import { sanitizeForLLM, isBotMessage, formatBotReply } from '../../src/utils/sanitizer.js';

describe('sanitizeForLLM', () => {
  it('wraps normal text in <user_content> tags', () => {
    expect(sanitizeForLLM('Hello world')).toBe(
      '<user_content>Hello world</user_content>',
    );
  });

  it('escapes < and > in text', () => {
    expect(sanitizeForLLM('<script>alert("xss")</script>')).toBe(
      '<user_content>&lt;script&gt;alert("xss")&lt;/script&gt;</user_content>',
    );
  });

  it('escapes > character', () => {
    expect(sanitizeForLLM('a > b')).toBe(
      '<user_content>a &gt; b</user_content>',
    );
  });

  it('handles empty string', () => {
    expect(sanitizeForLLM('')).toBe('<user_content></user_content>');
  });
});

describe('isBotMessage', () => {
  it('detects [FCP] prefix', () => {
    expect(isBotMessage('[FCP] Hello')).toBe(true);
  });

  it('detects [FCP] with leading spaces', () => {
    expect(isBotMessage('  [FCP] Hello')).toBe(true);
  });

  it('returns false without prefix', () => {
    expect(isBotMessage('Hello world')).toBe(false);
  });

  it('supports custom prefix', () => {
    expect(isBotMessage('[BOT] Hello', '[BOT]')).toBe(true);
    expect(isBotMessage('[FCP] Hello', '[BOT]')).toBe(false);
  });
});

describe('formatBotReply', () => {
  it('prepends [FCP] prefix to normal message', () => {
    expect(formatBotReply('Hello')).toBe('[FCP] Hello');
  });

  it('does not double-prefix already prefixed message', () => {
    expect(formatBotReply('[FCP] Hello')).toBe('[FCP] Hello');
  });

  it('supports custom prefix', () => {
    expect(formatBotReply('Hello', '[BOT]')).toBe('[BOT] Hello');
  });

  it('does not double-prefix with custom prefix', () => {
    expect(formatBotReply('[BOT] Hello', '[BOT]')).toBe('[BOT] Hello');
  });
});
