import { db, rawDb } from '../db/client.js';
import { getComments, getCurrentUser } from '../figma/api.js';
import { resolveStatusFromReactions, reconcileStatus } from './reconciler.js';
import { sanitizeForLLM, isBotMessage } from '../utils/sanitizer.js';
import { appConfig, EMOJI_TO_STATUS } from '../config.js';
import type { LocalStatus } from '../config.js';
import type { FigmaComment } from '../figma/types.js';
import type { Thread, SyncResult, AggregatedReaction } from '../figma/types.js';
import type { NewComment, CommentRow } from '../db/types.js';

// ── Single Writer Lock ──────────────────────────────────────────────────────

const fileLocks = new Map<string, Promise<void>>();

async function withFileLock<T>(fileKey: string, fn: () => Promise<T>): Promise<T> {
  // Wait for any existing operation on this file to finish
  while (fileLocks.has(fileKey)) {
    await fileLocks.get(fileKey);
  }

  let resolve!: () => void;
  const lock = new Promise<void>((r) => { resolve = r; });
  fileLocks.set(fileKey, lock);

  try {
    return await fn();
  } finally {
    fileLocks.delete(fileKey);
    resolve();
  }
}

// ── Bot User ID Resolution ──────────────────────────────────────────────────

async function ensureBotUserId(fileKey: string): Promise<string> {
  // Check if we already have it cached
  const syncState = await db
    .selectFrom('sync_state')
    .select('bot_user_id')
    .where('file_key', '=', fileKey)
    .executeTakeFirst();

  if (syncState?.bot_user_id) {
    return syncState.bot_user_id;
  }

  // Fetch from Figma API
  const me = await getCurrentUser();

  // Upsert sync_state
  await db
    .insertInto('sync_state')
    .values({ file_key: fileKey, bot_user_id: me.id })
    .onConflict((oc) => oc.column('file_key').doUpdateSet({ bot_user_id: me.id }))
    .execute();

  return me.id;
}

// ── Comment Grouping ────────────────────────────────────────────────────────

interface CommentGroup {
  root: FigmaComment;
  replies: FigmaComment[];
}

function groupCommentsByThread(comments: FigmaComment[]): Map<string, CommentGroup> {
  const groups = new Map<string, CommentGroup>();

  // First pass: identify root comments
  for (const comment of comments) {
    const isRoot = !comment.parent_id || comment.parent_id === '';
    if (isRoot) {
      groups.set(comment.id, { root: comment, replies: [] });
    }
  }

  // Second pass: attach replies to their root
  for (const comment of comments) {
    if (comment.parent_id && comment.parent_id !== '') {
      const group = groups.get(comment.parent_id);
      if (group) {
        group.replies.push(comment);
      }
      // If the parent doesn't exist in our map, the comment is orphaned (skip)
    }
  }

  // Sort replies by created_at within each group
  for (const group of groups.values()) {
    group.replies.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }

  return groups;
}

// ── Aggregate Reactions ─────────────────────────────────────────────────────

function aggregateReactions(
  reactions: FigmaComment['reactions'],
  botUserId: string,
): AggregatedReaction[] {
  const map = new Map<string, { count: number; me_reacted: boolean }>();

  for (const r of reactions) {
    const existing = map.get(r.emoji) ?? { count: 0, me_reacted: false };
    existing.count++;
    if (r.user.id === botUserId) {
      existing.me_reacted = true;
    }
    map.set(r.emoji, existing);
  }

  return Array.from(map.entries()).map(([emoji, data]) => ({
    emoji,
    count: data.count,
    me_reacted: data.me_reacted,
  }));
}

// ── Thread Builder ──────────────────────────────────────────────────────────

function buildThread(
  group: CommentGroup,
  localStatus: LocalStatus,
  botUserId: string,
  prefix: string,
): Thread {
  const lastReply = group.replies[group.replies.length - 1];
  const lastReplyIsBot = lastReply
    ? isBotMessage(lastReply.message, prefix) || lastReply.user.id === botUserId
    : false;

  const needsAttention =
    (localStatus === 'OPEN' || localStatus === 'PENDING') && !lastReplyIsBot;

  return {
    id: group.root.id,
    file_key: group.root.file_key,
    status: localStatus,
    needs_attention: needsAttention,
    root_comment: {
      id: group.root.id,
      text: sanitizeForLLM(group.root.message),
      author: {
        id: group.root.user.id,
        handle: group.root.user.handle,
      },
      created_at: group.root.created_at,
      reactions: aggregateReactions(group.root.reactions, botUserId),
    },
    replies: group.replies.map((r) => ({
      id: r.id,
      text: sanitizeForLLM(r.message),
      author: { id: r.user.id, handle: r.user.handle },
      created_at: r.created_at,
      is_ai: isBotMessage(r.message, prefix) || r.user.id === botUserId,
    })),
  };
}

// ── Sync Engine ─────────────────────────────────────────────────────────────

/**
 * Full sync: Fetch all comments from Figma, diff against local DB,
 * and return threads that need attention (OPEN/PENDING or changed).
 */
export async function syncComments(
  fileKey: string,
  forceFullSync: boolean = false,
): Promise<SyncResult> {
  return withFileLock(fileKey, async () => {
    const botUserId = await ensureBotUserId(fileKey);
    const prefix = appConfig.BOT_REPLY_PREFIX;

    // 1. Fetch all comments from Figma
    const response = await getComments(fileKey);
    const figmaComments = response.comments;

    // 2. Group by thread
    const groups = groupCommentsByThread(figmaComments);

    // 3. Get existing comments from local DB
    const existingComments = await db
      .selectFrom('comments')
      .selectAll()
      .where('file_key', '=', fileKey)
      .execute();

    const existingMap = new Map(existingComments.map((c) => [c.id, c]));
    const existingRoots = new Map<string, CommentRow>();
    for (const c of existingComments) {
      if (!c.parent_id) {
        existingRoots.set(c.id, c);
      }
    }

    // 4. Diff and upsert
    let newThreads = 0;
    let updatedThreads = 0;
    const resultThreads: Thread[] = [];

    // Use a transaction for atomicity
    const upsertAll = rawDb.transaction(() => {
      for (const [rootId, group] of groups) {
        const existingRoot = existingRoots.get(rootId);
        const isNew = !existingRoot;

        // Determine status from reactions
        const remoteStatus = resolveStatusFromReactions(group.root.reactions);
        const currentLocalStatus: LocalStatus =
          (existingRoot?.local_status as LocalStatus) ?? 'OPEN';
        const finalStatus = forceFullSync
          ? (remoteStatus ?? 'OPEN')
          : reconcileStatus(remoteStatus, currentLocalStatus);

        // Determine remote status emoji for storage
        const remoteEmoji = remoteStatus
          ? group.root.reactions.find(
              (r) => EMOJI_TO_STATUS[r.emoji] !== undefined,
            )?.emoji ?? null
          : null;

        // Upsert root comment
        const rootRow: NewComment = {
          id: group.root.id,
          file_key: fileKey,
          parent_id: null,
          root_id: group.root.id,
          message_text: group.root.message,
          author_id: group.root.user.id,
          author_handle: group.root.user.handle,
          created_at: group.root.created_at,
          updated_at: group.root.resolved_at,
          reactions_json: JSON.stringify(group.root.reactions),
          remote_status_emoji: remoteEmoji,
          local_status: finalStatus,
          reply_posted_by_ai:
            isBotMessage(group.root.message, prefix) ||
            group.root.user.id === botUserId
              ? 1
              : 0,
        };

        // Use raw db for synchronous transaction
        rawDb
          .prepare(
            `INSERT INTO comments (id, file_key, parent_id, root_id, message_text, author_id, author_handle, created_at, updated_at, reactions_json, remote_status_emoji, local_status, reply_posted_by_ai)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               message_text = excluded.message_text,
               updated_at = excluded.updated_at,
               reactions_json = excluded.reactions_json,
               remote_status_emoji = excluded.remote_status_emoji,
               local_status = excluded.local_status,
               author_handle = excluded.author_handle`,
          )
          .run(
            rootRow.id,
            rootRow.file_key,
            rootRow.parent_id ?? null,
            rootRow.root_id ?? null,
            rootRow.message_text,
            rootRow.author_id,
            rootRow.author_handle ?? null,
            rootRow.created_at,
            rootRow.updated_at ?? null,
            rootRow.reactions_json ?? null,
            rootRow.remote_status_emoji ?? null,
            rootRow.local_status ?? 'OPEN',
            rootRow.reply_posted_by_ai ?? 0,
          );

        // Upsert replies
        for (const reply of group.replies) {
          const isAi =
            isBotMessage(reply.message, prefix) ||
            reply.user.id === botUserId;

          rawDb
            .prepare(
              `INSERT INTO comments (id, file_key, parent_id, root_id, message_text, author_id, author_handle, created_at, updated_at, reactions_json, local_status, reply_posted_by_ai)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)
               ON CONFLICT(id) DO UPDATE SET
                 message_text = excluded.message_text,
                 updated_at = excluded.updated_at,
                 author_handle = excluded.author_handle`,
            )
            .run(
              reply.id,
              fileKey,
              reply.parent_id,
              rootId,
              reply.message,
              reply.user.id,
              reply.user.handle,
              reply.created_at,
              reply.resolved_at ?? null,
              JSON.stringify(reply.reactions),
              isAi ? 1 : 0,
            );
        }

        // Track new vs updated
        if (isNew) {
          newThreads++;
        } else if (
          existingRoot?.local_status !== finalStatus ||
          existingRoot?.message_text !== group.root.message
        ) {
          updatedThreads++;
        }
      }
    });

    upsertAll();

    // 5. Update sync_state
    await db
      .updateTable('sync_state')
      .set({ last_full_sync_at: new Date().toISOString() })
      .where('file_key', '=', fileKey)
      .execute();

    // 6. Build result threads (only OPEN/PENDING or changed)
    for (const [rootId, group] of groups) {
      const updatedRoot = await db
        .selectFrom('comments')
        .selectAll()
        .where('id', '=', rootId)
        .executeTakeFirst();

      const status = (updatedRoot?.local_status as LocalStatus) ?? 'OPEN';

      if (
        status === 'OPEN' ||
        status === 'PENDING' ||
        forceFullSync
      ) {
        resultThreads.push(buildThread(group, status, botUserId, prefix));
      }
    }

    // Sort by needs_attention first, then by created_at
    resultThreads.sort((a, b) => {
      if (a.needs_attention && !b.needs_attention) return -1;
      if (!a.needs_attention && b.needs_attention) return 1;
      return (
        new Date(b.root_comment.created_at).getTime() -
        new Date(a.root_comment.created_at).getTime()
      );
    });

    return {
      threads: resultThreads,
      stats: {
        total_threads: groups.size,
        new_threads: newThreads,
        updated_threads: updatedThreads,
        total_comments_fetched: figmaComments.length,
      },
    };
  });
}

/**
 * Get a single thread by root comment ID from the local DB.
 */
export async function getThread(
  fileKey: string,
  threadId: string,
): Promise<Thread | null> {
  const botUserId = await ensureBotUserId(fileKey);
  const prefix = appConfig.BOT_REPLY_PREFIX;

  const root = await db
    .selectFrom('comments')
    .selectAll()
    .where('id', '=', threadId)
    .where('file_key', '=', fileKey)
    .where('parent_id', 'is', null)
    .executeTakeFirst();

  if (!root) return null;

  const replies = await db
    .selectFrom('comments')
    .selectAll()
    .where('root_id', '=', threadId)
    .where('file_key', '=', fileKey)
    .where('parent_id', 'is not', null)
    .orderBy('created_at', 'asc')
    .execute();

  const reactions: AggregatedReaction[] = root.reactions_json
    ? aggregateReactions(JSON.parse(root.reactions_json), botUserId)
    : [];

  const status = root.local_status as LocalStatus;
  const lastReply = replies[replies.length - 1];
  const lastReplyIsBot = lastReply
    ? isBotMessage(lastReply.message_text, prefix) ||
      lastReply.author_id === botUserId
    : false;

  return {
    id: root.id,
    file_key: fileKey,
    status,
    needs_attention:
      (status === 'OPEN' || status === 'PENDING') && !lastReplyIsBot,
    root_comment: {
      id: root.id,
      text: sanitizeForLLM(root.message_text),
      author: { id: root.author_id, handle: root.author_handle ?? '' },
      created_at: root.created_at,
      reactions,
    },
    replies: replies.map((r) => ({
      id: r.id,
      text: sanitizeForLLM(r.message_text),
      author: { id: r.author_id, handle: r.author_handle ?? '' },
      created_at: r.created_at,
      is_ai:
        isBotMessage(r.message_text, prefix) || r.author_id === botUserId,
    })),
  };
}

/**
 * List all OPEN (pending) threads from local DB, no network request.
 */
export async function listPendingThreads(
  fileKey: string,
  limit: number = 20,
): Promise<Thread[]> {
  const botUserId = await ensureBotUserId(fileKey);
  const prefix = appConfig.BOT_REPLY_PREFIX;

  const roots = await db
    .selectFrom('comments')
    .selectAll()
    .where('file_key', '=', fileKey)
    .where('parent_id', 'is', null)
    .where('local_status', 'in', ['OPEN', 'PENDING'])
    .where('deleted_at', 'is', null)
    .orderBy('created_at', 'desc')
    .limit(limit)
    .execute();

  const threads: Thread[] = [];

  for (const root of roots) {
    const replies = await db
      .selectFrom('comments')
      .selectAll()
      .where('root_id', '=', root.id)
      .where('file_key', '=', fileKey)
      .where('parent_id', 'is not', null)
      .orderBy('created_at', 'asc')
      .execute();

    const reactions: AggregatedReaction[] = root.reactions_json
      ? aggregateReactions(JSON.parse(root.reactions_json), botUserId)
      : [];

    const status = root.local_status as LocalStatus;
    const lastReply = replies[replies.length - 1];
    const lastReplyIsBot = lastReply
      ? isBotMessage(lastReply.message_text, prefix) ||
        lastReply.author_id === botUserId
      : false;

    threads.push({
      id: root.id,
      file_key: fileKey,
      status,
      needs_attention:
        (status === 'OPEN' || status === 'PENDING') && !lastReplyIsBot,
      root_comment: {
        id: root.id,
        text: sanitizeForLLM(root.message_text),
        author: { id: root.author_id, handle: root.author_handle ?? '' },
        created_at: root.created_at,
        reactions,
      },
      replies: replies.map((r) => ({
        id: r.id,
        text: sanitizeForLLM(r.message_text),
        author: { id: r.author_id, handle: r.author_handle ?? '' },
        created_at: r.created_at,
        is_ai:
          isBotMessage(r.message_text, prefix) || r.author_id === botUserId,
      })),
    });
  }

  // Sort: needs_attention first
  threads.sort((a, b) => {
    if (a.needs_attention && !b.needs_attention) return -1;
    if (!a.needs_attention && b.needs_attention) return 1;
    return 0;
  });

  return threads;
}
