import axios from 'axios';
import type { AxiosInstance } from 'axios';
import Bottleneck from 'bottleneck';
import { db } from '../db/client.js';
import type {
  FigmaCommentsResponse,
  FigmaComment,
  FigmaPostCommentRequest,
  FigmaPostReactionRequest,
} from './types.js';
import type {
  FigmaFileResponse,
  FigmaFileNodesResponse,
  FigmaImagesResponse,
  FigmaVersionsResponse,
  FigmaVariablesResponse,
} from './design_types.js';

const FIGMA_API_BASE = 'https://api.figma.com';

// ── Rate Limiters (Tier 2 assumptions) ──────────────────────────────────────

/** Read limiter: max 5 concurrent requests */
const readLimiter = new Bottleneck({
  maxConcurrent: 5,
  minTime: 100, // At least 100ms between requests
});

/** Write limiter: max 1 request per second (serialized) */
const writeLimiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 1000, // 1 request per second
});

// ── Token Management ────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  // First check for personal access token in env
  const pat = process.env['FIGMA_PERSONAL_ACCESS_TOKEN'];
  if (pat) {
    return pat;
  }

  // Then check for OAuth token in DB
  const row = await db
    .selectFrom('config')
    .select('value')
    .where('key', '=', 'access_token')
    .executeTakeFirst();

  if (!row) {
    throw new Error(
      'No Figma access token found. Run `npx figma-mcp-server auth` to authenticate, ' +
        'or set FIGMA_PERSONAL_ACCESS_TOKEN in .env',
    );
  }

  return row.value;
}

function createAuthHeaders(token: string, usePAT: boolean): Record<string, string> {
  if (usePAT) {
    return { 'X-Figma-Token': token };
  }
  return { Authorization: `Bearer ${token}` };
}

// ── Axios Instance ──────────────────────────────────────────────────────────

function createClient(): AxiosInstance {
  const client = axios.create({
    baseURL: FIGMA_API_BASE,
    timeout: 30_000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Response interceptor for 429 rate limiting
  client.interceptors.response.use(undefined, async (error) => {
    if (error.response?.status === 429) {
      const retryAfter = parseInt(
        error.response.headers['retry-after'] ?? '60',
        10,
      );
      console.error(
        `⏳ Figma API rate limited. Retry after ${retryAfter}s`,
      );
    }
    throw error;
  });

  return client;
}

const client = createClient();

// ── Helper: Auth-Aware Request ──────────────────────────────────────────────

async function getAuthConfig(): Promise<{ headers: Record<string, string> }> {
  const token = await getAccessToken();
  const usePAT = Boolean(process.env['FIGMA_PERSONAL_ACCESS_TOKEN']);
  return { headers: createAuthHeaders(token, usePAT) };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch all comments for a Figma file.
 */
export async function getComments(
  fileKey: string,
): Promise<FigmaCommentsResponse> {
  return readLimiter.schedule(async () => {
    const auth = await getAuthConfig();
    const response = await client.get<FigmaCommentsResponse>(
      `/v1/files/${fileKey}/comments`,
      auth,
    );
    return response.data;
  });
}

/**
 * Post a comment (or reply) to a Figma file.
 */
export async function postComment(
  fileKey: string,
  body: FigmaPostCommentRequest,
): Promise<FigmaComment> {
  return writeLimiter.schedule(async () => {
    const auth = await getAuthConfig();
    const response = await client.post<FigmaComment>(
      `/v1/files/${fileKey}/comments`,
      body,
      auth,
    );
    return response.data;
  });
}

/**
 * Delete a comment from a Figma file.
 * Only the comment author can delete their own comments.
 */
export async function deleteComment(
  fileKey: string,
  commentId: string,
): Promise<void> {
  return writeLimiter.schedule(async () => {
    const auth = await getAuthConfig();
    await client.delete(
      `/v1/files/${fileKey}/comments/${commentId}`,
      auth,
    );
  });
}

/**
 * Add a reaction (emoji) to a comment.
 */
export async function addReaction(
  fileKey: string,
  commentId: string,
  body: FigmaPostReactionRequest,
): Promise<void> {
  return writeLimiter.schedule(async () => {
    const auth = await getAuthConfig();
    await client.post(
      `/v1/files/${fileKey}/comments/${commentId}/reactions`,
      body,
      auth,
    );
  });
}

/**
 * Remove a reaction (emoji) from a comment.
 */
export async function removeReaction(
  fileKey: string,
  commentId: string,
  emoji: string,
): Promise<void> {
  return writeLimiter.schedule(async () => {
    const auth = await getAuthConfig();
    await client.delete(
      `/v1/files/${fileKey}/comments/${commentId}/reactions`,
      {
        ...auth,
        params: { emoji },
      },
    );
  });
}

/**
 * Get the current user's info (to determine bot_user_id).
 */
export async function getCurrentUser(): Promise<{ id: string; handle: string }> {
  return readLimiter.schedule(async () => {
    const auth = await getAuthConfig();
    const response = await client.get<{ id: string; handle: string; email: string }>(
      '/v1/me',
      auth,
    );
    return { id: response.data.id, handle: response.data.handle };
  });
}

// ── Design Review API Methods ────────────────────────────────────────────────

/** Heavy file limiter: 1 concurrent per call, generous timeout */
const fileLimiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 2000,
});

/**
 * Fetch full file JSON (node tree, components, styles).
 * WARNING: Response can be very large (>10MB). Use depth/node_ids params to limit scope.
 */
export async function getFile(
  fileKey: string,
  opts?: { depth?: number; geometry?: string },
): Promise<FigmaFileResponse> {
  return fileLimiter.schedule(async () => {
    const auth = await getAuthConfig();
    const params: Record<string, string | number> = {};
    if (opts?.depth !== undefined) params['depth'] = opts.depth;
    if (opts?.geometry) params['geometry'] = opts.geometry;
    const response = await client.get<FigmaFileResponse>(
      `/v1/files/${fileKey}`,
      { ...auth, params, timeout: 120_000 },
    );
    return response.data;
  });
}

/**
 * Fetch specific nodes from a file.
 */
export async function getFileNodes(
  fileKey: string,
  nodeIds: string[],
): Promise<FigmaFileNodesResponse> {
  return readLimiter.schedule(async () => {
    const auth = await getAuthConfig();
    const response = await client.get<FigmaFileNodesResponse>(
      `/v1/files/${fileKey}/nodes`,
      { ...auth, params: { ids: nodeIds.join(',') } },
    );
    return response.data;
  });
}

/**
 * Export node images (PNG, SVG, PDF, JPG).
 */
export async function getImages(
  fileKey: string,
  nodeIds: string[],
  opts?: { format?: string; scale?: number },
): Promise<FigmaImagesResponse> {
  return readLimiter.schedule(async () => {
    const auth = await getAuthConfig();
    const response = await client.get<FigmaImagesResponse>(
      `/v1/images/${fileKey}`,
      {
        ...auth,
        params: {
          ids: nodeIds.join(','),
          format: opts?.format ?? 'png',
          scale: opts?.scale ?? 2,
        },
      },
    );
    return response.data;
  });
}

/**
 * Get file version history.
 */
export async function getFileVersions(
  fileKey: string,
  opts?: { limit?: number },
): Promise<FigmaVersionsResponse> {
  return readLimiter.schedule(async () => {
    const auth = await getAuthConfig();
    const params: Record<string, number> = {};
    if (opts?.limit) params['page_size'] = opts.limit;
    const response = await client.get<FigmaVersionsResponse>(
      `/v1/files/${fileKey}/versions`,
      { ...auth, params },
    );
    return response.data;
  });
}

/**
 * Get local variables from a file (requires Enterprise plan).
 */
export async function getLocalVariables(
  fileKey: string,
): Promise<FigmaVariablesResponse> {
  return readLimiter.schedule(async () => {
    const auth = await getAuthConfig();
    const response = await client.get<FigmaVariablesResponse>(
      `/v1/files/${fileKey}/variables/local`,
      { ...auth, timeout: 60_000 },
    );
    return response.data;
  });
}

/**
 * Get published variables from a file (requires Enterprise plan).
 */
export async function getPublishedVariables(
  fileKey: string,
): Promise<FigmaVariablesResponse> {
  return readLimiter.schedule(async () => {
    const auth = await getAuthConfig();
    const response = await client.get<FigmaVariablesResponse>(
      `/v1/files/${fileKey}/variables/published`,
      { ...auth, timeout: 60_000 },
    );
    return response.data;
  });
}
