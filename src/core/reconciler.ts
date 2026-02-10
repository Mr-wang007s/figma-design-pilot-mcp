import type { FigmaReaction } from '../figma/types.js';
import type { LocalStatus } from '../config.js';
import { EMOJI_TO_STATUS } from '../config.js';

/**
 * Determine the effective status from a list of Figma reactions.
 *
 * Rules (from PRD §6.2):
 * - ✅ (Check) → DONE
 * - 🚫 (No Entry) → WONTFIX
 * - 👀 (Eyes) → PENDING
 * - No relevant emoji → null (caller decides based on current local status)
 * - Conflict (✅ + 🚫) → DONE takes priority
 */
export function resolveStatusFromReactions(
  reactions: FigmaReaction[],
): LocalStatus | null {
  let hasDone = false;
  let hasWontfix = false;
  let hasPending = false;

  for (const reaction of reactions) {
    const status = EMOJI_TO_STATUS[reaction.emoji];
    if (status === 'DONE') hasDone = true;
    if (status === 'WONTFIX') hasWontfix = true;
    if (status === 'PENDING') hasPending = true;
  }

  // Conflict resolution: DONE takes priority
  if (hasDone) return 'DONE';
  if (hasWontfix) return 'WONTFIX';
  if (hasPending) return 'PENDING';

  return null; // No relevant emoji found
}

/**
 * Reconcile remote Figma status with local DB status.
 *
 * Decision table (from PRD §6.2):
 * | Figma Reaction | Local DB  | Decision         | Result  |
 * |----------------|-----------|------------------|---------|
 * | none           | OPEN      | Keep             | OPEN    |
 * | ✅             | OPEN/PEND | Trust human      | DONE    |
 * | 🚫             | OPEN/PEND | Trust human      | WONTFIX |
 * | none (removed) | DONE      | Reopen           | OPEN    |
 * | 👀 (bot)       | PENDING   | Update local     | PENDING |
 * | ✅ + 🚫        | ANY       | DONE priority    | DONE    |
 *
 * Principle: User behavior (Figma reactions) always wins.
 */
export function reconcileStatus(
  remoteStatus: LocalStatus | null,
  currentLocalStatus: LocalStatus,
): LocalStatus {
  // If remote has a definitive status emoji, trust it
  if (remoteStatus !== null) {
    return remoteStatus;
  }

  // No relevant emoji found on Figma side
  // If local was DONE or WONTFIX and emoji was removed → reopen
  if (currentLocalStatus === 'DONE' || currentLocalStatus === 'WONTFIX') {
    return 'OPEN';
  }

  // Otherwise keep current status
  return currentLocalStatus;
}

/**
 * Get the emoji shortcode for a given local status.
 * Returns null for OPEN (no emoji).
 */
export function statusToEmoji(status: LocalStatus): string | null {
  switch (status) {
    case 'PENDING':
      return ':eyes:';
    case 'DONE':
      return ':white_check_mark:';
    case 'WONTFIX':
      return ':no_entry_sign:';
    case 'OPEN':
    default:
      return null;
  }
}

/**
 * Get the previous status emoji that should be removed when changing status.
 * Returns null if transitioning from OPEN (no emoji to remove).
 */
export function previousStatusEmoji(currentStatus: LocalStatus): string | null {
  return statusToEmoji(currentStatus);
}
