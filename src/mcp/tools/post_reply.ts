import { enqueueReply, processOperations } from '../../core/operations.js';

interface PostReplyArgs {
  file_key: string;
  root_comment_id: string;
  message: string;
}

interface PostReplyResult {
  op_id: string;
  status: 'queued' | 'duplicate' | 'confirmed';
  message: string;
}

/**
 * figma_post_reply tool handler.
 *
 * Replies to a thread via the Outbox pattern (idempotent).
 * The reply is enqueued, then immediately processed.
 */
export async function handlePostReply(args: PostReplyArgs): Promise<PostReplyResult> {
  const result = await enqueueReply(
    args.file_key,
    args.root_comment_id,
    args.message,
  );

  if (result.status === 'duplicate') {
    const existingState = result.existing_op?.state ?? 'UNKNOWN';
    return {
      op_id: result.op_id,
      status: 'duplicate',
      message: `Duplicate operation detected (state: ${existingState}). Original op_id: ${result.op_id}`,
    };
  }

  // Process immediately
  await processOperations(args.file_key);

  return {
    op_id: result.op_id,
    status: 'confirmed',
    message: `Reply queued and sent to Figma. op_id: ${result.op_id}`,
  };
}
