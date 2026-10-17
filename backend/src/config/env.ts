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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
