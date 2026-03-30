/**
 * Store.js — Unified GameState Controller
 * Single source of truth for all player data.
 * Persists to IndexedDB (primary) with localStorage write-through (fast cold-start).
 * Falls back to localStorage-only if IndexedDB is unavailable.
 * Emits events on every mutation so subscribers (HUD, etc.) stay in sync.
 *
 * XP Thresholds: level[i] = XP required to REACH level i+1
 */
import { bus } from './EventBus.js';

const XP_THRESHOLDS = [
  0,      // Level 1  → 0
  100,    // Level 2  → 100
  250,    // Level 3  → 250
  500,    // Level 4  → 500
  900,    // Level 5  → 900
  1400,   // Level 6  → 1400
  2100,   // Level 7  → 2100
  3000,   // Level 8  → 3000
  4200,   // Level 9  → 4200
  5800,   // Level 10 → 5800 (CCNA Certified)
];

const DEFAULT_STATE = {
  playerName: 'Network Cadet',
  level: 1,
  xp: 0,
  hints: 3,                  // Free hints; buy more with XP
  inventory: [],             // [{ id, name, description, rarity, acquiredAt }]
  completedLabs: [],         // [{ id, score, completedAt }]
  completedQuizzes: [],      // [{ id, score, completedAt }]
  bossesDefeated: [],        // [bossId, ...]
  currentWeek: 1,
  storyProgress: {},         // { nodeId: { seen: true, choice: '...' } }
  achievements: [],          // [{ id, name, unlockedAt }]
  settings: {
    sfxEnabled: true,
    theme: 'terminal-green', // 'terminal-green' | 'amber' | 'blue'
  },
  quizHistory: [],           // [{ date, total, correct, score, mode, domainStats }]
  streak: { current: 0, lastLogin: null, longest: 0 }, // daily login streak
  mistakeNotebook: {},       // { questionId: wrongCount }
  reviewSchedule: {},        // { questionId: { correctStreak, intervalIndex, dueDate, totalSeen, totalCorrect } }
  studyMinutes: 0,           // cumulative time spent in the app (minutes)
  flaggedQuestions: [],      // [questionId, ...]
  examHistory: [],           // last 10 exam runs: [{ date, score, correct, total, elapsed, domainStats }]
  examDate: null,            // ISO date string 'YYYY-MM-DD' — user's target exam date
  studyLog: {},              // { 'YYYY-MM-DD': minutes } — per-day study time for heatmap
  onboardingDone: false,   // true after first-run tour is completed/skipped
  visitedViews: [],        // views the user has opened at least once (for tip banners)
  dailyChallengeLog: {},   // { 'YYYY-MM-DD': { questionId, completed, xpAwarded } }
  completedProjects: {},   // { [projectId]: { completedPhases: [], xpEarned, startedAt, completedAt } }
  megaLabProgress: {},     // { [labId]: { completedPhases: [], xpEarned, hintsUsed, startedAt, completedAt } }
  badges: [],              // [{ id, name, icon, description, awardedAt }]
  scriptingProgress: {},   // { [labId]: { completedAt } }
  confidenceLog: {},       // { questionId: [{ rating, correct, date }] }
  pomodoroCount: 0,        // total completed work pomodoros (25-min blocks)
  pomodoroLog: {},         // { 'YYYY-MM-DD': count } — per-day pomodoros completed
  customQuestions: [],     // user-created MC questions [{ id, question, options, correct_answer, explanation, domain, difficulty, week, _custom }]
  sessionHistory: [],      // last 30 session quality records [{ date, score, accuracy, srsScore, newScore, timeScore, elapsedMins, total, correct }]
  lastSaved: null,
};

const STORAGE_KEY = 'ccna_gamestate_v1';
const IDB_NAME    = 'ccna_mastery';
const IDB_VERSION = 1;
const IDB_STORE   = 'gamestate';

export class Store {
  constructor() {
    this._state = this._load();   // sync: read localStorage immediately
    this._recalcLevel(false);
    this._idb          = null;    // set after async init
    this._readyPromise = this._initIDB();
  }

  /** Resolves once IndexedDB is initialised (or failed gracefully). Await in init(). */
  get ready() { return this._readyPromise; }

  // ─── Internal ───────────────────────────────────────────────────────────────

  /** Open the IndexedDB database, creating the object store on first run. */
  _openIDB() {
    return new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) { reject(new Error('IDB not supported')); return; }
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = ev => {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = ev => resolve(ev.target.result);
      req.onerror   = ev => reject(ev.target.error);
    });
  }

  /** Read the saved state from IndexedDB. Returns null if not found. */
  _loadFromIDB() {
    if (!this._idb) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      try {
        const tx  = this._idb.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get('save');
        req.onsuccess = ev => resolve(ev.target.result || null);
        req.onerror   = ev => reject(ev.target.error);
      } catch (e) { reject(e); }
    });
  }

  /** Best-effort async write to IndexedDB. Never throws. */
  _saveToIDB(state) {
    if (!this._idb) return;
    try {
      const tx = this._idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(state, 'save');
    } catch (e) {
      console.warn('[Store] IDB write failed:', e.message);
    }
  }

  /**
   * Open IndexedDB and, if it holds a newer save than localStorage, upgrade
   * the in-memory state. Runs asynchronously after construction; the app
   * should await store.ready before rendering to pick up the IDB state.
   */
  async _initIDB() {
    try {
      this._idb = await this._openIDB();
      const idbState = await this._loadFromIDB();
      if (idbState && (idbState.lastSaved || 0) > (this._state.lastSaved || 0)) {
        // IDB has a more recent save (e.g. localStorage was cleared)
        this._state = { ...DEFAULT_STATE, ...idbState };
        this._recalcLevel(false);
        // Write it back to localStorage so next cold-start is also fast
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state)); } catch {}
      } else if (this._state.lastSaved && !idbState) {
        // IDB is empty but localStorage has data — prime IDB from localStorage
        this._saveToIDB(this._state);
      }
    } catch (e) {
      console.warn('[Store] IndexedDB unavailable, using localStorage only:', e.message);
      this._idb = null;
    }
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) };
    } catch {
      console.warn('[Store] Failed to load saved state, using defaults.');
    }
    return { ...DEFAULT_STATE };
  }

  _persist() {
    try {
      this._state.lastSaved = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state));
    } catch (e) {
      console.warn('[Store] localStorage write failed:', e.message);
    }
    // Best-effort async write to IndexedDB (primary long-term storage)
    this._saveToIDB(this._state);
  }

  /**
   * Recalculate level from raw XP. Optionally emits level:up.
   * @param {boolean} emitEvents
   */
  _recalcLevel(emitEvents = true) {
    const xp = this._state.xp;
    let level = 1;
    for (let i = 0; i < XP_THRESHOLDS.length; i++) {
      if (xp >= XP_THRESHOLDS[i]) level = i + 1;
      else break;
    }

    const prevLevel = this._state.level;
    this._state.level = level;

    const currentThreshold = XP_THRESHOLDS[level - 1] ?? 0;
    const nextThreshold = XP_THRESHOLDS[level] ?? Infinity;
    this._state.xpInCurrentLevel = xp - currentThreshold;
    this._state.xpNeededForNext = nextThreshold === Infinity ? 0 : nextThreshold - currentThreshold;
    this._state.xpToNextLevel = nextThreshold === Infinity ? 0 : nextThreshold - xp;
    this._state.isMaxLevel = level >= XP_THRESHOLDS.length;

    if (emitEvents && level > prevLevel) {
      bus.emit('level:up', { level, previous: prevLevel });
      this._unlockLevelRewards(level);
    }
  }

  _unlockLevelRewards(level) {
    const rewards = {
      2:  { id: 'console_cable',    name: 'Console Cable',    description: '+2 free hints awarded immediately. Never run out of help in CLI labs.', rarity: 'common' },
      4:  { id: 'packet_sniffer',   name: 'Packet Sniffer',   description: '+10% XP on every completed CLI lab. Passive bonus, always active.',       rarity: 'uncommon' },
      6:  { id: 'subnet_calc_pro',  name: 'Subnet Calc Pro',  description: 'Reveals subnet mask for each subnetting problem. Passive, always on.',    rarity: 'rare' },
      8:  { id: 'debug_badge',      name: 'Debug Badge',      description: 'Unlocks "debug" commands in the CLI terminal for deeper troubleshooting.', rarity: 'rare' },
      10: { id: 'ccna_cert_frame',  name: 'CCNA Cert Frame',  description: 'Legendary: you have achieved Level 10. Proof of true CCNA mastery.',      rarity: 'legendary' },
    };
    if (rewards[level]) this.addItem(rewards[level]);
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  get state() {
    return structuredClone(this._state);
  }

  /**
   * Check and update the daily login streak.
   * Returns { current, isNew, extended } — call once on app init.
   */
  checkStreak() {
    const today = new Date().toDateString();
    const s     = this._state.streak || { current: 0, lastLogin: null, longest: 0 };

    if (s.lastLogin === today) {
      // Already checked in today — no change
      return { current: s.current, isNew: false, extended: false };
    }

    const yesterday = new Date(Date.now() - 86400000).toDateString();
    let extended = false;

    if (s.lastLogin === yesterday) {
      s.current++;
      extended = true;
    } else {
      s.current = 1;
    }

    s.lastLogin = today;
    s.longest   = Math.max(s.longest || 0, s.current);
    this._state.streak = s;
    this._persist();
    bus.emit('streak:updated', { current: s.current, longest: s.longest, extended });
    bus.emit('state:changed', this.state);
    return { current: s.current, isNew: true, extended };
  }

  /** XP multiplier from active streak (applied to quiz/boss sources). */
  get streakMultiplier() {
    const current = this._state.streak?.current || 0;
    if (current >= 7) return 1.5;
    if (current >= 3) return 1.25;
    return 1.0;
  }

  /** Record a question answered incorrectly. Notebook tracks wrong counts. */
  recordMistake(questionId) {
    if (!this._state.mistakeNotebook) this._state.mistakeNotebook = {};
    this._state.mistakeNotebook[questionId] = (this._state.mistakeNotebook[questionId] || 0) + 1;
    this._persist();
  }

  /** Clear the mistake notebook. */
  clearNotebook() {
    this._state.mistakeNotebook = {};
    this._persist();
    bus.emit('state:changed', this.state);
  }

  /** Get IDs of questions wrong ≥ threshold times (default 2). */
  getMistakeIds(threshold = 2) {
    const nb = this._state.mistakeNotebook || {};
    return Object.entries(nb).filter(([, n]) => n >= threshold).map(([id]) => id);
  }

  // ─── Spaced Repetition ───────────────────────────────────────────────────────

  /**
   * Update the SRS schedule for a question after an answer.
   * Intervals (days): [1, 3, 7, 14, 30, 90, 180]
   *   Correct → advance interval index, set dueDate = now + interval
   *   Wrong   → reset to index 0 (1 day), correctStreak = 0
   */
  /**
   * Update the SRS schedule for a question after an answer.
   * @param {string}      questionId
   * @param {boolean}     correct
   * @param {number|null} confidence  1–5 rating (null = not rated)
   *   correct + conf 1–2  → treat as wrong for SRS (lucky guess)
   *   correct + conf 3    → advance interval but don't increment correctStreak
   *   correct + conf 4–5  → advance normally (same as no confidence)
   */
  updateSRS(questionId, correct, confidence = null) {
    const SRS_INTERVALS = [1, 3, 7, 14, 30, 90, 180];
    const DAY           = 86400000;
    const now           = Date.now();
    if (!this._state.reviewSchedule) this._state.reviewSchedule = {};

    const e = this._state.reviewSchedule[questionId] || {
      correctStreak: 0, intervalIndex: 0, dueDate: now, totalSeen: 0, totalCorrect: 0,
    };

    e.totalSeen++;
    if (correct) e.totalCorrect++;

    // Confidence-adjusted SRS: low-confidence correct answers don't advance
    const effectiveCorrect = correct && (confidence === null || confidence >= 3);
    const halfCredit       = correct && confidence === 3;

    if (effectiveCorrect) {
      if (!halfCredit) e.correctStreak++;
      e.intervalIndex = Math.min(e.intervalIndex + 1, SRS_INTERVALS.length - 1);
    } else {
      e.correctStreak = 0;
      e.intervalIndex = 0;
    }
    e.dueDate = now + SRS_INTERVALS[e.intervalIndex] * DAY;

    this._state.reviewSchedule[questionId] = e;
    this._persist();
  }

  /**
   * Record a confidence rating for a question answer.
   * @param {string}  questionId
   * @param {number}  rating    1–5
   * @param {boolean} correct
   */
  recordConfidence(questionId, rating, correct) {
    if (!this._state.confidenceLog) this._state.confidenceLog = {};
    if (!this._state.confidenceLog[questionId]) this._state.confidenceLog[questionId] = [];
    this._state.confidenceLog[questionId].push({ rating, correct, date: Date.now() });
    // Keep last 10 entries per question
    if (this._state.confidenceLog[questionId].length > 10) {
      this._state.confidenceLog[questionId] = this._state.confidenceLog[questionId].slice(-10);
    }
    this._persist();
  }

  /** Get the raw SRS entry for a question, or null if never seen. */
  getSRSEntry(questionId) {
    return this._state.reviewSchedule?.[questionId] ?? null;
  }

  /**
   * Classify a question's SRS state.
   * Returns 'new' | 'learning' | 'due' | 'mastered'
   */
  getSRSState(questionId) {
    const e = this._state.reviewSchedule?.[questionId];
    if (!e) return 'new';
    if (e.correctStreak >= 5) return 'mastered';          // 30+ day interval
    if (e.dueDate <= Date.now()) return 'due';
    if (e.correctStreak < 3) return 'learning';
    return 'learning';
  }

  /**
   * Compute SRS stats across a set of question IDs.
   * Returns { new, due, learning, mastered }
   */
  getSRSStats(questionIds) {
    const now = Date.now();
    const srs = this._state.reviewSchedule || {};
    const stats = { new: 0, due: 0, learning: 0, mastered: 0 };
    questionIds.forEach(id => {
      const e = srs[id];
      if (!e) { stats.new++; return; }
      if (e.correctStreak >= 5) { stats.mastered++; return; }
      if (e.dueDate <= now) { stats.due++; return; }
      stats.learning++;
    });
    return stats;
  }

  /** Reset the entire SRS schedule (danger zone). */
  clearSRS() {
    this._state.reviewSchedule = {};
    this._persist();
    bus.emit('state:changed', this.state);
  }

  // ─── Flag System ─────────────────────────────────────────────────────────────

  /** Toggle flag on a question. Returns new flagged state (true/false). */
  toggleFlag(questionId) {
    if (!this._state.flaggedQuestions) this._state.flaggedQuestions = [];
    const idx = this._state.flaggedQuestions.indexOf(questionId);
    if (idx === -1) {
      this._state.flaggedQuestions.push(questionId);
    } else {
      this._state.flaggedQuestions.splice(idx, 1);
    }
    this._persist();
    bus.emit('flag:changed', { questionId, flagged: idx === -1 });
    return idx === -1;
  }

  isFlagged(questionId) {
    return (this._state.flaggedQuestions || []).includes(questionId);
  }

  getFlaggedIds() {
    return [...(this._state.flaggedQuestions || [])];
  }

  clearFlags() {
    this._state.flaggedQuestions = [];
    this._persist();
    bus.emit('state:changed', this.state);
  }

  /** Record study time. Minutes are fractional; persisted as total minutes. */
  addStudyTime(minutes) {
    if (minutes <= 0) return;
    this._state.studyMinutes = (this._state.studyMinutes || 0) + minutes;
    // Log to per-day record for heatmap
    const today = new Date().toISOString().slice(0, 10);
    if (!this._state.studyLog) this._state.studyLog = {};
    this._state.studyLog[today] = (this._state.studyLog[today] || 0) + minutes;
    this._persist();
    bus.emit('study:time', { total: this._state.studyMinutes });
  }

  /** Record a completed pomodoro (25-min work block). */
  recordPomodoro() {
    this._state.pomodoroCount = (this._state.pomodoroCount || 0) + 1;
    const today = new Date().toISOString().slice(0, 10);
    if (!this._state.pomodoroLog) this._state.pomodoroLog = {};
    this._state.pomodoroLog[today] = (this._state.pomodoroLog[today] || 0) + 1;
    this._persist();
    bus.emit('pomodoro:completed', { total: this._state.pomodoroCount });
  }

  get pomodoroCount() { return this._state.pomodoroCount || 0; }

  // ── Custom Questions ──────────────────────────────────────────────────────

  /** Add a custom question. Returns the saved question object. */
  addCustomQuestion(q) {
    if (!this._state.customQuestions) this._state.customQuestions = [];
    const entry = { ...q, id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, _custom: true, type: 'multiple_choice' };
    this._state.customQuestions.push(entry);
    this._persist();
    return entry;
  }

  /** Delete a custom question by id. */
  deleteCustomQuestion(id) {
    if (!this._state.customQuestions) return;
    this._state.customQuestions = this._state.customQuestions.filter(q => q.id !== id);
    this._persist();
  }

  /** Return a copy of all custom questions. */
  getCustomQuestions() {
    return [...(this._state.customQuestions || [])];
  }

  /** Cumulative study hours (float). */
  get studyHours() {
    return (this._state.studyMinutes || 0) / 60;
  }

  /** Gain XP from any source. Triggers level-up checks. */
  addXP(amount, source = 'general') {
    if (amount <= 0) return;
    this._state.xp += amount;
    this._recalcLevel(true);
    this._persist();
    bus.emit('xp:gained', { amount, total: this._state.xp, level: this._state.level, source });
    bus.emit('state:changed', this.state);
  }

  /** Spend XP (for hints, power-ups). Returns false if insufficient. */
  spendXP(amount) {
    if (this._state.xp < amount) return false;
    this._state.xp -= amount;
    this._recalcLevel(false);
    this._persist();
    bus.emit('xp:spent', { amount, remaining: this._state.xp });
    bus.emit('state:changed', this.state);
    return true;
  }

  /** Add item to inventory (no duplicates) and apply its passive effect. */
  addItem(item) {
    if (this._state.inventory.find(i => i.id === item.id)) return;
    this._state.inventory.push({ ...item, acquiredAt: Date.now() });
    // Apply passive on-acquire effects
    if (item.id === 'console_cable') this._state.hints += 2; // bonus hints
    this._persist();
    bus.emit('inventory:added', item);
    bus.emit('state:changed', this.state);
  }

  hasItem(itemId) {
    return this._state.inventory.some(i => i.id === itemId);
  }

  /** Record a completed lab. Re-completion only updates score if higher. */
  completeLab(labId, score = 100) {
    const existing = this._state.completedLabs.find(l => l.id === labId);
    if (!existing) {
      this._state.completedLabs.push({ id: labId, score, completedAt: Date.now() });
    } else if (score > existing.score) {
      existing.score = score;
      existing.completedAt = Date.now();
    }
    this._persist();
    bus.emit('lab:completed', { labId, score });
  }

  completeQuiz(quizId, score) {
    const existing = this._state.completedQuizzes.find(q => q.id === quizId);
    if (!existing) {
      this._state.completedQuizzes.push({ id: quizId, score, completedAt: Date.now() });
    } else if (score > existing.score) {
      existing.score = score;
      existing.completedAt = Date.now();
    }
    this._persist();
    bus.emit('quiz:completed', { quizId, score });
  }

  defeatBoss(bossId) {
    if (!this._state.bossesDefeated.includes(bossId)) {
      this._state.bossesDefeated.push(bossId);
      this._persist();
      bus.emit('boss:defeated', { bossId });
    }
  }

  // ─── Projects ───────────────────────────────────────────────────────────────

  getProjectProgress(id) {
    if (!this._state.completedProjects) this._state.completedProjects = {};
    return this._state.completedProjects[id] || null;
  }

  recordProjectPhase(id, phaseIdx, xp = 0) {
    if (!this._state.completedProjects) this._state.completedProjects = {};
    const prog = this._state.completedProjects[id] || { completedPhases: [], xpEarned: 0, startedAt: Date.now(), completedAt: null };
    if (!prog.completedPhases.includes(phaseIdx)) {
      prog.completedPhases.push(phaseIdx);
      prog.xpEarned = (prog.xpEarned || 0) + xp;
      if (xp > 0) this.addXP(xp, `project_phase:${id}:${phaseIdx}`);
    }
    this._state.completedProjects[id] = prog;
    this._persist();
  }

  completeProject(id) {
    if (!this._state.completedProjects) this._state.completedProjects = {};
    if (this._state.completedProjects[id]) {
      this._state.completedProjects[id].completedAt = Date.now();
      this._persist();
    }
  }

  isProjectComplete(id, totalPhases) {
    const prog = this.getProjectProgress(id);
    return prog ? prog.completedPhases.length >= totalPhases : false;
  }

  // ─── Mega Labs ───────────────────────────────────────────────────────────────

  getMegaLabProgress(id) {
    if (!this._state.megaLabProgress) this._state.megaLabProgress = {};
    return this._state.megaLabProgress[id] || null;
  }

  recordMegaLabPhase(id, phaseIdx, xp = 0) {
    if (!this._state.megaLabProgress) this._state.megaLabProgress = {};
    const prog = this._state.megaLabProgress[id] || { completedPhases: [], xpEarned: 0, hintsUsed: 0, startedAt: Date.now(), completedAt: null };
    if (!prog.completedPhases.includes(phaseIdx)) {
      prog.completedPhases.push(phaseIdx);
      prog.xpEarned = (prog.xpEarned || 0) + xp;
      if (xp > 0) this.addXP(xp, `megalab_phase:${id}:${phaseIdx}`);
    }
    this._state.megaLabProgress[id] = prog;
    this._persist();
  }

  recordMegaLabHint(id) {
    if (!this._state.megaLabProgress) this._state.megaLabProgress = {};
    const prog = this._state.megaLabProgress[id];
    if (prog) { prog.hintsUsed = (prog.hintsUsed || 0) + 1; this._persist(); }
    // Penalty: spend 30 XP
    this.spendXP(30);
  }

  completeMegaLab(id, badge) {
    if (!this._state.megaLabProgress) this._state.megaLabProgress = {};
    if (this._state.megaLabProgress[id]) {
      this._state.megaLabProgress[id].completedAt = Date.now();
      this._persist();
    }
    if (badge) this.awardBadge(badge.id, badge.name, badge.icon, badge.description);
  }

  isMegaLabComplete(id, totalPhases) {
    const prog = this.getMegaLabProgress(id);
    return prog ? prog.completedPhases.length >= totalPhases : false;
  }

  // ─── Badges ─────────────────────────────────────────────────────────────────

  awardBadge(id, name, icon, description) {
    if (!this._state.badges) this._state.badges = [];
    if (!this._state.badges.find(b => b.id === id)) {
      this._state.badges.push({ id, name, icon, description, awardedAt: Date.now() });
      this._persist();
      bus.emit('badge:awarded', { id, name, icon });
    }
  }

  get badges() { return this._state.badges || []; }

  /** Use a hint (free stock first, then costs 50 XP). */
  useHint() {
    if (this._state.hints > 0) {
      this._state.hints--;
      this._persist();
      bus.emit('hint:used', { hintsRemaining: this._state.hints });
      return true;
    }
    const spent = this.spendXP(50);
    if (spent) bus.emit('hint:used', { hintsRemaining: 0, xpCost: 50 });
    return spent;
  }

  updateStoryProgress(nodeId, data) {
    this._state.storyProgress[nodeId] = { ...data, timestamp: Date.now() };
    this._persist();
    bus.emit('story:progress', { nodeId, data });
  }

  unlockAchievement(id, name) {
    if (this._state.achievements.find(a => a.id === id)) return;
    this._state.achievements.push({ id, name, unlockedAt: Date.now() });
    this._persist();
    bus.emit('achievement:unlocked', { id, name });
  }

  setPlayerName(name) {
    this._state.playerName = name.trim() || 'Network Cadet';
    this._persist();
    bus.emit('state:changed', this.state);
  }

  /** Returns today's daily challenge log entry, or null if not yet set. */
  getDailyChallengeEntry() {
    const today = new Date().toISOString().slice(0, 10);
    return (this._state.dailyChallengeLog || {})[today] || null;
  }

  /** Record the question chosen for today (idempotent). */
  setDailyChallengeQuestion(questionId) {
    const today = new Date().toISOString().slice(0, 10);
    if (!this._state.dailyChallengeLog) this._state.dailyChallengeLog = {};
    if (!this._state.dailyChallengeLog[today]) {
      this._state.dailyChallengeLog[today] = { questionId, completed: false, xpAwarded: 0 };
      this._persist();
    }
  }

  /** Mark today's challenge completed and award XP. Returns xp awarded. */
  completeDailyChallenge(questionId) {
    const today = new Date().toISOString().slice(0, 10);
    if (!this._state.dailyChallengeLog) this._state.dailyChallengeLog = {};
    const entry = this._state.dailyChallengeLog[today];
    if (entry?.completed) return 0; // already done
    const xp = 50;
    this._state.dailyChallengeLog[today] = { questionId, completed: true, xpAwarded: xp };
    this._persist();
    this.addXP(xp, 'daily_challenge');
    return xp;
  }

  setTheme(theme) {
    if (!this._state.settings) this._state.settings = {};
    this._state.settings.theme = theme;
    this._persist();
  }

  completeOnboarding() {
    this._state.onboardingDone = true;
    this._persist();
  }

  hasVisitedView(view) {
    return (this._state.visitedViews || []).includes(view);
  }

  markViewVisited(view) {
    if (!this._state.visitedViews) this._state.visitedViews = [];
    if (!this._state.visitedViews.includes(view)) {
      this._state.visitedViews.push(view);
      this._persist();
    }
  }

  advanceWeek() {
    if (this._state.currentWeek < 6) {
      this._state.currentWeek++;
      this._persist();
      bus.emit('week:advanced', { week: this._state.currentWeek });
    }
  }

  clearQuizHistory() {
    this._state.quizHistory = [];
    this._persist();
    bus.emit('state:changed', this.state);
  }

  /** Record a completed quiz/exam session with per-domain breakdown. */
  recordQuizSession(data) {
    if (!this._state.quizHistory) this._state.quizHistory = [];
    this._state.quizHistory.push({ ...data, date: Date.now() });
    // Keep last 200 sessions
    if (this._state.quizHistory.length > 200) {
      this._state.quizHistory = this._state.quizHistory.slice(-200);
    }
    this._persist();
  }

  /** Record a session quality entry (last 30 kept). */
  recordSessionQuality(data) {
    if (!this._state.sessionHistory) this._state.sessionHistory = [];
    this._state.sessionHistory.push({ ...data, date: Date.now() });
    if (this._state.sessionHistory.length > 30) {
      this._state.sessionHistory = this._state.sessionHistory.slice(-30);
    }
    this._persist();
  }

  get sessionHistory() { return this._state.sessionHistory || []; }

  /** Set or clear the user's target exam date. Pass null to clear. */
  setExamDate(isoDate) {
    this._state.examDate = isoDate || null;
    this._persist();
    bus.emit('state:changed', this.state);
  }

  /** Days remaining until examDate (0 on exam day, negative if past, null if not set). */
  get daysUntilExam() {
    if (!this._state.examDate) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const exam  = new Date(this._state.examDate + 'T00:00:00');
    return Math.round((exam - today) / 86400000);
  }

  /** Record a completed exam run. Keeps the last 10 only. */
  recordExamRun(data) {
    if (!this._state.examHistory) this._state.examHistory = [];
    this._state.examHistory.push({ ...data, date: Date.now() });
    if (this._state.examHistory.length > 10) {
      this._state.examHistory = this._state.examHistory.slice(-10);
    }
    this._persist();
  }

  /** Export the full game state as a JSON string (for file download). */
  exportSave() {
    return JSON.stringify(this._state, null, 2);
  }

  /**
   * Replace the current game state with a previously exported save.
   * Merges with DEFAULT_STATE so new fields added in future versions survive.
   * @param {string} jsonString
   */
  importSave(jsonString) {
    const parsed = JSON.parse(jsonString);
    this._state = { ...DEFAULT_STATE, ...parsed };
    this._recalcLevel(false);
    this._persist(); // writes localStorage + IDB
    bus.emit('state:changed', this.state);
  }

  /** Full reset — wipes localStorage and IndexedDB. */
  reset() {
    localStorage.removeItem(STORAGE_KEY);
    if (this._idb) {
      try {
        const tx = this._idb.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete('save');
      } catch { /* non-critical */ }
    }
    this._state = { ...DEFAULT_STATE };
    this._recalcLevel(false);
    bus.emit('state:reset', {});
    bus.emit('state:changed', this.state);
  }

  /** XP percentage within current level (0–100) for progress bars. */
  get xpPercent() {
    if (this._state.isMaxLevel) return 100;
    const { xpInCurrentLevel, xpNeededForNext } = this._state;
    return Math.min(100, Math.round((xpInCurrentLevel / xpNeededForNext) * 100));
  }

  static get XP_THRESHOLDS() { return XP_THRESHOLDS; }
}
