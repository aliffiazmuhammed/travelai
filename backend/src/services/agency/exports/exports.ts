import { Types } from 'mongoose';
import Agency from '../../../models/Agency.js';
import AgencyClient from '../../../models/AgencyClient.js';
import AgencyExport, {
  type AgencyExportStatus,
  type IAgencyExport,
} from '../../../models/AgencyExport.js';
import AgencyQuote from '../../../models/AgencyQuote.js';
import AgencyTemplate, {
  type AgencyBuiltinTemplateKey,
} from '../../../models/AgencyTemplate.js';
import Trip from '../../../models/Trip.js';
import { AppError } from '../../../utils/AppError.js';
import { agencyCan, type AgencyRole } from '../access.js';
import {
  effectiveQuoteStatus,
  getLatestQuote,
  reconcileQuoteExpiry,
} from '../quotes.js';
import { recordAgencyAudit } from '../audit.js';
import { assertExportQuota, monthStart } from '../plan.js';
import { resolveExportBrand } from './brand.js';
import { buildExportDocument } from './document.js';
import { renderCustomTemplateHtml } from './customTemplate.js';
import {
  countPdfPages,
  pdfRenderDeadlineMs,
  remotePdfRenderer,
  renderHtmlToPdf,
} from './pdf.js';
import { renderExportHtml, type ExportRenderBrand } from './render.js';
import { exportDownloadPath, verifyExportDownload } from './signing.js';
import {
  resolveAgencyTemplateVersion,
  type ResolvedAgencyTemplateVersion,
} from './templateResolver.js';
import {
  buildAgencyExportStorageKey,
  readAgencyExportFile,
  removeAgencyExportFile,
  writeAgencyExportFile,
} from './storage.js';
import {
  assertRenderableTemplate,
  getAgencyTemplate,
  projectAgencyTemplate,
  type AgencyTemplateProjection,
} from './templates.js';

/**
 * Asynchronous proposal exports (Agency Workspace A5).
 *
 * A request pins the quote version and template version on the job, then
 * renders outside the request path. The row is the durable state: a browser
 * refresh, a crash or a missing Chrome install leaves a visible `failed` job
 * that can be retried instead of a silent lost click.
 *
 * Renders are serialised by a small in-process queue because each one starts a
 * headless Chrome process. The queue is a resource guard, not durable work
 * scheduling; the Mongo row remains the source of truth.
 */

export const EXPORT_RETENTION_DAYS = 30;
export const EXPORT_MAX_CONCURRENT_RENDERS = 2;

export function exportExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + EXPORT_RETENTION_DAYS * 86_400_000);
}

/**
 * A live render cannot outlast twice its own deadline plus slack. Anything
 * older was left behind by a process that died — render jobs run in-process,
 * so a redeploy or a slept instance (Render free tier) strands the row.
 */
export function staleRenderCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - (pdfRenderDeadlineMs() * 2 + 60_000));
}

/**
 * Turns interrupted jobs into retryable failures. `retryAgencyExport` only
 * accepts `failed`, so without this sweep an orphaned `rendering` row would
 * spin forever with no action available in the UI.
 */
export async function recoverStaleAgencyExports(
  now: Date = new Date()
): Promise<number> {
  const stale = await AgencyExport.find({
    status: 'rendering',
    startedAt: { $lt: staleRenderCutoff(now) },
  })
    .select('_id agencyId tripId requestedBy')
    .lean();

  let recovered = 0;
  for (const job of stale) {
    const updated = await AgencyExport.findOneAndUpdate(
      { _id: job._id, status: 'rendering' },
      {
        $set: {
          status: 'failed',
          error: 'The render was interrupted. Please retry the export.',
          completedAt: now,
        },
      },
      { new: true }
    ).catch(() => null);
    if (!updated) continue;

    recovered += 1;
    await recordAgencyAudit({
      agencyId: String(job.agencyId),
      actorId: String(job.requestedBy),
      action: 'export.failed',
      targetType: 'AgencyExport',
      targetId: String(job._id),
      metadata: { tripId: String(job.tripId), reason: 'interrupted' },
    }).catch(() => undefined);
  }

  if (recovered > 0) {
    console.warn(`Recovered ${recovered} interrupted agency export(s).`);
  }
  return recovered;
}

/* -------------------------------------------------------------------------- */
/*  Policy                                                                    */
/* -------------------------------------------------------------------------- */

export interface ExportPolicyInput {
  audience: 'client' | 'internal';
  role: AgencyRole;
  quote: any | null;
}

/**
 * Pure policy shared by create and preview:
 * - a viewer can read exports but never generate one;
 * - an internal desk copy needs admin rank (it carries internal estimates);
 * - a client proposal needs a quote, and a cancelled quote is not proposal
 *   material. Draft and expired quotes are allowed, with a watermark.
 */
export function assertExportPolicy(input: ExportPolicyInput): void {
  if (!agencyCan(input.role, 'planner')) {
    throw new AppError("You don't have permission to generate exports.", 403);
  }
  if (input.audience === 'internal' && !agencyCan(input.role, 'admin')) {
    throw new AppError('Only an agency admin can generate an internal export.', 403);
  }
  if (input.audience !== 'client') return;

  if (!input.quote) {
    throw new AppError(
      'Create and review a quote before exporting a client proposal.',
      400
    );
  }
  if (effectiveQuoteStatus(input.quote) === 'cancelled') {
    throw new AppError(
      'A cancelled quote cannot be exported. Create a new quote version first.',
      409
    );
  }
}

/* -------------------------------------------------------------------------- */
/*  Projection                                                                */
/* -------------------------------------------------------------------------- */

export interface AgencyExportProjection {
  _id: string;
  tripId: string;
  quoteId?: string;
  quoteNumber?: string;
  quoteVersion?: number;
  templateId: string;
  templateName: string;
  templateVersion: number;
  audience: 'client' | 'internal';
  format: string;
  status: AgencyExportStatus;
  bytes?: number;
  error?: string;
  attempts: number;
  requestedBy: string;
  createdAt: Date;
  completedAt?: Date;
  expiresAt: Date;
  expired: boolean;
  downloadUrl: string | null;
}

/**
 * The list/history shape. `outputKey` never leaves the server; the UI receives
 * a short-lived signed URL for a ready, unexpired file.
 */
export function projectAgencyExport(
  job: IAgencyExport | any,
  now: Date = new Date()
): AgencyExportProjection {
  const expiresAt = new Date(job.expiresAt);
  const expired = expiresAt.getTime() <= now.getTime();
  const downloadable =
    job.status === 'ready' && Boolean(job.outputKey) && !expired;

  return {
    _id: String(job._id),
    tripId: String(job.tripId),
    ...(job.quoteId ? { quoteId: String(job.quoteId) } : {}),
    ...(job.quoteNumber ? { quoteNumber: job.quoteNumber } : {}),
    ...(job.quoteVersion ? { quoteVersion: job.quoteVersion } : {}),
    templateId: String(job.templateId),
    templateName: String(job.templateName ?? ''),
    templateVersion: Number(job.templateVersion ?? 1),
    audience: job.audience,
    format: job.format,
    status: job.status,
    ...(job.status === 'ready' && job.bytes !== undefined ? { bytes: job.bytes } : {}),
    ...(job.status === 'failed' && job.error ? { error: job.error } : {}),
    attempts: Number(job.attempts ?? 1),
    requestedBy: String(job.requestedBy),
    createdAt: job.createdAt,
    ...(job.completedAt ? { completedAt: job.completedAt } : {}),
    expiresAt,
    expired,
    downloadUrl: downloadable
      ? exportDownloadPath({
          agencyId: String(job.agencyId),
          exportId: String(job._id),
          now: now.getTime(),
        })
      : null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Request validation                                                        */
/* -------------------------------------------------------------------------- */

async function resolveExportQuote(
  agencyId: string,
  tripId: string,
  quoteId: unknown
): Promise<any | null> {
  if (quoteId === undefined || quoteId === null || quoteId === '') {
    return getLatestQuote(agencyId, tripId);
  }

  const id = String(quoteId);
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError('Quote not found', 404);
  }
  const quote = await AgencyQuote.findOne({ _id: id, agencyId, tripId });
  if (!quote) {
    throw new AppError('Quote not found', 404);
  }
  return reconcileQuoteExpiry(quote);
}

interface ResolvedExportTemplate {
  template: any;
  /** Name pinned for the document; retries keep the name the job recorded. */
  name: string;
  kind: 'builtin' | 'custom';
  /** The version pinned on the job and rendered for previews. */
  version: number;
  custom: ResolvedAgencyTemplateVersion | null;
}

/**
 * Resolves the template a *new* export should pin. Custom templates must be
 * active and use their activated version; built-ins stay code-backed.
 */
async function resolveExportTemplate(
  agencyId: string,
  templateId: unknown
): Promise<ResolvedExportTemplate> {
  if (!templateId) {
    throw new AppError('Choose a template for this export.', 400);
  }
  const template = await getAgencyTemplate(agencyId, String(templateId));
  assertRenderableTemplate(template);

  if (template.builtinKey) {
    return {
      template,
      name: template.name,
      kind: 'builtin',
      version: Number(template.version ?? 1),
      custom: null,
    };
  }

  const custom = await resolveAgencyTemplateVersion({
    agencyId,
    templateId: template._id,
    version: template.activeVersion,
    requireActiveTemplate: true,
  });
  return {
    template,
    name: template.name,
    kind: 'custom',
    version: custom.version.version,
    custom,
  };
}

function renderTemplate(template: any) {
  return {
    builtinKey: template.builtinKey as AgencyBuiltinTemplateKey,
    name: template.name,
    audience: template.audience,
    version: template.version,
  };
}

function renderResolvedTemplate(
  resolved: ResolvedExportTemplate,
  doc: ReturnType<typeof buildExportDocument>,
  brand: ExportRenderBrand
) {
  if (resolved.kind === 'custom' && resolved.custom) {
    return renderCustomTemplateHtml({
      doc,
      template: {
        name: resolved.name,
        audience: resolved.custom.version.audience,
        version: resolved.custom.version.version,
      },
      source: resolved.custom.source,
      assets: resolved.custom.assets,
    });
  }
  return renderExportHtml(doc, renderTemplate(resolved.template), brand);
}

/**
 * Renders the exact document a finished job pinned, for paths that are not a
 * staff preview (A7 public share links). Custom templates resolve their
 * immutable snapshot even after activation moved on or the template was
 * archived; built-ins read the live brand pointers like every preview.
 */
export async function renderPinnedAgencyExport(input: {
  agencyId: string;
  job: IAgencyExport | any;
  agency: any;
  trip: any;
  quote: any | null;
  client: any | null;
}): Promise<{ html: string; pageCount: number }> {
  const template = await AgencyTemplate.findOne({
    _id: input.job.templateId,
    agencyId: input.agencyId,
  });
  if (!template) throw new AppError('Template not found', 404);

  if (template.builtinKey) {
    const brand = await resolveExportBrand(input.agencyId, input.agency);
    const doc = buildExportDocument({
      agency: input.agency,
      trip: input.trip,
      quote: input.quote,
      client: input.client,
      brand: brand.documentAssets,
    });
    return renderExportHtml(
      doc,
      renderTemplate({
        builtinKey: template.builtinKey,
        name: input.job.templateName ?? template.name,
        audience: template.audience,
        version: Number(input.job.templateVersion ?? template.version ?? 1),
      }),
      brand
    );
  }

  const custom = await resolveAgencyTemplateVersion({
    agencyId: input.agencyId,
    templateId: String(template._id),
    version: input.job.templateVersion,
    requireActiveTemplate: false,
  });
  const doc = buildExportDocument({
    agency: input.agency,
    trip: input.trip,
    quote: input.quote,
    client: input.client,
  });
  return renderCustomTemplateHtml({
    doc,
    template: {
      name: input.job.templateName ?? template.name,
      audience: custom.version.audience,
      version: custom.version.version,
    },
    source: custom.source,
    assets: custom.assets,
  });
}

/* -------------------------------------------------------------------------- */
/*  Render queue                                                              */
/* -------------------------------------------------------------------------- */

let activeRenders = 0;
const renderWaiters: Array<() => void> = [];

/**
 * A remote renderer on a free instance has a tenth of a CPU and 512 MB, so two
 * parallel documents only compete for the same budget. Serialise remote work;
 * a local Chrome process can use the full concurrency.
 */
function maxConcurrentRenders(): number {
  return remotePdfRenderer() ? 1 : EXPORT_MAX_CONCURRENT_RENDERS;
}

async function acquireRenderSlot(): Promise<() => void> {
  if (activeRenders < maxConcurrentRenders()) {
    activeRenders += 1;
  } else {
    await new Promise<void>((resolve) => renderWaiters.push(resolve));
    activeRenders += 1;
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeRenders = Math.max(0, activeRenders - 1);
    const next = renderWaiters.shift();
    if (next) next();
  };
}

function scheduleAgencyExport(exportId: string): void {
  setImmediate(() => {
    void processAgencyExport(exportId).catch((error) => {
      console.warn('Agency export job crashed:', error);
    });
  });
}

/* -------------------------------------------------------------------------- */
/*  Preview                                                                   */
/* -------------------------------------------------------------------------- */

export interface PreviewAgencyExportInput {
  agencyId: string;
  role: AgencyRole;
  trip: any;
  templateId: unknown;
  quoteId?: unknown;
}

export interface AgencyExportPreview {
  html: string;
  pageCount: number;
  audience: 'client' | 'internal';
  template: AgencyTemplateProjection;
  quote: {
    _id: string;
    number: string;
    version: number;
    status: string;
    validUntil: Date | null;
    currency: string;
    total: number;
    perPerson: number;
  } | null;
}

/**
 * Renders the real template HTML for the in-app preview. The UI puts this in a
 * sandboxed iframe, so the page looks exactly like the eventual PDF without a
 * second preview engine drifting from the renderer.
 */
export async function previewAgencyExport(
  input: PreviewAgencyExportInput
): Promise<AgencyExportPreview> {
  if (!agencyCan(input.role, 'planner')) {
    throw new AppError("You don't have permission to preview exports.", 403);
  }

  const resolved = await resolveExportTemplate(
    input.agencyId,
    input.templateId
  );
  const quote = await resolveExportQuote(
    input.agencyId,
    String(input.trip._id),
    input.quoteId
  );
  assertExportPolicy({
    audience: resolved.template.audience,
    role: input.role,
    quote,
  });

  // The trip guard already loaded the trip inside the tenant; the agency
  // document carries branding and is required for a real preview.
  const [agency, client] = await Promise.all([
    Agency.findById(input.agencyId),
    input.trip.clientId
      ? AgencyClient.findOne({
          _id: input.trip.clientId,
          agencyId: input.agencyId,
        })
      : null,
  ]);
  if (!agency) throw new AppError('Agency not found', 404);

  // Custom templates render from their pinned snapshots; only built-ins read
  // the live A3 brand pointers.
  const brand =
    resolved.kind === 'builtin'
      ? await resolveExportBrand(input.agencyId, agency)
      : null;

  const doc = buildExportDocument({
    agency,
    trip: input.trip,
    quote,
    client,
    ...(brand ? { brand: brand.documentAssets } : {}),
  });
  const rendered = renderResolvedTemplate(resolved, doc, brand ?? {});

  return {
    html: rendered.html,
    pageCount: rendered.pageCount,
    audience: resolved.template.audience,
    template: {
      ...projectAgencyTemplate(resolved.template),
      version: resolved.version,
    },
    quote: quote
      ? {
          _id: String(quote._id),
          number: quote.number,
          version: Number(quote.version ?? 1),
          status: effectiveQuoteStatus(quote),
          validUntil: quote.validUntil ?? null,
          currency: String(quote.currency ?? 'INR'),
          total: Number(quote.total ?? 0),
          perPerson: Number(quote.perPerson ?? 0),
        }
      : null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Create / list                                                             */
/* -------------------------------------------------------------------------- */

export interface CreateAgencyExportInput {
  agencyId: string;
  actorId: string;
  role: AgencyRole;
  trip: any;
  templateId: unknown;
  quoteId?: unknown;
  schedule?: boolean;
}

export async function createAgencyExport(
  input: CreateAgencyExportInput
): Promise<IAgencyExport> {
  if (!agencyCan(input.role, 'planner')) {
    throw new AppError("You don't have permission to generate exports.", 403);
  }

  if (input.trip?.archivedAt) {
    throw new AppError(
      'This trip is archived. Unarchive it before generating new exports.',
      409
    );
  }

  await assertExportQuota(input.agencyId);

  const resolved = await resolveExportTemplate(
    input.agencyId,
    input.templateId
  );
  const template = resolved.template;
  const quote = await resolveExportQuote(
    input.agencyId,
    String(input.trip._id),
    input.quoteId
  );
  assertExportPolicy({ audience: template.audience, role: input.role, quote });

  const job = await AgencyExport.create({
    agencyId: input.agencyId,
    tripId: input.trip._id,
    ...(quote
      ? {
          quoteId: quote._id,
          quoteNumber: quote.number,
          quoteVersion: quote.version,
        }
      : {}),
    templateId: template._id,
    templateVersion: resolved.version,
    templateName: template.name,
    audience: template.audience,
    format: 'pdf',
    status: 'queued',
    attempts: 1,
    requestedBy: input.actorId,
    expiresAt: exportExpiry(),
  });

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'export.requested',
    targetType: 'AgencyExport',
    targetId: String(job._id),
    metadata: {
      tripId: String(input.trip._id),
      templateId: String(template._id),
      templateEngine: template.engine,
      templateVersion: resolved.version,
      ...(template.builtinKey ? { templateKey: template.builtinKey } : {}),
      audience: template.audience,
      ...(quote ? { quoteNumber: quote.number, quoteVersion: quote.version } : {}),
    },
  });

  if (input.schedule !== false) {
    scheduleAgencyExport(String(job._id));
  }

  return job;
}

let lastRecoverySweepAt = 0;
const RECOVERY_SWEEP_INTERVAL_MS = 60_000;

/**
 * Reads of the export history are user-driven, so they double as a cheap
 * sweep trigger — free hosts do not offer cron jobs for a background timer.
 */
async function maybeRecoverStaleExports(now: Date): Promise<void> {
  if (now.getTime() - lastRecoverySweepAt < RECOVERY_SWEEP_INTERVAL_MS) return;
  lastRecoverySweepAt = now.getTime();
  await recoverStaleAgencyExports(now).catch((error) => {
    console.warn('Agency export recovery failed:', error);
  });
}

export async function listAgencyExports(input: {
  agencyId: string;
  tripId: string;
  role: AgencyRole;
  limit?: number;
  now?: Date;
}): Promise<AgencyExportProjection[]> {
  await maybeRecoverStaleExports(input.now ?? new Date());

  const limit = Math.min(50, Math.max(1, Number(input.limit) || 20));
  const jobs = await AgencyExport.find({
    agencyId: input.agencyId,
    tripId: input.tripId,
    // Desk copies carry internal estimates; only admin rank sees them in the
    // history, matching the generate policy above.
    ...(agencyCan(input.role, 'admin')
      ? {}
      : { audience: { $ne: 'internal' } }),
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return jobs.map((job) => projectAgencyExport(job, input.now));
}

/* -------------------------------------------------------------------------- */
/*  Processing                                                                */
/* -------------------------------------------------------------------------- */

function safeFailureMessage(error: unknown): string {
  if (error instanceof AppError && error.isOperational) {
    return error.message.slice(0, 500);
  }
  return 'The export could not be generated. Please retry.';
}

/**
 * Claims and renders one queued job. Safe to call twice: the atomic
 * `queued -> rendering` transition makes the second call a no-op. Every
 * failure is recorded on the row so the UI always has a retry action.
 */
export async function processAgencyExport(
  exportId: string
): Promise<IAgencyExport | null> {
  if (!Types.ObjectId.isValid(exportId)) return null;

  const job = await AgencyExport.findOneAndUpdate(
    { _id: exportId, status: 'queued' },
    { $set: { status: 'rendering', startedAt: new Date() }, $unset: { error: 1 } },
    { new: true }
  );
  if (!job) return null;

  const release = await acquireRenderSlot();
  try {
    const [agency, trip, template] = await Promise.all([
      Agency.findById(job.agencyId),
      Trip.findOne({
        _id: job.tripId,
        agencyId: job.agencyId,
        workspace: 'agency',
        isDeleted: { $ne: true },
      }),
      // Pin by id, not status: an archived template must still render the
      // version this job approved. New exports are blocked at request time.
      AgencyTemplate.findOne({
        _id: job.templateId,
        agencyId: job.agencyId,
      }),
    ]);

    if (!agency || !trip) {
      throw new AppError('This export is no longer available.', 404);
    }
    if (!template) {
      throw new AppError(
        'The template used by this export is no longer available. Generate a new export.',
        409
      );
    }

    let custom: ResolvedAgencyTemplateVersion | null = null;
    if (template.builtinKey) {
      assertRenderableTemplate(template);
    } else {
      try {
        custom = await resolveAgencyTemplateVersion({
          agencyId: String(job.agencyId),
          templateId: template._id,
          version: job.templateVersion,
          requireActiveTemplate: false,
        });
      } catch (error) {
        if (error instanceof AppError && error.statusCode === 404) {
          throw new AppError(
            'The template version used by this export is no longer available. Generate a new export.',
            409
          );
        }
        throw error;
      }
      if (custom.version.audience !== job.audience) {
        throw new AppError(
          'The template version no longer matches this export. Generate a new export.',
          409
        );
      }
    }
    const resolved: ResolvedExportTemplate = {
      template,
      name: job.templateName || template.name,
      kind: custom ? 'custom' : 'builtin',
      version: Number(job.templateVersion ?? 1),
      custom,
    };

    const quote = job.quoteId
      ? await AgencyQuote.findOne({
          _id: job.quoteId,
          agencyId: job.agencyId,
          tripId: job.tripId,
        })
      : null;
    if (job.quoteId && !quote) {
      throw new AppError(
        'The quote used by this export is no longer available.',
        409
      );
    }

    const client = trip.clientId
      ? await AgencyClient.findOne({
          _id: trip.clientId,
          agencyId: job.agencyId,
        })
      : null;

    // A custom render must use only its approved snapshots, so live A3 brand
    // pointers are read for built-ins only.
    const brand =
      resolved.kind === 'builtin'
        ? await resolveExportBrand(String(job.agencyId), agency)
        : null;
    const doc = buildExportDocument({
      agency,
      trip,
      quote,
      client,
      ...(brand ? { brand: brand.documentAssets } : {}),
    });
    const rendered = renderResolvedTemplate(resolved, doc, brand ?? {});
    const pdf = await renderHtmlToPdf(rendered.html);
    countPdfPages(pdf);

    const outputKey = buildAgencyExportStorageKey(job.agencyId, job._id);
    await writeAgencyExportFile(outputKey, pdf);

    const ready = await AgencyExport.findOneAndUpdate(
      { _id: job._id, status: 'rendering' },
      {
        $set: {
          status: 'ready',
          outputKey,
          bytes: pdf.byteLength,
          completedAt: new Date(),
        },
        $unset: { error: 1 },
      },
      { new: true }
    );

    if (!ready) {
      // The row changed state while rendering; do not leave an orphan file.
      await removeAgencyExportFile(outputKey).catch(() => undefined);
      return null;
    }

    await recordAgencyAudit({
      agencyId: String(job.agencyId),
      actorId: String(job.requestedBy),
      action: 'export.completed',
      targetType: 'AgencyExport',
      targetId: String(job._id),
      metadata: {
        tripId: String(job.tripId),
        bytes: pdf.byteLength,
        pages: rendered.pageCount,
      },
    });

    return ready;
  } catch (error) {
    const message = safeFailureMessage(error);
    console.warn('Agency export failed:', String((error as any)?.message ?? error));
    await AgencyExport.updateOne(
      { _id: job._id, status: 'rendering' },
      {
        $set: { status: 'failed', error: message, completedAt: new Date() },
      }
    ).catch(() => undefined);

    await recordAgencyAudit({
      agencyId: String(job.agencyId),
      actorId: String(job.requestedBy),
      action: 'export.failed',
      targetType: 'AgencyExport',
      targetId: String(job._id),
      metadata: { tripId: String(job.tripId), reason: message },
    });

    return null;
  } finally {
    release();
  }
}

export async function retryAgencyExport(input: {
  agencyId: string;
  tripId: string;
  exportId: string;
  role: AgencyRole;
  actorId: string;
}): Promise<IAgencyExport> {
  if (!agencyCan(input.role, 'planner')) {
    throw new AppError("You don't have permission to retry exports.", 403);
  }
  if (
    !Types.ObjectId.isValid(input.exportId) ||
    !Types.ObjectId.isValid(input.tripId)
  ) {
    throw new AppError('Export not found', 404);
  }

  const existing = await AgencyExport.findOne({
    _id: input.exportId,
    agencyId: input.agencyId,
    tripId: input.tripId,
  });
  if (!existing) throw new AppError('Export not found', 404);
  if (existing.status !== 'failed') {
    throw new AppError('Only a failed export can be retried.', 409);
  }

  // A retry only consumes quota when the row was not already counted this
  // month (it updates the row rather than inserting a new one).
  const alreadyCounted = await AgencyExport.exists({
    _id: existing._id,
    $or: [
      { createdAt: { $gte: monthStart() } },
      { updatedAt: { $gte: monthStart() } },
    ],
  });
  if (!alreadyCounted) {
    await assertExportQuota(input.agencyId);
  }

  const updated = await AgencyExport.findOneAndUpdate(
    { _id: existing._id, status: 'failed' },
    {
      $set: { status: 'queued', expiresAt: exportExpiry() },
      $inc: { attempts: 1 },
      $unset: {
        error: 1,
        outputKey: 1,
        bytes: 1,
        startedAt: 1,
        completedAt: 1,
      },
    },
    { new: true }
  );
  if (!updated) {
    throw new AppError('This export changed before it could be retried.', 409);
  }

  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'export.retried',
    targetType: 'AgencyExport',
    targetId: String(updated._id),
    metadata: { tripId: input.tripId, attempt: updated.attempts },
  });
  scheduleAgencyExport(String(updated._id));
  return updated;
}

/* -------------------------------------------------------------------------- */
/*  Download                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Staff download behind a short-lived signature. The route has already proved
 * tenant membership; signature verification is bound to `(agencyId, exportId)`
 * so a link can never be replayed against another agency.
 */
export async function readAgencyExportDownload(input: {
  agencyId: string;
  exportId: string;
  expiresAt: number;
  signature: string;
  actorId: string;
  role: AgencyRole;
}): Promise<{ job: IAgencyExport; buffer: Buffer }> {
  if (!Types.ObjectId.isValid(input.exportId)) {
    throw new AppError('Export not found', 404);
  }
  if (
    !verifyExportDownload({
      agencyId: input.agencyId,
      exportId: input.exportId,
      expiresAt: input.expiresAt,
      signature: input.signature,
    })
  ) {
    throw new AppError('That download link is invalid or has expired.', 403);
  }

  const job = await AgencyExport.findOne({
    _id: input.exportId,
    agencyId: input.agencyId,
  });
  if (!job || job.status !== 'ready' || !job.outputKey) {
    throw new AppError('Export not found', 404);
  }
  if (job.audience === 'internal' && !agencyCan(input.role, 'admin')) {
    throw new AppError(
      'Only an agency admin can download an internal export.',
      403
    );
  }
  if (new Date(job.expiresAt).getTime() <= Date.now()) {
    throw new AppError(
      'This export is past its retention window. Generate a new export.',
      410
    );
  }

  const buffer = await readAgencyExportFile(job.outputKey);
  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'export.downloaded',
    targetType: 'AgencyExport',
    targetId: String(job._id),
    metadata: { tripId: String(job.tripId) },
  });

  return { job, buffer };
}
