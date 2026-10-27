import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileDown,
  FileText,
  History,
  LayoutTemplate,
  Link2,
  Loader2,
  Lock,
  Receipt,
  RefreshCw,
  Share2,
  ShieldAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import PdfDocumentViewer from '@/components/agency/PdfDocumentViewer';
import { API_BASE_URL } from '@/config';
import { useAgency } from '@/context/AgencyContext';
import { formatAgencyDate } from '@/lib/agency';
import { base64PdfToBytes } from '@/lib/pdfjs';
import { templateVersionNumber } from '@/lib/templates';
import { cn } from '@/lib/utils';
import { api } from '@/services/api';
import type {
  AgencyExport,
  AgencyExportPreview,
  AgencyExportStatus,
  AgencyProposalLink,
  AgencyQuote,
  AgencyTemplate,
  QuoteStatus,
} from '@/types';
import { toast } from 'sonner';

const EXPORT_POLL_MS = 2500;

const exportStatusLabel: Record<AgencyExportStatus, string> = {
  queued: 'Queued',
  rendering: 'Rendering',
  ready: 'Ready',
  failed: 'Failed',
};

const exportStatusClass: Record<AgencyExportStatus, string> = {
  queued:
    'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300',
  rendering:
    'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
  ready:
    'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300',
  failed:
    'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
};

const quoteStatusLabel: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

const quoteStatusClass: Record<QuoteStatus, string> = {
  draft:
    'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300',
  sent: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
  accepted:
    'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300',
  expired:
    'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  cancelled:
    'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
};

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

function formatMoney(amount: number | undefined, currency: string): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadName(job: AgencyExport): string {
  const base = job.quoteNumber
    ? `${job.quoteNumber}-v${job.quoteVersion ?? 1}`
    : `itinerary-${job.tripId}`;
  return `${base.replace(/[^a-z0-9._-]+/gi, '-').slice(0, 80)}.pdf`;
}

function absoluteExportUrl(path: string): string {
  if (/^https?:\/\//i.test(API_BASE_URL)) {
    return `${API_BASE_URL.replace(/\/+$/, '')}${path}`;
  }
  return new URL(`${API_BASE_URL}${path}`, window.location.origin).toString();
}

interface AgencyExportPanelProps {
  agencyId: string;
  tripId: string;
  tripTitle: string;
  /** A8: archived trips are read-only — new previews/exports are blocked,
   *  but existing jobs stay downloadable and retryable. */
  archived?: boolean;
  onOpenQuoteTab: () => void;
}

/**
 * A5: proposal exports. The server renders the real document and stores the
 * PDF privately, so this panel only chooses a template, confirms the pinned
 * quote and polls the resulting job; the iframe preview uses the same renderer.
 */
const AgencyExportPanel: React.FC<AgencyExportPanelProps> = ({
  agencyId,
  tripId,
  tripTitle,
  archived = false,
  onOpenQuoteTab,
}) => {
  const { activeAgency, canManage } = useAgency();
  const canPlan = canManage || activeAgency?.role === 'planner';
  const canAdmin = canManage;

  const [templates, setTemplates] = useState<AgencyTemplate[]>([]);
  const [exports, setExports] = useState<AgencyExport[]>([]);
  const [quote, setQuote] = useState<AgencyQuote | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AgencyExportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [shares, setShares] = useState<AgencyProposalLink[]>([]);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [createdShare, setCreatedShare] = useState<{
    url: string;
    quoteNumber: string | null;
  } | null>(null);

  const previewPdfBytes = useMemo(
    () => (preview?.pdf ? base64PdfToBytes(preview.pdf) : null),
    [preview?.pdf]
  );

  const requestRef = useRef(0);
  const previewRequestRef = useRef(0);
  const exportStatusRef = useRef<Map<string, AgencyExportStatus>>(new Map());

  const seedExportStatuses = useCallback((items: AgencyExport[]) => {
    exportStatusRef.current = new Map(
      items.map((item) => [item._id, item.status])
    );
  }, []);

  const applyExports = useCallback(
    (items: AgencyExport[], notify: boolean) => {
      const previous = exportStatusRef.current;
      const next = new Map<string, AgencyExportStatus>();
      for (const item of items) {
        next.set(item._id, item.status);
        const before = previous.get(item._id);
        if (notify && before && before !== item.status) {
          if (item.status === 'ready') {
            toast.success(
              `${item.templateName || 'Your export'} is ready to download.`
            );
          } else if (item.status === 'failed') {
            toast.error(
              `${item.templateName || 'Your export'} could not be generated.`
            );
          }
        }
      }
      exportStatusRef.current = next;
      setExports(items);
    },
    []
  );

  const loadData = useCallback(async () => {
    const requestId = ++requestRef.current;
    previewRequestRef.current += 1;
    setLoading(true);
    setLoadError(null);
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(false);
    try {
      const [exportsResult, templatesResult, quoteResult, sharesResult] =
        await Promise.all([
          api.getAgencyExports(agencyId, tripId),
          canPlan
            ? api.getAgencyTemplates(agencyId)
            : Promise.resolve({ success: true, templates: [] as AgencyTemplate[] }),
          canPlan
            ? api.getAgencyQuote(agencyId, tripId)
            : Promise.resolve({ success: true, quote: null as AgencyQuote | null }),
          api.getAgencyProposalLinks(agencyId, tripId),
        ]);
      if (requestId !== requestRef.current) return;

      applyExports(exportsResult.exports || [], false);
      setTemplates(templatesResult.templates || []);
      setQuote(quoteResult.quote ?? null);
      setShares(sharesResult.links || []);

      const available = (templatesResult.templates || []).filter(
        (template) => template.audience !== 'internal' || canAdmin
      );
      setSelectedTemplateId((current) => {
        if (current && available.some((template) => template._id === current)) {
          return current;
        }
        return (
          available.find((template) => template.isDefault) ?? available[0]
        )?._id ?? null;
      });
    } catch (error) {
      if (requestId !== requestRef.current) return;
      setLoadError(
        errorMessage(error, 'Could not load the export workspace.')
      );
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [agencyId, tripId, canPlan, canAdmin, applyExports]);

  useEffect(() => {
    void loadData();
    return () => {
      requestRef.current += 1;
    };
  }, [loadData]);

  const hasActiveExports = useMemo(
    () =>
      exports.some(
        (item) => item.status === 'queued' || item.status === 'rendering'
      ),
    [exports]
  );

  useEffect(() => {
    if (!hasActiveExports) return;
    let cancelled = false;
    let timer = 0;

    const poll = async () => {
      try {
        const result = await api.getAgencyExports(agencyId, tripId);
        if (cancelled) return;
        applyExports(result.exports || [], true);
      } catch {
        /* Keep polling: a transient list error must not strand a render. */
      }
      if (!cancelled) {
        timer = window.setTimeout(() => void poll(), EXPORT_POLL_MS);
      }
    };

    timer = window.setTimeout(() => void poll(), EXPORT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [hasActiveExports, agencyId, tripId, applyExports]);

  const visibleTemplates = useMemo(
    () =>
      templates.filter(
        (template) => template.audience !== 'internal' || canAdmin
      ),
    [templates, canAdmin]
  );

  const selectedTemplate =
    visibleTemplates.find((template) => template._id === selectedTemplateId) ??
    null;

  const clientQuoteBlockedReason = !quote
    ? 'A client proposal needs a quote. Create one in the Quote tab first.'
    : quote.status === 'cancelled'
      ? 'This quote was cancelled. Create a new quote version before exporting it.'
      : null;

  const archivedBlockedReason = archived
    ? 'This trip is archived. Unarchive it before generating new exports.'
    : null;

  const generationBlocked =
    Boolean(archived) ||
    !selectedTemplate ||
    (selectedTemplate.audience === 'client' &&
      clientQuoteBlockedReason !== null);

  const previewMatchesSelection = Boolean(
    preview && selectedTemplate && preview.template._id === selectedTemplate._id
  );

  const canGenerate = Boolean(
    canPlan && previewMatchesSelection && !generationBlocked && !generating
  );

  const watermark =
    preview?.audience === 'client' &&
    preview.quote &&
    (preview.quote.status === 'draft' || preview.quote.status === 'expired')
      ? preview.quote.status === 'draft'
        ? 'This quote is still a draft. The PDF will carry a DRAFT watermark.'
        : 'This quote has expired. The PDF will carry an EXPIRED watermark.'
      : null;

  const selectTemplate = (template: AgencyTemplate) => {
    if (template._id === selectedTemplateId) return;
    previewRequestRef.current += 1;
    setSelectedTemplateId(template._id);
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(false);
  };

  const handlePreview = async () => {
    if (!selectedTemplate || generationBlocked) return;
    const requestId = ++previewRequestRef.current;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await api.previewAgencyExport(agencyId, tripId, {
        templateId: selectedTemplate._id,
        ...(quote ? { quoteId: quote._id } : {}),
      });
      if (requestId !== previewRequestRef.current) return;
      setPreview(result.preview);
    } catch (error) {
      if (requestId !== previewRequestRef.current) return;
      setPreview(null);
      setPreviewError(
        errorMessage(error, 'Could not render this document preview.')
      );
    } finally {
      if (requestId === previewRequestRef.current) setPreviewLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!canGenerate || !preview) return;
    setGenerating(true);
    try {
      const result = await api.createAgencyExport(agencyId, tripId, {
        // Generate exactly what was previewed and confirmed, even if the
        // selected template changed in another browser tab.
        templateId: preview.template._id,
        ...(preview.quote ? { quoteId: preview.quote._id } : {}),
      });
      setConfirmOpen(false);
      setExports((prev) => [
        result.export,
        ...prev.filter((job) => job._id !== result.export._id),
      ]);
      exportStatusRef.current.set(result.export._id, result.export.status);
      toast.success(result.message || 'Your export is being prepared.');
    } catch (error) {
      toast.error(errorMessage(error, 'Could not start the export.'));
    } finally {
      setGenerating(false);
    }
  };

  const handleRetry = async (job: AgencyExport) => {
    setRetryingId(job._id);
    try {
      const result = await api.retryAgencyExport(agencyId, tripId, job._id);
      setExports((prev) =>
        prev.map((item) => (item._id === job._id ? result.export : item))
      );
      exportStatusRef.current.set(result.export._id, result.export.status);
      toast.success(result.message || 'Retrying your export.');
    } catch (error) {
      toast.error(errorMessage(error, 'Could not retry this export.'));
    } finally {
      setRetryingId(null);
    }
  };

  const handleDownload = async (job: AgencyExport) => {
    if (!job.downloadUrl) return;
    setDownloadingId(job._id);
    try {
      const blob = await api.downloadAgencyExport(job.downloadUrl);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = downloadName(job);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
      toast.success('Download started.');
    } catch (error) {
      toast.error(errorMessage(error, 'Could not download that export.'));
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCopyLink = async (job: AgencyExport) => {
    if (!job.downloadUrl) return;
    try {
      await navigator.clipboard.writeText(
        absoluteExportUrl(job.downloadUrl)
      );
      toast.success('Staff link copied. It expires in 10 minutes.');
    } catch {
      toast.error('Could not copy the link. Use Download instead.');
    }
  };

  const handleCreateShare = async (job: AgencyExport) => {
    setSharingId(job._id);
    try {
      const result = await api.createAgencyProposalLink(
        agencyId,
        tripId,
        job._id
      );
      const links = await api.getAgencyProposalLinks(agencyId, tripId);
      setShares(links.links || []);
      setCreatedShare({
        url: result.url,
        quoteNumber: result.link.quoteNumber,
      });
    } catch (error) {
      toast.error(errorMessage(error, 'Could not create a share link.'));
    } finally {
      setSharingId(null);
    }
  };

  const handleCopyCreatedShare = async () => {
    if (!createdShare) return;
    try {
      await navigator.clipboard.writeText(createdShare.url);
      toast.success('Client link copied.');
    } catch {
      toast.error('Could not copy the link. Select it and copy manually.');
    }
  };

  const handleRevokeShare = async (link: AgencyProposalLink) => {
    setRevokingId(link._id);
    try {
      await api.revokeAgencyProposalLink(agencyId, tripId, link._id);
      setShares((prev) =>
        prev.map((item) =>
          item._id === link._id
            ? { ...item, revokedAt: new Date().toISOString() }
            : item
        )
      );
      toast.success('Client link revoked.');
    } catch (error) {
      toast.error(errorMessage(error, 'Could not revoke that share link.'));
    } finally {
      setRevokingId(null);
    }
  };

  if (loading) {
    return (
      <Card className="rounded-3xl border-border/70">
        <CardContent className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading proposal exports...
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card className="rounded-3xl border-rose-200 dark:border-rose-900/60">
        <CardContent className="space-y-3 py-14 text-center">
          <AlertTriangle className="mx-auto h-6 w-6 text-rose-500" />
          <p className="text-sm text-rose-700 dark:text-rose-300">
            {loadError}
          </p>
          <Button variant="outline" size="sm" onClick={() => void loadData()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const historyCard = (
    <Card className="rounded-3xl border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Export history
          </span>
          <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
            PDFs are kept for 30 days
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {exports.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            {canPlan
              ? 'Generated proposals appear here with their quote and template versions.'
              : 'No exports have been generated for this trip yet.'}
          </p>
        ) : (
          exports.map((job) => {
            const active =
              job.status === 'queued' || job.status === 'rendering';
            return (
              <div
                key={job._id}
                className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-semibold">
                        {job.templateName || 'Proposal'}
                      </p>
                      <Badge
                        variant="outline"
                        className="text-[10px] capitalize"
                      >
                        {job.audience}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px]',
                          exportStatusClass[job.status]
                        )}
                      >
                        {active ? (
                          <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
                        ) : job.status === 'ready' ? (
                          <CheckCircle2 className="mr-1 h-2.5 w-2.5" />
                        ) : job.status === 'failed' ? (
                          <AlertTriangle className="mr-1 h-2.5 w-2.5" />
                        ) : null}
                        {exportStatusLabel[job.status]}
                      </Badge>
                      {job.expired ? (
                        <Badge
                          variant="outline"
                          className="border-slate-300 text-[10px] text-slate-500 dark:border-slate-700"
                        >
                          Expired
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {job.quoteNumber
                        ? `${job.quoteNumber} · v${job.quoteVersion ?? 1}`
                        : 'No quote pinned'}
                      {' · '}
                      {formatAgencyDate(job.createdAt)}
                      {job.status === 'ready' && job.bytes
                        ? ` · ${formatBytes(job.bytes)}`
                        : ''}
                      {job.attempts > 1 ? ` · attempt ${job.attempts}` : ''}
                    </p>
                    {job.status === 'failed' && job.error ? (
                      <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
                        {job.error}
                      </p>
                    ) : null}
                    {job.status === 'ready' && !job.expired ? (
                      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                        Download available until {formatAgencyDate(job.expiresAt)}
                      </p>
                    ) : job.expired ? (
                      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                        Past the retention window. Generate a new export to
                        download again.
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {job.status === 'ready' && job.downloadUrl && !job.expired ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleDownload(job)}
                          disabled={downloadingId === job._id}
                        >
                          {downloadingId === job._id ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Download
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleCopyLink(job)}
                          title="Copy a signed staff-only link. It expires in 10 minutes."
                          aria-label="Copy staff download link"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        {job.audience === 'client' && canPlan ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleCreateShare(job)}
                            disabled={sharingId === job._id}
                            title="Create a client link for this proposal. The client can view and accept it without an account."
                          >
                            {sharingId === job._id ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Share2 className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Share with client
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                    {job.status === 'failed' && canPlan ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleRetry(job)}
                        disabled={retryingId === job._id}
                      >
                        {retryingId === job._id ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Retry
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );

  const shareLinkActive = (link: AgencyProposalLink): boolean =>
    !link.revokedAt && new Date(link.expiresAt).getTime() > Date.now();

  const sharesCard = (
    <Card className="rounded-3xl border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Client share links
          </span>
          <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
            Full links are shown only once, when created
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {shares.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            {canPlan
              ? 'Share a ready client export to send the client a link they can view and accept without an account.'
              : 'No client share links have been created for this trip yet.'}
          </p>
        ) : (
          shares.map((link) => {
            const active = shareLinkActive(link);
            return (
              <div
                key={link._id}
                className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-semibold">
                        {link.quoteNumber
                          ? `${link.quoteNumber} · v${link.quoteVersion}`
                          : 'Client link'}
                      </p>
                      {link.acceptedAt ? (
                        <Badge
                          variant="outline"
                          className="border-teal-300 bg-teal-50 text-[10px] text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300"
                        >
                          Accepted
                        </Badge>
                      ) : null}
                      {link.revokedAt ? (
                        <Badge
                          variant="outline"
                          className="border-rose-300 bg-rose-50 text-[10px] text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                        >
                          Revoked
                        </Badge>
                      ) : active ? (
                        <Badge
                          variant="outline"
                          className="border-sky-300 bg-sky-50 text-[10px] text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                        >
                          Active
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-300 bg-amber-50 text-[10px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                        >
                          Expired
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      …{link.tokenHint}
                      {link.templateName ? ` · ${link.templateName}` : ''}
                      {' · created '}
                      {formatAgencyDate(link.createdAt)}
                      {' · valid until '}
                      {formatAgencyDate(link.expiresAt)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                      {link.viewCount} view{link.viewCount === 1 ? '' : 's'}
                      {link.lastViewedAt
                        ? ` · last viewed ${formatAgencyDate(link.lastViewedAt)}`
                        : ' · not viewed yet'}
                      {link.acceptedAt
                        ? ` · accepted ${formatAgencyDate(link.acceptedAt)}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {active && canPlan ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleRevokeShare(link)}
                        disabled={revokingId === link._id}
                        title="Revoke this link. The client can no longer open it."
                      >
                        {revokingId === link._id ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Ban className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Revoke
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );

  if (!canPlan) {
    return (
      <div className="space-y-4">
        <Card className="rounded-3xl border-border/70">
          <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-indigo-600 text-white">
                <FileText className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  Proposal exports
                </h2>
                <p className="mt-1 max-w-xl text-xs text-slate-500 dark:text-slate-400">
                  Download finished PDFs for {tripTitle}. Generating new
                  documents is limited to planners and admins.
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="gap-1 text-[10px] text-slate-500"
            >
              <Lock className="h-3 w-3" />
              Read-only
            </Badge>
          </CardContent>
        </Card>
        {historyCard}
        {sharesCard}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl border-border/70">
        <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-indigo-600 text-white">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Proposal exports
              </h2>
              <p className="mt-1 max-w-xl text-xs text-slate-500 dark:text-slate-400">
                Choose a template, confirm the quote and generate a branded
                PDF. The quote and template versions are pinned to each export;
                previews and generations share a 20-per-hour limit.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {canAdmin ? (
              <Button asChild variant="outline" size="sm">
                <Link to="/agency/templates">
                  <LayoutTemplate className="mr-1.5 h-3.5 w-3.5" />
                  Manage templates
                </Link>
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadData()}
              title="Reload templates, quote and history"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
        <div className="space-y-4">
          <Card className="rounded-3xl border-border/70">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4" />
                Template
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {visibleTemplates.length === 0 ? (
                <div className="space-y-2 rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <p>No active export templates are available yet.</p>
                  {canAdmin ? (
                    <Button asChild variant="outline" size="sm">
                      <Link to="/agency/templates">
                        <LayoutTemplate className="mr-1.5 h-3.5 w-3.5" />
                        Set up templates
                      </Link>
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {visibleTemplates.map((template) => {
                    const selected = template._id === selectedTemplateId;
                    return (
                      <button
                        key={template._id}
                        type="button"
                        onClick={() => selectTemplate(template)}
                        className={cn(
                          'rounded-2xl border p-3 text-left transition',
                          selected
                            ? 'border-teal-500 bg-teal-50/70 ring-1 ring-teal-500 dark:border-teal-500 dark:bg-teal-950/30'
                            : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-teal-800 dark:hover:bg-slate-900/60'
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={cn(
                              'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl',
                              template.audience === 'internal'
                                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                                : 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300'
                            )}
                          >
                            {template.audience === 'internal' ? (
                              <ShieldAlert className="h-4 w-4" />
                            ) : (
                              <FileText className="h-4 w-4" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-semibold">
                                {template.name}
                              </span>
                              {template.isDefault ? (
                                <Badge
                                  variant="outline"
                                  className="text-[9px]"
                                >
                                  Default
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                              {template.description ||
                                (template.audience === 'internal'
                                  ? 'Desk copy with internal estimates.'
                                  : 'Client-facing proposal document.')}
                            </p>
                            <p className="mt-1.5 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              {template.audience} ·{' '}
                              {template.builtinKey ? 'built-in' : 'custom'} · v
                              {templateVersionNumber(template)}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {!canAdmin ? (
                <p className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <Lock className="h-3 w-3" />
                  Internal summaries can only be generated by an admin.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-border/70">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Receipt className="h-4 w-4" />
                Quote confirmation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {quote ? (
                <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {quote.number}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      v{quote.version}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px]',
                        quoteStatusClass[quote.status]
                      )}
                    >
                      {quoteStatusLabel[quote.status]}
                    </Badge>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Valid until {formatAgencyDate(quote.validUntil)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-900/60">
                      <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Total
                      </span>
                      <p className="mt-0.5 text-sm font-semibold">
                        {formatMoney(quote.total, quote.currency)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-900/60">
                      <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Per person
                      </span>
                      <p className="mt-0.5 text-sm font-semibold">
                        {formatMoney(quote.perPerson, quote.currency)}
                      </p>
                    </div>
                  </div>
                  {quote.status === 'draft' ||
                  quote.status === 'expired' ||
                  quote.status === 'cancelled' ? (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        {quote.status === 'cancelled'
                          ? 'A cancelled quote cannot be exported. Create a new quote version first.'
                          : quote.status === 'draft'
                            ? 'This quote is still a draft. A client proposal will carry a DRAFT watermark.'
                            : 'This quote has expired. A client proposal will carry an EXPIRED watermark.'}
                      </span>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="space-y-2 rounded-xl border border-dashed border-slate-200 p-3 text-center dark:border-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No quote for this trip yet. A client proposal needs a priced
                    quote before it can be exported.
                  </p>
                  <Button variant="outline" size="sm" onClick={onOpenQuoteTab}>
                    <Receipt className="mr-1.5 h-3.5 w-3.5" />
                    Open quote
                  </Button>
                </div>
              )}
              {quote?.status === 'cancelled' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenQuoteTab}
                  className="w-full"
                >
                  <Receipt className="mr-1.5 h-3.5 w-3.5" />
                  Open quote to create a new version
                </Button>
              ) : null}
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                The export pins this quote version. Later edits create a new
                quote version and do not change this document.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden rounded-3xl border-border/70">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Eye className="h-4 w-4" />
              Live preview
              {preview ? (
                <Badge variant="outline" className="text-[10px]">
                  {preview.pageCount}{' '}
                  {preview.pageCount === 1 ? 'page' : 'pages'}
                </Badge>
              ) : null}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handlePreview()}
              disabled={previewLoading || generationBlocked}
              title={
                generationBlocked
                  ? clientQuoteBlockedReason ?? 'Choose a template first'
                  : undefined
              }
            >
              {previewLoading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              {preview ? 'Refresh preview' : 'Preview'}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            {generationBlocked ? (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {archivedBlockedReason ??
                    clientQuoteBlockedReason ??
                    'Choose a template before previewing an export.'}
                </span>
              </div>
            ) : null}

            {previewError ? (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-[11px] text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{previewError}</span>
              </div>
            ) : null}

            {preview ? (
              <>
                {preview.engine === 'pdf-background' ? (
                  <PdfDocumentViewer
                    source={previewPdfBytes}
                    title={preview.template.name}
                    className="h-[560px]"
                  />
                ) : (
                  <iframe
                    title={`${preview.template.name} preview`}
                    srcDoc={preview.html ?? ''}
                    sandbox=""
                    className="h-[560px] w-full rounded-2xl border border-slate-200 bg-white"
                  />
                )}
                <div className="space-y-2">
                  {watermark ? (
                    <p className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {watermark}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {preview.template.name} · v{preview.template.version}
                      {preview.quote
                        ? ` · ${preview.quote.number} v${preview.quote.version}`
                        : ' · no quote pinned'}
                    </p>
                    <Button
                      size="sm"
                      className="bg-teal-600 hover:bg-teal-700"
                      onClick={() => setConfirmOpen(true)}
                      disabled={!canGenerate}
                    >
                      <FileDown className="mr-1.5 h-3.5 w-3.5" />
                      Generate PDF
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void handlePreview()}
                disabled={previewLoading || generationBlocked}
                className="flex h-[560px] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 text-center transition hover:border-teal-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-teal-800"
              >
                {previewLoading ? (
                  <Loader2 className="h-7 w-7 animate-spin text-teal-600" />
                ) : (
                  <Eye className="h-7 w-7 text-slate-300 dark:text-slate-700" />
                )}
                <span className="text-sm font-semibold">
                  Preview the actual PDF layout
                </span>
                <span className="max-w-xs text-[11px] text-slate-500 dark:text-slate-400">
                  Rendered by the same engine as the download, using the
                  current trip, {selectedTemplate?.name ?? 'template'} and
                  pinned quote.
                </span>
              </button>
            )}
          </CardContent>
        </Card>
      </div>

      {historyCard}
      {sharesCard}

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!generating) setConfirmOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate this proposal?</DialogTitle>
            <DialogDescription>
              The PDF is rendered on the server and kept privately for 30 days.
              You can download it from the export history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-2xl border border-slate-200 p-3 text-xs dark:border-slate-800">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">
                Template
              </span>
              <span className="text-right font-medium">
                {preview?.template.name}
                {preview ? ` · v${preview.template.version}` : ''}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">
                Audience
              </span>
              <span className="font-medium capitalize">
                {preview?.audience}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">Quote</span>
              <span className="text-right font-medium">
                {preview?.quote
                  ? `${preview.quote.number} · v${preview.quote.version} · ${quoteStatusLabel[preview.quote.status]}`
                  : 'No quote pinned'}
              </span>
            </div>
            {preview?.quote ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500 dark:text-slate-400">
                  Total
                </span>
                <span className="font-medium">
                  {formatMoney(preview.quote.total, preview.quote.currency)}
                </span>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">Pages</span>
              <span className="font-medium">{preview?.pageCount}</span>
            </div>
            {watermark ? (
              <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {watermark}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={generating}
            >
              Cancel
            </Button>
            <Button
              className="bg-teal-600 hover:bg-teal-700"
              onClick={() => void handleGenerate()}
              disabled={!canGenerate}
            >
              {generating ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileDown className="mr-1.5 h-3.5 w-3.5" />
              )}
              Generate PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(createdShare)}
        onOpenChange={(open) => {
          if (!open) setCreatedShare(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Client link created</DialogTitle>
            <DialogDescription>
              Send this link to the client
              {createdShare?.quoteNumber
                ? ` for ${createdShare.quoteNumber}`
                : ''}
              . They can view the proposal and accept it without an account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <span className="min-w-0 flex-1 break-all text-xs font-medium text-slate-700 dark:text-slate-300">
                {createdShare?.url}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleCopyCreatedShare()}
                className="shrink-0"
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Copy
              </Button>
            </div>
            <p className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                This full link is shown only once. Anyone with it can open the
                proposal, so send it only to the client.
              </span>
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedShare(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AgencyExportPanel;
