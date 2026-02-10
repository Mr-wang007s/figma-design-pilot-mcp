import express from 'express';
import type { Express, Request, Response } from 'express';
import cors from 'cors';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMcpServer } from '../mcp/router.js';
import { syncComments } from '../core/sync.js';
import { appConfig } from '../config.js';
import { createHmac, timingSafeEqual } from 'node:crypto';

// ── Express App Factory ──────────────────────────────────────────────────────

/**
 * Create the Express app with SSE, message, webhook, and health endpoints.
 * Exported separately for testing.
 */
export function createSseApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Active SSE transports keyed by session ID
  const transports = new Map<string, SSEServerTransport>();

  // ── SSE Endpoint ─────────────────────────────────────────────────────────

  app.get('/sse', async (req: Request, res: Response) => {
    const server = createMcpServer();
    const transport = new SSEServerTransport('/message', res);
    transports.set(transport.sessionId, transport);

    transport.onclose = () => {
      transports.delete(transport.sessionId);
    };

    await server.connect(transport);
    await transport.start();
  });

  // ── JSON-RPC Message Endpoint ────────────────────────────────────────────

  app.post('/message', async (req: Request, res: Response) => {
    const sessionId = req.query['sessionId'] as string | undefined;
    if (!sessionId) {
      res.status(400).json({ error: 'Missing sessionId query parameter' });
      return;
    }

    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: 'Session not found. The SSE connection may have been closed.' });
      return;
    }

    await transport.handlePostMessage(req, res);
  });

  // ── Webhook Endpoint ─────────────────────────────────────────────────────

  app.post('/webhook', async (req: Request, res: Response) => {
    // Verify signature if secret is configured
    if (appConfig.WEBHOOK_SECRET) {
      const signature = req.headers['x-figma-signature'] as string | undefined;
      if (!signature || !verifyWebhookSignature(req.body, appConfig.WEBHOOK_SECRET, signature)) {
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
      }
    }

    const body = req.body as Record<string, unknown>;
    const eventType = body['event_type'] as string | undefined;
    const fileKey = body['file_key'] as string | undefined;

    if (eventType === 'FILE_COMMENT' && fileKey) {
      // Trigger incremental sync in background (don't block the response)
      syncComments(fileKey).catch((err: unknown) => {
        console.error(`⚠️  Webhook sync failed for ${fileKey}:`, err);
      });
    }

    res.status(200).json({ ok: true });
  });

  // ── Health Check ─────────────────────────────────────────────────────────

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', version: '3.1' });
  });

  return app;
}

// ── Server Startup ───────────────────────────────────────────────────────────

/**
 * Start the Express server with SSE transport.
 */
export async function startSseServer(port: number): Promise<void> {
  const app = createSseApp();

  app.listen(port, '127.0.0.1', () => {
    console.error(`🚀 Figma Comment Pilot MCP Server v3.1 running on http://127.0.0.1:${port}`);
    console.error(`   SSE endpoint:     http://127.0.0.1:${port}/sse`);
    console.error(`   Message endpoint: http://127.0.0.1:${port}/message`);
    console.error(`   Webhook endpoint: http://127.0.0.1:${port}/webhook`);
    console.error(`   Health check:     http://127.0.0.1:${port}/health`);
  });
}

// ── Webhook Signature Verification ───────────────────────────────────────────

function verifyWebhookSignature(
  body: unknown,
  secret: string,
  signature: string,
): boolean {
  try {
    const hmac = createHmac('sha256', secret);
    hmac.update(JSON.stringify(body));
    const expected = Buffer.from(hmac.digest('hex'));
    const received = Buffer.from(signature);

    if (expected.length !== received.length) return false;
    return timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}
