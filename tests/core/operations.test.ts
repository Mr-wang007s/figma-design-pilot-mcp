import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb, type TestDb } from '../helpers.js';

let testDb: TestDb;

// Mock db module — MUST be before importing operations
vi.mock('../../src/db/client.js', () => ({
  get db() { return testDb.db; },
  get rawDb() { return testDb.rawDb; },
  closeDatabaseConnection: vi.fn(),
}));

// Mock Figma API
const mockPostComment = vi.fn().mockResolvedValue({ id: 'figma_comment_123' });
const mockDeleteComment = vi.fn().mockResolvedValue(undefined);
const mockAddReaction = vi.fn().mockResolvedValue(undefined);
const mockRemoveReaction = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/figma/api.js', () => ({
  postComment: (...args: unknown[]) => mockPostComment(...args),
  deleteComment: (...args: unknown[]) => mockDeleteComment(...args),
  addReaction: (...args: unknown[]) => mockAddReaction(...args),
  removeReaction: (...args: unknown[]) => mockRemoveReaction(...args),
}));

// Mock config
vi.mock('../../src/config.js', () => ({
  appConfig: {
    FIGMA_CLIENT_ID: '',
    FIGMA_CLIENT_SECRET: '',
    DB_PATH: ':memory:',
    AUTH_CALLBACK_PORT: 3456,
    FIGMA_PERSONAL_ACCESS_TOKEN: '',
    BOT_REPLY_PREFIX: '[FCP]',
  },
}));

// Import AFTER mocks
const {
  enqueueReply,
  enqueueSetStatus,
  enqueueRemoveReaction,
  enqueueDeleteComment,
  processOperations,
  cleanupOldOperations,
} = await import('../../src/core/operations.js');

beforeEach(() => {
  testDb = createTestDb();
  vi.clearAllMocks();
});

afterEach(() => {
  closeTestDb(testDb.rawDb);
});

describe('enqueueReply', () => {
  it('creates a PENDING operation in the DB', async () => {
    const result = await enqueueReply('file1', 'root1', 'Hello');
    expect(result.status).toBe('created');
    expect(result.op_id).toBeTruthy();

    const row = await testDb.db
      .selectFrom('operations')
      .selectAll()
      .where('op_id', '=', result.op_id)
      .executeTakeFirst();

    expect(row).toBeDefined();
    expect(row!.state).toBe('PENDING');
    expect(row!.op_type).toBe('REPLY');
    expect(row!.file_key).toBe('file1');
  });

  it('returns duplicate for same content', async () => {
    const first = await enqueueReply('file1', 'root1', 'Hello');
    const second = await enqueueReply('file1', 'root1', 'Hello');

    expect(first.status).toBe('created');
    expect(second.status).toBe('duplicate');
    expect(second.op_id).toBe(first.op_id);
  });

  it('creates separate operations for different content', async () => {
    const a = await enqueueReply('file1', 'root1', 'Hello');
    const b = await enqueueReply('file1', 'root1', 'World');

    expect(a.status).toBe('created');
    expect(b.status).toBe('created');
    expect(a.op_id).not.toBe(b.op_id);
  });

  it('prepends [FCP] prefix to message', async () => {
    const result = await enqueueReply('file1', 'root1', 'Hello');

    const row = await testDb.db
      .selectFrom('operations')
      .selectAll()
      .where('op_id', '=', result.op_id)
      .executeTakeFirst();

    const payload = JSON.parse(row!.payload_json);
    expect(payload.message).toBe('[FCP] Hello');
  });
});

describe('enqueueSetStatus', () => {
  it('creates ADD_REACTION operation', async () => {
    const result = await enqueueSetStatus('file1', 'c1', ':eyes:');
    expect(result.status).toBe('created');

    const row = await testDb.db
      .selectFrom('operations')
      .selectAll()
      .where('op_id', '=', result.op_id)
      .executeTakeFirst();

    expect(row!.op_type).toBe('ADD_REACTION');
    const payload = JSON.parse(row!.payload_json);
    expect(payload.emoji).toBe(':eyes:');
  });

  it('detects duplicate', async () => {
    await enqueueSetStatus('file1', 'c1', ':eyes:');
    const dup = await enqueueSetStatus('file1', 'c1', ':eyes:');
    expect(dup.status).toBe('duplicate');
  });
});

describe('enqueueRemoveReaction', () => {
  it('creates REMOVE_REACTION operation', async () => {
    const result = await enqueueRemoveReaction('file1', 'c1', ':eyes:');
    expect(result.status).toBe('created');

    const row = await testDb.db
      .selectFrom('operations')
      .selectAll()
      .where('op_id', '=', result.op_id)
      .executeTakeFirst();

    expect(row!.op_type).toBe('REMOVE_REACTION');
  });
});

describe('enqueueDeleteComment', () => {
  it('creates DELETE_COMMENT operation', async () => {
    const result = await enqueueDeleteComment('file1', 'c1');
    expect(result.status).toBe('created');

    const row = await testDb.db
      .selectFrom('operations')
      .selectAll()
      .where('op_id', '=', result.op_id)
      .executeTakeFirst();

    expect(row!.op_type).toBe('DELETE_COMMENT');
  });
});

describe('processOperations', () => {
  it('processes PENDING REPLY → CONFIRMED', async () => {
    const { op_id } = await enqueueReply('file1', 'root1', 'Hello');
    const processed = await processOperations('file1');

    expect(processed).toBe(1);
    expect(mockPostComment).toHaveBeenCalledOnce();

    const row = await testDb.db
      .selectFrom('operations')
      .selectAll()
      .where('op_id', '=', op_id)
      .executeTakeFirst();

    expect(row!.state).toBe('CONFIRMED');
    expect(row!.figma_response_id).toBe('figma_comment_123');
  });

  it('processes ADD_REACTION operation', async () => {
    await enqueueSetStatus('file1', 'c1', ':eyes:');
    await processOperations('file1');
    expect(mockAddReaction).toHaveBeenCalledOnce();
  });

  it('processes REMOVE_REACTION operation', async () => {
    await enqueueRemoveReaction('file1', 'c1', ':eyes:');
    await processOperations('file1');
    expect(mockRemoveReaction).toHaveBeenCalledOnce();
  });

  it('processes DELETE_COMMENT operation', async () => {
    await enqueueDeleteComment('file1', 'c1');
    await processOperations('file1');
    expect(mockDeleteComment).toHaveBeenCalledOnce();
  });

  it('increments retry_count on failure, keeps PENDING', async () => {
    mockPostComment.mockRejectedValueOnce(new Error('Network error'));

    const { op_id } = await enqueueReply('file1', 'root1', 'Hello');
    await processOperations('file1');

    const row = await testDb.db
      .selectFrom('operations')
      .selectAll()
      .where('op_id', '=', op_id)
      .executeTakeFirst();

    expect(row!.retry_count).toBe(1);
    expect(row!.state).toBe('PENDING');
    expect(row!.error_message).toBe('Network error');
  });

  it('marks FAILED after MAX_RETRIES (3)', async () => {
    mockPostComment.mockRejectedValue(new Error('Persistent error'));

    const { op_id } = await enqueueReply('file1', 'root1', 'Hello');

    // Process 3 times
    await processOperations('file1');
    await processOperations('file1');
    await processOperations('file1');

    const row = await testDb.db
      .selectFrom('operations')
      .selectAll()
      .where('op_id', '=', op_id)
      .executeTakeFirst();

    expect(row!.retry_count).toBe(3);
    expect(row!.state).toBe('FAILED');
  });

  it('does not process operations for other files', async () => {
    await enqueueReply('file1', 'root1', 'Hello');
    const processed = await processOperations('file2');
    expect(processed).toBe(0);
    expect(mockPostComment).not.toHaveBeenCalled();
  });
});

describe('cleanupOldOperations', () => {
  it('deletes old CONFIRMED operations', async () => {
    const { op_id } = await enqueueReply('file1', 'root1', 'Hello');

    // Manually set to CONFIRMED with old timestamp
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await testDb.db
      .updateTable('operations')
      .set({ state: 'CONFIRMED', created_at: oldDate })
      .where('op_id', '=', op_id)
      .execute();

    const deleted = await cleanupOldOperations();
    expect(deleted).toBe(1);
  });

  it('deletes old FAILED operations', async () => {
    const { op_id } = await enqueueReply('file1', 'root1', 'Hello');

    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await testDb.db
      .updateTable('operations')
      .set({ state: 'FAILED', created_at: oldDate })
      .where('op_id', '=', op_id)
      .execute();

    const deleted = await cleanupOldOperations();
    expect(deleted).toBe(1);
  });

  it('does NOT delete PENDING operations', async () => {
    const { op_id } = await enqueueReply('file1', 'root1', 'Hello');

    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await testDb.db
      .updateTable('operations')
      .set({ created_at: oldDate })
      .where('op_id', '=', op_id)
      .execute();

    const deleted = await cleanupOldOperations();
    expect(deleted).toBe(0);
  });

  it('does NOT delete recent CONFIRMED operations', async () => {
    const { op_id } = await enqueueReply('file1', 'root1', 'Hello');

    await testDb.db
      .updateTable('operations')
      .set({ state: 'CONFIRMED' })
      .where('op_id', '=', op_id)
      .execute();

    const deleted = await cleanupOldOperations();
    expect(deleted).toBe(0);
  });
});
