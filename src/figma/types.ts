// ── Figma REST API Types ────────────────────────────────────────────────────

/** User object from Figma API */
export interface FigmaUser {
  id: string;
  handle: string;
  img_url: string;
  email?: string;
}

/** Reaction on a comment */
export interface FigmaReaction {
  user: FigmaUser;
  emoji: string; // Shortcode: ":heart:", ":eyes:", ":white_check_mark:", ":no_entry_sign:"
  created_at: string;
}

/** Single comment from GET /v1/files/:key/comments */
export interface FigmaComment {
  id: string;
  file_key: string;
  parent_id: string; // Empty string "" for root comments
  user: FigmaUser;
  created_at: string;
  resolved_at: string | null;
  message: string;
  client_meta: {
    x?: number;
    y?: number;
    node_id?: string;
    node_offset?: { x: number; y: number };
  } | null;
  order_id: number;
  reactions: FigmaReaction[];
}

/** Response from GET /v1/files/:key/comments */
export interface FigmaCommentsResponse {
  comments: FigmaComment[];
}

/** Request body for POST /v1/files/:key/comments */
export interface FigmaPostCommentRequest {
  message: string;
  comment_id?: string; // Root comment ID when replying
}

/** Request body for POST /v1/files/:key/comments/:id/reactions */
export interface FigmaPostReactionRequest {
  emoji: string;
}

/** OAuth token exchange response */
export interface FigmaOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  user_id_string?: string;
}

/** OAuth token refresh response */
export interface FigmaOAuthRefreshResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// ── Thread DTO (MCP tool output) ────────────────────────────────────────────

/** Aggregated reaction (collapsed by emoji) */
export interface AggregatedReaction {
  emoji: string;
  count: number;
  me_reacted: boolean;
}

/** Thread DTO returned by MCP tools */
export interface Thread {
  id: string; // Root comment ID
  file_key: string;
  status: 'OPEN' | 'PENDING' | 'DONE' | 'WONTFIX';
  needs_attention: boolean;
  root_comment: {
    id: string;
    text: string;
    author: { id: string; handle: string };
    created_at: string;
    reactions: AggregatedReaction[];
  };
  replies: Array<{
    id: string;
    text: string;
    author: { id: string; handle: string };
    created_at: string;
    is_ai: boolean;
  }>;
}

/** Sync result returned by figma_sync_comments tool */
export interface SyncResult {
  threads: Thread[];
  stats: {
    total_threads: number;
    new_threads: number;
    updated_threads: number;
    total_comments_fetched: number;
  };
}

/** Operation types for the outbox */
export type OpType = 'REPLY' | 'ADD_REACTION' | 'REMOVE_REACTION' | 'DELETE_COMMENT';

/** Operation states in the outbox */
export type OpState = 'PENDING' | 'PROCESSING' | 'CONFIRMED' | 'FAILED';
