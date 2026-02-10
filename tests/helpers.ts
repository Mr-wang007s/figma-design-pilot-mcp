/**
 * Test helper: creates an isolated SQLite database for each test.
 *
 * Usage:
 *   import { createTestDb, closeTestDb } from '../helpers.js';
 *   let db, rawDb;
 *   beforeEach(() => { ({ db, rawDb } = createTestDb()); });
 *   afterEach(() => { closeTestDb(rawDb); });
 */
import BetterSqlite3 from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSchema } from '../src/db/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, '..', 'src', 'db', 'schema.sql');
const schemaSql = readFileSync(schemaPath, 'utf-8');

export interface TestDb {
  db: Kysely<DatabaseSchema>;
  rawDb: BetterSqlite3.Database;
}

/**
 * Create an in-memory SQLite database with the full schema applied.
 */
export function createTestDb(): TestDb {
  const sqliteDb = new BetterSqlite3(':memory:');
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
  sqliteDb.exec(schemaSql);

  const db = new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({ database: sqliteDb }),
  });

  return { db, rawDb: sqliteDb };
}

/**
 * Close the test database.
 */
export function closeTestDb(rawDb: BetterSqlite3.Database): void {
  try {
    rawDb.close();
  } catch {
    // Already closed
  }
}

/**
 * Create a mock Figma comment for testing.
 */
export function mockFigmaComment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'comment_1',
    file_key: 'test_file',
    parent_id: '',
    user: { id: 'user_1', handle: 'TestUser', img_url: '' },
    created_at: '2026-01-01T00:00:00Z',
    resolved_at: null,
    message: 'Test comment',
    client_meta: null,
    order_id: 1,
    reactions: [],
    ...overrides,
  };
}
