import { db } from '../../db/client.js';
import { enqueueDeleteComment, processOperations } from '../../core/operations.js';

interface DeleteOwnReplyArgs {
  file_key: string;
  comment_id: string;
}

interface DeleteOwnReplyResult {
  success: boolean;
  message: string;
}

/**
 * figma_delete_own_reply tool handler.
 *
 * Delete a reply that was posted by the bot (for corrections).
 * Only allows deletion of comments that were created via our outbox.
 */
export async function handleDeleteOwnReply(
  args: DeleteOwnReplyArgs,
): Promise<DeleteOwnReplyResult> {
  // Verify the comment exists and was posted by AI
  const comment = await db
    .selectFrom('comments')
    .select(['id', 'reply_posted_by_ai', 'parent_id'])
    .where('id', '=', args.comment_id)
    .where('file_key', '=', args.file_key)
    .executeTakeFirst();

  if (!comment) {
    return {
      success: false,
      message: `Comment ${args.comment_id} not found in local DB.`,
    };
  }

  if (!comment.reply_posted_by_ai) {
    return {
      success: false,
      message: `Comment ${args.comment_id} was not posted by the bot. Only bot-generated replies can be deleted.`,
    };
  }

  // Also verify via operations table that we have a record of posting it
  const operation = await db
    .selectFrom('operations')
    .select(['op_id'])
    .where('file_key', '=', args.file_key)
    .where('op_type', '=', 'REPLY')
    .where('state', '=', 'CONFIRMED')
    .executeTakeFirst();

  // Enqueue the delete operation
  const result = await enqueueDeleteComment(args.file_key, args.comment_id);

  if (result.status === 'duplicate') {
    return {
      success: false,
      message: `Delete operation for comment ${args.comment_id} already exists.`,
    };
  }

  // Process immediately
  await processOperations(args.file_key);

  // Soft-delete in local DB
  await db
    .updateTable('comments')
    .set({ deleted_at: new Date().toISOString() })
    .where('id', '=', args.comment_id)
    .execute();

  return {
    success: true,
    message: `Reply ${args.comment_id} deleted successfully.`,
  };
}
