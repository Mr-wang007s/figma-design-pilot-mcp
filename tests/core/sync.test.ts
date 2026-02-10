import { createTestDb, closeTestDb, type TestDb } from '../helpers.js';
import type { FigmaComment, FigmaCommentsResponse } from '../../src/figma/types.js';

let testDb: TestDb;

// Mock db module
vi.mock('../../src/db/client.js', () => ({
  get db() { return testDb.db; },
  get rawDb() { return testDb.rawDb; },
  closeDatabaseConnection: vi.fn(),
}));

// Mock Figma API
const mockGetComments = vi.fn<() => Promise<FigmaCommentsResponse>>();
const mockGetCurrentUser = vi.fn().mockResolvedValue({ id: 'bot_1', handle: 'FCP Bot' });

vi.mock('../../src/figma/api.js', () => ({
  getComments: () => mockGetComments(),
  getCurrentUser: () => mockGetCurrentUser(),
  postComment: vi.fn().mockResolvedValue({ id: 'new_c' }),
  deleteComment: vi.fn(),
  addReaction: vi.fn(),
  removeReaction: vi.fn(),
}));

// Mock config
vi.mock('../../src/config.js', () => ({
  appConfig: {
    FIGMA_CLIENT_ID: '',
    FIGMA_CLIENT_SECRET: '',
    DB_PATH: ':memory:',
    AUTH_CALLBACK_PORT: 3456,
    FIGMA_PERSONAL_ACCESS_TOKEN: 'test_pat',
    BOT_REPLY_PREFIX: '[FCP]',
  },
  EMOJI_TO_STATUS: {
    ':eyes:': 'PENDING',
    ':white_check_mark:': 'DONE',
    ':no_entry_sign:': 'WONTFIX',
    '👀': 'PENDING',
    '✅': 'DONE',
    '🚫': 'WONTFIX',
  } as Record<string, string>,
}));

const { syncComments, getThread, listPendingThreads } = await import(
  '../../src/core/sync.js'
);

function makeFigmaComment(overrides: Partial<FigmaComment> = {}): FigmaComment {
  return {
    id: 'c_1',
    file_key: 'test_file',
    parent_id: '',
    user: { id: 'user_1', handle: 'Designer', img_url: '' },
    created_at: '2026-01-01T00:00:00Z',
    resolved_at: null,
    message: 'Fix the button color',
    client_meta: null,
    order_id: 1,
    reactions: [],
    ...overrides,
  };
}

beforeEach(() => {
  testDb = createTestDb();
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue({ id: 'bot_1', handle: 'FCP Bot' });
});

afterEach(() => {
  closeTestDb(testDb.rawDb);
});

describe('syncComments', () => {
  it('returns empty threads for empty file', async () => {
    mockGetComments.mockResolvedValue({ comments: [] });
    const result = await syncComments('test_file');

    expect(result.threads).toHaveLength(0);
    expect(result.stats.total_comments_fetched).toBe(0);
    expect(result.stats.new_threads).toBe(0);
  });

  it('returns single root comment as OPEN thread', async () => {
    mockGetComments.mockResolvedValue({
      comments: [makeFigmaComment()],
    });

    const result = await syncComments('test_file');

    expect(result.threads).toHaveLength(1);
    expect(result.threads[0].status).toBe('OPEN');
    expect(result.threads[0].id).toBe('c_1');
    expect(result.threads[0].replies).toHaveLength(0);
  });

  it('groups root + replies into a thread', async () => {
    mockGetComments.mockResolvedValue({
      comments: [
        makeFigmaComment({ id: 'root_1' }),
        makeFigmaComment({
          id: 'reply_1',
          parent_id: 'root_1',
          message: 'First reply',
          created_at: '2026-01-01T01:00:00Z',
        }),
        makeFigmaComment({
          id: 'reply_2',
          parent_id: 'root_1',
          message: 'Second reply',
          created_at: '2026-01-01T02:00:00Z',
        }),
      ],
    });

    const result = await syncComments('test_file');

    expect(result.threads).toHaveLength(1);
    expect(result.threads[0].replies).toHaveLength(2);
    // Sorted by created_at
    expect(result.threads[0].replies[0].id).toBe('reply_1');
    expect(result.threads[0].replies[1].id).toBe('reply_2');
  });

  it('detects bot messages by user ID', async () => {
    mockGetComments.mockResolvedValue({
      comments: [
        makeFigmaComment({ id: 'root_1' }),
        makeFigmaComment({
          id: 'reply_bot',
          parent_id: 'root_1',
          user: { id: 'bot_1', handle: 'FCP Bot', img_url: '' },
          message: 'Bot reply',
        }),
      ],
    });

    const result = await syncComments('test_file');
    expect(result.threads[0].replies[0].is_ai).toBe(true);
  });

  it('detects bot messages by [FCP] prefix', async () => {
    mockGetComments.mockResolvedValue({
      comments: [
        makeFigmaComment({ id: 'root_1' }),
        makeFigmaComment({
          id: 'reply_fcp',
          parent_id: 'root_1',
          message: '[FCP] Automated reply',
          user: { id: 'other_user', handle: 'Other', img_url: '' },
        }),
      ],
    });

    const result = await syncComments('test_file');
    expect(result.threads[0].replies[0].is_ai).toBe(true);
  });

  it('sets status DONE from ✅ reaction (stored in DB, not in result threads)', async () => {
    mockGetComments.mockResolvedValue({
      comments: [
        makeFigmaComment({
          id: 'root_1',
          reactions: [
            { user: { id: 'user_1', handle: 'X', img_url: '' }, emoji: ':white_check_mark:', created_at: '2026-01-01T00:00:00Z' },
          ],
        }),
      ],
    });

    const result = await syncComments('test_file');
    // DONE threads are NOT returned in sync result (only OPEN/PENDING)
    expect(result.threads).toHaveLength(0);

    // But the thread IS stored in DB with DONE status
    const thread = await getThread('test_file', 'root_1');
    expect(thread).not.toBeNull();
    expect(thread!.status).toBe('DONE');
  });

  it('needs_attention=true when OPEN and last reply is not bot', async () => {
    mockGetComments.mockResolvedValue({
      comments: [
        makeFigmaComment({ id: 'root_1' }),
        makeFigmaComment({
          id: 'reply_1',
          parent_id: 'root_1',
          user: { id: 'human_user', handle: 'Human', img_url: '' },
          message: 'Human reply',
        }),
      ],
    });

    const result = await syncComments('test_file');
    expect(result.threads[0].needs_attention).toBe(true);
  });

  it('needs_attention=false when last reply is bot', async () => {
    mockGetComments.mockResolvedValue({
      comments: [
        makeFigmaComment({ id: 'root_1' }),
        makeFigmaComment({
          id: 'reply_bot',
          parent_id: 'root_1',
          user: { id: 'bot_1', handle: 'FCP Bot', img_url: '' },
          message: '[FCP] Done',
        }),
      ],
    });

    const result = await syncComments('test_file');
    expect(result.threads[0].needs_attention).toBe(false);
  });

  it('upsert: second sync with same data produces 0 new threads', async () => {
    const comments = [makeFigmaComment({ id: 'root_1' })];
    mockGetComments.mockResolvedValue({ comments });

    const first = await syncComments('test_file');
    expect(first.stats.new_threads).toBe(1);

    const second = await syncComments('test_file');
    expect(second.stats.new_threads).toBe(0);
  });

  it('skips orphaned replies', async () => {
    mockGetComments.mockResolvedValue({
      comments: [
        makeFigmaComment({ id: 'root_1' }),
        makeFigmaComment({
          id: 'orphan_reply',
          parent_id: 'nonexistent_root',
          message: 'Orphaned',
        }),
      ],
    });

    const result = await syncComments('test_file');
    expect(result.threads).toHaveLength(1);
    expect(result.threads[0].replies).toHaveLength(0);
  });
});

describe('getThread', () => {
  it('returns full Thread DTO for existing thread', async () => {
    mockGetComments.mockResolvedValue({
      comments: [makeFigmaComment({ id: 'root_1' })],
    });
    await syncComments('test_file');

    const thread = await getThread('test_file', 'root_1');
    expect(thread).not.toBeNull();
    expect(thread!.id).toBe('root_1');
    expect(thread!.status).toBe('OPEN');
  });

  it('returns null for non-existent thread', async () => {
    const thread = await getThread('test_file', 'nonexistent');
    expect(thread).toBeNull();
  });
});

describe('listPendingThreads', () => {
  beforeEach(async () => {
    mockGetComments.mockResolvedValue({
      comments: [
        makeFigmaComment({ id: 'open_1', message: 'Open thread' }),
        makeFigmaComment({
          id: 'done_1',
          message: 'Done thread',
          reactions: [
            { user: { id: 'u', handle: 'X', img_url: '' }, emoji: ':white_check_mark:', created_at: '2026-01-01T00:00:00Z' },
          ],
        }),
      ],
    });
    await syncComments('test_file');
  });

  it('returns only OPEN/PENDING threads', async () => {
    const threads = await listPendingThreads('test_file');
    expect(threads.every((t) => t.status === 'OPEN' || t.status === 'PENDING')).toBe(true);
  });

  it('excludes DONE threads', async () => {
    const threads = await listPendingThreads('test_file');
    expect(threads.find((t) => t.id === 'done_1')).toBeUndefined();
  });

  it('respects limit parameter', async () => {
    // Add more open threads
    mockGetComments.mockResolvedValue({
      comments: [
        makeFigmaComment({ id: 'a1', created_at: '2026-01-01T00:00:00Z' }),
        makeFigmaComment({ id: 'a2', created_at: '2026-01-02T00:00:00Z' }),
        makeFigmaComment({ id: 'a3', created_at: '2026-01-03T00:00:00Z' }),
      ],
    });
    await syncComments('test_file', true);

    const threads = await listPendingThreads('test_file', 2);
    expect(threads).toHaveLength(2);
  });

  it('excludes soft-deleted threads', async () => {
    // Soft-delete the open thread
    await testDb.db
      .updateTable('comments')
      .set({ deleted_at: new Date().toISOString() })
      .where('id', '=', 'open_1')
      .execute();

    const threads = await listPendingThreads('test_file');
    expect(threads.find((t) => t.id === 'open_1')).toBeUndefined();
  });
});
