/**
 * BossBattle.js — Boss Battle Engine
 *
 * Health system: player starts with maxHP. Wrong answer → damage.
 * Hints cost XP (via Store). Time pressure adds score multiplier.
 * Emits events: boss:damage, boss:heal, boss:defeated, boss:failed
 */
import { bus } from '../core/EventBus.js';

const BASE_MAX_HP   = 100;
const HINT_XP_COST  = 75;   // XP cost to reveal a hint
const TIME_BONUS_S  = 60;   // Seconds for max time bonus
const PERFECT_BONUS = 100;  // Extra XP for zero wrong answers

// Damage scales up with difficulty phase
const PHASE_DAMAGE  = { easy: 10, medium: 20, hard: 30 };

export class BossBattle {
  /**
   * @param {object} bossData  - from content.json boss entry
   * @param {object} store     - Store instance
   */
  constructor(bossData, store) {
    this.bossData     = bossData;
    this.store        = store;

    this.maxHP        = BASE_MAX_HP;
    this.currentHP    = BASE_MAX_HP;
    this.bossHP       = 100;           // Boss loses HP on correct answers
    this.currentIdx   = 0;
    this.score        = 0;
    this.correct      = 0;
    this.wrong        = 0;
    this.hintsUsed    = 0;
    this.startTime    = null;
    this.endTime      = null;
    this._timer       = null;
    this._elapsed     = 0;
    this.active       = false;
    this.phaseStats   = { easy: { correct: 0, total: 0 }, medium: { correct: 0, total: 0 }, hard: { correct: 0, total: 0 } };
    // Sort questions by difficulty: easy → medium → hard (then shuffle within each tier)
    this.questions    = this._sortByDifficulty([...bossData.questions]);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  start() {
    this.active    = true;
    this.startTime = Date.now();
    this._elapsed  = 0;
    this._timer    = setInterval(() => {
      this._elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      bus.emit('boss:tick', { elapsed: this._elapsed, hp: this.currentHP, bossHp: this.bossHP });
    }, 1000);

    bus.emit('boss:started', {
      bossId:    this.bossData.id,
      bossName:  this.bossData.name,
      question:  this.currentQuestion,
      totalQ:    this.questions.length,
      maxHP:     this.maxHP,
    });
  }

  stop() {
    this.active  = false;
    this.endTime = Date.now();
    clearInterval(this._timer);
  }

  // ─── Answering ─────────────────────────────────────────────────────────────

  /**
   * Submit an answer for the current question.
   * @param {string|number} answer  - index for MC, string for text
   * @returns {{ correct: bool, feedback: string, done: bool, finalScore: number|null }}
   */
  answer(answer) {
    if (!this.active) return { correct: false, feedback: 'Battle not active.', done: false };

    const q       = this.currentQuestion;
    const isRight = this._checkAnswer(q, answer);

    const prevPhase = this._phase();
    const diff = q.difficulty || 'medium';
    if (!this.phaseStats[diff]) this.phaseStats[diff] = { correct: 0, total: 0 };
    this.phaseStats[diff].total++;
    if (isRight) {
      this.phaseStats[diff].correct++;
      this.correct++;
      const xpGain    = this._calcXP(q);
      const bossDmg   = Math.floor(100 / this.questions.length);
      this.bossHP     = Math.max(0, this.bossHP - bossDmg);
      this.score     += xpGain;
      this.store.addXP(xpGain, `boss:${this.bossData.id}`);
      bus.emit('boss:correct', { xpGain, bossHp: this.bossHP, feedback: q.explanation });

      if (this.bossHP <= 0) {
        return this._victory();
      }
    } else {
      this.wrong++;
      const damage = PHASE_DAMAGE[q.difficulty] ?? PHASE_DAMAGE.medium;
      this.currentHP = Math.max(0, this.currentHP - damage);
      bus.emit('boss:damage', { damage, hp: this.currentHP, correct: q.correct_answer });

      if (this.currentHP <= 0) {
        return this._defeat();
      }
    }

    this.currentIdx++;
    if (this.currentIdx >= this.questions.length) {
      // All questions answered — final result depends on HP
      return this.currentHP > 0 ? this._victory() : this._defeat();
    }

    const nextPhase    = this._phase();
    const phaseChanged = nextPhase !== prevPhase;

    return {
      correct:     isRight,
      feedback:    isRight ? (q.explanation || 'Correct!') : `Wrong. ${q.explanation || ''}`,
      done:        false,
      next:        this.currentQuestion,
      phaseChanged,
      phase:       nextPhase,
    };
  }

  // ─── Hints ─────────────────────────────────────────────────────────────────

  /**
   * Reveal a hint for the current question. Costs XP via Store.
   * @returns {{ hint: string|null, cost: number, success: bool }}
   */
  useHint() {
    const q = this.currentQuestion;
    if (!q?.hints?.length) return { hint: 'No hints available for this question.', cost: 0, success: true };

    const hintIdx = Math.min(this.hintsUsed, q.hints.length - 1);

    // Free hints from store first, then XP cost
    const ok = this.store.useHint();
    if (!ok) return { hint: null, cost: HINT_XP_COST, success: false, message: 'Not enough XP for a hint.' };

    this.hintsUsed++;
    const hint = q.hints[hintIdx];
    bus.emit('boss:hint', { hint, hintsUsed: this.hintsUsed });
    return { hint, cost: HINT_XP_COST, success: true };
  }

  // ─── Scoring ───────────────────────────────────────────────────────────────

  _calcXP(question) {
    const baseXP = { easy: 10, medium: 20, hard: 35, boss: 50 };
    const base   = baseXP[question.difficulty] ?? 15;
    const timeBonus = this._elapsed < TIME_BONUS_S ? Math.round((1 - this._elapsed / TIME_BONUS_S) * base * 0.5) : 0;
    return base + timeBonus;
  }

  _victory() {
    this.stop();
    const finalScore  = this._finalScore();
    const perfectRun  = this.wrong === 0;
    this.store.defeatBoss(this.bossData.id);
    this.store.addXP(this.bossData.xpReward || 200, `boss_clear:${this.bossData.id}`);
    if (perfectRun) {
      const bonus = this.bossData.perfectBonus || PERFECT_BONUS;
      this.store.addXP(bonus, `boss_perfect:${this.bossData.id}`);
    }
    bus.emit('boss:defeated', { bossId: this.bossData.id, score: finalScore, time: this._elapsed, perfectRun });
    return { correct: true, done: true, victory: true, finalScore, elapsed: this._elapsed, perfectRun, phaseStats: this.phaseStats, correctCount: this.correct, total: this.questions.length };
  }

  _defeat() {
    this.stop();
    const finalScore = this._finalScore();
    bus.emit('boss:failed', { bossId: this.bossData.id, score: finalScore });
    return { correct: false, done: true, victory: false, finalScore, elapsed: this._elapsed, phaseStats: this.phaseStats, correctCount: this.correct, total: this.questions.length };
  }

  _finalScore() {
    const accuracy = this.questions.length > 0 ? (this.correct / this.questions.length) * 100 : 0;
    const hpBonus  = Math.floor((this.currentHP / this.maxHP) * 50);
    return Math.round(accuracy + hpBonus);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  _checkAnswer(q, answer) {
    if (q.type === 'multiple_choice') {
      return String(answer) === String(q.correct_answer);
    }
    if (q.type === 'true_false') {
      return String(answer).toLowerCase() === String(q.correct_answer).toLowerCase();
    }
    if (q.type === 'fill_blank') {
      const normalize = s => s.toLowerCase().trim().replace(/\s+/g, ' ');
      return normalize(String(answer)) === normalize(String(q.correct_answer));
    }
    return false;
  }

  /** Current difficulty phase based on question index. */
  _phase() {
    const pct = this.currentIdx / this.questions.length;
    if (pct >= 0.67) return 'hard';
    if (pct >= 0.33) return 'medium';
    return 'easy';
  }

  /** Sort questions easy→medium→hard, shuffling within each tier. */
  _sortByDifficulty(arr) {
    const order  = { easy: 0, medium: 1, hard: 2 };
    const tiers  = { easy: [], medium: [], hard: [] };
    arr.forEach(q => (tiers[q.difficulty] || tiers.medium).push(q));
    return [
      ...this._shuffle(tiers.easy),
      ...this._shuffle(tiers.medium),
      ...this._shuffle(tiers.hard),
    ];
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  get currentQuestion() {
    return this.questions[this.currentIdx] ?? null;
  }

  get currentPhase() {
    return this._phase();
  }

  get progressPercent() {
    return Math.round((this.currentIdx / this.questions.length) * 100);
  }

  get hpPercent() {
    return Math.round((this.currentHP / this.maxHP) * 100);
  }

  get bossHpPercent() {
    return Math.round((this.bossHP / 100) * 100);
  }
}
