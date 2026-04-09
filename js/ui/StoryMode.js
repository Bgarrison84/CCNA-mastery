/**
 * StoryMode.js — 6-Week Narrative Engine & Home View
 */
import { bus } from '../core/EventBus.js';
import { glossarize } from '../utils/glossary.js';
import { CharacterWidget } from './CharacterWidget.js';

export class StoryMode {
  constructor(content, store, containerEl) {
    this.content      = content;
    this.beats        = content.storyBeats || [];
    this.store        = store;
    this.containerEl  = containerEl;
    this._typingTimer = null;
    this._charWidget  = null;
  }

  /** Main entry point for rendering the Story/Home view. */
  render() {
    // Destroy old character widget before re-rendering
    this._charWidget?.destroy();
    this._charWidget = null;

    this.containerEl.innerHTML = `
      <div class="max-w-3xl mx-auto">
        <div id="week-timeline" class="px-6 pt-5 pb-1"></div>
        <div id="char-road" class="px-6 pb-2"></div>
        <div id="mission-card" class="px-6 pb-1"></div>
        <div id="daily-challenge-card" class="px-6 pb-1"></div>
        <div id="weak-card" class="px-6 pb-1"></div>
        <div id="story-container" class="p-6"></div>
      </div>`;

    this._renderWeekTimeline();
    this._renderCharacter();
    this._renderMissionCard();
    this._renderDailyChallenge();
    this._renderWeakCard();

    // The actual story beat container
    this.storyContainer = this.containerEl.querySelector('#story-container');
    this.showCurrentBeat();
  }

  /** Called by Router when navigating away — prevent timer/event leaks. */
  destroy() {
    clearTimeout(this._typingTimer);
    this._charWidget?.destroy();
    this._charWidget = null;
  }

  _renderCharacter() {
    const el = this.containerEl.querySelector('#char-road');
    if (!el) return;
    if (this.store.state.settings?.characterAnim === false) return;
    this._charWidget = new CharacterWidget(el, this.store, this.beats);
    this._charWidget.render();
  }

  // ─── Timeline & Dashboard Cards ────────────────────────────────────────────

  _renderWeekTimeline() {
    const el = this.containerEl.querySelector('#week-timeline');
    if (!el) return;
    const state = this.store.state;
    const currentWeek = state.currentWeek;
    const WEEK_TOPICS = ['Network Fundamentals', 'Network Access', 'IP Connectivity', 'IP Services', 'Security Fundamentals', 'Automation'];

    const beatsByWeek = {};
    this.beats.forEach(b => {
      if (!b.branchOf) {
        if (!beatsByWeek[b.week]) beatsByWeek[b.week] = { total: 0, seen: 0 };
        beatsByWeek[b.week].total++;
        if (state.storyProgress?.[b.id]?.seen) beatsByWeek[b.week].seen++;
      }
    });

    const weeks = [1, 2, 3, 4, 5, 6];
    const nodes = weeks.map(w => {
      const wb = beatsByWeek[w] || { total: 0, seen: 0 };
      const done    = wb.total > 0 && wb.seen >= wb.total;
      const active  = w === currentWeek;
      const locked  = w > currentWeek;
      const pct     = wb.total > 0 ? Math.round((wb.seen / wb.total) * 100) : 0;
      
      const nodeColor = done ? 'bg-green-700 border-green-500 text-green-200'
                      : active ? 'bg-amber-800 border-amber-500 text-amber-200'
                      : locked ? 'bg-gray-800 border-gray-700 text-gray-600'
                      : 'bg-gray-800 border-gray-600 text-gray-400';
      const labelColor = done ? 'text-green-400' : active ? 'text-amber-400' : locked ? 'text-gray-700' : 'text-gray-500';
      
      return `
        <div class="flex flex-col items-center gap-1 relative">
          <div class="w-10 h-10 rounded-full border-2 ${nodeColor} flex items-center justify-center font-bold text-sm transition-colors" title="Week ${w}: ${WEEK_TOPICS[w-1]} — ${wb.seen}/${wb.total} beats">
            ${done ? '✓' : `W${w}`}
          </div>
          ${pct > 0 && !done ? `<div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-10 h-1 bg-gray-800 rounded overflow-hidden"><div class="h-full bg-amber-500 rounded" style="width:${pct}%"></div></div>` : ''}
          <div class="text-center ${labelColor} text-xs leading-tight max-w-14 mt-1">${WEEK_TOPICS[w-1].split(' ')[0]}</div>
        </div>`;
    });

    const nodesWithConnectors = [];
    nodes.forEach((node, i) => {
      nodesWithConnectors.push(node);
      if (i < nodes.length - 1) {
        const w = i + 1;
        const done = (beatsByWeek[w]?.seen || 0) >= (beatsByWeek[w]?.total || 1) && (beatsByWeek[w]?.total || 0) > 0;
        nodesWithConnectors.push(`<div class="flex-1 h-0.5 ${done ? 'bg-green-700' : w < currentWeek ? 'bg-gray-600' : 'bg-gray-800'} self-center mb-6"></div>`);
      }
    });

    el.innerHTML = `
      <div class="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
        <div class="flex items-center gap-1 mb-1">
          <span class="text-xs text-gray-500 font-semibold uppercase tracking-wider">6-Week Journey</span>
          <span class="text-xs text-gray-700 ml-2">Week ${currentWeek} of 6 active</span>
        </div>
        <div class="flex items-start pt-2 px-1">
          ${nodesWithConnectors.join('')}
        </div>
      </div>`;
  }

  _renderMissionCard() {
    const el = this.containerEl.querySelector('#mission-card');
    if (!el) return;
    const state = this.store.state;
    const week = state.currentWeek;
    
    // Find next lab and quiz for this week
    const labs = (this.content.labs || []).filter(l => l.week === week);
    const labCount = labs.length;
    const labDone = labs.filter(l => state.completedLabs.some(cl => cl.id === l.id)).length;
    
    el.innerHTML = `
      <div class="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 mt-3">
        <div class="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">Current Mission</div>
        <div class="flex items-center justify-between">
          <div class="text-sm text-green-300">Week ${week} Labs: ${labDone}/${labCount} done</div>
          <div class="text-xs text-gray-500">${Math.round((labDone/labCount)*100 || 0)}% complete</div>
        </div>
        <div class="w-full h-1 bg-gray-800 rounded-full mt-2 overflow-hidden">
          <div class="h-full bg-green-500" style="width:${(labDone/labCount)*100 || 0}%"></div>
        </div>
      </div>`;
  }

  _renderDailyChallenge() {
    const el = this.containerEl.querySelector('#daily-challenge-card');
    if (!el) return;
    const entry = this.store.getDailyChallengeEntry();
    
    el.innerHTML = `
      <div class="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 mt-3">
        <div class="flex items-center justify-between mb-1">
          <div class="text-xs text-gray-500 font-semibold uppercase tracking-wider">Daily Challenge</div>
          ${entry?.completed ? '<span class="text-[10px] text-green-500 font-bold tracking-widest">COMPLETED ✓</span>' : ''}
        </div>
        <div class="flex items-center gap-3">
          <div class="text-xl">📅</div>
          <div class="flex-1">
            <div class="text-sm text-green-300">${entry?.completed ? 'Come back tomorrow for a new challenge!' : 'Answer today\'s random question for +50 bonus XP.'}</div>
          </div>
          ${!entry?.completed ? `<button id="home-start-daily" class="px-3 py-1 bg-green-800 hover:bg-green-700 text-green-100 text-xs rounded border border-green-600">Start</button>` : ''}
        </div>
      </div>`;
    
    el.querySelector('#home-start-daily')?.addEventListener('click', () => {
      bus.emit('nav:switch', { view: 'grind', daily: true });
    });
  }

  _renderWeakCard() {
    const el = this.containerEl.querySelector('#weak-card');
    if (!el) return;
    const mistakes = this.store.getMistakeIds(1);
    if (!mistakes.length) return;
    
    el.innerHTML = `
      <div class="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 mt-3">
        <div class="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">Weak Area Focus</div>
        <div class="flex items-center gap-3">
          <div class="text-xl">📓</div>
          <div class="flex-1">
            <div class="text-sm text-amber-400">${mistakes.length} questions in your mistake notebook.</div>
          </div>
          <button id="home-start-notebook" class="px-3 py-1 bg-amber-800 hover:bg-amber-700 text-amber-100 text-xs rounded border border-amber-600">Review</button>
        </div>
      </div>`;
      
    el.querySelector('#home-start-notebook')?.addEventListener('click', () => {
      bus.emit('nav:switch', { view: 'notebook' });
    });
  }

  // ─── Story Beats ───────────────────────────────────────────────────────────

  showCurrentBeat() {
    const state = this.store.state;
    const week  = state.currentWeek;

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

  _checkGate(beat) {
    const gate = beat.gate;
    if (!gate) return true;
    const state = this.store.state;

    if (gate.type === 'quiz') return !!state.storyProgress[`quiz_w${gate.week}_complete`]?.seen;
    if (gate.type === 'lab') return state.completedLabs.some(l => l.id.includes(`_w${gate.week}_`));
    if (gate.type === 'boss') return state.bossesDefeated.includes(gate.bossId);
    return true;
  }

  showBeat(beatId) {
    const beat = this.beats.find(b => b.id === beatId);
    if (beat) this._renderBeat(beat);
  }

  _renderBeat(beat) {
    if (!this.storyContainer) return;

    this.storyContainer.innerHTML = `
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

        ${beat.concept_visual ? `
        <div class="story-concept-block mt-4 border border-green-900/40 rounded overflow-hidden">
          <button class="story-concept-toggle w-full flex items-center justify-between px-4 py-2 bg-green-950/40 hover:bg-green-900/30 text-left transition-colors">
            <span class="text-xs font-semibold text-green-400">📐 ${beat.concept_visual.title || 'Concept Diagram'}</span>
            <span class="story-concept-caret text-green-600 text-xs">▶</span>
          </button>
          <div class="story-concept-panel hidden px-3 py-3 bg-black/60">
            ${beat.concept_visual.explanation ? `<p class="text-xs text-gray-400 mb-3 leading-relaxed">${glossarize(beat.concept_visual.explanation)}</p>` : ''}
            <div class="story-diagram-container"></div>
          </div>
        </div>` : ''}

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
      const choices = this.storyContainer.querySelector('#story-choices');
      const cont    = this.storyContainer.querySelector('#story-continue');
      if (choices) choices.classList.remove('hidden');
      if (cont)    cont.classList.remove('hidden');

      this.storyContainer.querySelectorAll('.story-choice').forEach(btn => {
        btn.addEventListener('click', () => this._handleChoice(beat, parseInt(btn.dataset.choice)));
      });
      if (cont) cont.addEventListener('click', () => this._markSeen(beat));

      const conceptToggle = this.storyContainer.querySelector('.story-concept-toggle');
      if (conceptToggle) {
        conceptToggle.addEventListener('click', () => {
          const panel  = conceptToggle.parentElement.querySelector('.story-concept-panel');
          const caret  = conceptToggle.querySelector('.story-concept-caret');
          const isOpen = !panel.classList.contains('hidden');
          panel.classList.toggle('hidden', isOpen);
          if (caret) caret.textContent = isOpen ? '▶' : '▼';
          if (!isOpen && panel.dataset.loaded !== '1') {
            panel.dataset.loaded = '1';
            const container = panel.querySelector('.story-diagram-container');
            if (container && beat.concept_visual?.diagramId && window.renderDiagram) {
              window.renderDiagram(beat.concept_visual.diagramId, container);
            }
          }
        });
      }
    });
  }

  _typeText(text, onComplete) {
    const el = this.storyContainer?.querySelector('#story-dialogue');
    if (!el) return;
    clearTimeout(this._typingTimer);

    const finish = () => {
      el.innerHTML = glossarize(el.textContent);
      onComplete?.();
    };

    let i = 0;
    el.textContent = '';
    const speed = 18;

    const type = () => {
      if (i < text.length) {
        el.textContent += text[i++];
        this._typingTimer = setTimeout(type, speed);
      } else {
        finish();
      }
    };

    el.addEventListener('click', () => {
      clearTimeout(this._typingTimer);
      el.textContent = text;
      finish();
    }, { once: true });

    type();
  }

  _handleChoice(beat, choiceIdx) {
    const choice = beat.choices?.[choiceIdx];
    if (!choice) return;
    this.store.updateStoryProgress(beat.id, { seen: true, choice: choiceIdx });
    if (choice.xpReward) this.store.addXP(choice.xpReward, `story:${beat.id}`);
    bus.emit('story:choice', { beatId: beat.id, choiceIdx, choice });
    if (choice.next) setTimeout(() => this.showBeat(choice.next), 400);
    else this._markSeen(beat);
  }

  _markSeen(beat) {
    this.store.updateStoryProgress(beat.id, { seen: true });
    bus.emit('story:beat_complete', { beatId: beat.id, week: beat.week });
    const state = this.store.state;
    const weekBeats = this.beats.filter(b => b.week === beat.week && !(b.branchOf && !state.storyProgress[b.id]?.seen));
    const allSeen = weekBeats.every(b => state.storyProgress[b.id]?.seen);
    if (allSeen && beat.week === state.currentWeek) {
      this.store.advanceWeek();
      bus.emit('story:week_advance', { week: beat.week });
    }
    setTimeout(() => this.showCurrentBeat(), 300);
  }

  _renderGateWait(nextLockedBeat) {
    if (!this.storyContainer) return;
    const gate = nextLockedBeat.gate;
    const messages = {
      quiz: 'Complete the Week assessment in The Grind to unlock the next chapter.',
      lab:  'Complete a lab in the Lab terminal to unlock the next chapter.',
      boss: 'Defeat the boss battle to unlock your week outro.',
    };
    const message = messages[gate?.type] || 'Complete the current objective to unlock the next chapter.';
    const navTarget = gate?.type === 'boss' ? 'boss' : gate?.type === 'lab' ? 'lab' : 'grind';
    const navLabel  = gate?.type === 'boss' ? 'Go to Boss Battles' : gate?.type === 'lab' ? 'Go to Labs' : 'Go to The Grind';

    this.storyContainer.innerHTML = `
      <div class="text-center py-12">
        <div class="text-5xl mb-4">🔒</div>
        <div class="text-yellow-300 text-xl font-bold mb-2">Chapter Locked</div>
        <p class="text-gray-400 text-sm max-w-sm mx-auto">${message}</p>
        <button id="story-go-unlock" class="mt-6 px-6 py-2 bg-yellow-700 hover:bg-yellow-600 text-white rounded font-semibold">
          ${navLabel}
        </button>
      </div>`;
    this.storyContainer.querySelector('#story-go-unlock')?.addEventListener('click', () => {
      bus.emit('nav:switch', { view: navTarget });
    });
  }

  _renderAllSeen(week) {
    if (!this.storyContainer) return;
    this.storyContainer.innerHTML = `
      <div class="text-center py-12">
        <div class="text-5xl mb-4">&#10003;</div>
        <div class="text-green-300 text-xl font-bold mb-2">Week ${week} Story Complete</div>
        <p class="text-gray-400 text-sm">Complete the labs and quizzes to advance to Week ${week + 1}.</p>
        <button id="story-next-week" class="mt-6 px-6 py-2 bg-yellow-700 hover:bg-yellow-600 text-white rounded font-semibold">
          View Week ${week + 1} Content
        </button>
      </div>`;
    this.storyContainer.querySelector('#story-next-week')?.addEventListener('click', () => {
      bus.emit('nav:switch', { view: 'lab' });
    });
  }
}
