import { describe, it, expect } from 'vitest';
import { generateIdempotencyKey, generateOpId } from '../../src/utils/hash.js';

describe('generateIdempotencyKey', () => {
  it('produces deterministic output for same inputs', () => {
    const a = generateIdempotencyKey('file1', 'root1', 'REPLY', 'hello');
    const b = generateIdempotencyKey('file1', 'root1', 'REPLY', 'hello');
    expect(a).toBe(b);
  });

  it('normalizes content (trim + lowercase)', () => {
    const a = generateIdempotencyKey('f', 'r', 'REPLY', '  Hello  ');
    const b = generateIdempotencyKey('f', 'r', 'REPLY', 'hello');
    expect(a).toBe(b);
  });

  it('different content → different hash', () => {
    const a = generateIdempotencyKey('f', 'r', 'REPLY', 'hello');
    const b = generateIdempotencyKey('f', 'r', 'REPLY', 'world');
    expect(a).not.toBe(b);
  });

  it('different opType → different hash', () => {
    const a = generateIdempotencyKey('f', 'r', 'REPLY', 'hello');
    const b = generateIdempotencyKey('f', 'r', 'ADD_REACTION', 'hello');
    expect(a).not.toBe(b);
  });

  it('different fileKey → different hash', () => {
    const a = generateIdempotencyKey('file1', 'r', 'REPLY', 'hello');
    const b = generateIdempotencyKey('file2', 'r', 'REPLY', 'hello');
    expect(a).not.toBe(b);
  });

  it('uses default agentIdentity', () => {
    const a = generateIdempotencyKey('f', 'r', 'REPLY', 'hello');
    const b = generateIdempotencyKey('f', 'r', 'REPLY', 'hello', 'default');
    expect(a).toBe(b);
  });

  it('different agentIdentity → different hash', () => {
    const a = generateIdempotencyKey('f', 'r', 'REPLY', 'hello', 'agent1');
    const b = generateIdempotencyKey('f', 'r', 'REPLY', 'hello', 'agent2');
    expect(a).not.toBe(b);
  });

  it('returns a hex string', () => {
    const key = generateIdempotencyKey('f', 'r', 'REPLY', 'hello');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('generateOpId', () => {
  it('returns a string', () => {
    expect(typeof generateOpId()).toBe('string');
  });

  it('returns unique values on successive calls', () => {
    const a = generateOpId();
    const b = generateOpId();
    expect(a).not.toBe(b);
  });

  it('matches UUID v4 format', () => {
    const id = generateOpId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
