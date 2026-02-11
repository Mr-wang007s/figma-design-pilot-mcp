import { z } from 'zod';
import { config as loadDotenv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from project root
loadDotenv({ path: resolve(__dirname, '..', '.env') });

const envSchema = z.object({
  FIGMA_CLIENT_ID: z.string().optional().default(''),
  FIGMA_CLIENT_SECRET: z.string().optional().default(''),
  DB_PATH: z.string().optional().default('./data.db'),
  AUTH_CALLBACK_PORT: z.coerce.number().int().positive().optional().default(3456),
  FIGMA_PERSONAL_ACCESS_TOKEN: z.string().optional().default(''),
  BOT_REPLY_PREFIX: z.string().optional().default('[FDP]'),
  SSE_PORT: z.coerce.number().int().positive().optional().default(3000),
  WEBHOOK_SECRET: z.string().optional().default(''),
});

export type AppConfig = z.infer<typeof envSchema>;

function loadConfig(): AppConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment configuration:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  // Resolve DB_PATH relative to project root
  const config = result.data;
  if (!resolve(config.DB_PATH).startsWith('/') && !resolve(config.DB_PATH).match(/^[A-Z]:\\/i)) {
    config.DB_PATH = resolve(__dirname, '..', config.DB_PATH);
  }

  return config;
}

export const appConfig = loadConfig();

// Status emoji shortcodes used by Figma API
export const STATUS_EMOJI = {
  PENDING: ':eyes:',
  DONE: ':white_check_mark:',
  WONTFIX: ':no_entry_sign:',
} as const;

// Unicode emoji for display/matching
export const STATUS_EMOJI_UNICODE = {
  PENDING: '👀',
  DONE: '✅',
  WONTFIX: '🚫',
} as const;

// Map emoji shortcodes to local status
export const EMOJI_TO_STATUS: Record<string, string> = {
  ':eyes:': 'PENDING',
  ':white_check_mark:': 'DONE',
  ':no_entry_sign:': 'WONTFIX',
  '👀': 'PENDING',
  '✅': 'DONE',
  '🚫': 'WONTFIX',
};

export type LocalStatus = 'OPEN' | 'PENDING' | 'DONE' | 'WONTFIX';
