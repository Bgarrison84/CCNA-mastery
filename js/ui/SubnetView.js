/**
 * SubnetView.js — Subnetting Calculator & Speed Drill
 *
 * Two tabs:
 *   Calculator — existing interactive subnetting diagram
 *   Speed Drill — timed drill mode powered by Subnetting.js
 */
import { generateIPv4Problem, validateIPv4 } from '../engine/Subnetting.js';

const FIELDS = [
  { key: 'networkId',   label: 'Network ID',      placeholder: 'e.g. 192.168.1.0' },
  { key: 'subnetMask',  label: 'Subnet Mask',      placeholder: 'e.g. 255.255.255.0' },
  { key: 'broadcast',   label: 'Broadcast',         placeholder: 'e.g. 192.168.1.255' },
  { key: 'firstUsable', label: 'First Usable Host', placeholder: 'e.g. 192.168.1.1' },
  { key: 'lastUsable',  label: 'Last Usable Host',  placeholder: 'e.g. 192.168.1.254' },
  { key: 'totalHosts',  label: 'Total Usable Hosts', placeholder: 'e.g. 254' },
];

export class SubnetView {
  constructor(content, store, containerEl) {
    this.content     = content;
    this.store       = store;
    this.containerEl = containerEl;
    this._tab        = 'calculator';
    this._drill      = null;   // active drill session state
    this._timerRef   = null;
  }

  render() {
    this.containerEl.innerHTML = `
      <div class="max-w-2xl mx-auto p-4">
        <div class="flex gap-2 mb-4">
          <button id="tab-calc"  class="subnet-tab px-4 py-1.5 text-xs font-mono border rounded transition-colors">🧮 Calculator</button>
          <button id="tab-drill" class="subnet-tab px-4 py-1.5 text-xs font-mono border rounded transition-colors">⚡ Speed Drill</button>
        </div>
        <div id="subnet-panel"></div>
      </div>`;

    this.containerEl.querySelector('#tab-calc').addEventListener('click',  () => this._switchTab('calculator'));
    this.containerEl.querySelector('#tab-drill').addEventListener('click', () => this._switchTab('drill'));
    this._switchTab(this._tab);
  }

  _switchTab(tab) {
    this._tab = tab;
    this.containerEl.querySelectorAll('.subnet-tab').forEach(btn => {
      const isActive = (btn.id === 'tab-calc' && tab === 'calculator') ||
                       (btn.id === 'tab-drill' && tab === 'drill');
      btn.className = `subnet-tab px-4 py-1.5 text-xs font-mono border rounded transition-colors ${
        isActive
          ? 'border-green-500 bg-green-900/20 text-green-400'
          : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-400'
      }`;
    });
    if (tab === 'calculator') this._renderCalculator();
    else                      this._renderDrill();
  }

  // ─── Calculator Tab ────────────────────────────────────────────────────────

  _renderCalculator() {
    const panel = this.containerEl.querySelector('#subnet-panel');
    panel.innerHTML = `
      <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 min-h-[400px]">
        <div class="animate-pulse text-gray-600 text-center py-20">Loading interactive tool…</div>
      </div>`;
    if (window.renderDiagram) {
      window.renderDiagram('subnetting', panel.querySelector('div'));
    }
  }

  // ─── Speed Drill Tab ───────────────────────────────────────────────────────

  _renderDrill() {
    const panel = this.containerEl.querySelector('#subnet-panel');

    // Load persisted drill stats
    const stats = this._loadStats();

    panel.innerHTML = `
      <div class="bg-gray-900 border border-gray-800 rounded-lg p-5 font-mono" id="drill-root">

        <!-- Stats bar -->
        <div class="flex flex-wrap gap-4 mb-5 text-xs text-gray-500">
          <span>Attempted: <span id="ds-attempted" class="text-green-400 font-bold">${stats.attempted}</span></span>
          <span>Correct: <span id="ds-correct" class="text-green-400 font-bold">${stats.correct}</span></span>
          <span>Streak: <span id="ds-streak" class="text-amber-400 font-bold">${stats.streak}</span></span>
          <span>Accuracy: <span id="ds-acc" class="text-green-400 font-bold">${stats.attempted ? Math.round((stats.correct / stats.attempted) * 100) : 0}%</span></span>
          ${stats.bestSpeedRun ? `<span>Best 5-run: <span class="text-cyan-400 font-bold">${stats.bestSpeedRun}s</span></span>` : ''}
        </div>

        <!-- Mode selector (only when idle) -->
        <div id="drill-idle">
          <div class="text-green-300 text-sm mb-4">Choose a drill mode:</div>
          <div class="flex flex-wrap gap-3 mb-2">
            <button data-mode="easy"     class="drill-start-btn px-4 py-2 border border-gray-600 hover:border-green-500 rounded text-xs text-gray-300 hover:text-green-300 transition-colors">
              🟢 Easy <span class="text-gray-600 ml-1">/24–/28</span>
            </button>
            <button data-mode="medium"   class="drill-start-btn px-4 py-2 border border-gray-600 hover:border-amber-500 rounded text-xs text-gray-300 hover:text-amber-300 transition-colors">
              🟡 Medium <span class="text-gray-600 ml-1">/19–/28</span>
            </button>
            <button data-mode="hard"     class="drill-start-btn px-4 py-2 border border-gray-600 hover:border-red-500 rounded text-xs text-gray-300 hover:text-red-300 transition-colors">
              🔴 Hard <span class="text-gray-600 ml-1">/16–/30</span>
            </button>
            <button data-mode="speedrun" class="drill-start-btn px-4 py-2 border border-cyan-800 hover:border-cyan-500 rounded text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
              ⚡ Speed Run <span class="text-gray-600 ml-1">5 problems</span>
            </button>
          </div>
          <p class="text-xs text-gray-600 mt-3">Correct answer = +25 XP · Speed Run bonus = +100 XP</p>
        </div>

        <!-- Active problem area (hidden until drill starts) -->
        <div id="drill-active" class="hidden">
          <div class="flex items-center justify-between mb-3">
            <span id="drill-problem-label" class="text-xs text-gray-500"></span>
            <div class="flex items-center gap-3">
              <span id="drill-timer" class="text-cyan-400 font-bold text-sm font-mono"></span>
              <button id="drill-stop" class="text-xs text-gray-600 hover:text-red-400 border border-gray-700 rounded px-2 py-0.5">✕ Stop</button>
            </div>
          </div>

          <!-- Problem statement -->
          <div id="drill-question" class="bg-black/40 border border-green-900/40 rounded p-3 mb-4 text-green-300 text-sm"></div>

          <!-- Hints (collapsible) -->
          <div id="drill-hints-wrap" class="mb-3 hidden">
            <button id="drill-hint-btn" class="text-xs text-amber-600 hover:text-amber-400 border border-amber-900/40 rounded px-2 py-0.5 mb-2">💡 Show Hint</button>
            <div id="drill-hint-text" class="hidden text-xs text-amber-300/70 bg-amber-950/20 border border-amber-900/30 rounded p-2"></div>
          </div>

          <!-- Answer fields -->
          <div id="drill-fields" class="grid grid-cols-1 gap-2 mb-4"></div>

          <!-- Submit -->
          <div class="flex gap-3">
            <button id="drill-submit" class="px-5 py-2 bg-green-800 hover:bg-green-700 text-green-100 text-sm rounded border border-green-600 font-semibold transition-colors">
              Submit →
            </button>
            <button id="drill-skip" class="px-3 py-2 text-xs text-gray-600 hover:text-gray-400 border border-gray-700 rounded transition-colors">
              Skip
            </button>
          </div>

          <!-- Feedback -->
          <div id="drill-feedback" class="mt-3 hidden"></div>
        </div>
      </div>`;

    // Wire up start buttons
    panel.querySelectorAll('.drill-start-btn').forEach(btn => {
      btn.addEventListener('click', () => this._startDrill(btn.dataset.mode));
    });
  }

  _startDrill(mode) {
    const isSpeedRun = mode === 'speedrun';
    const difficulty = isSpeedRun ? 'medium' : mode;

    this._drill = {
      mode,
      difficulty,
      isSpeedRun,
      problemCount: isSpeedRun ? 5 : Infinity,
      solved: 0,
      elapsed: 0,
      startTime: Date.now(),
      current: null,
      hintIdx: 0,
    };

    const root = this.containerEl.querySelector('#drill-root');
    root.querySelector('#drill-idle').classList.add('hidden');
    root.querySelector('#drill-active').classList.remove('hidden');
    root.querySelector('#drill-hints-wrap').classList.remove('hidden');

    // Timer
    this._timerRef = setInterval(() => {
      if (!this._drill) return;
      this._drill.elapsed = Math.round((Date.now() - this._drill.startTime) / 1000);
      const timerEl = this.containerEl.querySelector('#drill-timer');
      if (timerEl) {
        timerEl.textContent = isSpeedRun
          ? `⏱ ${this._drill.elapsed}s [${this._drill.solved}/${this._drill.problemCount}]`
          : `⏱ ${this._drill.elapsed}s`;
      }
    }, 500);

    // Wire stop/skip/submit/hint
    root.querySelector('#drill-stop').addEventListener('click',   () => this._stopDrill(false));
    root.querySelector('#drill-skip').addEventListener('click',   () => this._nextProblem(false));
    root.querySelector('#drill-submit').addEventListener('click', () => this._checkAnswer());
    root.querySelector('#drill-hint-btn').addEventListener('click', () => {
      const hint = this._drill?.current?.hints?.[this._drill.hintIdx] || 'No more hints.';
      const el = this.containerEl.querySelector('#drill-hint-text');
      el.textContent = hint;
      el.classList.remove('hidden');
      if (this._drill) this._drill.hintIdx++;
    });

    // Enter key submits
    root.addEventListener('keydown', e => {
      if (e.key === 'Enter') this._checkAnswer();
    });

    this._nextProblem(true);
  }

  _nextProblem(isFirst = false) {
    if (!this._drill) return;
    this._drill.hintIdx = 0;
    this._drill.current = generateIPv4Problem(this._drill.difficulty);

    const root = this.containerEl.querySelector('#drill-root');
    const p    = this._drill.current;
    const num  = this._drill.solved + 1;
    const total = this._drill.isSpeedRun ? `/${this._drill.problemCount}` : '';

    root.querySelector('#drill-problem-label').textContent =
      `Problem ${num}${total} · ${this._drill.isSpeedRun ? 'Speed Run' : this._drill.difficulty.charAt(0).toUpperCase() + this._drill.difficulty.slice(1)}`;
    root.querySelector('#drill-question').textContent = p.question;
    root.querySelector('#drill-feedback').classList.add('hidden');
    root.querySelector('#drill-hint-text').classList.add('hidden');

    // Render answer fields
    const fieldsEl = root.querySelector('#drill-fields');
    fieldsEl.innerHTML = FIELDS.map(f => `
      <div class="flex items-center gap-2">
        <label class="text-xs text-gray-500 w-36 shrink-0">${f.label}</label>
        <input data-field="${f.key}" type="text" placeholder="${f.placeholder}"
          class="flex-1 bg-black/40 border border-gray-700 rounded px-2 py-1 text-green-300 text-xs font-mono
                 focus:outline-none focus:border-green-500 transition-colors" autocomplete="off" />
        <span data-fb="${f.key}" class="w-4 text-sm"></span>
      </div>`).join('');

    if (!isFirst) {
      fieldsEl.querySelector('input')?.focus();
    }
  }

  _checkAnswer() {
    if (!this._drill?.current) return;
    const root    = this.containerEl.querySelector('#drill-root');
    const correct = this._drill.current.answers;

    const userAnswers = {};
    FIELDS.forEach(f => {
      const input = root.querySelector(`input[data-field="${f.key}"]`);
      if (input) userAnswers[f.key] = input.value;
    });

    const result = validateIPv4(userAnswers, correct);
    const stats  = this._loadStats();

    // Per-field feedback
    FIELDS.forEach(f => {
      const input = root.querySelector(`input[data-field="${f.key}"]`);
      const fb    = root.querySelector(`[data-fb="${f.key}"]`);
      const err   = result.errors[f.key];
      if (err) {
        if (input) { input.style.borderColor = '#ef4444'; input.style.color = '#fca5a5'; }
        if (fb)    fb.textContent = '✗';
      } else {
        if (input) { input.style.borderColor = '#22c55e'; input.style.color = '#86efac'; }
        if (fb)    fb.textContent = '✓';
      }
    });

    stats.attempted++;
    if (result.pass) {
      stats.correct++;
      stats.streak++;
      stats.maxStreak = Math.max(stats.maxStreak || 0, stats.streak);
      this._drill.solved++;
      this.store?.addXP(25, 'subnet_drill');
      document.dispatchEvent(new CustomEvent('ccna-xp', { detail: { amount: 25, reason: 'Subnet Drill' } }));
    } else {
      stats.streak = 0;
    }
    this._saveStats(stats);
    this._updateStatsBar(stats);

    // Summary feedback
    const fbEl = root.querySelector('#drill-feedback');
    fbEl.classList.remove('hidden');
    if (result.pass) {
      fbEl.innerHTML = `
        <div class="text-green-400 text-xs font-bold mb-1">✅ Correct! +25 XP</div>
        <div class="text-xs text-gray-600">Score: ${result.score}% · Streak: ${stats.streak}</div>`;
    } else {
      const errLines = Object.entries(result.errors).map(([k, v]) =>
        `<div class="text-red-400/80">  ${k}: expected <span class="text-red-300 font-bold">${v.expected}</span></div>`
      ).join('');
      fbEl.innerHTML = `
        <div class="text-red-400 text-xs font-bold mb-1">❌ ${result.passed}/${result.total} correct</div>
        ${errLines}`;
    }

    // Auto-advance or end speed run
    const isSpeedRunDone = this._drill.isSpeedRun && this._drill.solved >= this._drill.problemCount;
    const delay = result.pass ? 900 : 2200;

    setTimeout(() => {
      if (isSpeedRunDone) {
        this._stopDrill(true);
      } else if (result.pass) {
        this._nextProblem(false);
      }
      // On wrong answer in normal mode user can retry after seeing feedback; skip button moves on
    }, result.pass ? delay : 0);
  }

  _stopDrill(completed) {
    clearInterval(this._timerRef);
    const elapsed = this._drill?.elapsed || 0;
    const solved  = this._drill?.solved  || 0;
    const isSpeedRun = this._drill?.isSpeedRun;
    this._drill = null;

    if (isSpeedRun && completed) {
      const stats = this._loadStats();
      if (!stats.bestSpeedRun || elapsed < stats.bestSpeedRun) {
        stats.bestSpeedRun = elapsed;
        this._saveStats(stats);
      }
      // Speed run XP bonus
      document.dispatchEvent(new CustomEvent('ccna-xp', { detail: { amount: 100, reason: 'Speed Run Complete' } }));
    }

    // Re-render the drill tab (returns to idle mode with updated stats)
    this._renderDrill();

    if (isSpeedRun && completed) {
      const root = this.containerEl.querySelector('#drill-root');
      const msg  = document.createElement('div');
      msg.className = 'mt-4 text-center text-sm text-cyan-400 font-bold border border-cyan-800 rounded p-3';
      msg.textContent = `⚡ Speed Run complete! ${solved}/5 correct in ${elapsed}s. +100 XP bonus!`;
      root.appendChild(msg);
    }
  }

  _updateStatsBar(stats) {
    const root = this.containerEl.querySelector('#drill-root');
    if (!root) return;
    const acc = stats.attempted ? Math.round((stats.correct / stats.attempted) * 100) : 0;
    const get = id => root.querySelector(`#${id}`);
    if (get('ds-attempted')) get('ds-attempted').textContent = stats.attempted;
    if (get('ds-correct'))   get('ds-correct').textContent   = stats.correct;
    if (get('ds-streak'))    get('ds-streak').textContent    = stats.streak;
    if (get('ds-acc'))       get('ds-acc').textContent       = `${acc}%`;
  }

  // ─── Persistent drill stats ────────────────────────────────────────────────

  _loadStats() {
    try {
      const raw = localStorage.getItem('ccna_drill_stats');
      return raw ? JSON.parse(raw) : { attempted: 0, correct: 0, streak: 0, maxStreak: 0, bestSpeedRun: null };
    } catch { return { attempted: 0, correct: 0, streak: 0, maxStreak: 0, bestSpeedRun: null }; }
  }

  _saveStats(s) {
    try { localStorage.setItem('ccna_drill_stats', JSON.stringify(s)); } catch {}
  }

  destroy() {
    clearInterval(this._timerRef);
    this._drill = null;
  }
}
