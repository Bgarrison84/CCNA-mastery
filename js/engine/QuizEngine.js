/**
 * QuizEngine.js — XP Farming / Grind Mode Quiz Engine
 *
 * Loads questions from content.json, filters by domain/difficulty,
 * tracks spaced repetition scores, and awards XP on completion.
 */
import { bus } from '../core/EventBus.js';

const XP_TABLE = {
  easy:   { correct: 5,  wrong: 0 },
  medium: { correct: 15, wrong: 0 },
  hard:   { correct: 30, wrong: 0 },
};

export class QuizEngine {
  /**
   * @param {object[]} questions  - array from content.json
   * @param {object}   store      - Store instance
   * @param {object}   opts
   * @param {string}   opts.domain      - filter by domain
   * @param {string}   opts.difficulty  - 'easy'|'medium'|'hard'|'all'
   * @param {number}   opts.count       - questions per session (default 10)
   * @param {boolean}  opts.shuffle     - randomize order (default true)
   */
  constructor(questions, store, opts = {}) {
    this.store      = store;
    this.opts       = { count: 10, shuffle: true, difficulty: 'all', domain: 'all', requeueWrong: false, srs: false, ...opts };

    this._pool      = this._filter(questions);
    this._session   = this._buildSession();
    this.currentIdx = 0;
    this.results    = [];    // [{ questionId, correct, timeMs, xpGained }]
    this._requeued  = new Set();   // question IDs already re-queued (re-queue once only)
    this.active     = false;
    this.startTime  = null;
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  start() {
    if (!this._session.length) {
      bus.emit('quiz:error', { message: 'No questions match selected filters.' });
      return false;
    }
    this.active    = true;
    this.startTime = Date.now();
    bus.emit('quiz:started', { total: this._session.length, question: this.currentQuestion });
    return true;
  }

  // ─── Answering ─────────────────────────────────────────────────────────────

  /**
   * @param {string|number} answer
   * @returns {{ correct: bool, explanation: string, xpGained: number, done: bool, summary?: object }}
   */
  answer(answer) {
    if (!this.active) return { correct: false, explanation: 'Quiz not started.', xpGained: 0, done: false };

    const q       = this.currentQuestion;
    const isRight = this._check(q, answer);
    const baseXP  = isRight ? (XP_TABLE[q.difficulty]?.correct ?? 10) : 0;
    const xp      = baseXP > 0 ? Math.round(baseXP * (this.store.streakMultiplier || 1)) : 0;
    const timeMs  = Date.now() - this.startTime;

    if (xp > 0) this.store.addXP(xp, `quiz:${q.id}`);

    // Update SRS schedule after every answer in SRS mode
    if (this.opts.srs) this.store.updateSRS(q.id, isRight);

    this.results.push({
      questionId: q.id,
      correct:    isRight,
      timeMs,
      xpGained:   xp,
      answer,
      correctAnswer: q.correct_answer,
    });

    // Re-queue wrong answers once ~5 questions later so the player gets a second attempt
    if (!isRight && this.opts.requeueWrong && !this._requeued.has(q.id)) {
      this._requeued.add(q.id);
      const insertAt = Math.min(this.currentIdx + 5, this._session.length);
      this._session.splice(insertAt, 0, q);
    }

    bus.emit('quiz:answered', { correct: isRight, xp, question: q });
    this.currentIdx++;

    if (this.currentIdx >= this._session.length) {
      return this._finish();
    }

    return {
      correct:     isRight,
      explanation: q.explanation || (isRight ? 'Correct!' : `Incorrect. Answer: ${q.correct_answer}`),
      xpGained:    xp,
      done:        false,
      next:        this.currentQuestion,
    };
  }

  skip() {
    this.results.push({ questionId: this.currentQuestion?.id, correct: false, skipped: true, xpGained: 0 });
    this.currentIdx++;
    if (this.currentIdx >= this._session.length) return this._finish();
    return { done: false, next: this.currentQuestion };
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  _finish() {
    this.active = false;
    const correct = this.results.filter(r => r.correct).length;
    const total   = this.results.length;
    const score   = Math.round((correct / total) * 100);
    const totalXP = this.results.reduce((s, r) => s + r.xpGained, 0);

    const summary = { correct, total, score, totalXP, results: this.results };
    bus.emit('quiz:completed', summary);
    return { done: true, summary };
  }

  _check(q, answer) {
    if (q.type === 'multiple_choice') {
      return String(answer) === String(q.correct_answer);
    }
    if (q.type === 'true_false') {
      return String(answer).toLowerCase() === String(q.correct_answer).toLowerCase();
    }
    if (q.type === 'multi_select') {
      if (!Array.isArray(answer) || !Array.isArray(q.correct_answer)) return false;
      const norm = arr => [...arr].map(String).sort().join(',');
      return norm(answer) === norm(q.correct_answer);
    }
    if (q.type === 'drag_drop' || q.type === 'ordering') {
      if (Array.isArray(answer) && Array.isArray(q.correct_answer)) {
        return JSON.stringify(answer) === JSON.stringify(q.correct_answer);
      }
    }
    if (q.type === 'fill_blank') {
      const norm = s => String(s).toLowerCase().trim();
      if (Array.isArray(q.correct_answer)) return q.correct_answer.some(a => norm(a) === norm(answer));
      return norm(answer) === norm(q.correct_answer);
    }
    return false;
  }

  _filter(questions) {
    return questions.filter(q => {
      if (this.opts.domain !== 'all' && q.domain !== this.opts.domain) return false;
      if (this.opts.difficulty !== 'all' && q.difficulty !== this.opts.difficulty) return false;
      if (q.type === 'cli_lab') return false; // CLI labs handled separately
      return true;
    });
  }

  _buildSession() {
    let pool = [...this._pool];

    if (this.opts.srs) {
      // SRS ordering: overdue/due first (ascending dueDate), then new (no entry), then not-yet-due
      const now = Date.now();
      pool.sort((a, b) => {
        const ea = this.store.getSRSEntry(a.id);
        const eb = this.store.getSRSEntry(b.id);
        // New questions (no entry) sort before not-yet-due, but after overdue
        const dueA = ea ? ea.dueDate : now;      // new = treat as due now
        const dueB = eb ? eb.dueDate : now;
        // Mastered questions (streak ≥ 5) sort last
        const mastA = ea && ea.correctStreak >= 5 ? 1 : 0;
        const mastB = eb && eb.correctStreak >= 5 ? 1 : 0;
        if (mastA !== mastB) return mastA - mastB;
        return dueA - dueB;
      });
    } else if (this.opts.shuffle) {
      pool = this._shuffle(pool);
    }

    return pool.slice(0, this.opts.count);
  }

  /** SRS stats for the current filtered pool. */
  get srsStats() {
    if (!this.opts.srs) return null;
    return this.store.getSRSStats(this._pool.map(q => q.id));
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  get currentQuestion() {
    return this._session[this.currentIdx] ?? null;
  }

  get progress() {
    return { current: this.currentIdx + 1, total: this._session.length };
  }

  get domains() {
    return [...new Set(this._pool.map(q => q.domain))];
  }

  /** Returns sorted unique domains derived from a questions array.
   *  Falls back to the canonical 6 CCNA domains if questions is empty. */
  static domainsFrom(questions = []) {
    const found = [...new Set(questions.map(q => q.domain).filter(Boolean))].sort();
    return found.length ? found : [
      'Network Fundamentals',
      'Network Access',
      'IP Connectivity',
      'IP Services',
      'Security Fundamentals',
      'Automation & Programmability',
    ];
  }
}
