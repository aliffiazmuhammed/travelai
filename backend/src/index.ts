import express, { type Request } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import connectDB from './db.js';
import { env } from './config/env.js';
import authRoutes from './routes/auth.routes.js';
import itineraryRoutes from './routes/itinerary.routes.js';
import invitesRoutes from './routes/invites.routes.js';
import geoRoutes from './routes/geo.routes.js';
import travelersRoutes from './routes/travelers.routes.js';
import exploreRoutes from './routes/explore.routes.js';
import eventsRoutes from './routes/events.routes.js';
import agenciesRoutes from './routes/agencies.routes.js';
import blocksRoutes from './routes/blocks.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import enquiriesRoutes from './routes/enquiries.routes.js';
import conversationsRoutes from './routes/conversations.routes.js';
import proposalsRoutes from './routes/proposals.routes.js';
import agencyRoutes from './routes/agency.routes.js';
import agencyAuthRoutes from './routes/agencyAuth.routes.js';
import adminAuthRoutes from './routes/adminAuth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import { requirePlatformAdmin } from './middleware/platformAdmin.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';
import { isCloudinaryConfigured, uploadDir } from './services/finance/receipt.js';
import { agencyStorageProvider } from './services/agency/cloudStorage.js';
import { recoverStaleAgencyExports } from './services/agency/exports/exports.js';
import {
  pdfRenderDeadlineMs,
  pdfRendererMode,
} from './services/agency/exports/pdf.js';
import { CSRF_HEADER, issueCsrfCookie, verifyCsrf } from './middleware/csrf.middleware.js';
import { isAllowedCorsOrigin, isSameOriginRequest } from './services/collab/httpOrigins.js';
import { healthState } from './utils/health.js';
import { buildCspDirectives } from './config/csp.js';

const app = express();

// Trust reverse proxy (Essential on Render, Heroku, Railway for HTTPS & rate limiting)
app.set('trust proxy', 1);

// Connect to MongoDB
await connectDB();

// Render jobs run inside this process, so a restart can strand a row in
// `rendering`. Recovering at boot turns that into a retryable failure instead
// of a permanent spinner (free hosts redeploy and sleep often).
await recoverStaleAgencyExports().catch((error) => {
  console.warn('Could not recover interrupted agency exports:', error);
});

// Resolved once at boot; the health payload reports which PDF engine is wired.
const pdfRenderer = await pdfRendererMode();

// Deployment shape is needed by both the CSP (local http vs HTTPS) and the
// static-serving diagnostics below.
const isRender = Boolean(process.env.RENDER);
const isDev = env.NODE_ENV === 'development' && !isRender;

// Security middleware. The CSP allow-list lives in `config/csp.ts` so the
// required origins are unit-tested rather than buried here.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: buildCspDirectives(isDev),
    },
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration (E1.0 / flaw F1 — strict allow-list).
//
// The previous configuration matched by *suffix* (`*.vercel.app`,
// `*.onrender.com`) with `credentials: true`. Anyone can deploy free hosting
// under those domains, so `evil.vercel.app` was an allowed origin for
// credentialed requests — a cross-origin read/write channel against a signed-in
// user. Matching is now by exact origin: the hosts below, plus anything from
// `FRONTEND_URL`/`ALLOWED_EXTRA_ORIGINS` (comma-separated) without a trailing
// slash. When the same service hosts the SPA (single-service deployments),
// same-origin requests carry no Origin header and skip CORS entirely.
app.use(
  // An options delegate (rather than a bare origin function) is needed to know
  // which host served the request: same-origin is always allowed, and the
  // exact allow-list only governs real cross-origin calls.
  cors((req, callback) => {
    const request = req as Request;
    const origin = String(request.headers.origin ?? '').replace(/\/+$/, '');
    if (!origin) return callback(null, { origin: true, credentials: true });

    const selfOrigin = `${request.protocol}://${request.get('host') ?? ''}`;
    if (isSameOriginRequest(origin, selfOrigin) || isAllowedCorsOrigin(origin)) {
      return callback(null, { origin: true, credentials: true });
    }
    return callback(
      new Error(`The CORS policy for this site does not allow access from Origin: ${origin}`),
      { origin: false }
    );
  })
);

// Body parsers
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// CSRF defense (E1.0 / flaw F1). Needs the parsed cookies, and `cors` handles
// `OPTIONS` preflights above, so the registration order is deliberate:
// 1. issue the `csrf` cookie when missing (any request can recover),
// 2. reject non-GET requests that do not echo it in `X-CSRF-Token`.
app.use(issueCsrfCookie);
app.use(verifyCsrf);
// Referenced for the header name contract used by `frontend/src/services/api.ts`.
void CSRF_HEADER;

// Static Frontend Discovery (Unified Monorepo Single-Service Deployment)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Comprehensive candidate locations for frontend/dist across dev, root cwd, workspace cwd, and Render platform path
const candidatePaths = [
  path.resolve(process.cwd(), 'public'),
  path.resolve(__dirname, '../public'),
  path.resolve(__dirname, '../../public'),
  path.resolve(process.cwd(), 'backend/public'),
  path.resolve(process.cwd(), '../backend/public'),
  path.resolve(process.cwd(), '../frontend/dist'),
  path.resolve(process.cwd(), 'frontend/dist'),
  path.resolve(process.cwd(), '../../frontend/dist'),
  path.resolve(__dirname, '../../frontend/dist'),
  path.resolve(__dirname, '../../../frontend/dist'),
  path.resolve(__dirname, '../frontend/dist'),
  '/opt/render/project/src/backend/public',
  '/opt/render/project/src/frontend/dist',
];
const frontendDist = candidatePaths.find((p) => fs.existsSync(path.join(p, 'index.html')));

// Always serve static frontend bundle on Render and production if frontendDist exists
const shouldServeStatic = Boolean(
  frontendDist && (isRender || !isDev || env.SERVE_STATIC === 'true' || env.SERVE_STATIC !== 'false')
);

// Health check with DB status, memory diagnostics, and static serving status.
// Render polls this path: a live process with a dead database must answer 503
// so the instance is replaced instead of being reported as ready.
app.get('/api/health', (_req, res) => {
  const health = healthState(mongoose.connection.readyState);
  const cloudinary = isCloudinaryConfigured();

  res.status(health.httpStatus).json({
    success: health.ok,
    status: health.status,
    database: health.database,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    // E4b feature discovery: the SPA opens SSE streams only when this is true
    // (ENABLE_TRIP_SSE) so a disabled tier never produces retry spam.
    collab: {
      sse: env.ENABLE_TRIP_SSE,
    },
    // M9 R1: the SPA subscribes to `/api/enquiries/events` and the agency
    // inbox stream only when this is true, so a dark tier never retry-spams.
    enquiries: {
      sse: env.ENABLE_ENQUIRY_SSE,
    },
    // Agency feature discovery. The namespace is dark by default; the
    // frontend must not render agency navigation or call `/api/agency` unless
    // this is true. The milestone marker tracks the latest implemented
    // milestone: A9 hardening and pilot on top of the A8 operations surface.
    agency: {
      enabled: env.AGENCY_WORKSPACE_ENABLED,
      milestone: 'A9',
      writesEnabled: env.AGENCY_WORKSPACE_ENABLED,
    },
    // PA1 platform admin discovery. When false the namespace is a 404 and the
    // SPA renders `/admin` as unavailable instead of offering a login form.
    platform: {
      enabled: env.PLATFORM_ADMIN_ENABLED,
      milestone: 'PA5',
    },
    staticServing: {
      enabled: Boolean(shouldServeStatic && frontendDist),
      envServeStatic: env.SERVE_STATIC ?? 'unset',
      // Absolute paths are deployment diagnostics, not public API. Production
      // monitors only need to know *whether* the bundle is served; the where
      // stays local to the process (and to development logs).
      ...(isDev
        ? {
            resolvedPath: frontendDist || 'NOT_FOUND',
            cwd: process.cwd(),
            dirname: __dirname,
            candidatePaths: candidatePaths.map((p) => ({
              path: p,
              hasIndexHtml: fs.existsSync(path.join(p, 'index.html')),
            })),
          }
        : {}),
    },
    receiptStorage: {
      provider: cloudinary ? 'cloudinary' : 'local',
      // Local disk is ephemeral on Render, so this is the field to check after
      // a deploy when avatars or receipts seem to disappear.
      durable: cloudinary,
      folder: process.env.CLOUDINARY_FOLDER || 'travelai/receipts',
      ...(isDev ? { localUploadsDir: uploadsDir } : {}),
    },
    // Agency tenant bytes (brand assets, templates, export PDFs) are private
    // and never served from a public CDN; this reports where they live.
    agencyStorage: {
      provider: agencyStorageProvider(),
      durable: agencyStorageProvider() === 'cloudinary',
    },
    // A5 PDF engine. `none` means export generation will fail with a retryable
    // 503 until a renderer is configured.
    agencyPdf: {
      renderer: pdfRenderer,
      timeoutMs: pdfRenderDeadlineMs(),
    },
    memory: process.memoryUsage(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/itinerary', itineraryRoutes);
app.use('/api/invites', invitesRoutes);
app.use('/api/geo', geoRoutes);
// Public gallery profiles (G2): anonymous by design, projection-only payload.
app.use('/api/travelers', travelersRoutes);
// Public gallery listing and trip pages (G3): same rule — anonymous, and every
// row leaves through the gallery projection rather than a raw trip document.
app.use('/api/explore', exploreRoutes);
// Public agency events (M10 E1): dated camps and group trips listed in
// Explore. Anonymous and projection-only; closed windows keep a readable page.
app.use('/api/events', eventsRoutes);
// Public agency directory profiles (M9 D1): anonymous, projection-only, and
// 404 for drafts, suspended agencies and ops-hidden profiles.
app.use('/api/agencies', agenciesRoutes);
// Personal block list (G5): account-scoped, one-way, never carries a trip id.
// Agency and platform sessions are refused by `protectPersonal`.
app.use('/api/blocks', blocksRoutes);
// Safety reports (G6): personal-realm, accountable, daily-limited. Reporting a
// trip or profile never exposes the reporter on any public payload.
app.use('/api/reports', reportsRoutes);
// A traveller's own enquiries (M9 D5): personal realm only, read-only. The
// public enquiry *write* lives on `/api/agencies/:slug/enquiries`.
app.use('/api/enquiries', enquiriesRoutes);
// Guest enquiry threads (M9 D8): the private token is the capability, so this
// router stays outside both realm guards. It resolves exactly one enquiry.
app.use('/api/conversations', conversationsRoutes);
// A traveller's proposal comparison (M9 D8): personal-realm only, ownership
// proven through the enquiry → client → quote chain.
app.use('/api/proposals', proposalsRoutes);
// Agency Workspace (A0): read-only placeholder namespace, gated per request.
// PA0 auth lives under the same gate, before the tenant routes — it is public
// bootstrap (`/context`, `/csrf`, `/signin`, `/logout`) plus agency-session
// self-service, so it must not inherit the tenant `:agencyId` guard chain.
app.use('/api/agency/auth', agencyAuthRoutes);
app.use('/api/agency', agencyRoutes);
// PA1 platform realm. The flag gate covers the whole namespace before any
// route, including future `/api/admin` mounts; the auth router repeats it so a
// route mounted elsewhere still cannot forget the kill switch.
app.use('/api/admin', requirePlatformAdmin);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin', adminRoutes);

// Uploaded receipt files (Milestone 5.5). Registered before the SPA fallback so
// `/uploads/<file>` is never rewritten to index.html. Filenames are generated
// server-side and include random bytes, so they are unlisted rather than secret.
const uploadsDir = uploadDir();
try {
  fs.mkdirSync(uploadsDir, { recursive: true });
  app.use(
    '/uploads',
    express.static(uploadsDir, {
      index: false,
      dotfiles: 'deny',
      fallthrough: false,
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    })
  );
  if (isCloudinaryConfigured()) {
    console.log('☁️  Cloudinary storage active: Receipts will be uploaded directly to Cloudinary CDN');
  } else {
    console.log(`🧾 Serving local receipt uploads from: ${uploadsDir}`);
  }
} catch (error) {
  console.warn(`Receipt uploads are disabled (could not prepare ${uploadsDir}):`, error);
}

// Agency workspace bytes are tenant-private, so Cloudinary storage uses
// `resource_type: 'raw'` and is never served from the public CDN.
if (agencyStorageProvider() === 'cloudinary') {
  console.log('☁️  Agency storage active on Cloudinary (raw, private reads)');
} else {
  console.log('💾 Agency storage active on local disk');
}

if (shouldServeStatic && frontendDist) {
  console.log(`📦 Serving static frontend files from: ${frontendDist}`);
  app.use(express.static(frontendDist));
  // Express 5 compatible SPA fallback (app.use prevents path-to-regexp v8 wildcard syntax error)
  app.use((req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ success: false, error: `Route ${req.originalUrl} not found` });
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  // Default API root message when not serving static frontend
  app.get('/', (_req, res) => {
    res.json({
      success: true,
      message: 'TravelAI API is running',
      note: 'Frontend dist not found at any candidate path',
      checkedPaths: candidatePaths,
    });
  });
}

// Global error handler (must be last middleware)
app.use(errorHandler);

// Start server
let server: ReturnType<typeof app.listen> | null = null;
if (env.NODE_ENV !== 'production' || env.SERVE_STATIC === 'true' || !process.env.VERCEL) {
  server = app.listen(env.PORT, () => {
    console.log(`🚀 Server running on port ${env.PORT}`);
  });
}

// Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  if (server) {
    server.close(() => {
      console.log('🔒 HTTP server closed.');
    });
  }
  try {
    await mongoose.connection.close();
    console.log('🔒 MongoDB connection closed.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during graceful shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
