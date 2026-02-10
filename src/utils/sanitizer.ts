/**
 * Wrap user-generated content in XML tags to mitigate prompt injection.
 *
 * When returning comment text to LLM clients, this prevents malicious
 * comments from being interpreted as instructions.
 */
export function sanitizeForLLM(text: string): string {
  const escaped = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<user_content>${escaped}</user_content>`;
}

/**
 * Check if a comment message was posted by our bot.
 * Detects the configurable prefix (default: "[FCP]").
 */
export function isBotMessage(message: string, prefix: string = '[FCP]'): boolean {
  return message.trimStart().startsWith(prefix);
}

/**
 * Format a message as a bot reply by prepending the standard prefix.
 * No-ops if the prefix is already present.
 */
export function formatBotReply(message: string, prefix: string = '[FCP]'): string {
  if (message.trimStart().startsWith(prefix)) {
    return message;
  }
  return `${prefix} ${message}`;
}
