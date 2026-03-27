/**
 * HUD.js — Heads-Up Display
 * Subscribes to Store events and updates all XP/Level/Inventory UI elements.
 * Renders toast notifications for XP gain, level up, achievements.
 */
import { bus } from '../core/EventBus.js';

export class HUD {
  /**
   * @param {object} store   - Store instance
   * @param {object} els     - DOM element references
   * @param {HTMLElement} els.levelBadge
   * @param {HTMLElement} els.xpBar
   * @param {HTMLElement} els.xpText
   * @param {HTMLElement} els.playerName
   * @param {HTMLElement} els.hintCount
   * @param {HTMLElement} els.inventoryList
   * @param {HTMLElement} els.toastContainer
   * @param {HTMLElement} els.weekBadge
   */
  constructor(store, els) {
    this.store = store;
    this.els   = els;
    this._bind();
    this.refresh(store.state);
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
    // Glow pulse on the XP bar
    if (this.els.xpBar) {
      this.els.xpBar.classList.remove('xp-level-pulse');
      void this.els.xpBar.offsetWidth; // reflow to restart
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
    if (!extended) return; // don't toast on first login of same day
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
    const container = this.els.toastContainer;
    if (!container) return;

    const el = document.createElement('div');
    el.className = `px-4 py-2 border rounded shadow-lg text-sm transition-all duration-300 opacity-0 translate-y-2 ${classes}`;
    el.textContent = message;
    container.appendChild(el);

    // Animate in
    requestAnimationFrame(() => {
      el.classList.remove('opacity-0', 'translate-y-2');
    });

    // Animate out then remove
    setTimeout(() => {
      el.classList.add('opacity-0', 'translate-y-2');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    }, duration);
  }
}
