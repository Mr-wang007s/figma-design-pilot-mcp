import express from 'express';
import type { Express, Request, Response } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from '../mcp/router.js';
import { syncComments } from '../core/sync.js';
import { appConfig } from '../config.js';
import { createHmac, timingSafeEqual } from 'node:crypto';

// ── Express App Factory ──────────────────────────────────────────────────────

/**
 * Create the Express app with Streamable HTTP MCP transport, webhook, and health endpoints.
 * Exported separately for testing.
 */
export function createSseApp(): Express {
  const app = express();
  app.use(cors());

  // Parse JSON for all routes EXCEPT /mcp (MCP transport reads the raw stream itself)
  app.use((req, res, next) => {
    if (req.path === '/mcp') return next();
    express.json()(req, res, next);
  });

  // Active transports keyed by session ID
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // ── MCP Streamable HTTP Endpoint ──────────────────────────────────────────

  // Handle POST (JSON-RPC messages including initialize)
  app.post('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Existing session
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res);
      return;
    }

    // New session (initialize request)
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        transports.delete(transport.sessionId);
      }
    };

    await server.connect(transport);
    await transport.handleRequest(req, res);

    if (transport.sessionId) {
      transports.set(transport.sessionId, transport);
    }
  });

  // Handle GET (SSE stream for server-initiated messages)
  app.get('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({ error: 'Missing or invalid session ID. Send an initialize request first.' });
      return;
    }

    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  });

  // Handle DELETE (session termination)
  app.delete('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !transports.has(sessionId)) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }

    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
    transports.delete(sessionId);
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
 * Start the Express server with Streamable HTTP transport.
 */
export async function startSseServer(port: number): Promise<void> {
  const app = createSseApp();

  app.listen(port, '127.0.0.1', () => {
    console.error(`🚀 Figma Comment Pilot MCP Server v3.1 running on http://127.0.0.1:${port}`);
    console.error(`   MCP endpoint:     http://127.0.0.1:${port}/mcp`);
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
