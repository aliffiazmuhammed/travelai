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
import agencyRoutes from './routes/agency.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import { isCloudinaryConfigured, uploadDir } from './services/finance/receipt.js';
import { CSRF_HEADER, issueCsrfCookie, verifyCsrf } from './middleware/csrf.middleware.js';
import { isAllowedCorsOrigin, isSameOriginRequest } from './services/collab/httpOrigins.js';
import { healthState } from './utils/health.js';
import { buildCspDirectives } from './config/csp.js';

const app = express();

// Trust reverse proxy (Essential on Render, Heroku, Railway for HTTPS & rate limiting)
app.set('trust proxy', 1);

// Connect to MongoDB
await connectDB();

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
    // Agency feature discovery. The namespace is dark by default; the
    // frontend must not render agency navigation or call `/api/agency` unless
    // this is true. A5 ships branded proposal exports on top of A4 quotes.
    agency: {
      enabled: env.AGENCY_WORKSPACE_ENABLED,
      milestone: 'A5',
      writesEnabled: env.AGENCY_WORKSPACE_ENABLED,
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
    memory: process.memoryUsage(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/itinerary', itineraryRoutes);
app.use('/api/invites', invitesRoutes);
app.use('/api/geo', geoRoutes);
// Agency Workspace (A0): read-only placeholder namespace, gated per request.
app.use('/api/agency', agencyRoutes);

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
