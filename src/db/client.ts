import BetterSqlite3 from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSchema } from './types.js';
import { appConfig } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── SQLite Instance ─────────────────────────────────────────────────────────

const sqliteDb = new BetterSqlite3(appConfig.DB_PATH);

// Enable WAL mode for better concurrent read performance
sqliteDb.pragma('journal_mode = WAL');
// Enable foreign keys
sqliteDb.pragma('foreign_keys = ON');

// ── Schema Initialization ───────────────────────────────────────────────────

const schemaPath = resolve(__dirname, 'schema.sql');

try {
  const schemaSql = readFileSync(schemaPath, 'utf-8');
  sqliteDb.exec(schemaSql);
} catch (err) {
  // In production (compiled), schema.sql might not be at the same relative path.
  // Try from the source directory as fallback.
  const fallbackPath = resolve(__dirname, '..', '..', 'src', 'db', 'schema.sql');
  try {
    const schemaSql = readFileSync(fallbackPath, 'utf-8');
    sqliteDb.exec(schemaSql);
  } catch {
    console.error('⚠️  Could not load schema.sql — database tables may not exist.');
    console.error('   Tried:', schemaPath, 'and', fallbackPath);
  }
}

// ── Kysely Instance ─────────────────────────────────────────────────────────

export const db = new Kysely<DatabaseSchema>({
  dialect: new SqliteDialect({
    database: sqliteDb,
  }),
});

// Expose the raw better-sqlite3 instance for operations that need it
// (e.g., transactions with immediate locking)
export const rawDb: BetterSqlite3.Database = sqliteDb;

// ── Lifecycle ───────────────────────────────────────────────────────────────

export function closeDatabaseConnection(): void {
  try {
    sqliteDb.close();
  } catch {
    // Already closed
  }
}

// Graceful shutdown handlers
function handleExit(): void {
  closeDatabaseConnection();
}

process.on('exit', handleExit);
process.on('SIGINT', () => {
  handleExit();
  process.exit(128 + 2);
});
process.on('SIGTERM', () => {
  handleExit();
  process.exit(128 + 15);
});
