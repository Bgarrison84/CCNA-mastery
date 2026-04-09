/**
 * CharacterWidget.js — Walking Character Progress Animation
 *
 * Renders a pixel-art network engineer who walks left-to-right along a
 * 6-zone "road" mapped to the 6-week CCNA story arc:
 *
 *   Week 1 (Office) → Week 2 (NOC) → Week 3 (Server Room) →
 *   Week 4 (Data Centre) → Week 5 (Security HQ) → Week 6 (Cloud)
 *
 * Animations:
 *   walk      — continuous leg/arm cycle while story mode is visible
 *   jump      — one-shot on story beat complete
 *   celebrate — one-shot on boss defeat / week advance
 *   stumble   — one-shot on boss wrong answer
 *   idle      — gentle bob when no interaction for 30 s
 *   idle-type — arm tapping keyboard after 60 s idle
 *
 * Disable via sidebar toggle (stores to store.settings.characterAnim).
 *
 * Usage:
 *   const cw = new CharacterWidget(containerEl, store, storyBeats);
 *   cw.render();          // call after containerEl is in DOM
 *   cw.updateProgress();  // call whenever story progress changes
 *   cw.play('jump');      // manually trigger an animation
 *   cw.destroy();         // clean up
 */

import { bus } from '../core/EventBus.js';

// ── Zone definitions ──────────────────────────────────────────────────────────
const ZONES = [
  { week: 1, label: 'Office',       bg: '#0c1c10' },
  { week: 2, label: 'NOC',          bg: '#0c1525' },
  { week: 3, label: 'Server Room',  bg: '#120c25' },
  { week: 4, label: 'Data Centre',  bg: '#0a0a1a' },
  { week: 5, label: 'Security HQ',  bg: '#1e0a0a' },
  { week: 6, label: 'Cloud',        bg: '#0a0c28' },
];

// Milestone icons between zones (SVG emoji-style shapes)
const MILESTONE_ICONS = ['⇒', '⇒', '⇒', '⇒', '⇒'];

// ── CSS injection (once per page) ─────────────────────────────────────────────
let _cssInjected = false;
function _injectCSS() {
  if (_cssInjected) return;
  _cssInjected = true;
  const s = document.createElement('style');
  s.textContent = `
  /* Road */
  .cw-road {
    position:relative; width:100%; height:82px;
    overflow:hidden; border-radius:8px;
    border: 1px solid #1f2937;
  }
  .cw-zone {
    position:absolute; top:0; bottom:0;
    display:flex; align-items:flex-end;
    padding-bottom:4px; justify-content:center;
  }
  .cw-zone-label {
    font-family:monospace; font-size:0.52rem;
    color:#1f2937; text-align:center; pointer-events:none;
    letter-spacing:0.03em; white-space:nowrap;
  }
  .cw-divider {
    position:absolute; top:8px; bottom:18px; width:1px;
    background: linear-gradient(to bottom, transparent, #374151 30%, #374151 70%, transparent);
    pointer-events:none;
  }
  .cw-ground {
    position:absolute; bottom:0; left:0; right:0; height:16px;
    background: linear-gradient(to bottom, #111827, #0a0f1a);
    border-top:1px solid #1f2937;
  }
  .cw-ground-line {
    position:absolute; bottom:0; left:0; right:0; height:3px;
    background: repeating-linear-gradient(
      to right,
      #30d158 0, #30d158 12px, transparent 12px, transparent 22px
    );
    opacity:0.15;
  }
  /* Character wrapper — positions along road */
  .cw-char-wrap {
    position:absolute;
    bottom: 14px;
    transform: translateX(-50%);
    transition: left 1.2s cubic-bezier(0.4, 0, 0.2, 1);
    z-index:2;
  }
  .cw-svg { width:28px; height:50px; overflow:visible; display:block; }

  /* ── Walk cycle ── */
  @keyframes cw-leg-l-w { 0%,100%{transform:rotate(-22deg) translateY(0)} 50%{transform:rotate(18deg) translateY(-1px)} }
  @keyframes cw-leg-r-w { 0%,100%{transform:rotate(18deg) translateY(0)} 50%{transform:rotate(-22deg) translateY(-1px)} }
  @keyframes cw-arm-l-w { 0%,100%{transform:rotate(14deg)} 50%{transform:rotate(-10deg)} }
  @keyframes cw-arm-r-w { 0%,100%{transform:rotate(-10deg)} 50%{transform:rotate(14deg)} }
  @keyframes cw-body-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-2px)} }

  .cw-walk .cw-leg-l { animation:cw-leg-l-w .38s ease-in-out infinite; transform-origin:center top; transform-box:fill-box; }
  .cw-walk .cw-leg-r { animation:cw-leg-r-w .38s ease-in-out infinite; transform-origin:center top; transform-box:fill-box; }
  .cw-walk .cw-arm-l { animation:cw-arm-l-w .38s ease-in-out infinite; transform-origin:center top; transform-box:fill-box; }
  .cw-walk .cw-arm-r { animation:cw-arm-r-w .38s ease-in-out infinite; transform-origin:center top; transform-box:fill-box; }
  .cw-walk .cw-char-g { animation:cw-body-bob .38s ease-in-out infinite; }

  /* ── Jump ── */
  @keyframes cw-jump {
    0%,100%{transform:translateY(0)}
    30%    {transform:translateY(-26px)}
    65%    {transform:translateY(-26px)}
  }
  .cw-jump .cw-char-g { animation:cw-jump .62s cubic-bezier(.25,.46,.45,.94) forwards; }

  /* ── Celebrate ── */
  @keyframes cw-cel-body { 0%,100%{transform:translateY(0) rotate(0)} 30%{transform:translateY(-18px) rotate(-7deg)} 70%{transform:translateY(-18px) rotate(7deg)} }
  @keyframes cw-cel-arm  { 0%,100%{transform:rotate(0)} 50%{transform:rotate(-145deg)} }
  .cw-celebrate .cw-char-g { animation:cw-cel-body .85s ease-in-out; }
  .cw-celebrate .cw-arm-l  { animation:cw-cel-arm  .85s ease-in-out; transform-origin:center top; transform-box:fill-box; }
  .cw-celebrate .cw-arm-r  { animation:cw-cel-arm  .85s ease-in-out reverse; transform-origin:center top; transform-box:fill-box; }

  /* ── Stumble ── */
  @keyframes cw-stumble { 0%,100%{transform:rotate(0) translateX(0)} 20%{transform:rotate(22deg) translateX(6px)} 55%{transform:rotate(-14deg) translateX(-3px)} 80%{transform:rotate(8deg)} }
  .cw-stumble .cw-char-g { animation:cw-stumble .75s ease-in-out; }

  /* ── Idle ── */
  @keyframes cw-idle-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-1.5px)} }
  .cw-idle .cw-char-g { animation:cw-idle-bob 2.2s ease-in-out infinite; }

  /* ── Idle type ── */
  @keyframes cw-arm-type { 0%,100%{transform:rotate(-18deg) translateY(4px)} 50%{transform:rotate(-48deg) translateY(-2px)} }
  @keyframes cw-head-nod { 0%,100%{transform:rotate(0)} 50%{transform:rotate(6deg)} }
  .cw-idle-type .cw-char-g { animation:cw-idle-bob 2.8s ease-in-out infinite; }
  .cw-idle-type .cw-arm-r  { animation:cw-arm-type .28s ease-in-out infinite; transform-origin:center top; transform-box:fill-box; }
  .cw-idle-type .cw-head   { animation:cw-head-nod 1.4s ease-in-out infinite; transform-origin:center bottom; transform-box:fill-box; }

  /* Week-advance star burst */
  @keyframes cw-star { 0%{transform:scale(0) rotate(0)} 50%{transform:scale(1.4) rotate(180deg)} 100%{transform:scale(0) rotate(360deg); opacity:0} }
  .cw-star { position:absolute; font-size:1rem; pointer-events:none; animation:cw-star .6s ease-out forwards; }
  `;
  document.head.appendChild(s);
}

// ── CharacterWidget ───────────────────────────────────────────────────────────

export class CharacterWidget {
  /**
   * @param {HTMLElement} el     — the container div to render into
   * @param {object}      store  — Store instance
   * @param {Array}       beats  — all story beats array (for progress calc)
   */
  constructor(el, store, beats) {
    this._el     = el;
    this._store  = store;
    this._beats  = beats || [];
    this._state  = 'walk';       // current animation class
    this._anim   = null;         // timer for one-shot reset back to walk
    this._idle   = null;         // idle countdown timer
    this._char   = null;         // .cw-char-wrap element
    this._unsubs = [];           // EventBus unsubscribe fns

    _injectCSS();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  render() {
    const enabled = this._store.state.settings?.characterAnim !== false;
    if (!enabled) { this._el.innerHTML = ''; return; }

    // 6 zone background divs
    const zones = ZONES.map((z, i) => {
      const left  = (i / 6 * 100).toFixed(2);
      const width = (100 / 6).toFixed(2);
      return `<div class="cw-zone" style="left:${left}%;width:${width}%;background:${z.bg}">
                <span class="cw-zone-label">W${z.week} ${z.label}</span>
              </div>`;
    }).join('');

    // Zone dividers at week boundaries
    const dividers = [1,2,3,4,5].map(i => {
      const pct = (i / 6 * 100).toFixed(2);
      return `<div class="cw-divider" style="left:${pct}%"></div>`;
    }).join('');

    this._el.innerHTML = `
      <div class="cw-road" title="Your progress through the 6-week CCNA journey">
        ${zones}
        ${dividers}
        <div class="cw-ground"><div class="cw-ground-line"></div></div>
        <div class="cw-char-wrap cw-walk" style="left:5%">
          ${this._charSvg()}
        </div>
      </div>`;

    this._char = this._el.querySelector('.cw-char-wrap');
    this._resetIdle();
    this._subscribeBus();
    this.updateProgress();
  }

  updateProgress() {
    if (!this._char) return;
    const state     = this._store.state;
    const mainBeats = this._beats.filter(b => !b.branchOf);
    const total     = mainBeats.length;
    const seen      = mainBeats.filter(b => state.storyProgress?.[b.id]?.seen).length;
    const pct       = total > 0
      ? Math.min(Math.max((seen / total) * 84 + 5, 5), 90)
      : 5;
    this._char.style.left = pct + '%';
  }

  /**
   * Play a one-shot animation state then return to walk.
   * @param {'jump'|'celebrate'|'stumble'} name
   */
  play(name) {
    if (!this._char) return;
    clearTimeout(this._anim);
    this._setState(name);
    const dur = { jump: 650, celebrate: 900, stumble: 800 }[name] || 700;
    this._anim = setTimeout(() => this._setState('walk'), dur);
    this._showStar(name);
    this._resetIdle();
  }

  destroy() {
    clearTimeout(this._anim);
    clearTimeout(this._idle);
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
    this._char = null;
    this._el.innerHTML = '';
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  _setState(name) {
    if (!this._char) return;
    this._char.className = `cw-char-wrap cw-${name}`;
    this._state = name;
  }

  _resetIdle() {
    clearTimeout(this._idle);
    if (this._state === 'idle' || this._state === 'idle-type') {
      this._setState('walk');
    }
    this._idle = setTimeout(() => {
      if (this._state === 'walk') {
        this._setState('idle');
        // Escalate to idle-type after another 30s
        this._idle = setTimeout(() => {
          if (this._state === 'idle') this._setState('idle-type');
        }, 30000);
      }
    }, 30000);
  }

  _showStar(type) {
    if (!this._char || type !== 'celebrate') return;
    const wrap = this._el.querySelector('.cw-road');
    if (!wrap) return;
    ['⭐', '✨', '🌟'].forEach((emoji, i) => {
      const el = document.createElement('div');
      el.className = 'cw-star';
      el.textContent = emoji;
      const left = parseFloat(this._char.style.left);
      el.style.left   = `calc(${left}% + ${(i - 1) * 20 - 5}px)`;
      el.style.bottom = `${54 + i * 8}px`;
      el.style.animationDelay = `${i * 80}ms`;
      wrap.appendChild(el);
      setTimeout(() => el.remove(), 800);
    });
  }

  _subscribeBus() {
    // Beat complete → jump
    this._unsubs.push(bus.on('story:beat_complete', () => {
      this.play('jump');
      setTimeout(() => this.updateProgress(), 500);
    }));

    // Week advance → celebrate
    this._unsubs.push(bus.on('story:week_advance', () => this.play('celebrate')));

    // Boss wrong → stumble
    this._unsubs.push(bus.on('boss:wrong', () => this.play('stumble')));

    // Boss defeat → celebrate
    this._unsubs.push(bus.on('boss:victory', () => this.play('celebrate')));

    // Any user interaction → reset idle
    ['click', 'keydown', 'touchstart'].forEach(ev => {
      const fn = () => this._resetIdle();
      document.addEventListener(ev, fn, { passive: true });
      this._unsubs.push(() => document.removeEventListener(ev, fn));
    });
  }

  // ── Character SVG ─────────────────────────────────────────────────────────

  _charSvg() {
    return `
    <svg class="cw-svg" viewBox="0 0 28 52" overflow="visible" aria-hidden="true">
      <g class="cw-char-g">
        <!-- Shadow -->
        <ellipse cx="14" cy="52" rx="7" ry="2" fill="#000" opacity="0.35"/>
        <!-- Legs (behind body) -->
        <g class="cw-leg-l">
          <rect x="9"  y="34" width="5" height="13" rx="2.2" fill="#1e3a5f"/>
          <rect x="8"  y="44" width="7" height="3.2" rx="1.5" fill="#111827"/>
        </g>
        <g class="cw-leg-r">
          <rect x="14" y="34" width="5" height="13" rx="2.2" fill="#1e3a5f"/>
          <rect x="13" y="44" width="7" height="3.2" rx="1.5" fill="#111827"/>
        </g>
        <!-- Body (jacket) -->
        <rect x="8" y="18" width="12" height="17" rx="2.5" fill="#1d4ed8"/>
        <!-- Collar / shirt -->
        <rect x="11" y="18" width="6" height="5" rx="1" fill="#e5e7eb"/>
        <!-- Tie -->
        <polygon points="13,21 15,21 14.6,28 13.4,28" fill="#dc2626"/>
        <!-- Left arm -->
        <g class="cw-arm-l">
          <rect x="4.5" y="19" width="3.8" height="11" rx="2" fill="#ffcf99"/>
        </g>
        <!-- Right arm -->
        <g class="cw-arm-r">
          <rect x="19.7" y="19" width="3.8" height="11" rx="2" fill="#ffcf99"/>
        </g>
        <!-- Head -->
        <g class="cw-head">
          <circle cx="14" cy="9" r="7.5" fill="#ffcf99"/>
          <!-- Hair -->
          <path d="M6.8 6.5 Q14 0 21.2 6.5 Q21.2 3 14 1.5 Q6.8 3 6.8 6.5 Z" fill="#2d1b1b"/>
          <!-- Glasses frames -->
          <circle cx="11" cy="9.5" r="2.5" fill="none" stroke="#6b7280" stroke-width="0.9"/>
          <circle cx="17" cy="9.5" r="2.5" fill="none" stroke="#6b7280" stroke-width="0.9"/>
          <line x1="13.5" y1="9.5" x2="14.5" y2="9.5" stroke="#6b7280" stroke-width="0.9"/>
          <line x1="8.5"  y1="9.5" x2="6.8"  y2="9"   stroke="#6b7280" stroke-width="0.9"/>
          <line x1="19.5" y1="9.5" x2="21.2" y2="9"   stroke="#6b7280" stroke-width="0.9"/>
          <!-- Eyes -->
          <circle cx="11" cy="9.5" r="1.3" fill="#1a1a2e"/>
          <circle cx="17" cy="9.5" r="1.3" fill="#1a1a2e"/>
          <!-- Eye shine -->
          <circle cx="11.5" cy="9" r="0.4" fill="#fff" opacity="0.8"/>
          <circle cx="17.5" cy="9" r="0.4" fill="#fff" opacity="0.8"/>
          <!-- Smile -->
          <path d="M11.5 13 Q14 15 16.5 13" stroke="#c47a3a" stroke-width="1" fill="none" stroke-linecap="round"/>
        </g>
      </g>
    </svg>`;
  }
}
