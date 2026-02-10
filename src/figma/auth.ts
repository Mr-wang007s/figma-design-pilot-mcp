import axios from 'axios';
import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import { URL } from 'node:url';
import { db } from '../db/client.js';
import { appConfig } from '../config.js';
import type {
  FigmaOAuthTokenResponse,
  FigmaOAuthRefreshResponse,
} from './types.js';

const FIGMA_AUTH_URL = 'https://www.figma.com/oauth';
const FIGMA_TOKEN_URL = 'https://api.figma.com/v1/oauth/token';
const FIGMA_REFRESH_URL = 'https://api.figma.com/v1/oauth/refresh';

// ── Config Store Helpers ────────────────────────────────────────────────────

async function setConfig(key: string, value: string): Promise<void> {
  await db
    .insertInto('config')
    .values({ key, value })
    .onConflict((oc) => oc.column('key').doUpdateSet({ value }))
    .execute();
}

async function getConfig(key: string): Promise<string | undefined> {
  const row = await db
    .selectFrom('config')
    .select('value')
    .where('key', '=', key)
    .executeTakeFirst();
  return row?.value;
}

// ── OAuth URL Generation ────────────────────────────────────────────────────

/**
 * Generate the Figma OAuth authorization URL.
 */
export function getAuthorizationUrl(state: string): string {
  const redirectUri = `http://127.0.0.1:${appConfig.AUTH_CALLBACK_PORT}/callback`;
  const scopes = 'file_comments:read,file_comments:write,current_user:read';

  const params = new URLSearchParams({
    client_id: appConfig.FIGMA_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
    response_type: 'code',
  });

  return `${FIGMA_AUTH_URL}?${params.toString()}`;
}

// ── Token Exchange ──────────────────────────────────────────────────────────

/**
 * Exchange an authorization code for access + refresh tokens.
 * Must be called within 30 seconds of receiving the code.
 */
export async function exchangeCodeForToken(
  code: string,
): Promise<FigmaOAuthTokenResponse> {
  const auth = Buffer.from(
    `${appConfig.FIGMA_CLIENT_ID}:${appConfig.FIGMA_CLIENT_SECRET}`,
  ).toString('base64');

  const redirectUri = `http://127.0.0.1:${appConfig.AUTH_CALLBACK_PORT}/callback`;

  const response = await axios.post<FigmaOAuthTokenResponse>(
    FIGMA_TOKEN_URL,
    new URLSearchParams({
      redirect_uri: redirectUri,
      code,
      grant_type: 'authorization_code',
    }),
    {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );

  const data = response.data;

  // Store tokens in DB
  await setConfig('access_token', data.access_token);
  await setConfig('refresh_token', data.refresh_token);
  await setConfig(
    'token_expires_at',
    new Date(Date.now() + data.expires_in * 1000).toISOString(),
  );

  if (data.user_id_string) {
    await setConfig('bot_user_id', data.user_id_string);
  }

  return data;
}

// ── Token Refresh ───────────────────────────────────────────────────────────

/**
 * Refresh the access token using the stored refresh token.
 */
export async function refreshAccessToken(): Promise<string> {
  const refreshToken = await getConfig('refresh_token');
  if (!refreshToken) {
    throw new Error(
      'No refresh token found. Run `npx figma-mcp-server auth` to authenticate.',
    );
  }

  const auth = Buffer.from(
    `${appConfig.FIGMA_CLIENT_ID}:${appConfig.FIGMA_CLIENT_SECRET}`,
  ).toString('base64');

  const response = await axios.post<FigmaOAuthRefreshResponse>(
    FIGMA_REFRESH_URL,
    new URLSearchParams({
      refresh_token: refreshToken,
    }),
    {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );

  const data = response.data;

  await setConfig('access_token', data.access_token);
  await setConfig(
    'token_expires_at',
    new Date(Date.now() + data.expires_in * 1000).toISOString(),
  );

  return data.access_token;
}

/**
 * Ensure the access token is valid, refreshing if necessary.
 */
export async function ensureValidToken(): Promise<string> {
  // Check for PAT first
  if (appConfig.FIGMA_PERSONAL_ACCESS_TOKEN) {
    return appConfig.FIGMA_PERSONAL_ACCESS_TOKEN;
  }

  const accessToken = await getConfig('access_token');
  if (!accessToken) {
    throw new Error(
      'No access token found. Run `npx figma-mcp-server auth` to authenticate.',
    );
  }

  const expiresAt = await getConfig('token_expires_at');
  if (expiresAt) {
    const expiryDate = new Date(expiresAt);
    const now = new Date();
    // Refresh if token expires within 5 minutes
    if (expiryDate.getTime() - now.getTime() < 5 * 60 * 1000) {
      try {
        return await refreshAccessToken();
      } catch {
        console.error('⚠️  Token refresh failed. Using existing token.');
        return accessToken;
      }
    }
  }

  return accessToken;
}

// ── OAuth Callback Server ───────────────────────────────────────────────────

/**
 * Start a temporary HTTP server to handle the OAuth callback.
 * Opens the browser for user authorization.
 * Returns after the token exchange is complete.
 */
export function startAuthServer(): Promise<FigmaOAuthTokenResponse> {
  return new Promise((resolve, reject) => {
    const state = Math.random().toString(36).substring(2);
    const port = appConfig.AUTH_CALLBACK_PORT;

    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);

        if (url.pathname !== '/callback') {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }

        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(400);
          res.end(`Authorization failed: ${error}`);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (returnedState !== state) {
          res.writeHead(400);
          res.end('State mismatch — possible CSRF attack.');
          server.close();
          reject(new Error('State mismatch'));
          return;
        }

        if (!code) {
          res.writeHead(400);
          res.end('No authorization code received.');
          server.close();
          reject(new Error('No code'));
          return;
        }

        // Exchange code immediately (30s window!)
        const tokenData = await exchangeCodeForToken(code);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: system-ui; text-align: center; padding: 40px;">
              <h1>✅ Figma Comment Pilot — Authorized!</h1>
              <p>You can close this tab and return to your terminal.</p>
            </body>
          </html>
        `);

        server.close();
        resolve(tokenData);
      } catch (err) {
        res.writeHead(500);
        res.end('Internal error during token exchange.');
        server.close();
        reject(err);
      }
    });

    server.listen(port, '127.0.0.1', () => {
      const authUrl = getAuthorizationUrl(state);
      console.error(`\n🔐 Opening browser for Figma authorization...`);
      console.error(`   If it doesn't open automatically, visit:\n`);
      console.error(`   ${authUrl}\n`);

      // Try to open browser
      const cmd =
        process.platform === 'win32'
          ? `start "" "${authUrl}"`
          : process.platform === 'darwin'
            ? `open "${authUrl}"`
            : `xdg-open "${authUrl}"`;
      exec(cmd);
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authorization timed out after 5 minutes.'));
    }, 5 * 60 * 1000);
  });
}
