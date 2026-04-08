/**
 * Store.test.js — Unit tests for js/core/Store.js
 *
 * Covers: XP/levelling, streak multiplier, mistake notebook (incl. graduation),
 * flag system, SRS scheduling, addStudyTime, setSetting, spendXP, addItem.
 *
 * Stubs: localStorage (in-memory map), indexedDB (undefined → graceful fallback)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Single shared stub whose backing Map is replaced before every test ────────
const _lsMap = new Map();
const _localStorageStub = {
  getItem:    (k)    => _lsMap.has(k) ? _lsMap.get(k) : null,
  setItem:    (k, v) => _lsMap.set(k, String(v)),
  removeItem: (k)    => _lsMap.delete(k),
  clear:      ()     => _lsMap.clear(),
};

// Install stubs at module-load time so Store.js sees them on import
vi.stubGlobal('localStorage', _localStorageStub);
vi.stubGlobal('indexedDB', undefined); // force localStorage-only path everywhere

import { Store } from '../js/core/Store.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Reset the shared stub and return a fresh Store instance. */
function freshStore() {
  _lsMap.clear();   // wipe all persisted data from the previous test
  return new Store();
}

// ─── XP & Level ──────────────────────────────────────────────────────────────

describe('XP and levelling', () => {
  let store;
  beforeEach(() => { store = freshStore(); });

  it('starts at level 1 with 0 XP', () => {
    expect(store.state.level).toBe(1);
    expect(store.state.xp).toBe(0);
  });

  it('addXP increases stored xp', () => {
    store.addXP(50);
    expect(store.state.xp).toBe(50);
  });

  it('reaches level 2 at 100 XP', () => {
    store.addXP(100);
    expect(store.state.level).toBe(2);
  });

  it('reaches level 3 at 250 XP', () => {
    store.addXP(250);
    expect(store.state.level).toBe(3);
  });

  it('does not level up below threshold', () => {
    store.addXP(99);
    expect(store.state.level).toBe(1);
  });

  it('xpInCurrentLevel resets on level-up', () => {
    store.addXP(120); // 20 XP into level 2
    expect(store.state.xpInCurrentLevel).toBe(20);
  });

  it('spendXP deducts correctly', () => {
    store.addXP(200);
    const ok = store.spendXP(50);
    expect(ok).toBe(true);
    expect(store.state.xp).toBe(150);
  });

  it('spendXP returns false when insufficient', () => {
    const ok = store.spendXP(1);
    expect(ok).toBe(false);
    expect(store.state.xp).toBe(0);
  });

  it('ignores addXP(0)', () => {
    store.addXP(0);
    expect(store.state.xp).toBe(0);
  });

  it('persists xp to localStorage', () => {
    store.addXP(75);
    const store2 = new Store(); // reads from same stubbed localStorage
    expect(store2.state.xp).toBe(75);
  });
});

// ─── Streak Multiplier ───────────────────────────────────────────────────────

describe('streakMultiplier', () => {
  it('is 1.0 with no streak', () => {
    const store = freshStore();
    expect(store.streakMultiplier).toBe(1.0);
  });

  it('is 1.0 for streaks 1–2', () => {
    const store = freshStore();
    store._state.streak.current = 2;
    expect(store.streakMultiplier).toBe(1.0);
  });

  it('is 1.25 for streak 3–6', () => {
    const store = freshStore();
    store._state.streak.current = 3;
    expect(store.streakMultiplier).toBe(1.25);
    store._state.streak.current = 6;
    expect(store.streakMultiplier).toBe(1.25);
  });

  it('is 1.5 for streak >= 7', () => {
    const store = freshStore();
    store._state.streak.current = 7;
    expect(store.streakMultiplier).toBe(1.5);
    store._state.streak.current = 30;
    expect(store.streakMultiplier).toBe(1.5);
  });
});

// ─── Mistake Notebook ────────────────────────────────────────────────────────

describe('mistake notebook', () => {
  let store;
  beforeEach(() => { store = freshStore(); });

  it('records a mistake for a question', () => {
    store.recordMistake('q1');
    expect(store.state.mistakeNotebook['q1']).toBe(1);
  });

  it('increments count on repeated mistakes', () => {
    store.recordMistake('q1');
    store.recordMistake('q1');
    expect(store.state.mistakeNotebook['q1']).toBe(2);
  });

  it('getMistakeIds returns IDs at or above threshold', () => {
    store.recordMistake('q1');
    store.recordMistake('q1'); // 2 wrongs
    store.recordMistake('q2'); // 1 wrong
    expect(store.getMistakeIds(2)).toContain('q1');
    expect(store.getMistakeIds(2)).not.toContain('q2');
  });

  it('recordMistakeCorrect increments streak', () => {
    store.recordMistake('q1');
    store.recordMistakeCorrect('q1');
    expect(store.getMistakeStreak('q1')).toBe(1);
  });

  it('recordMistakeCorrect graduates question after 3 consecutive correct', () => {
    store.recordMistake('q1');
    store.recordMistakeCorrect('q1');
    store.recordMistakeCorrect('q1');
    store.recordMistakeCorrect('q1'); // 3rd — should graduate
    expect(store.state.mistakeNotebook['q1']).toBeUndefined();
    expect(store.state.mistakeStreaks['q1']).toBeUndefined();
  });

  it('recordMistake resets streak back to 0', () => {
    store.recordMistake('q1');
    store.recordMistakeCorrect('q1');
    store.recordMistakeCorrect('q1');
    store.recordMistake('q1'); // wrong again — resets streak
    expect(store.getMistakeStreak('q1')).toBe(0);
  });

  it('clearNotebook empties the notebook', () => {
    store.recordMistake('q1');
    store.recordMistake('q2');
    store.clearNotebook();
    expect(Object.keys(store.state.mistakeNotebook)).toHaveLength(0);
  });

  it('recordMistakeCorrect is a no-op for unknown questions', () => {
    expect(() => store.recordMistakeCorrect('unknown_id')).not.toThrow();
  });
});

// ─── Flag System ─────────────────────────────────────────────────────────────

describe('flag system', () => {
  let store;
  beforeEach(() => { store = freshStore(); });

  it('isFlagged returns false initially', () => {
    expect(store.isFlagged('q1')).toBe(false);
  });

  it('toggleFlag adds a flag and returns true', () => {
    const result = store.toggleFlag('q1');
    expect(result).toBe(true);
    expect(store.isFlagged('q1')).toBe(true);
  });

  it('toggleFlag removes flag on second call', () => {
    store.toggleFlag('q1');
    const result = store.toggleFlag('q1');
    expect(result).toBe(false);
    expect(store.isFlagged('q1')).toBe(false);
  });

  it('getFlaggedIds returns all flagged IDs', () => {
    store.toggleFlag('q1');
    store.toggleFlag('q2');
    const ids = store.getFlaggedIds();
    expect(ids).toContain('q1');
    expect(ids).toContain('q2');
    expect(ids).toHaveLength(2);
  });

  it('clearFlags empties the list', () => {
    store.toggleFlag('q1');
    store.clearFlags();
    expect(store.getFlaggedIds()).toHaveLength(0);
  });
});

// ─── SRS Scheduling ──────────────────────────────────────────────────────────

describe('SRS scheduling', () => {
  let store;
  beforeEach(() => { store = freshStore(); });

  it('getSRSState returns "new" for unseen questions', () => {
    expect(store.getSRSState('q1')).toBe('new');
  });

  it('updateSRS creates an entry', () => {
    store.updateSRS('q1', true);
    expect(store.getSRSEntry('q1')).not.toBeNull();
  });

  it('correct answer advances interval index', () => {
    store.updateSRS('q1', true);
    const e = store.getSRSEntry('q1');
    expect(e.intervalIndex).toBe(1);
  });

  it('wrong answer resets interval index to 0', () => {
    store.updateSRS('q1', true);
    store.updateSRS('q1', true);
    store.updateSRS('q1', false); // wrong
    const e = store.getSRSEntry('q1');
    expect(e.intervalIndex).toBe(0);
    expect(e.correctStreak).toBe(0);
  });

  it('getSRSState returns "mastered" after 5 correct in a row', () => {
    for (let i = 0; i < 5; i++) store.updateSRS('q1', true);
    expect(store.getSRSState('q1')).toBe('mastered');
  });

  it('low-confidence correct (conf=2) does not advance interval', () => {
    store.updateSRS('q1', true, 2); // low confidence
    const e = store.getSRSEntry('q1');
    expect(e.intervalIndex).toBe(0); // stays at 0 (treated as wrong for SRS)
  });

  it('high-confidence correct (conf=4) advances normally', () => {
    store.updateSRS('q1', true, 4);
    const e = store.getSRSEntry('q1');
    expect(e.intervalIndex).toBe(1);
  });

  it('getSRSStats categorises a set of IDs', () => {
    store.updateSRS('q1', true);  // learning
    // q2 never seen → new
    const stats = store.getSRSStats(['q1', 'q2']);
    expect(stats.new).toBe(1);
    expect(stats.learning + stats.due).toBeGreaterThanOrEqual(1);
  });

  it('clearSRS removes all entries', () => {
    store.updateSRS('q1', true);
    store.clearSRS();
    expect(store.getSRSEntry('q1')).toBeNull();
  });
});

// ─── Study Time ──────────────────────────────────────────────────────────────

describe('addStudyTime', () => {
  let store;
  beforeEach(() => { store = freshStore(); });

  it('accumulates study minutes', () => {
    store.addStudyTime(10);
    store.addStudyTime(15);
    expect(store.state.studyMinutes).toBe(25);
  });

  it('studyHours rounds to 1 decimal', () => {
    store.addStudyTime(90);
    expect(store.studyHours).toBeCloseTo(1.5, 1);
  });

  it('ignores non-positive values', () => {
    store.addStudyTime(0);
    store.addStudyTime(-5);
    expect(store.state.studyMinutes).toBe(0);
  });
});

// ─── Settings ────────────────────────────────────────────────────────────────

describe('setSetting', () => {
  let store;
  beforeEach(() => { store = freshStore(); });

  it('updates a known setting', () => {
    store.setSetting('sfxEnabled', false);
    expect(store.state.settings.sfxEnabled).toBe(false);
  });

  it('change persists across instances', () => {
    store.setSetting('dyslexiaFont', true);
    const store2 = new Store();
    expect(store2.state.settings.dyslexiaFont).toBe(true);
  });
});

// ─── Inventory ───────────────────────────────────────────────────────────────

describe('addItem', () => {
  let store;
  beforeEach(() => { store = freshStore(); });

  it('adds an item to inventory', () => {
    store.addItem({ id: 'packet_sniffer', name: 'Packet Sniffer', rarity: 'uncommon' });
    expect(store.hasItem('packet_sniffer')).toBe(true);
  });

  it('does not duplicate items', () => {
    const item = { id: 'test_item', name: 'Test', rarity: 'common' };
    store.addItem(item);
    store.addItem(item);
    expect(store.state.inventory.filter(i => i.id === 'test_item')).toHaveLength(1);
  });

  it('console_cable grants +2 hints on acquire', () => {
    const initialHints = store.state.hints;
    store.addItem({ id: 'console_cable', name: 'Console Cable', rarity: 'common' });
    expect(store.state.hints).toBe(initialHints + 2);
  });
});
