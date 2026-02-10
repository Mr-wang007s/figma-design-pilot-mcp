import { describe, it, expect } from 'vitest';
import {
  resolveStatusFromReactions,
  reconcileStatus,
  statusToEmoji,
  previousStatusEmoji,
} from '../../src/core/reconciler.js';
import type { FigmaReaction } from '../../src/figma/types.js';

function makeReaction(emoji: string, userId: string = 'user_1'): FigmaReaction {
  return {
    user: { id: userId, handle: 'Test', img_url: '' },
    emoji,
    created_at: '2026-01-01T00:00:00Z',
  };
}

describe('resolveStatusFromReactions', () => {
  it('returns null for empty reactions', () => {
    expect(resolveStatusFromReactions([])).toBeNull();
  });

  it('returns DONE for ✅ shortcode', () => {
    expect(resolveStatusFromReactions([makeReaction(':white_check_mark:')])).toBe('DONE');
  });

  it('returns DONE for ✅ unicode', () => {
    expect(resolveStatusFromReactions([makeReaction('✅')])).toBe('DONE');
  });

  it('returns WONTFIX for 🚫 shortcode', () => {
    expect(resolveStatusFromReactions([makeReaction(':no_entry_sign:')])).toBe('WONTFIX');
  });

  it('returns WONTFIX for 🚫 unicode', () => {
    expect(resolveStatusFromReactions([makeReaction('🚫')])).toBe('WONTFIX');
  });

  it('returns PENDING for 👀 shortcode', () => {
    expect(resolveStatusFromReactions([makeReaction(':eyes:')])).toBe('PENDING');
  });

  it('returns PENDING for 👀 unicode', () => {
    expect(resolveStatusFromReactions([makeReaction('👀')])).toBe('PENDING');
  });

  it('returns DONE when ✅ + 🚫 conflict (DONE takes priority)', () => {
    expect(
      resolveStatusFromReactions([
        makeReaction(':white_check_mark:'),
        makeReaction(':no_entry_sign:'),
      ]),
    ).toBe('DONE');
  });

  it('returns null for unrelated emoji', () => {
    expect(resolveStatusFromReactions([makeReaction(':heart:')])).toBeNull();
  });

  it('returns PENDING for mixed unrelated + 👀', () => {
    expect(
      resolveStatusFromReactions([
        makeReaction(':heart:'),
        makeReaction(':eyes:'),
      ]),
    ).toBe('PENDING');
  });
});

describe('reconcileStatus', () => {
  it('remote=null, local=OPEN → OPEN (keep)', () => {
    expect(reconcileStatus(null, 'OPEN')).toBe('OPEN');
  });

  it('remote=null, local=PENDING → PENDING (keep)', () => {
    expect(reconcileStatus(null, 'PENDING')).toBe('PENDING');
  });

  it('remote=null, local=DONE → OPEN (reopen)', () => {
    expect(reconcileStatus(null, 'DONE')).toBe('OPEN');
  });

  it('remote=null, local=WONTFIX → OPEN (reopen)', () => {
    expect(reconcileStatus(null, 'WONTFIX')).toBe('OPEN');
  });

  it('remote=DONE, local=OPEN → DONE (trust human)', () => {
    expect(reconcileStatus('DONE', 'OPEN')).toBe('DONE');
  });

  it('remote=DONE, local=PENDING → DONE (trust human)', () => {
    expect(reconcileStatus('DONE', 'PENDING')).toBe('DONE');
  });

  it('remote=WONTFIX, local=OPEN → WONTFIX (trust human)', () => {
    expect(reconcileStatus('WONTFIX', 'OPEN')).toBe('WONTFIX');
  });

  it('remote=PENDING, local=OPEN → PENDING', () => {
    expect(reconcileStatus('PENDING', 'OPEN')).toBe('PENDING');
  });
});

describe('statusToEmoji', () => {
  it('PENDING → :eyes:', () => {
    expect(statusToEmoji('PENDING')).toBe(':eyes:');
  });

  it('DONE → :white_check_mark:', () => {
    expect(statusToEmoji('DONE')).toBe(':white_check_mark:');
  });

  it('WONTFIX → :no_entry_sign:', () => {
    expect(statusToEmoji('WONTFIX')).toBe(':no_entry_sign:');
  });

  it('OPEN → null', () => {
    expect(statusToEmoji('OPEN')).toBeNull();
  });
});

describe('previousStatusEmoji', () => {
  it('delegates to statusToEmoji', () => {
    expect(previousStatusEmoji('PENDING')).toBe(statusToEmoji('PENDING'));
    expect(previousStatusEmoji('DONE')).toBe(statusToEmoji('DONE'));
    expect(previousStatusEmoji('WONTFIX')).toBe(statusToEmoji('WONTFIX'));
    expect(previousStatusEmoji('OPEN')).toBe(statusToEmoji('OPEN'));
  });
});
