import { createTestDb, closeTestDb, type TestDb } from '../helpers.js';
import type { FigmaComment, FigmaCommentsResponse } from '../../src/figma/types.js';

let testDb: TestDb;

vi.mock('../../src/db/client.js', () => ({
  get db() { return testDb.db; },
  get rawDb() { return testDb.rawDb; },
  closeDatabaseConnection: vi.fn(),
}));

const mockGetComments = vi.fn<() => Promise<FigmaCommentsResponse>>();

vi.mock('../../src/figma/api.js', () => ({
  getComments: () => mockGetComments(),
  getCurrentUser: vi.fn().mockResolvedValue({ id: 'bot_1', handle: 'FCP Bot' }),
  postComment: vi.fn().mockResolvedValue({ id: 'new_c' }),
  deleteComment: vi.fn(),
  addReaction: vi.fn(),
  removeReaction: vi.fn(),
}));

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
    message: 'Test comment',
    client_meta: null,
    order_id: 1,
    reactions: [],
    ...overrides,
  };
}

beforeEach(() => {
  testDb = createTestDb();
  vi.clearAllMocks();
});

afterEach(() => {
  closeTestDb(testDb.rawDb);
});

describe('Integration: Sync → DB → Read flow', () => {
  it('full lifecycle: sync 3 threads, read back, filter pending', async () => {
    // 1. Setup: 3 threads — one open, one with replies, one done
    mockGetComments.mockResolvedValue({
      comments: [
        // Thread 1: Simple open
        makeFigmaComment({ id: 'thread_1', message: 'Please review the header' }),

        // Thread 2: With replies
        makeFigmaComment({ id: 'thread_2', message: 'Button alignment is off' }),
        makeFigmaComment({
          id: 'reply_2a',
          parent_id: 'thread_2',
          message: 'I see the issue',
          user: { id: 'user_2', handle: 'Dev', img_url: '' },
          created_at: '2026-01-01T01:00:00Z',
        }),
        makeFigmaComment({
          id: 'reply_2b',
          parent_id: 'thread_2',
          message: '[FCP] I will fix this',
          user: { id: 'bot_1', handle: 'FCP Bot', img_url: '' },
          created_at: '2026-01-01T02:00:00Z',
        }),

        // Thread 3: Done (has ✅ reaction)
        makeFigmaComment({
          id: 'thread_3',
          message: 'Color looks wrong',
          reactions: [
            { user: { id: 'user_1', handle: 'Designer', img_url: '' }, emoji: ':white_check_mark:', created_at: '2026-01-01T00:00:00Z' },
          ],
        }),
      ],
    });

    // 2. Sync
    const result = await syncComments('test_file');

    expect(result.stats.new_threads).toBe(3);
    expect(result.stats.total_comments_fetched).toBe(5);

    // 3. Verify getThread returns correct data
    const thread2 = await getThread('test_file', 'thread_2');
    expect(thread2).not.toBeNull();
    expect(thread2!.replies).toHaveLength(2);
    expect(thread2!.replies[1].is_ai).toBe(true); // Bot reply
    expect(thread2!.status).toBe('OPEN');

    const thread3 = await getThread('test_file', 'thread_3');
    expect(thread3).not.toBeNull();
    expect(thread3!.status).toBe('DONE');

    // 4. Verify listPendingThreads returns only OPEN/PENDING
    const pending = await listPendingThreads('test_file');
    const pendingIds = pending.map((t) => t.id);
    expect(pendingIds).toContain('thread_1');
    expect(pendingIds).toContain('thread_2');
    expect(pendingIds).not.toContain('thread_3'); // DONE excluded

    // 5. Manually mark thread_1 as DONE in DB
    await testDb.db
      .updateTable('comments')
      .set({ local_status: 'DONE' })
      .where('id', '=', 'thread_1')
      .execute();

    const pendingAfter = await listPendingThreads('test_file');
    const pendingIdsAfter = pendingAfter.map((t) => t.id);
    expect(pendingIdsAfter).not.toContain('thread_1');
    expect(pendingIdsAfter).toContain('thread_2');
  });

  it('sanitizes comment text for LLM output', async () => {
    mockGetComments.mockResolvedValue({
      comments: [
        makeFigmaComment({
          id: 'xss_thread',
          message: '<script>alert("xss")</script>',
        }),
      ],
    });

    await syncComments('test_file');
    const thread = await getThread('test_file', 'xss_thread');

    expect(thread!.root_comment.text).toContain('&lt;script&gt;');
    expect(thread!.root_comment.text).toContain('<user_content>');
    expect(thread!.root_comment.text).not.toContain('<script>');
  });

  it('re-sync with status change reconciles correctly', async () => {
    // First sync: thread with ✅ → DONE
    mockGetComments.mockResolvedValue({
      comments: [
        makeFigmaComment({
          id: 'thread_r',
          reactions: [
            { user: { id: 'u', handle: 'X', img_url: '' }, emoji: ':white_check_mark:', created_at: '2026-01-01T00:00:00Z' },
          ],
        }),
      ],
    });
    await syncComments('test_file');

    let thread = await getThread('test_file', 'thread_r');
    expect(thread!.status).toBe('DONE');

    // Second sync: emoji removed → should reopen to OPEN
    mockGetComments.mockResolvedValue({
      comments: [
        makeFigmaComment({ id: 'thread_r', reactions: [] }),
      ],
    });
    await syncComments('test_file');

    thread = await getThread('test_file', 'thread_r');
    expect(thread!.status).toBe('OPEN');
  });
});
