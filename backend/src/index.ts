import express from 'express';
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
import { errorHandler } from './middleware/error.middleware.js';

const app = express();

// Trust reverse proxy (Essential on Render, Heroku, Railway for HTTPS & rate limiting)
app.set('trust proxy', 1);

// Connect to MongoDB
await connectDB();

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration (handles custom domain, Render URLs, and local development)
const configuredOrigins = (env.FRONTEND_URL || '')
  .split(',')
  .map((u) => u.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:3000',
  'https://travelai-eta.vercel.app',
  'https://travelai-8cm4.vercel.app',
  ...configuredOrigins,
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const cleanOrigin = origin.replace(/\/+$/, '');
      if (
        allowedOrigins.includes(cleanOrigin) ||
        cleanOrigin.endsWith('.onrender.com') ||
        cleanOrigin.endsWith('.vercel.app')
      ) {
        return callback(null, true);
      }
      return callback(
        new Error(`The CORS policy for this site does not allow access from Origin: ${origin}`),
        false
      );
    },
    credentials: true,
  })
);

// Body parsers
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// Static Frontend Discovery (Unified Monorepo Single-Service Deployment)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Comprehensive candidate locations for frontend/dist across dev, root cwd, workspace cwd, and Render platform path
const candidatePaths = [
  path.resolve(process.cwd(), '../frontend/dist'),
  path.resolve(process.cwd(), 'frontend/dist'),
  path.resolve(process.cwd(), '../../frontend/dist'),
  path.resolve(__dirname, '../../frontend/dist'),
  path.resolve(__dirname, '../../../frontend/dist'),
  path.resolve(__dirname, '../frontend/dist'),
  '/opt/render/project/src/frontend/dist',
];
const frontendDist = candidatePaths.find((p) => fs.existsSync(path.join(p, 'index.html')));

const shouldServeStatic =
  env.SERVE_STATIC === 'true' ||
  (env.SERVE_STATIC !== 'false' && Boolean(frontendDist));

// Health check with DB status, memory diagnostics, and static serving status
app.get('/api/health', (_req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatusMap: Record<number, string> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  res.json({
    success: true,
    status: 'healthy',
    database: dbStatusMap[dbState] || 'unknown',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    staticServing: {
      enabled: Boolean(shouldServeStatic && frontendDist),
      resolvedPath: frontendDist || 'NOT_FOUND',
      envServeStatic: env.SERVE_STATIC ?? 'unset',
      cwd: process.cwd(),
      dirname: __dirname,
      candidatePaths: candidatePaths.map((p) => ({
        path: p,
        hasIndexHtml: fs.existsSync(path.join(p, 'index.html')),
      })),
    },
    memory: process.memoryUsage(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/itinerary', itineraryRoutes);

if (shouldServeStatic && frontendDist) {
  console.log(`📦 Serving static frontend files from: ${frontendDist}`);
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
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
