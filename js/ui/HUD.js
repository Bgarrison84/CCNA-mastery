/**
 * HUD.js — Heads-Up Display
 * Subscribes to Store events and updates all XP/Level/Inventory UI elements.
 * Renders toast notifications for XP gain, level up, achievements.
 * Handles the Pomodoro focus timer.
 */
import { bus } from '../core/EventBus.js';

const POMODORO_WORK_SECS  = 25 * 60;   // 25 minutes
const POMODORO_BREAK_SECS = 5  * 60;   // 5-minute break

export class HUD {
  /**
   * @param {object} store   - Store instance
   * @param {object} els     - DOM element references
   */
  constructor(store, els) {
    this.store = store;
    this.els   = els;
    
    this._pomo = {
      state:     'idle',   // 'idle' | 'work' | 'break'
      remaining: 0,        // seconds left
      _interval: null,
    };

    this._bind();
    this.refresh(store.state);
    this._initPomodoro();
  }

  _bind() {
    bus.on('state:changed',          s  => this.refresh(s));
    bus.on('xp:gained',              e  => this._toastXP(e));
    bus.on('level:up',               e  => this._toastLevelUp(e));
    bus.on('inventory:added',        e  => this._toastItem(e));
    bus.on('achievement:unlocked',   e  => this._toastAchievement(e));
    bus.on('boss:defeated',          e  => this._toastBoss(e));
    bus.on('hint:used',              e  => this._updateHints(e));
    bus.on('streak:updated',         e  => this._toastStreak(e));
  }

  refresh(state) {
    const { level, xp, xpInCurrentLevel, xpNeededForNext, isMaxLevel,
            playerName, hints, currentWeek } = state;

    if (this.els.levelBadge)  this.els.levelBadge.textContent  = `LVL ${level}`;
    if (this.els.playerName)  this.els.playerName.textContent  = playerName;
    if (this.els.hintCount)   this.els.hintCount.textContent   = hints;
    if (this.els.weekBadge)   this.els.weekBadge.textContent   = `Week ${currentWeek}`;

    // XP bar
    if (this.els.xpBar) {
      const pct = isMaxLevel ? 100 :
        xpNeededForNext > 0 ? Math.round((xpInCurrentLevel / xpNeededForNext) * 100) : 100;
      this.els.xpBar.style.width = `${pct}%`;
      this.els.xpBar.setAttribute('aria-valuenow', pct);
    }

    if (this.els.xpText) {
      this.els.xpText.textContent = isMaxLevel
        ? `${xp} XP — MAX LEVEL`
        : `${xp} XP  (${xpInCurrentLevel}/${xpNeededForNext} to next level)`;
    }

    // Streak
    const streak = state.streak?.current || 0;
    const streakEl = document.getElementById('hud-streak-count');
    if (streakEl) streakEl.textContent = streak;
    const multEl  = document.getElementById('hud-multiplier');
    const multVal = document.getElementById('hud-mult-val');
    if (multEl && multVal) {
      const mult = streak >= 7 ? '1.5' : streak >= 3 ? '1.25' : null;
      if (mult) {
        multVal.textContent = mult;
        multEl.classList.remove('hidden');
      } else {
        multEl.classList.add('hidden');
      }
    }

    // Inventory
    if (this.els.inventoryList) this._renderInventory(state.inventory);
    
    // Pomodoro total
    this._syncPomodoroCount();
  }

  _renderInventory(inventory) {
    const el = this.els.inventoryList;
    if (!el || !inventory) return;
    el.innerHTML = '';

    if (!inventory.length) {
      el.innerHTML = '<li class="text-gray-500 text-sm italic">No items yet.</li>';
      return;
    }

    const rarityColors = {
      common:    'text-gray-300 border-gray-600',
      uncommon:  'text-green-300 border-green-600',
      rare:      'text-blue-300 border-blue-600',
      legendary: 'text-yellow-300 border-yellow-500',
    };

    for (const item of inventory) {
      const li  = document.createElement('li');
      const cls = rarityColors[item.rarity] || rarityColors.common;
      li.className = `flex items-start gap-2 py-1 border-b border-gray-800 ${cls}`;
      li.innerHTML = `
        <span class="text-lg select-none">${this._itemIcon(item.rarity)}</span>
        <div>
          <div class="font-semibold text-sm">${item.name}</div>
          <div class="text-xs opacity-70">${item.description}</div>
        </div>`;
      el.appendChild(li);
    }
  }

  _itemIcon(rarity) {
    return { common: '&#9632;', uncommon: '&#9670;', rare: '&#9733;', legendary: '&#9762;' }[rarity] || '&#9632;';
  }

  // ─── Hints ─────────────────────────────────────────────────────────────────

  _updateHints({ hintsRemaining }) {
    if (this.els.hintCount) this.els.hintCount.textContent = hintsRemaining;
  }

  // ─── Pomodoro ──────────────────────────────────────────────────────────────

  _initPomodoro() {
    this._syncPomodoroCount();
    const btn = document.getElementById('hud-pomodoro-btn');
    if (!btn) return;
    btn.addEventListener('click', () => this._togglePomodoro());
  }

  _syncPomodoroCount() {
    const el = document.getElementById('hud-pomodoro-total');
    if (el) el.textContent = this.store.pomodoroCount;
  }

  _togglePomodoro() {
    if (this._pomo.state === 'idle') {
      this._startPomodoroWork();
    } else {
      this._stopPomodoro(true);
    }
  }

  _startPomodoroWork() {
    this._pomo.state     = 'work';
    this._pomo.remaining = POMODORO_WORK_SECS;
    this._pomo._interval = setInterval(() => this._pomodoroTick(), 1000);
    this._renderPomodoroHUD();
  }

  _startPomodoroBreak() {
    this._pomo.state     = 'break';
    this._pomo.remaining = POMODORO_BREAK_SECS;
    this._pomo._interval = setInterval(() => this._pomodoroTick(), 1000);
    this._renderPomodoroHUD();
  }

  _stopPomodoro(cancelled = false) {
    clearInterval(this._pomo._interval);
    this._pomo._interval = null;
    this._pomo.state     = 'idle';
    this._pomo.remaining = 0;
    this._renderPomodoroHUD();
    if (!cancelled) return;
    const btn = document.getElementById('hud-pomodoro-btn');
    if (btn) btn.title = 'Start a 25-minute Pomodoro focus session';
  }

  _pomodoroTick() {
    this._pomo.remaining--;
    this._renderPomodoroHUD();

    if (this._pomo.remaining > 0) return;

    clearInterval(this._pomo._interval);
    this._pomo._interval = null;

    if (this._pomo.state === 'work') {
      this.store.recordPomodoro();
      this.store.addStudyTime(25);
      this._syncPomodoroCount();
      this._pomodoroToast(
        `&#127813; Pomodoro #${this.store.pomodoroCount} complete! +25 min study time. Take a 5-minute break.`,
        'green'
      );
      this._startPomodoroBreak();
    } else {
      this._pomo.state = 'idle';
      this._renderPomodoroHUD();
      this._pomodoroToast('&#9749; Break over! Click &#127813; to start your next Pomodoro.', 'blue');
    }
  }

  _renderPomodoroHUD() {
    const btn   = document.getElementById('hud-pomodoro-btn');
    const label = document.getElementById('hud-pomodoro-label');
    if (!btn || !label) return;

    if (this._pomo.state === 'idle') {
      label.textContent = 'Pomodoro';
      btn.className = 'flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors cursor-pointer select-none';
      btn.title = 'Start a 25-minute Pomodoro focus session';
      return;
    }

    const mins = String(Math.floor(this._pomo.remaining / 60)).padStart(2, '0');
    const secs = String(this._pomo.remaining % 60).padStart(2, '0');
    const display = `${mins}:${secs}`;

    if (this._pomo.state === 'work') {
      label.textContent = `${display} — click to cancel`;
      btn.className = 'flex items-center gap-1 text-red-400 font-mono font-bold cursor-pointer select-none animate-pulse';
      btn.title = `Focus session: ${display} remaining. Click to cancel.`;
    } else {
      label.textContent = `\u2615 ${display} break`;
      btn.className = 'flex items-center gap-1 text-blue-400 font-mono cursor-pointer select-none';
      btn.title = `Break: ${display} remaining. Click to skip.`;
    }
  }

  _pomodoroToast(msg, colour = 'green') {
    const colourMap = { green: 'bg-green-900 border-green-600 text-green-200', blue: 'bg-blue-900 border-blue-600 text-blue-200' };
    const cls = colourMap[colour] || colourMap.green;
    this._toast(msg, cls, 5000);
  }

  // ─── Toast Notifications ───────────────────────────────────────────────────

  _toastXP({ amount, source }) {
    this._toast(`+${amount} XP`, 'bg-green-800 border-green-500 text-green-200', 1500);
  }

  _toastLevelUp({ level }) {
    this._toast(
      `LEVEL UP! → LVL ${level}`,
      'bg-yellow-900 border-yellow-400 text-yellow-200 text-lg font-bold',
      3000
    );
    if (this.els.xpBar) {
      this.els.xpBar.classList.remove('xp-level-pulse');
      void this.els.xpBar.offsetWidth; 
      this.els.xpBar.classList.add('xp-level-pulse');
      this.els.xpBar.addEventListener('animationend', () => {
        this.els.xpBar.classList.remove('xp-level-pulse');
      }, { once: true });
    }
  }

  _toastItem({ name, rarity }) {
    const colors = { legendary: 'bg-yellow-900 border-yellow-400 text-yellow-200', rare: 'bg-blue-900 border-blue-400 text-blue-200', uncommon: 'bg-green-900 border-green-500 text-green-200', common: 'bg-gray-800 border-gray-500 text-gray-200' };
    this._toast(`Item Unlocked: ${name}`, `${colors[rarity] || colors.common}`, 2500);
  }

  _toastAchievement({ name }) {
    this._toast(`Achievement: ${name}`, 'bg-purple-900 border-purple-400 text-purple-200 font-bold', 3000);
  }

  _toastBoss({ bossId, perfectRun }) {
    this._toast(
      perfectRun ? 'BOSS DEFEATED! PERFECT RUN! +100 XP' : 'BOSS DEFEATED!',
      'bg-red-900 border-red-400 text-red-200 text-lg font-bold',
      3500
    );
  }

  _toastStreak({ current, extended }) {
    if (!extended) return; 
    const msg = current >= 7
      ? `\u{1F525} ${current}-Day Streak! 1.5x XP active!`
      : current >= 3
        ? `\u{1F525} ${current}-Day Streak! 1.25x XP active!`
        : `\u{1F525} ${current}-Day Streak! Keep it up!`;
    this._toast(msg, 'bg-orange-900 border-orange-400 text-orange-200 font-bold', 3500);
  }

  /**
   * Render a toast notification.
   * @param {string} message
   * @param {string} classes  - Tailwind classes
   * @param {number} duration - ms
   */
  _toast(message, classes, duration = 2000) {
    const container = this.els.toastContainer || document.getElementById('toast-container');
    if (!container) return;

    const el = document.createElement('div');
    el.className = `px-4 py-2 border rounded shadow-lg text-sm transition-all duration-300 opacity-0 translate-y-2 ${classes}`;
    // Handle HTML if it starts with an entity (like the pomodoro emoji)
    if (message.includes('&') || message.includes('<')) el.innerHTML = message;
    else el.textContent = message;
    
    container.appendChild(el);

    requestAnimationFrame(() => {
      el.classList.remove('opacity-0', 'translate-y-2');
    });

    setTimeout(() => {
      el.classList.add('opacity-0', 'translate-y-2');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    }, duration);
  }
}
