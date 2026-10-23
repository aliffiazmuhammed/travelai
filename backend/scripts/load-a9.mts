/**
 * Live load test for Agency Workspace A9 (hardening, pilot and launch).
 *
 * Fires ~50 concurrent export jobs at a running dev backend over plain HTTP
 * and asserts queue health, per-request latency and limit behaviour:
 *
 *   1. Ops plan gate: the `x-travelai-ops` secret is checked over HTTP.
 *   2. Burst: 50 export POSTs in flight at once (5 admins x 10 jobs) — all
 *      must be accepted (202) and every job must drain through the 2-wide
 *      render queue to `ready` with a downloadable PDF.
 *   3. Health: /api/health and /api/agency/status stay 200 with the database
 *      connected while the burst is in flight.
 *   4. Wide rate limit: the 61st export in the hour for one agency answers
 *      429 with the agency-wide message.
 *   5. Per-user rate limit: a 21st export from one user answers 429 with the
 *      per-user message.
 *   6. Monthly quota: an agency capped at 3 exports accepts 3 and answers 409
 *      on the 4th.
 *   7. Usage and audit read back consistently after the run.
 *
 * Prerequisites: the dev backend is running with AGENCY_WORKSPACE_ENABLED=true
 * and the same MONGODB_URI / JWT_SECRET as this process (backend/.env), and a
 * Chrome/Edge binary is installed for PDF rendering.
 *
 * Run from backend/:
 *   npx tsx scripts/load-a9.mts
 * Override the target with AGENCY_LOAD_BASE_URL.
 *
 * The script seeds three recognisable "A9 Load ..." agencies into the dev
 * database, cleans them up (rows and PDF files) when it finishes, and purges
 * residue from any previous crashed run on the next start.
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import mongoose, { Types } from 'mongoose';
import { performance } from 'perf_hooks';
import Agency from '../src/models/Agency.js';
import AgencyAudit from '../src/models/AgencyAudit.js';
import AgencyExport from '../src/models/AgencyExport.js';
import AgencyMember from '../src/models/AgencyMember.js';
import AgencyTemplate from '../src/models/AgencyTemplate.js';
import Trip from '../src/models/Trip.js';
import {
  ensureBuiltinTemplates,
  listAgencyTemplates,
} from '../src/services/agency/exports/templates.js';
import { removeAgencyExportFile } from '../src/services/agency/exports/storage.js';

const BASE_URL = String(process.env.AGENCY_LOAD_BASE_URL || 'http://localhost:5000').replace(
  /\/+$/,
  ''
);
const BURST_JOBS = 50;
const BURST_USERS = 5;
const WIDE_LIMIT = 60;
const USER_LIMIT = 20;
const SETTLE_TIMEOUT_MS = 10 * 60 * 1000;

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label}`);
  if (!ok) {
    failures += 1;
    if (detail !== undefined) {
      console.log('     detail:', JSON.stringify(detail)?.slice(0, 500));
    }
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

interface HttpResult {
  status: number;
  ms: number;
  json: any;
}

async function http(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<HttpResult> {
  const started = performance.now();
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  return { status: response.status, ms: performance.now() - started, json };
}

async function fetchBytes(path: string, token: string): Promise<{ status: number; buffer: Buffer }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  return { status: response.status, buffer };
}

async function purgeLoadResidue(): Promise<void> {
  const stale = await Agency.find({ name: /^A9 Load / }).select('_id').lean();
  for (const entry of stale) {
    const agencyId = String(entry._id);
    const jobs = await AgencyExport.find({ agencyId }).select('storageKey').lean();
    await Promise.all(
      jobs.map((job) =>
        job.storageKey ? removeAgencyExportFile(job.storageKey).catch(() => undefined) : undefined
      )
    );
    await Promise.all([
      Trip.deleteMany({ agencyId }),
      AgencyExport.deleteMany({ agencyId }),
      AgencyAudit.deleteMany({ agencyId }),
      AgencyMember.deleteMany({ agencyId }),
      AgencyTemplate.deleteMany({ agencyId }),
    ]);
    await Agency.deleteOne({ _id: entry._id });
  }
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the A9 load test against production.');
  }
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is missing. Run from backend/ so dotenv loads .env.');
  }

  const health = await http('GET', '/api/health');
  if (health.status !== 200) {
    throw new Error(`Backend not reachable at ${BASE_URL} (health ${health.status}).`);
  }
  const status = await http('GET', '/api/agency/status');
  check(
    'the target backend serves the agency workspace with writes enabled',
    status.status === 200 &&
      status.json?.workspace === 'agency' &&
      status.json?.writesEnabled === true,
    status.json
  );
  if (!status.json?.writesEnabled) {
    throw new Error('Agency workspace writes are disabled on the target backend.');
  }

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/travelai';
  await mongoose.connect(mongoUri);
  console.log(`Seeding against ${mongoUri} — must be the same database ${BASE_URL} serves.`);

  await purgeLoadResidue();

  const ownerId = new Types.ObjectId();
  // Internal exports need admin rank, so the load users are admins rather
  // than planners (assertExportPolicy blocks internal audience below admin).
  const admins = Array.from({ length: BURST_USERS + 1 }, () => new Types.ObjectId());
  const burstAdmins = admins.slice(0, BURST_USERS);
  const wideProbeUser = admins[BURST_USERS];
  const perUserProbeUser = new Types.ObjectId();
  const quotaProbeUser = new Types.ObjectId();
  const suffix = new Date().toISOString().replace(/[:.]/g, '-');

  const agencyA = await Agency.create({
    name: `A9 Load burst ${suffix}`,
    createdBy: ownerId,
  });
  const agencyB = await Agency.create({
    name: `A9 Load per-user ${suffix}`,
    createdBy: ownerId,
  });
  const agencyC = await Agency.create({
    name: `A9 Load quota ${suffix}`,
    createdBy: ownerId,
  });
  const agencyAId = String(agencyA._id);
  const agencyBId = String(agencyB._id);
  const agencyCId = String(agencyC._id);

  await Agency.updateOne(
    { _id: agencyA._id },
    { $set: { plan: { tierId: 'starter', seats: 10, monthlyExports: 100, storageMb: 500 } } }
  );
  await Agency.updateOne(
    { _id: agencyB._id },
    { $set: { plan: { tierId: 'starter', seats: 5, monthlyExports: 100 } } }
  );
  await Agency.updateOne(
    { _id: agencyC._id },
    { $set: { plan: { tierId: 'starter', seats: 5, monthlyExports: 3 } } }
  );

  await AgencyMember.insertMany(
    [
      { agencyId: agencyA._id, userId: ownerId, role: 'owner' },
      ...admins.map((userId) => ({
        agencyId: agencyA._id,
        userId,
        role: 'admin',
      })),
      { agencyId: agencyB._id, userId: ownerId, role: 'owner' },
      { agencyId: agencyB._id, userId: perUserProbeUser, role: 'admin' },
      { agencyId: agencyC._id, userId: ownerId, role: 'owner' },
      { agencyId: agencyC._id, userId: quotaProbeUser, role: 'admin' },
    ].map((member) => ({ ...member, joinedAt: new Date() }))
  );

  await ensureBuiltinTemplates(agencyAId, String(ownerId));
  await ensureBuiltinTemplates(agencyBId, String(ownerId));
  await ensureBuiltinTemplates(agencyCId, String(ownerId));
  const internalTemplateId = async (agencyId: string): Promise<string> => {
    const templates = await listAgencyTemplates({ agencyId, role: 'owner' });
    const internal = templates.find((entry) => entry.audience === 'internal');
    if (!internal) throw new Error(`No builtin internal template for ${agencyId}.`);
    return String(internal._id);
  };
  const templateA = await internalTemplateId(agencyAId);
  const templateB = await internalTemplateId(agencyBId);
  const templateC = await internalTemplateId(agencyCId);

  const makeTrips = (agencyId: unknown, count: number, prefix: string) =>
    Promise.all(
      Array.from({ length: count }, (_, index) =>
        Trip.create({
          userId: ownerId,
          workspace: 'agency',
          agencyId,
          title: `${prefix} ${index + 1}`,
          status: 'planned',
          tripDetails: { trip_title: `${prefix} ${index + 1}`, duration_days: 2 },
        })
      )
    );
  const tripsA = await makeTrips(agencyA._id, 5, 'A9 Load trip');
  const tripsB = await makeTrips(agencyB._id, 2, 'A9 Load trip B');
  const tripsC = await makeTrips(agencyC._id, 1, 'A9 Load trip C');

  const tokenFor = (userId: Types.ObjectId): string =>
    jwt.sign({ userId: String(userId) }, process.env.JWT_SECRET as string, {
      expiresIn: '1h',
    });
  const ownerToken = tokenFor(ownerId);

  /* 1. Ops plan gate over HTTP (no membership guard; the secret is the gate). */
  const wrongOps = await http('PATCH', `/api/agency/${agencyAId}/plan`, {
    token: ownerToken,
    headers: { 'x-travelai-ops': 'load-wrong-key' },
    body: { tierId: 'starter', seats: 9 },
  });
  check('the ops plan route rejects a wrong secret over HTTP (403)', wrongOps.status === 403, {
    status: wrongOps.status,
    error: wrongOps.json?.error,
  });
  if (process.env.AGENCY_OPS_KEY) {
    const rightOps = await http('PATCH', `/api/agency/${agencyAId}/plan`, {
      token: ownerToken,
      headers: { 'x-travelai-ops': process.env.AGENCY_OPS_KEY },
      body: { tierId: 'starter', seats: 10, monthlyExports: 100, storageMb: 500 },
    });
    check('the ops plan route accepts the correct secret over HTTP (200)', rightOps.status === 200, {
      status: rightOps.status,
      error: rightOps.json?.error,
    });
  } else {
    console.log('     (AGENCY_OPS_KEY not set: positive ops-path check skipped; plan seeded directly.)');
  }

  /* 2. Health sampler running behind the burst. */
  let sampling = true;
  const healthSamples: Array<{ status: number; ms: number; json: any }> = [];
  const sampler = (async () => {
    while (sampling) {
      const sample = await http('GET', '/api/health');
      healthSamples.push({ status: sample.status, ms: sample.ms, json: sample.json });
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  })();

  /* 3. The burst: 50 export jobs in flight at once. */
  const createExport = (agencyId: string, tripId: string, templateId: string, token: string) =>
    http('POST', `/api/agency/${agencyId}/trips/${tripId}/exports`, {
      token,
      body: { templateId },
    });
  const burstStarted = performance.now();
  const burst = await Promise.all(
    Array.from({ length: BURST_JOBS }, (_, index) =>
      createExport(
        agencyAId,
        String(tripsA[index % tripsA.length]._id),
        templateA,
        tokenFor(burstAdmins[index % burstAdmins.length])
      )
    )
  );
  sampling = false;
  await sampler;

  const burstIds = new Set<string>(
    burst.map((result) => String(result.json?.export?._id ?? '')).filter(Boolean)
  );
  const burstLatencies = burst.map((result) => result.ms);
  const accepted = burst.filter((result) => result.status === 202).length;
  check(
    `all ${BURST_JOBS} burst requests are accepted (202)`,
    accepted === BURST_JOBS,
    burst.filter((result) => result.status !== 202).map((result) => ({
      status: result.status,
      error: result.json?.error,
    }))
  );
  check('every burst response carries a queued export id', burstIds.size === BURST_JOBS, {
    got: burstIds.size,
  });
  console.log(
    `     burst create latency ms: min=${Math.min(...burstLatencies).toFixed(0)} ` +
      `p50=${percentile(burstLatencies, 50).toFixed(0)} ` +
      `p95=${percentile(burstLatencies, 95).toFixed(0)} ` +
      `max=${Math.max(...burstLatencies).toFixed(0)} (${(performance.now() - burstStarted).toFixed(0)} ms wall)`
  );
  check('burst p95 create latency stays under 5s', percentile(burstLatencies, 95) < 5000, percentile(burstLatencies, 95));

  const healthySamples = healthSamples.filter(
    (sample) =>
      sample.status === 200 &&
      sample.json?.status === 'healthy' &&
      sample.json?.database === 'connected'
  ).length;
  check(
    'health stays 200 + database connected for the whole burst',
    healthySamples === healthSamples.length && healthSamples.length > 0,
    { samples: healthSamples.length, healthy: healthySamples }
  );
  const healthLatencies = healthSamples.map((sample) => sample.ms);
  if (healthLatencies.length > 0) {
    check(
      'health p95 latency under load stays under 1.5s',
      percentile(healthLatencies, 95) < 1500,
      percentile(healthLatencies, 95)
    );
  }
  const statusDuringLoad = await http('GET', '/api/agency/status');
  check(
    'agency status endpoint stays available during the run',
    statusDuringLoad.status === 200 && statusDuringLoad.json?.writesEnabled === true,
    statusDuringLoad.json
  );

  /* 4. Wide rate limit: request 61 in the hour for agency A answers 429. */
  const wideRequests: HttpResult[] = [];
  for (let index = 0; index < 11; index += 1) {
    wideRequests.push(
      await createExport(
        agencyAId,
        String(tripsA[index % tripsA.length]._id),
        templateA,
        tokenFor(wideProbeUser)
      )
    );
  }
  const wideAccepted = wideRequests.slice(0, 10).filter((result) => result.status === 202).length;
  const wideBlocked = wideRequests[10];
  check('the 10 requests under the wide limit are accepted', wideAccepted === 10, {
    got: wideAccepted,
  });
  check(
    'the 61st export in the hour answers 429 with the agency-wide message',
    wideBlocked.status === 429 &&
      String(wideBlocked.json?.error ?? '').includes('hourly export limit'),
    { status: wideBlocked.status, error: wideBlocked.json?.error }
  );
  for (const result of wideRequests.slice(0, 10)) {
    const id = String(result.json?.export?._id ?? '');
    if (id) burstIds.add(id);
  }

  /* 5. Per-user rate limit: request 21 from one user answers 429. */
  const userRequests: HttpResult[] = [];
  const perUserToken = tokenFor(perUserProbeUser);
  const perUserIds = new Set<string>();
  for (let index = 0; index < USER_LIMIT + 1; index += 1) {
    const result = await createExport(
      agencyBId,
      String(tripsB[index % tripsB.length]._id),
      templateB,
      perUserToken
    );
    userRequests.push(result);
    const id = String(result.json?.export?._id ?? '');
    if (id) perUserIds.add(id);
  }
  const userAccepted = userRequests.slice(0, USER_LIMIT).filter((result) => result.status === 202).length;
  const userBlocked = userRequests[USER_LIMIT];
  check(`the first ${USER_LIMIT} requests from one user are accepted`, userAccepted === USER_LIMIT, {
    got: userAccepted,
  });
  check(
    "a user's 21st export in the hour answers 429 with the per-user message",
    userBlocked.status === 429 && String(userBlocked.json?.error ?? '').includes('Too many exports'),
    { status: userBlocked.status, error: userBlocked.json?.error }
  );

  /* 6. Monthly quota: an agency capped at 3 accepts 3 then answers 409. */
  const quotaRequests: HttpResult[] = [];
  const quotaToken = tokenFor(quotaProbeUser);
  const quotaIds = new Set<string>();
  for (let index = 0; index < 4; index += 1) {
    const result = await createExport(agencyCId, String(tripsC[0]._id), templateC, quotaToken);
    quotaRequests.push(result);
    const id = String(result.json?.export?._id ?? '');
    if (id) quotaIds.add(id);
  }
  const quotaAccepted = quotaRequests.slice(0, 3).filter((result) => result.status === 202).length;
  const quotaBlocked = quotaRequests[3];
  check('the agency capped at 3 exports accepts its 3 jobs', quotaAccepted === 3, {
    got: quotaAccepted,
  });
  check(
    'the 4th export answers 409 with the monthly quota message',
    quotaBlocked.status === 409 && String(quotaBlocked.json?.error ?? '').includes('Monthly export limit'),
    { status: quotaBlocked.status, error: quotaBlocked.json?.error }
  );

  /* 7. Queue health: every accepted job drains to a settled state. */
  const listJobs = async (agencyId: string, trips: any[], token: string): Promise<any[]> => {
    const lists = await Promise.all(
      trips.map((trip) =>
        http('GET', `/api/agency/${agencyId}/trips/${String(trip._id)}/exports`, { token })
      )
    );
    return lists.flatMap((result) => (result.status === 200 ? result.json?.exports ?? [] : []));
  };
  const settle = async (): Promise<{ settled: Map<string, any>; wallMs: number }> => {
    const started = performance.now();
    const deadline = Date.now() + SETTLE_TIMEOUT_MS;
    const want = new Set([...burstIds, ...perUserIds, ...quotaIds]);
    const settled = new Map<string, any>();
    for (;;) {
      const [aJobs, bJobs, cJobs] = await Promise.all([
        listJobs(agencyAId, tripsA, tokenFor(burstAdmins[0])),
        listJobs(agencyBId, tripsB, perUserToken),
        listJobs(agencyCId, tripsC, quotaToken),
      ]);
      for (const job of [...aJobs, ...bJobs, ...cJobs]) {
        const id = String(job._id);
        if (want.has(id) && job.status !== 'queued' && job.status !== 'rendering') {
          settled.set(id, job);
        }
      }
      if (settled.size === want.size) {
        return { settled, wallMs: performance.now() - started };
      }
      if (Date.now() > deadline) {
        throw new Error(
          `Queue did not drain in time: ${settled.size}/${want.size} settled after ${SETTLE_TIMEOUT_MS / 1000}s.`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  };
  const { settled, wallMs } = await settle();
  const readyCount = [...settled.values()].filter((job) => job.status === 'ready').length;
  const failedJobs = [...settled.values()].filter((job) => job.status === 'failed');
  check(
    `all ${settled.size} accepted jobs drain through the queue`,
    settled.size === burstIds.size + perUserIds.size + quotaIds.size,
    { settled: settled.size, expected: burstIds.size + perUserIds.size + quotaIds.size }
  );
  check(
    `every job renders to ready (2-wide queue drained in ${(wallMs / 1000).toFixed(0)}s)`,
    readyCount === settled.size,
    failedJobs
      .slice(0, 3)
      .map((job) => ({ status: job.status, error: job.error }))
  );
  if (failedJobs.length > 0) {
    console.log(
      '     Hints: is a Chrome/Edge binary installed? Set AGENCY_CHROME_PATH if it is not auto-detected.'
    );
  }

  /* 8. End-to-end download probe on one ready job. */
  const sampleJob = [...settled.values()].find((job) => job.status === 'ready' && job.downloadUrl);
  if (sampleJob) {
    const download = await fetchBytes(String(sampleJob.downloadUrl), tokenFor(burstAdmins[0]));
    const isPdf =
      download.status === 200 &&
      download.buffer.byteLength > 0 &&
      download.buffer.subarray(0, 5).toString('latin1') === '%PDF-';
    check('a ready job downloads as a real PDF over the signed URL', isPdf, {
      status: download.status,
      bytes: download.buffer.byteLength,
    });
  } else {
    check('a ready job exposes a signed download URL', false, 'no ready job found');
  }

  /* 9. Usage and audit read back consistently after the run. */
  const usageFor = async (agencyId: string): Promise<any> => {
    const result = await http('GET', `/api/agency/${agencyId}/usage`, { token: ownerToken });
    return { status: result.status, used: result.json?.usage?.used, plan: result.json?.usage?.plan };
  };
  const usageA = await usageFor(agencyAId);
  check(
    'usage reports 60 exports and 7 seats for the burst agency',
    usageA.status === 200 &&
      usageA.used?.exportsThisMonth === burstIds.size &&
      usageA.used?.seats === 7 &&
      Number(usageA.used?.storageBytes ?? 0) > 0,
    usageA
  );
  const usageB = await usageFor(agencyBId);
  check(
    'usage reports 20 exports for the per-user agency',
    usageB.status === 200 && usageB.used?.exportsThisMonth === perUserIds.size,
    usageB
  );
  const usageC = await usageFor(agencyCId);
  check(
    'usage reports 3 exports for the quota agency',
    usageC.status === 200 && usageC.used?.exportsThisMonth === quotaIds.size,
    usageC
  );

  const auditEntries: any[] = [];
  for (let page = 1; page <= 3; page += 1) {
    const auditPage = await http(
      'GET',
      `/api/agency/${agencyAId}/audit?action=export&limit=100&page=${page}`,
      { token: ownerToken }
    );
    const entries = Array.isArray(auditPage.json?.entries) ? auditPage.json.entries : [];
    auditEntries.push(...entries);
    if (entries.length < 100) break;
  }
  const requested = auditEntries.filter((entry: any) => entry.action === 'export.requested').length;
  check(
    'audit recorded every accepted export request under load',
    requested >= burstIds.size,
    { requested, expected: burstIds.size }
  );

  console.log(
    failures === 0
      ? `\nA9 load test PASSED against ${BASE_URL}.`
      : `\nA9 load test FAILED with ${failures} failing check(s).`
  );
}

let cleaned = false;
async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try {
    await purgeLoadResidue();
    console.log('Cleaned up A9 load rows and PDF files.');
  } catch (error) {
    console.warn('Cleanup failed; residue stays for the next run to purge:', error);
  }
  try {
    await mongoose.disconnect();
  } catch {
    /* already disconnected */
  }
  process.exit(failures === 0 ? 0 : 1);
}

process.on('SIGINT', () => {
  void cleanup();
});
process.on('SIGTERM', () => {
  void cleanup();
});

main()
  .catch((error) => {
    console.error('A9 load test crashed:', error);
    failures += 1;
  })
  .finally(() => cleanup());
