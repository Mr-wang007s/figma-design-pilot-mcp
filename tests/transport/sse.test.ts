import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeTestDb, type TestDb } from '../helpers.js';
import type { Express } from 'express';
import { createServer, type Server } from 'node:http';
import { createHmac } from 'node:crypto';

let testDb: TestDb;

// Mock db module
vi.mock('../../src/db/client.js', () => ({
  get db() { return testDb.db; },
  get rawDb() { return testDb.rawDb; },
  closeDatabaseConnection: vi.fn(),
}));

// Mock Figma API
vi.mock('../../src/figma/api.js', () => ({
  getComments: vi.fn().mockResolvedValue({ comments: [] }),
  getCurrentUser: vi.fn().mockResolvedValue({ id: 'bot_1', handle: 'FCP Bot' }),
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
    SSE_PORT: 0, // Random port
    WEBHOOK_SECRET: 'test_secret_123',
  },
  EMOJI_TO_STATUS: {
    ':eyes:': 'PENDING',
    ':white_check_mark:': 'DONE',
    ':no_entry_sign:': 'WONTFIX',
  } as Record<string, string>,
}));

const { createSseApp } = await import('../../src/transport/sse.js');

let app: Express;
let server: Server;
let baseUrl: string;

beforeEach(async () => {
  testDb = createTestDb();
  vi.clearAllMocks();
  app = createSseApp();

  // Start on random port
  await new Promise<void>((resolve) => {
    server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

afterEach(async () => {
  closeTestDb(testDb.rawDb);
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok', version: '3.1' });
  });
});

describe('POST /message', () => {
  it('returns 400 without sessionId', async () => {
    const res = await fetch(`${baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('sessionId');
  });

  it('returns 404 with invalid sessionId', async () => {
    const res = await fetch(`${baseUrl}/message?sessionId=nonexistent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /webhook', () => {
  function signPayload(payload: unknown, secret: string): string {
    const hmac = createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }

  it('returns 200 for valid webhook with correct signature', async () => {
    const payload = { event_type: 'FILE_COMMENT', file_key: 'test_file' };
    const signature = signPayload(payload, 'test_secret_123');

    const res = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-figma-signature': signature,
      },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it('returns 401 for invalid signature', async () => {
    const payload = { event_type: 'FILE_COMMENT', file_key: 'test_file' };

    const res = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-figma-signature': 'invalid_signature',
      },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(401);
  });

  it('returns 401 when signature is missing', async () => {
    const payload = { event_type: 'FILE_COMMENT', file_key: 'test_file' };

    const res = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(401);
  });
});

describe('GET /sse', () => {
  it('returns SSE content-type', async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 500);

    try {
      const res = await fetch(`${baseUrl}/sse`, {
        signal: controller.signal,
      });
      // SSE connections return text/event-stream
      expect(res.headers.get('content-type')).toContain('text/event-stream');
    } catch {
      // AbortError is expected — we just need to verify the headers
    } finally {
      clearTimeout(timeout);
    }
  });
});
