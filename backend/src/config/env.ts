import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backendEnv = path.resolve(__dirname, '../../.env');
const rootEnv = path.resolve(__dirname, '../../../.env');
const cwdEnv = path.resolve(process.cwd(), '.env');

if (fs.existsSync(backendEnv)) {
  dotenv.config({ path: backendEnv });
} else if (fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
} else if (fs.existsSync(cwdEnv)) {
  dotenv.config({ path: cwdEnv });
} else {
  dotenv.config();
}

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),
  FRONTEND_URL: z.string().optional(),
  /**
   * Additional exact CORS origins beyond FRONTEND_URL (comma-separated).
   * Suffix wildcards were removed deliberately (flaw F1) — every origin must be
   * an exact `http(s)://host[:port]` entry.
   */
  ALLOWED_EXTRA_ORIGINS: z.string().optional(),
  // Collaboration (Milestone 6). Consumed directly by services/collab/*
  TRIP_MAX_MEMBERS: z.coerce.number().positive().default(25),
  INVITE_TTL_HOURS: z.coerce.number().positive().default(168),
  INVITE_DEFAULT_MAX_USES: z.coerce.number().positive().default(1),
  // E4 presence (SSE). The live tier is opt-in per environment. NOTE: parsed
  // as a string first — `Boolean('false')` is true, which would be a trap.
  ENABLE_TRIP_SSE: z
    .string()
    .optional()
    .transform((value) => value !== undefined && value !== '' && value !== 'false'),
  PRESENCE_TTL_MS: z.coerce.number().positive().default(30000),
  SERVE_STATIC: z.string().optional(),
  // AI generation cache (Milestone 2). Consumed directly by services/ai/cache.ts
  AI_CACHE_TTL_MS: z.coerce.number().positive().optional(),
  AI_CACHE_MAX: z.coerce.number().positive().optional(),
  // Geo routing (Milestone 4). Consumed directly by services/geo/route.ts
  GEO_ROUTING_PROVIDER: z.enum(['haversine', 'osrm']).optional(),
  OSRM_BASE_URL: z.string().optional(),
  // Currency rates (Milestone 5). Consumed directly by services/finance/currency.ts
  CURRENCY_RATES_PROVIDER: z.string().optional(),
  CURRENCY_CACHE_TTL_MS: z.coerce.number().positive().optional(),
  // Weather + nearby search (Milestone 4). Consumed directly by services/geo/*
  OPEN_METEO_BASE: z.string().optional(),
  WEATHER_CACHE_TTL_MS: z.coerce.number().positive().optional(),
  // Comma-separated Overpass endpoints, tried in order (replaces the built-in mirrors).
  OVERPASS_ENDPOINTS: z.string().optional(),
  // Deprecated single endpoint: tried first, built-in mirrors stay as fallbacks.
  OVERPASS_ENDPOINT: z.string().optional(),
  OVERPASS_TIMEOUT_MS: z.coerce.number().positive().optional(),
  OVERPASS_BUDGET_MS: z.coerce.number().positive().optional(),
  // Geoapify Places (optional key): promoted to the first provider when set.
  GEOAPIFY_API_KEY: z.string().optional(),
  GEOAPIFY_TIMEOUT_MS: z.coerce.number().positive().optional(),
  // Nominatim (keyless fallback provider).
  NOMINATIM_BASE: z.string().optional(),
  NOMINATIM_TIMEOUT_MS: z.coerce.number().positive().optional(),
  NOMINATIM_MIN_INTERVAL_MS: z.coerce.number().positive().optional(),
  NEARBY_CACHE_TTL_MS: z.coerce.number().positive().optional(),
  NEARBY_RETRY_AFTER_MS: z.coerce.number().positive().optional(),
  NEARBY_BUDGET_MS: z.coerce.number().positive().optional(),
  // Receipt uploads (Milestone 5). Consumed directly by services/finance/receipt.ts
  UPLOAD_DIR: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().positive().optional(),
  // Cloudinary storage (Milestone 5.5). Consumed directly by services/finance/receipt.ts
  CLOUDINARY_URL: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_FOLDER: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
