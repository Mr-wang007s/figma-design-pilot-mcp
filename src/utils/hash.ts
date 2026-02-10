import { createHash, randomUUID } from 'node:crypto';

/**
 * Generate a deterministic idempotency key for an outbox operation.
 *
 * Formula: SHA256(file_key | root_comment_id | op_type | normalized_content | agent_identity)
 *
 * The key ensures the same logical operation produces the same hash,
 * preventing duplicate writes even if the caller retries.
 */
export function generateIdempotencyKey(
  fileKey: string,
  rootCommentId: string,
  opType: string,
  content: string,
  agentIdentity: string = 'default',
): string {
  const normalized = content.trim().toLowerCase();
  const input = `${fileKey}|${rootCommentId}|${opType}|${normalized}|${agentIdentity}`;
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Generate a unique operation ID (UUID v4).
 */
export function generateOpId(): string {
  return randomUUID();
}
