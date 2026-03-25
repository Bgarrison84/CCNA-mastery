/**
 * StoryMode.js — 6-Week Narrative Engine
 *
 * Manages story beats, NPC dialogue, week progression gates.
 * Story nodes are driven by data (content.json storyBeats[]), not hardcoded here.
 * This keeps index.html thin and makes content easy to extend.
 */
import { bus } from '../core/EventBus.js';

export class StoryMode {
  /**
   * @param {object[]} storyBeats  - from content.json
   * @param {object}   store       - Store instance
   * @param {HTMLElement} containerEl
   */
  constructor(storyBeats, store, containerEl) {
    this.beats       = storyBeats;
    this.store       = store;
    this.containerEl = containerEl;
    this._current    = null;
    this._typingTimer = null;
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  /** Show the next unlocked story beat for the current week. */
  showCurrentBeat() {
    const state = this.store.state;
    const week  = state.currentWeek;

    // Find first unseen beat that passes its gate.
    // Skip branch-response beats (branchOf set) when their parent beat is already seen —
    // these are only reached via direct showBeat() calls from a choice chain.
    const beat = this.beats.find(b => {
      if (b.week !== week) return false;
      if (state.storyProgress[b.id]?.seen) return false;
      if (b.branchOf && state.storyProgress[b.branchOf]?.seen) return false;
      return this._checkGate(b);
    });

    if (beat) {
      this._renderBeat(beat);
      return;
    }

    // Gated beats still waiting — don't show "all done" prematurely.
    // Also exclude branch-response beats whose parent is seen.
    const locked = this.beats.filter(b => {
      if (b.week !== week) return false;
      if (state.storyProgress[b.id]?.seen) return false;
      if (b.branchOf && state.storyProgress[b.branchOf]?.seen) return false;
      return !this._checkGate(b);
    });

    if (locked.length) {
      this._renderGateWait(locked[0]);
    } else {
      this._renderAllSeen(week);
    }
  }

  /**
   * Check whether a beat's gate condition is met.
   * Gate shapes:
   *   { type: 'quiz', week: N }        — quiz_wN_complete marker in storyProgress
   *   { type: 'lab',  week: N }        — any completedLab id matching _wN_
   *   { type: 'boss', bossId: '...' }  — bossId in bossesDefeated
   */
  _checkGate(beat) {
    const gate = beat.gate;
    if (!gate) return true;
    const state = this.store.state;

    if (gate.type === 'quiz') {
      return !!state.storyProgress[`quiz_w${gate.week}_complete`]?.seen;
    }
    if (gate.type === 'lab') {
      return state.completedLabs.some(l => l.id.includes(`_w${gate.week}_`));
    }
    if (gate.type === 'boss') {
      return state.bossesDefeated.includes(gate.bossId);
    }
    return true;
  }

  showBeat(beatId) {
    const beat = this.beats.find(b => b.id === beatId);
    if (beat) this._renderBeat(beat);
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────

  _renderBeat(beat) {
    this._current = beat;
    if (!this.containerEl) return;

    this.containerEl.innerHTML = `
      <div class="story-beat max-w-2xl mx-auto" data-beat="${beat.id}">
        ${beat.background ? `<div class="story-bg mb-4 rounded overflow-hidden h-32 flex items-center justify-center bg-gray-900 border border-gray-700">
          <span class="text-5xl">${beat.background}</span>
        </div>` : ''}

        <div class="flex items-center gap-3 mb-4">
          <div class="w-12 h-12 rounded-full bg-green-900 border-2 border-green-400 flex items-center justify-center text-xl">
            ${beat.npc?.avatar || '?'}
          </div>
          <div>
            <div class="font-bold text-green-300">${beat.npc?.name || 'Narrator'}</div>
            <div class="text-xs text-gray-500">${beat.npc?.title || ''}</div>
          </div>
          <div class="ml-auto text-xs text-yellow-400 border border-yellow-700 rounded px-2 py-0.5">
            Week ${beat.week} · ${beat.location || 'NOC'}
          </div>
        </div>

        <div id="story-dialogue" class="bg-gray-900 border border-gray-700 rounded p-4 text-green-200 leading-relaxed min-h-[80px] font-mono text-sm"></div>

        ${beat.choices?.length ? `
        <div id="story-choices" class="mt-4 space-y-2 hidden">
          ${beat.choices.map((c, i) => `
            <button data-choice="${i}" class="story-choice w-full text-left px-4 py-2 border border-gray-600 hover:border-green-500 hover:bg-green-900/30 rounded text-gray-200 text-sm transition-colors">
              ${c.text}
            </button>`).join('')}
        </div>` : `
        <div id="story-choices" class="mt-4">
          <button id="story-continue" class="hidden px-6 py-2 bg-green-700 hover:bg-green-600 text-white rounded font-semibold transition-colors">
            Continue &rarr;
          </button>
        </div>`}
      </div>`;

    this._typeText(beat.dialogue, () => {
      const choices = this.containerEl.querySelector('#story-choices');
      const cont    = this.containerEl.querySelector('#story-continue');
      if (choices) choices.classList.remove('hidden');
      if (cont)    cont.classList.remove('hidden');

      // Bind choices
      this.containerEl.querySelectorAll('.story-choice').forEach(btn => {
        btn.addEventListener('click', () => this._handleChoice(beat, parseInt(btn.dataset.choice)));
      });
      if (cont) {
        cont.addEventListener('click', () => this._markSeen(beat));
      }
    });
  }

  _typeText(text, onComplete) {
    const el = this.containerEl?.querySelector('#story-dialogue');
    if (!el) return;
    clearTimeout(this._typingTimer);

    let i = 0;
    el.textContent = '';
    const speed = 18; // ms per character

    const type = () => {
      if (i < text.length) {
        el.textContent += text[i++];
        this._typingTimer = setTimeout(type, speed);
      } else {
        onComplete?.();
      }
    };

    // Click to skip typing
    el.addEventListener('click', () => {
      clearTimeout(this._typingTimer);
      el.textContent = text;
      onComplete?.();
    }, { once: true });

    type();
  }

  _handleChoice(beat, choiceIdx) {
    const choice = beat.choices?.[choiceIdx];
    if (!choice) return;

    this.store.updateStoryProgress(beat.id, { seen: true, choice: choiceIdx });

    if (choice.xpReward) {
      this.store.addXP(choice.xpReward, `story:${beat.id}`);
    }

    bus.emit('story:choice', { beatId: beat.id, choiceIdx, choice });

    if (choice.next) {
      setTimeout(() => this.showBeat(choice.next), 400);
    } else {
      this._markSeen(beat);
    }
  }

  _markSeen(beat) {
    this.store.updateStoryProgress(beat.id, { seen: true });
    bus.emit('story:beat_complete', { beatId: beat.id, week: beat.week });

    // Auto-advance week if all non-branch-response beats for this week are done.
    // Branch-response beats (branchOf set) that were never navigated to are
    // intentionally skipped — don't block week advancement waiting for them.
    const state = this.store.state;
    const weekBeats = this.beats.filter(b =>
      b.week === beat.week && !(b.branchOf && !state.storyProgress[b.id]?.seen)
    );
    const allSeen = weekBeats.every(b => state.storyProgress[b.id]?.seen);
    if (allSeen && beat.week === state.currentWeek) {
      this.store.advanceWeek();
    }

    // Auto-advance to the next beat so the player doesn't have to navigate away.
    setTimeout(() => this.showCurrentBeat(), 300);
  }

  _renderGateWait(nextLockedBeat) {
    if (!this.containerEl) return;
    const gate = nextLockedBeat.gate;
    const messages = {
      quiz: 'Complete the Week assessment in The Grind to unlock the next chapter.',
      lab:  'Complete a lab in the Lab terminal to unlock the next chapter.',
      boss: 'Defeat the boss battle to unlock your week outro.',
    };
    const message = messages[gate?.type] || 'Complete the current objective to unlock the next chapter.';
    const navTarget = gate?.type === 'boss' ? 'boss' : gate?.type === 'lab' ? 'lab' : 'grind';
    const navLabel  = gate?.type === 'boss' ? 'Go to Boss Battles' : gate?.type === 'lab' ? 'Go to Labs' : 'Go to The Grind';

    this.containerEl.innerHTML = `
      <div class="text-center py-12">
        <div class="text-5xl mb-4">🔒</div>
        <div class="text-yellow-300 text-xl font-bold mb-2">Chapter Locked</div>
        <p class="text-gray-400 text-sm max-w-sm mx-auto">${message}</p>
        <button id="story-go-unlock" class="mt-6 px-6 py-2 bg-yellow-700 hover:bg-yellow-600 text-white rounded font-semibold">
          ${navLabel}
        </button>
      </div>`;
    this.containerEl.querySelector('#story-go-unlock')?.addEventListener('click', () => {
      bus.emit('nav:switch', { view: navTarget });
    });
  }

  _renderAllSeen(week) {
    if (!this.containerEl) return;
    this.containerEl.innerHTML = `
      <div class="text-center py-12">
        <div class="text-5xl mb-4">&#10003;</div>
        <div class="text-green-300 text-xl font-bold mb-2">Week ${week} Story Complete</div>
        <p class="text-gray-400 text-sm">Complete the labs and quizzes to advance to Week ${week + 1}.</p>
        <button id="story-next-week" class="mt-6 px-6 py-2 bg-yellow-700 hover:bg-yellow-600 text-white rounded font-semibold">
          View Week ${week + 1} Content
        </button>
      </div>`;
    this.containerEl.querySelector('#story-next-week')?.addEventListener('click', () => {
      bus.emit('nav:switch', { view: 'lab' });
    });
  }
}
