/**
 * main.js — Application Entry Point
 *
 * Bootstraps all modules, wires up the navigation router,
 * and renders the active view. All views are lazily rendered
 * into #app-view — keeping index.html as a pure shell.
 *
 * To add new content weeks: drop a new week.json in /data/
 * and import it here — no changes to index.html required.
 */

import { Store }       from './core/Store.js';
import { bus }         from './core/EventBus.js';
import { HUD }         from './ui/HUD.js';
import { StoryMode }   from './ui/StoryMode.js';
import { Terminal }    from './engine/Terminal.js';
import { BossBattle }  from './engine/BossBattle.js';
import { QuizEngine }  from './engine/QuizEngine.js';
import { generateIPv4Problem, validateIPv4, buildChallenge } from './engine/Subnetting.js';

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const store   = new Store();
let content     = null;
let terminal    = null;
let quiz        = null;
let boss        = null;
let story       = null;
let examState   = null; // { session, currentIdx, results, startTime, timerId, domainStats }
let currentView = 'story';
let _quizKeyHandler  = null;   // keyboard shortcut handler for active quiz/exam question
let _viewEnterTime   = null;   // timestamp when current view was entered (for study timer)
let _grindPresetDomain = null; // pre-select domain when drilling from Stats
let _grindPresetWeek   = null; // pre-select week when drilling from Stats weak-area
let flashState = null;         // { cards, currentIdx, results, flipped, pointerStartX }

function _removeQuizKeyHandler() {
  if (_quizKeyHandler) { document.removeEventListener('keydown', _quizKeyHandler); _quizKeyHandler = null; }
}

/**
 * Attach up/down buttons + Pointer Events drag-and-drop to a sortable list.
 * @param {string}   listId    - id of the <ul> containing <li class="drag-item" data-orig-idx="N">
 * @param {string}   submitId  - id of the submit <button>
 * @param {function} onSubmit  - called with array of origIdx values in current visual order
 */
function _initPointerDragSort(listId, submitId, onSubmit) {
  const list      = document.getElementById(listId);
  const submitBtn = document.getElementById(submitId);
  if (!list || !submitBtn) return;

  // ── Up / Down button reorder ─────────────────────────────────────────────
  list.addEventListener('click', e => {
    const up = e.target.closest('.drag-up');
    const dn = e.target.closest('.drag-dn');
    if (!up && !dn) return;
    const li = (up || dn).closest('li');
    if (!li) return;
    if (up && li.previousElementSibling) list.insertBefore(li, li.previousElementSibling);
    else if (dn && li.nextElementSibling)  list.insertBefore(li.nextElementSibling, li);
  });

  // ── Pointer Events drag-and-drop (mouse + touch) ─────────────────────────
  let dragging = null, ghost = null, origH = 0;

  list.addEventListener('pointerdown', e => {
    const li = e.target.closest('li.drag-item');
    if (!li || e.target.closest('button')) return;
    e.preventDefault();
    dragging = li;
    origH    = li.offsetHeight;
    li.setPointerCapture(e.pointerId);
    li.style.opacity = '0.35';
    ghost = li.cloneNode(true);
    const r = li.getBoundingClientRect();
    ghost.style.cssText = `position:fixed;width:${r.width}px;left:${r.left}px;top:${r.top}px;` +
      `pointer-events:none;z-index:9997;opacity:0.9;background:#1f2937;` +
      `border:1px solid #00ff41;border-radius:6px;`;
    document.body.appendChild(ghost);
  }, { passive: false });

  list.addEventListener('pointermove', e => {
    if (!dragging || !ghost) return;
    ghost.style.top = (e.clientY - origH / 2) + 'px';
    const siblings = [...list.querySelectorAll('li.drag-item')].filter(el => el !== dragging);
    let inserted = false;
    for (const sib of siblings) {
      const sibR = sib.getBoundingClientRect();
      if (e.clientY < sibR.top + sibR.height / 2) {
        list.insertBefore(dragging, sib);
        inserted = true;
        break;
      }
    }
    if (!inserted && siblings.length) list.appendChild(dragging);
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging.style.opacity = '';
    ghost?.remove(); ghost = null; dragging = null;
  };
  list.addEventListener('pointerup',     endDrag);
  list.addEventListener('pointercancel', endDrag);

  // ── Submit ───────────────────────────────────────────────────────────────
  submitBtn.addEventListener('click', () => {
    const order = [...list.querySelectorAll('li.drag-item')].map(li => +li.dataset.origIdx);
    submitBtn.disabled = true;
    onSubmit(order);
  });
}

// CCNA 200-301 official domain weights (120 questions total)
const EXAM_DOMAIN_WEIGHTS = [
  { domain: 'Network Fundamentals',        count: 24 },
  { domain: 'Network Access',              count: 24 },
  { domain: 'IP Connectivity',             count: 30 },
  { domain: 'IP Services',                 count: 12 },
  { domain: 'Security Fundamentals',       count: 18 },
  { domain: 'Automation & Programmability',count: 12 },
];
const EXAM_TIME_SECONDS = 120 * 60; // 120 minutes — real CCNA 200-301 format

async function init() {
  try {
    const res = await fetch('./data/content.json');
    content = await res.json();
    // Flatten scenario questions into individual sub-questions, each carrying
    // scenario_text so the renderer can display the context block above the question.
    const flattened = [];
    for (const q of content.questions) {
      if (q.type !== 'scenario') { flattened.push(q); continue; }
      (q.sub_questions || []).forEach((sub, i) => {
        flattened.push({
          ...sub,
          id:            sub.id  || `${q.id}_q${i + 1}`,
          domain:        sub.domain    || q.domain,
          week:          sub.week      ?? q.week,
          difficulty:    sub.difficulty || q.difficulty,
          scenario_text: q.scenario_text,
          scenario_ref:  q.scenario_ref,
          scenario_id:   q.id,
          source_ref:    sub.source_ref || q.scenario_ref,
        });
      });
    }
    content.questions = flattened;
  } catch (e) {
    console.error('[main] Failed to load content.json:', e);
    content = { questions: [], labs: [], bossBattles: [], storyBeats: [] };
  }

  // Daily streak check
  store.checkStreak();
  _viewEnterTime = Date.now(); // start study timer from app launch

  // Player name prompt on first launch — loop until non-blank or cancelled
  if (!store.state.playerName || store.state.playerName === 'Network Cadet') {
    let name = null;
    do {
      name = prompt('Enter your callsign (player name):', '');
      if (name === null) break; // user cancelled — keep default
    } while (!name.trim());
    if (name !== null && name.trim()) store.setPlayerName(name.trim());
  }

  initHUD();
  initNav();
  switchView('story'); // default view
}

// ─── HUD ──────────────────────────────────────────────────────────────────────

function initHUD() {
  new HUD(store, {
    levelBadge:      document.getElementById('hud-level'),
    xpBar:           document.getElementById('hud-xp-bar'),
    xpText:          document.getElementById('hud-xp-text'),
    playerName:      document.getElementById('hud-player-name'),
    hintCount:       document.getElementById('hud-hints'),
    inventoryList:   document.getElementById('inventory-list'),
    toastContainer:  document.getElementById('toast-container'),
    weekBadge:       document.getElementById('hud-week'),
  });
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function initNav() {
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.nav));
  });

  bus.on('nav:switch', ({ view }) => switchView(view));

  // ── Story gating: unlock next beat on milestone events ──────────────────

  // Quiz completion → mark gate, record domain stats, refresh story if visible
  bus.on('quiz:completed', (summary) => {
    if (!summary.results) return; // guard against Store's own completeQuiz() event
    const week = store.state.currentWeek;
    store.updateStoryProgress(`quiz_w${week}_complete`, { seen: true, score: summary.score });

    // Build per-domain and per-week breakdown from results
    const domainStats = {};
    const weekStats   = {};
    summary.results.forEach(r => {
      const q = content.questions.find(q => q.id === r.questionId);
      if (!q) return;
      if (!domainStats[q.domain]) domainStats[q.domain] = { correct: 0, total: 0 };
      domainStats[q.domain].total++;
      if (r.correct) domainStats[q.domain].correct++;
      const w = q.week ?? 0;
      if (!weekStats[w]) weekStats[w] = { correct: 0, total: 0 };
      weekStats[w].total++;
      if (r.correct) weekStats[w].correct++;
    });
    store.recordQuizSession({
      total: summary.total,
      correct: summary.correct,
      score: summary.score,
      mode: 'grind',
      domainStats,
      weekStats,
      streakMultiplier: store.streakMultiplier,
    });

    if (currentView === 'story' && story) story.showCurrentBeat();
  });

  // Lab completion → refresh story if visible (completedLabs already updated by Store)
  bus.on('lab:completed', () => {
    if (currentView === 'story' && story) story.showCurrentBeat();
  });

  // Boss defeated → navigate to story after end screen, then refresh
  bus.on('boss:defeated', () => {
    setTimeout(() => {
      switchView('story');
      if (story) story.showCurrentBeat();
    }, 2500);
  });
}

function switchView(view) {
  // Flush study time for the view we are leaving (before resetting the timer)
  if (_viewEnterTime !== null) {
    const elapsed = (Date.now() - _viewEnterTime) / 60000; // minutes
    if (elapsed >= 0.25 && elapsed <= 180) store.addStudyTime(elapsed); // ignore < 15s and > 3h
  }
  _viewEnterTime = null; // clear now; reset AFTER render so rapid re-entry doesn't double-count

  // Clean up exam timer and keyboard handlers when navigating away
  if (view !== 'exam' && examState?.timerId) {
    clearInterval(examState.timerId);
    examState = null;
  }
  if (view !== 'flash') flashState = null;
  _removeQuizKeyHandler();
  currentView = view;
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.classList.toggle('nav-active', btn.dataset.nav === view);
  });

  switch (view) {
    case 'story':    renderStory();    break;
    case 'lab':      renderLab();      break;
    case 'grind':    renderGrind();    break;
    case 'boss':     renderBoss();     break;
    case 'exam':     renderExam();     break;
    case 'stats':    renderStats();    break;
    case 'subnet':   renderSubnet();   break;
    case 'flash':     renderFlash();     break;
    case 'reference': renderReference(); break;
    case 'notebook':  renderNotebook();  break;
    case 'inventory':renderInventory();break;
    default: break;
  }
  // Start timer AFTER render so any secondary switchView calls inside render don't corrupt it
  _viewEnterTime = Date.now();
}

// ─── Story Mode ───────────────────────────────────────────────────────────────

const WEEK_DOMAINS = [
  'Network Fundamentals',
  'Network Access',
  'IP Connectivity',
  'IP Services',
  'Security Fundamentals',
  'Automation & Programmability',
];

function _renderMissionCard() {
  const el = document.getElementById('mission-card');
  if (!el) return;

  const state     = store.state;
  const daysLeft  = store.daysUntilExam;
  const studyHrs  = store.studyHours;
  const GOAL      = 300;
  const hrsLeft   = Math.max(0, GOAL - studyHrs);
  const week      = Math.min(6, Math.max(1, state.currentWeek || 1));
  const topic     = WEEK_DOMAINS[week - 1];

  // Daily hours needed
  let dailyHrsHtml = '';
  if (daysLeft !== null && daysLeft > 0) {
    const needed = (hrsLeft / daysLeft).toFixed(1);
    dailyHrsHtml = `<span class="text-cyan-300 font-mono font-bold">${needed} hrs/day</span> needed`;
  } else if (daysLeft === 0) {
    dailyHrsHtml = `<span class="text-yellow-400 font-bold">Exam Day!</span>`;
  } else if (daysLeft !== null && daysLeft < 0) {
    dailyHrsHtml = `<span class="text-red-400 text-xs">Exam date passed</span>`;
  }

  // Countdown display
  let countdownHtml = '';
  if (daysLeft === null) {
    countdownHtml = `<button id="set-exam-date-btn" class="text-xs text-gray-600 hover:text-cyan-400 underline transition-colors">Set exam date</button>`;
  } else if (daysLeft > 0) {
    countdownHtml = `<span class="text-yellow-300 font-mono font-bold text-lg">${daysLeft}</span><span class="text-gray-500 text-xs ml-1">days to exam</span>`;
  } else if (daysLeft === 0) {
    countdownHtml = `<span class="text-yellow-400 font-bold">Today!</span>`;
  } else {
    countdownHtml = `<button id="set-exam-date-btn" class="text-xs text-gray-600 hover:text-cyan-400 underline transition-colors">Update exam date</button>`;
  }

  // Progress ring (study hours)
  const pct      = Math.min(100, Math.round((studyHrs / GOAL) * 100));
  const ringColor = pct >= 80 ? '#4ade80' : pct >= 40 ? '#22d3ee' : '#6366f1';
  const circumference = 2 * Math.PI * 18;
  const dash = Math.round(circumference * pct / 100);

  // SRS due count
  const allQIds = content.questions.filter(q => q.type !== 'cli_lab').map(q => q.id);
  const srs     = store.getSRSStats(allQIds);

  el.innerHTML = `
    <div class="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-2">
      <div class="flex items-start justify-between gap-4">
        <!-- Left: mission info -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xs font-mono text-gray-600 uppercase tracking-widest">Today's Mission</span>
            <span class="text-gray-700">·</span>
            ${countdownHtml}
          </div>

          <div class="flex flex-wrap gap-4 text-sm mb-3">
            <div>
              <div class="text-[11px] text-gray-600 uppercase tracking-wider">Topic</div>
              <div class="text-white font-medium">Week ${week}: ${topic}</div>
            </div>
            ${daysLeft !== null && daysLeft > 0 ? `
            <div>
              <div class="text-[11px] text-gray-600 uppercase tracking-wider">Daily Target</div>
              <div>${dailyHrsHtml}</div>
            </div>` : ''}
            <div>
              <div class="text-[11px] text-gray-600 uppercase tracking-wider">SRS Queue</div>
              <div>
                <span class="${srs.due > 0 ? 'text-yellow-400 font-bold' : 'text-green-400'}">${srs.due}</span>
                <span class="text-gray-600 text-xs"> due · </span>
                <span class="text-cyan-400">${srs.new}</span>
                <span class="text-gray-600 text-xs"> new</span>
              </div>
            </div>
          </div>

          <!-- Quick-start buttons -->
          <div class="flex flex-wrap gap-2">
            <button data-nav="grind" class="mission-nav px-3 py-1.5 text-xs bg-green-900 hover:bg-green-700 text-green-300 rounded font-semibold transition-colors">
              ▶ Grind${srs.due > 0 ? ` (${srs.due} due)` : ''}
            </button>
            <button data-nav="exam" class="mission-nav px-3 py-1.5 text-xs bg-yellow-900 hover:bg-yellow-700 text-yellow-300 rounded font-semibold transition-colors">
              ▶ Exam Sim
            </button>
            <button data-nav="lab" class="mission-nav px-3 py-1.5 text-xs bg-blue-900 hover:bg-blue-700 text-blue-300 rounded font-semibold transition-colors">
              ▶ Labs
            </button>
          </div>
        </div>

        <!-- Right: study hours ring -->
        <div class="shrink-0 flex flex-col items-center">
          <div class="relative w-12 h-12">
            <svg viewBox="0 0 44 44" class="w-full h-full -rotate-90">
              <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="5"/>
              <circle cx="22" cy="22" r="18" fill="none"
                stroke="${ringColor}" stroke-width="5" stroke-linecap="round"
                stroke-dasharray="${dash} 999"/>
            </svg>
            <span class="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold text-gray-300">${pct}%</span>
          </div>
          <span class="text-[10px] text-gray-600 mt-1">${studyHrs < 1 ? Math.round(studyHrs * 60) + 'm' : studyHrs.toFixed(1) + 'h'} / ${GOAL}h</span>
        </div>
      </div>
    </div>`;

  // Quick-start nav buttons
  el.querySelectorAll('.mission-nav').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.nav));
  });

  // "Set exam date" link
  document.getElementById('set-exam-date-btn')?.addEventListener('click', () => switchView('stats'));
}

/** Render the "3 Weakest Topics" compact card on the home/story screen. */
function _renderWeakCard() {
  const el = document.getElementById('weak-card');
  if (!el) return;

  const history = store.state.quizHistory || [];
  const domains = QuizEngine.domainsFrom(content.questions);

  // Aggregate domain totals from all sessions
  const domainTotals = {};
  domains.forEach(d => { domainTotals[d] = { correct: 0, total: 0 }; });
  history.forEach(session => {
    for (const [domain, stats] of Object.entries(session.domainStats || {})) {
      if (!domainTotals[domain]) domainTotals[domain] = { correct: 0, total: 0 };
      domainTotals[domain].correct += stats.correct;
      domainTotals[domain].total   += stats.total;
    }
  });

  const weak = domains
    .map(d => ({ domain: d, pct: domainTotals[d].total > 0 ? Math.round((domainTotals[d].correct / domainTotals[d].total) * 100) : null }))
    .filter(d => d.pct !== null)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 3);

  if (!weak.length) { el.innerHTML = ''; return; }

  const rows = weak.map(d => {
    const color = d.pct >= 80 ? 'text-green-400' : d.pct >= 60 ? 'text-yellow-400' : 'text-red-400';
    const bar   = d.pct >= 80 ? 'bg-green-500' : d.pct >= 60 ? 'bg-yellow-500' : 'bg-red-500';
    return `
      <div class="flex items-center gap-3">
        <span class="text-xs text-gray-400 truncate flex-1">${d.domain}</span>
        <div class="w-20 bg-gray-700 rounded-full h-1.5 shrink-0">
          <div class="${bar} h-1.5 rounded-full" style="width:${d.pct}%"></div>
        </div>
        <span class="font-mono text-xs ${color} shrink-0 w-9 text-right">${d.pct}%</span>
        <button class="weak-drill shrink-0 px-2 py-0.5 text-[10px] bg-green-900 hover:bg-green-700 text-green-300 rounded transition-colors" data-domain="${d.domain}">Drill</button>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="bg-gray-900 border border-red-900/50 rounded-lg p-3 mb-2">
      <div class="flex items-center justify-between mb-2">
        <span class="text-[11px] font-mono text-gray-600 uppercase tracking-widest">Weakest Topics</span>
        <button id="weak-view-stats" class="text-[10px] text-gray-700 hover:text-cyan-400 transition-colors">View all stats →</button>
      </div>
      <div class="space-y-2">${rows}</div>
    </div>`;

  el.querySelectorAll('.weak-drill').forEach(btn => {
    btn.addEventListener('click', () => {
      _grindPresetDomain = btn.dataset.domain;
      switchView('grind');
    });
  });
  document.getElementById('weak-view-stats')?.addEventListener('click', () => switchView('stats'));
}

  const view = getView();
  view.innerHTML = `
    <div class="max-w-3xl mx-auto">
      <div id="mission-card" class="px-6 pt-5"></div>
      <div id="weak-card" class="px-6 pb-1"></div>
      <div id="story-container" class="p-6"></div>
    </div>`;
  _renderMissionCard();
  _renderWeakCard();
  story = new StoryMode(content.storyBeats, store, document.getElementById('story-container'));
  story.showCurrentBeat();
}

// ─── Lab (CLI Simulator) ──────────────────────────────────────────────────────

function renderLab() {
  const state = store.state;
  const week  = state.currentWeek;
  const labs  = content.labs.filter(l => l.week <= week);
  const view  = getView();

  view.innerHTML = `
    <div class="flex h-full gap-4 p-4">
      <!-- Lab selector -->
      <div class="w-64 shrink-0 flex flex-col gap-2">
        <h2 class="text-green-400 font-bold text-sm uppercase tracking-widest mb-2">Labs</h2>
        ${labs.map(lab => {
          const done = state.completedLabs.find(l => l.id === lab.id);
          return `<button data-lab="${lab.id}" class="lab-btn text-left px-3 py-2 rounded border ${done ? 'border-green-700 bg-green-900/30 text-green-300' : 'border-gray-700 hover:border-green-600 text-gray-300'} text-xs transition-colors">
            <div class="font-semibold">${lab.title}</div>
            <div class="text-gray-500 mt-0.5">Week ${lab.week} · ${lab.difficulty} · ${lab.xpReward}XP${done ? ' ✓' : ''}</div>
          </button>`;
        }).join('')}
        ${!labs.length ? '<p class="text-gray-500 text-xs">Complete Story Mode to unlock labs.</p>' : ''}
      </div>

      <!-- Terminal -->
      <div class="flex-1 flex flex-col bg-black border border-green-900 rounded overflow-hidden">
        <div class="flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-green-900">
          <div class="flex gap-1.5">
            <div class="w-3 h-3 rounded-full bg-red-500"></div>
            <div class="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div class="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <span id="lab-title" class="text-green-400 text-xs font-mono ml-2">No Lab Selected — Click a lab to begin</span>
          <div class="ml-auto flex gap-2">
            <button id="btn-validate" class="px-3 py-1 text-xs bg-green-800 hover:bg-green-700 text-green-200 rounded hidden">validate</button>
            <button id="btn-reset"    class="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded hidden">reset</button>
            <button id="btn-hint"     class="px-3 py-1 text-xs bg-yellow-800 hover:bg-yellow-700 text-yellow-200 rounded hidden">hint (<span id="hint-count">${state.hints}</span>)</button>
          </div>
        </div>
        <!-- Device switcher — only shown for multi-device labs -->
        <div id="device-switcher" class="hidden flex gap-2 px-3 py-1 bg-gray-900 border-b border-green-900/50 items-center">
          <span class="text-gray-500 text-xs">Device:</span>
        </div>
        <div id="terminal-output" class="flex-1 overflow-y-auto p-3 font-mono text-sm leading-relaxed"></div>
        <div class="flex items-center px-3 py-2 border-t border-green-900 bg-black">
          <span id="terminal-prompt" class="text-yellow-400 font-mono text-sm select-none mr-2">Router> </span>
          <input id="terminal-input" type="text" autocomplete="off" spellcheck="false"
            class="flex-1 bg-transparent text-white font-mono text-sm outline-none caret-green-400"
            placeholder="type a command...">
        </div>
      </div>

      <!-- Validation results -->
      <div id="validation-panel" class="w-64 shrink-0 hidden">
        <h3 class="text-green-400 font-bold text-sm mb-2 uppercase tracking-widest">Validation</h3>
        <div id="validation-results" class="space-y-1 text-xs font-mono"></div>
      </div>
    </div>`;

  // Init terminal
  terminal = new Terminal({
    outputEl:  document.getElementById('terminal-output'),
    inputEl:   document.getElementById('terminal-input'),
    promptEl:  document.getElementById('terminal-prompt'),
    store,
  });
  const termInput = document.getElementById('terminal-input');
  termInput.focus();
  // On mobile the virtual keyboard pushes the viewport up — scroll the input into view on focus
  termInput.addEventListener('focus', () => {
    setTimeout(() => termInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 300);
  });

  // Lab selection
  document.querySelectorAll('.lab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lab = content.labs.find(l => l.id === btn.dataset.lab);
      if (!lab) return;
      loadLab(lab);
      document.querySelectorAll('.lab-btn').forEach(b => b.classList.remove('border-green-400'));
      btn.classList.add('border-green-400');
    });
  });

  // Control buttons
  document.getElementById('btn-validate')?.addEventListener('click', () => {
    if (!terminal) return;
    const result = terminal.validate();
    showValidationResults(result);
    if (result.pass) {
      store.completeLab(terminal._labId, result.score);
      const labBaseXP = content.labs.find(l => l.id === terminal._labId)?.xpReward || 50;
      const labXP = store.hasItem('packet_sniffer') ? Math.round(labBaseXP * 1.1) : labBaseXP;
      store.addXP(labXP, 'lab_complete');
    }
  });

  document.getElementById('btn-reset')?.addEventListener('click', () => terminal?.reset());

  document.getElementById('btn-hint')?.addEventListener('click', () => {
    const lab = content.labs.find(l => l.id === terminal?._labId);
    if (!lab?.hints?.length) return;
    const idx  = Math.min(store.state.hints, lab.hints.length - 1);
    store.useHint();
    alert(`Hint: ${lab.hints[idx] || 'No more hints.'}`);
    document.getElementById('hint-count').textContent = store.state.hints;
  });
}

function loadLab(lab) {
  if (!terminal) return;
  terminal.loadLab(lab);
  document.getElementById('lab-title').textContent = lab.title;
  ['btn-validate', 'btn-reset', 'btn-hint'].forEach(id => {
    document.getElementById(id)?.classList.remove('hidden');
  });
  document.getElementById('validation-panel')?.classList.add('hidden');

  // Multi-device switcher
  const switcher = document.getElementById('device-switcher');
  if (switcher) {
    const devices = terminal.deviceNames;
    if (devices && devices.length > 1) {
      // Rebuild switcher buttons
      switcher.innerHTML = '<span class="text-gray-500 text-xs">Device:</span>';
      devices.forEach(name => {
        const btn = document.createElement('button');
        btn.textContent = name;
        btn.dataset.device = name;
        btn.className = `device-tab px-2 py-0.5 text-xs rounded font-mono border ${
          name === terminal.activeDevice
            ? 'border-green-500 text-green-300 bg-green-900/30'
            : 'border-gray-600 text-gray-400 hover:border-green-600'}`;
        btn.addEventListener('click', () => {
          terminal.switchDevice(name);
          switcher.querySelectorAll('.device-tab').forEach(b => {
            const active = b.dataset.device === terminal.activeDevice;
            b.className = `device-tab px-2 py-0.5 text-xs rounded font-mono border ${
              active ? 'border-green-500 text-green-300 bg-green-900/30'
                     : 'border-gray-600 text-gray-400 hover:border-green-600'}`;
          });
        });
        switcher.appendChild(btn);
      });
      switcher.classList.remove('hidden');
    } else {
      switcher.classList.add('hidden');
    }
  }
}

function showValidationResults(result) {
  const panel   = document.getElementById('validation-panel');
  const results = document.getElementById('validation-results');
  if (!panel || !results) return;

  panel.classList.remove('hidden');
  results.innerHTML = '';

  const header = document.createElement('div');
  header.className = `font-bold mb-2 ${result.pass ? 'text-green-400' : 'text-red-400'}`;
  header.textContent = result.pass
    ? `PASS — Score: ${result.score}%`
    : `FAIL — Score: ${result.score}%`;
  results.appendChild(header);

  if (result.pass) {
    const ok = document.createElement('div');
    ok.className = 'text-green-300';
    ok.textContent = 'All objectives met!';
    results.appendChild(ok);
  } else {
    result.missing.forEach(msg => {
      const el = document.createElement('div');
      el.className = 'text-red-300 border-l-2 border-red-700 pl-2 py-0.5';
      el.textContent = `✗ ${msg}`;
      results.appendChild(el);
    });
  }
}

// ─── Grind / Quiz Mode ────────────────────────────────────────────────────────

function renderGrind() {
  const view = getView();
  const presetDomain = _grindPresetDomain;
  const presetWeek   = _grindPresetWeek;
  _grindPresetDomain = null; // consume presets
  _grindPresetWeek   = null;

  // Compute SRS stats for prompt display (all non-cli_lab questions)
  const allQIds = content.questions.filter(q => q.type !== 'cli_lab').map(q => q.id);
  const srs     = store.getSRSStats(allQIds);
  const srsTotal = srs.due + srs.new;

  view.innerHTML = `
    <div class="max-w-2xl mx-auto p-6 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-green-400 font-bold text-xl">The Grind — Quiz Mode</h2>
        <div class="flex gap-2 text-xs">
          <select id="quiz-domain" class="bg-gray-800 border border-gray-600 text-gray-300 rounded px-2 py-1">
            <option value="all">All Domains</option>
            ${QuizEngine.domainsFrom(content.questions).map(d => `<option value="${d}" ${d === presetDomain ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
          <select id="quiz-week" class="bg-gray-800 border border-gray-600 text-gray-300 rounded px-2 py-1">
            <option value="all">All Weeks</option>
            ${[1,2,3,4,5,6].map(w => `<option value="${w}" ${w === presetWeek ? 'selected' : ''}>Week ${w}</option>`).join('')}
          </select>
          <select id="quiz-difficulty" class="bg-gray-800 border border-gray-600 text-gray-300 rounded px-2 py-1">
            <option value="all">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
          <label class="flex items-center gap-1 cursor-pointer select-none border border-gray-600 rounded px-2 py-1" title="Spaced Repetition: serves due questions first">
            <input type="checkbox" id="quiz-srs" checked class="accent-green-500">
            <span class="text-gray-300">SRS</span>
          </label>
          <label class="flex items-center gap-1 cursor-pointer select-none border border-gray-600 rounded px-2 py-1" title="Re-queue: missed questions reappear ~5 questions later">
            <input type="checkbox" id="quiz-requeue" class="accent-yellow-500">
            <span class="text-gray-300">Re-queue</span>
          </label>
          <button id="start-quiz" class="px-4 py-1 bg-green-700 hover:bg-green-600 text-white rounded font-semibold">Start</button>
        </div>
      </div>

      <!-- SRS stats bar -->
      <div class="flex gap-3 text-[11px] font-mono bg-gray-900 border border-gray-700 rounded px-4 py-2">
        <span class="text-cyan-400">&#9632; New <strong>${srs.new}</strong></span>
        <span class="text-yellow-400">&#9632; Due <strong>${srs.due}</strong></span>
        <span class="text-blue-400">&#9632; Learning <strong>${srs.learning}</strong></span>
        <span class="text-green-500">&#9632; Mastered <strong>${srs.mastered}</strong></span>
        <span class="ml-auto text-gray-600">${allQIds.length} total questions</span>
      </div>

      <div id="quiz-area" class="hidden"></div>
      <div id="quiz-prompt" class="text-center py-12">
        ${srsTotal > 0
          ? `<p class="text-yellow-400 font-semibold">${srs.due} due · ${srs.new} new</p>
             <p class="text-gray-400 text-sm mt-1">SRS mode will serve these first.</p>`
          : `<p class="text-green-400 font-semibold">You're all caught up!</p>
             <p class="text-gray-400 text-sm mt-1">No questions due. Come back tomorrow, or drill any domain below.</p>`}
        <p class="text-xs text-gray-600 mt-3">Select a domain and difficulty, then press Start.</p>
      </div>
    </div>`;

  document.getElementById('start-quiz')?.addEventListener('click', startQuiz);

  // Auto-start if drilled from Stats (preset domain or week)
  if (presetDomain || presetWeek) setTimeout(startQuiz, 0);
}

function startQuiz() {
  const domain     = document.getElementById('quiz-domain')?.value || 'all';
  const week       = document.getElementById('quiz-week')?.value   || 'all';
  const difficulty = document.getElementById('quiz-difficulty')?.value || 'all';
  const srsOn      = document.getElementById('quiz-srs')?.checked ?? true;
  const requeueOn  = document.getElementById('quiz-requeue')?.checked ?? false;

  // Pre-filter by week if selected (QuizEngine handles domain/difficulty internally)
  const pool = week === 'all' ? content.questions : content.questions.filter(q => String(q.week) === String(week));

  quiz = new QuizEngine(pool, store, { domain, difficulty, count: 20, shuffle: !srsOn, srs: srsOn, requeueWrong: requeueOn });

  if (!quiz.start()) return;
  document.getElementById('quiz-prompt')?.classList.add('hidden');
  renderQuizQuestion();
}

function renderQuizQuestion() {
  const area = document.getElementById('quiz-area');
  if (!area) return;

  const q = quiz.currentQuestion;
  if (!q) return;

  const { current, total } = quiz.progress;
  const srsState  = quiz.opts.srs ? store.getSRSState(q.id) : null;
  const srsBadge  = srsState ? {
    new:      '<span class="px-1.5 py-0.5 rounded text-[10px] bg-cyan-900 text-cyan-300 border border-cyan-700">NEW</span>',
    due:      '<span class="px-1.5 py-0.5 rounded text-[10px] bg-yellow-900 text-yellow-300 border border-yellow-700">DUE</span>',
    learning: '<span class="px-1.5 py-0.5 rounded text-[10px] bg-blue-900 text-blue-300 border border-blue-700">LEARNING</span>',
    mastered: '<span class="px-1.5 py-0.5 rounded text-[10px] bg-green-900 text-green-400 border border-green-700">MASTERED</span>',
  }[srsState] : '';
  const requeueBadge = quiz.opts.requeueWrong
    ? '<span class="px-1.5 py-0.5 rounded text-[10px] bg-yellow-950 text-yellow-600 border border-yellow-900" title="Re-queue active — missed questions will reappear">↩ Re-queue</span>'
    : '';

  // For drag_drop: pre-shuffle items (track original indices for answer submission)
  let _ddItems = [];
  if (q.type === 'drag_drop' || q.type === 'ordering') {
    _ddItems = (q.items || []).map((text, i) => ({ text, origIdx: i }));
    for (let i = _ddItems.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [_ddItems[i], _ddItems[j]] = [_ddItems[j], _ddItems[i]];
    }
  }

  const _flagged = store.isFlagged(q.id);
  area.classList.remove('hidden');
  area.innerHTML = `
    <div class="bg-gray-900 border border-gray-700 rounded p-5">
      <div class="flex items-center justify-between text-xs text-gray-500 mb-3">
        <span>${q.domain}</span>
        <div class="flex items-center gap-2">
          ${srsBadge}
          ${requeueBadge}
          <span class="uppercase font-semibold text-${q.difficulty === 'hard' ? 'red' : q.difficulty === 'medium' ? 'yellow' : 'green'}-400">${q.difficulty}</span>
        </div>
        <div class="flex items-center gap-2">
          <button id="quiz-flag-btn" class="font-mono text-[11px] transition-colors ${_flagged ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-500'}" title="Flag for review">
            ${_flagged ? '⚑ Flagged' : '⚐ Flag'}
          </button>
          <span>${current} / ${total}</span>
        </div>
      </div>
      <div class="w-full bg-gray-700 rounded-full h-1 mb-4">
        <div class="bg-green-500 h-1 rounded-full transition-all" style="width:${((current-1)/total)*100}%"></div>
      </div>
      ${q.scenario_text ? `
      <div class="mb-4 p-3 bg-blue-950/40 border border-blue-900/50 rounded text-xs text-blue-200 leading-relaxed">
        <div class="text-[10px] text-blue-500 font-mono uppercase tracking-wider mb-1">&#128196; Scenario</div>
        ${q.scenario_text}
      </div>` : ''}
      <p class="text-white font-medium mb-4 leading-relaxed">${q.question}</p>
      ${q.type === 'multiple_choice' ? '<p class="text-[10px] text-gray-600 font-mono mb-2">Press 1–4 or A–D to answer</p>'
        : q.type === 'true_false'    ? '<p class="text-[10px] text-gray-600 font-mono mb-2">Press T = True · F = False</p>'
        : q.type === 'multi_select'  ? '<p class="text-[10px] text-gray-600 font-mono mb-2">Press 1–4 / A–D to toggle · Enter to submit</p>'
        : ''}

      ${q.type === 'multiple_choice' ? `
        <div class="space-y-2">
          ${q.options.map((opt, i) => `
            <button data-answer="${i}" class="quiz-option w-full text-left px-4 py-2.5 border border-gray-600 hover:border-green-500 hover:bg-green-900/20 rounded text-sm text-gray-200 transition-colors">
              <span class="text-gray-500 mr-2">${String.fromCharCode(65+i)}.</span>${opt}
            </button>`).join('')}
        </div>` : q.type === 'true_false' ? `
        <div class="flex gap-3">
          <button data-answer="true"  class="quiz-option flex-1 py-3 border border-gray-600 hover:border-green-500 rounded text-sm text-gray-200">True</button>
          <button data-answer="false" class="quiz-option flex-1 py-3 border border-gray-600 hover:border-red-500 rounded text-sm text-gray-200">False</button>
        </div>` : q.type === 'multi_select' ? `
        <div class="space-y-2">
          <p class="text-xs text-yellow-400 font-mono mb-2">Select all that apply:</p>
          ${q.options.map((opt, i) => `
            <label data-idx="${i}" class="multi-label flex items-start gap-3 px-4 py-2.5 border border-gray-600 hover:border-green-500 rounded cursor-pointer transition-colors">
              <input type="checkbox" value="${i}" class="multi-check mt-0.5 w-4 h-4 accent-green-500" style="flex-shrink:0">
              <span class="text-sm text-gray-200"><span class="text-gray-500 mr-1">${String.fromCharCode(65+i)}.</span>${opt}</span>
            </label>`).join('')}
        </div>
        <button id="submit-multi" disabled class="mt-3 w-full py-2 bg-green-900 hover:bg-green-700 text-green-300 border border-green-800 rounded font-semibold text-sm opacity-50 transition-colors">
          Submit Selection
        </button>` : (q.type === 'drag_drop' || q.type === 'ordering') ? `
        <p class="text-xs text-cyan-400 font-mono mb-2">Drag items or use ▲▼ to arrange in the correct order:</p>
        <ul id="drag-list" class="space-y-2">
          ${_ddItems.map(item => `
            <li class="drag-item flex items-center gap-2 px-3 py-2.5 border border-gray-600 rounded bg-gray-800 cursor-grab touch-none"
                data-orig-idx="${item.origIdx}">
              <span class="text-gray-500 text-sm select-none">⠿</span>
              <span class="text-sm text-gray-200 flex-1">${item.text}</span>
              <div class="flex flex-col gap-0.5 shrink-0">
                <button class="drag-up text-gray-500 hover:text-green-400 text-xs px-1 py-0.5 leading-none" title="Move up">▲</button>
                <button class="drag-dn text-gray-500 hover:text-green-400 text-xs px-1 py-0.5 leading-none" title="Move down">▼</button>
              </div>
            </li>`).join('')}
        </ul>
        <button id="submit-drag" class="mt-3 w-full py-2 bg-cyan-900 hover:bg-cyan-700 text-cyan-300 border border-cyan-800 rounded font-semibold text-sm transition-colors">
          Submit Order
        </button>` : `
        <input id="fill-answer" type="text" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm outline-none focus:border-green-500" placeholder="Type your answer...">
        <button id="submit-fill" class="mt-2 px-4 py-1.5 bg-green-700 hover:bg-green-600 text-white text-sm rounded">Submit</button>`}

      <div id="quiz-feedback" class="hidden mt-4 p-3 rounded text-sm"></div>
    </div>`;

  document.querySelectorAll('.quiz-option').forEach(btn => {
    btn.addEventListener('click', () => submitQuizAnswer(btn.dataset.answer));
  });
  document.getElementById('submit-fill')?.addEventListener('click', () => {
    submitQuizAnswer(document.getElementById('fill-answer')?.value || '');
  });
  _initPointerDragSort('drag-list', 'submit-drag', order => submitQuizAnswer(order));
  document.getElementById('quiz-flag-btn')?.addEventListener('click', () => {
    const nowFlagged = store.toggleFlag(q.id);
    const btn = document.getElementById('quiz-flag-btn');
    if (btn) {
      btn.textContent = nowFlagged ? '⚑ Flagged' : '⚐ Flag';
      btn.className = `font-mono text-[11px] transition-colors ${nowFlagged ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-500'}`;
    }
  });
  // multi_select: enable submit once at least one box is checked
  document.querySelectorAll('.multi-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const anyChecked = [...document.querySelectorAll('.multi-check')].some(c => c.checked);
      const btn = document.getElementById('submit-multi');
      if (btn) { btn.disabled = !anyChecked; btn.classList.toggle('opacity-50', !anyChecked); }
    });
  });
  document.getElementById('submit-multi')?.addEventListener('click', () => {
    const answer = [...document.querySelectorAll('.multi-check')]
      .filter(c => c.checked).map(c => c.value);
    submitQuizAnswer(answer);
  });

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  _removeQuizKeyHandler();
  const _q = quiz.currentQuestion;
  if (_q && _q.type !== 'fill_blank') {
    _quizKeyHandler = (e) => {
      // Ignore if a text input is focused
      if (document.activeElement?.tagName === 'INPUT') return;
      const k = e.key.toUpperCase();
      if (_q.type === 'multiple_choice') {
        const idx = ['1','2','3','4'].indexOf(k) >= 0 ? +k - 1
                  : ['A','B','C','D'].indexOf(k) >= 0 ? ['A','B','C','D'].indexOf(k)
                  : -1;
        if (idx >= 0 && idx < (_q.options?.length ?? 0)) {
          e.preventDefault();
          _removeQuizKeyHandler();
          submitQuizAnswer(String(idx));
        }
      } else if (_q.type === 'true_false') {
        if (k === 'T' || k === 'Y') { e.preventDefault(); _removeQuizKeyHandler(); submitQuizAnswer('true'); }
        if (k === 'F' || k === 'N') { e.preventDefault(); _removeQuizKeyHandler(); submitQuizAnswer('false'); }
      } else if (_q.type === 'multi_select') {
        const idx = ['1','2','3','4'].indexOf(k) >= 0 ? +k - 1
                  : ['A','B','C','D'].indexOf(k) >= 0 ? ['A','B','C','D'].indexOf(k)
                  : -1;
        if (idx >= 0 && idx < (_q.options?.length ?? 0)) {
          e.preventDefault();
          const cb = document.querySelectorAll('.multi-check')[idx];
          if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        }
        if ((e.key === 'Enter' || e.key === ' ')) {
          const btn = document.getElementById('submit-multi');
          if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
        }
      }
    };
    document.addEventListener('keydown', _quizKeyHandler);
  }
}

function submitQuizAnswer(answer) {
  if (!quiz) return;
  _removeQuizKeyHandler();
  const currentQ = quiz.currentQuestion;
  const result   = quiz.answer(answer);

  // Track mistakes for Notebook (wrong answers accumulate)
  if (!result.correct && currentQ) store.recordMistake(currentQ.id);

  const feedback = document.getElementById('quiz-feedback');
  if (feedback) {
    feedback.classList.remove('hidden');
    feedback.className = `mt-4 p-3 rounded text-sm ${result.correct ? 'bg-green-900 border border-green-600 text-green-200' : 'bg-red-900 border border-red-700 text-red-200'}`;
    feedback.innerHTML = `
      <span class="font-bold">${result.correct ? '✓ Correct!' : '✗ Incorrect'}</span>
      ${result.xpGained ? ` <span class="text-green-400 text-xs ml-2">+${result.xpGained} XP</span>` : ''}
      ${result.explanation ? `<p class="mt-1 text-xs opacity-80">${result.explanation}</p>` : ''}`;
  }

  // Disable answer buttons / reveal multi-select colours
  document.querySelectorAll('.quiz-option').forEach(b => { b.disabled = true; b.style.pointerEvents = 'none'; });
  if (currentQ.type === 'multi_select') _revealMultiSelect(currentQ, answer);

  if (result.done) {
    setTimeout(() => renderQuizSummary(result.summary), 1200);
  } else {
    setTimeout(() => renderQuizQuestion(), 1500);
  }
}

function _buildReviewDetail(q, userAnswer) {
  if (!q) return '<p class="text-gray-600 italic text-xs">Question data not available.</p>';
  const correct = q.correct_answer;
  let optionsHtml = '';

  if (q.type === 'multiple_choice') {
    optionsHtml = (q.options || []).map((opt, i) => {
      const si = String(i);
      const isCorrect  = si === String(correct);
      const isUserPick = si === String(userAnswer) && !isCorrect;
      const cls    = isCorrect ? 'text-green-400' : isUserPick ? 'text-red-400' : 'text-gray-600';
      const prefix = isCorrect ? '✓' : isUserPick ? '✗' : '○';
      return `<div class="${cls}"><span class="mr-1.5">${prefix}</span>${String.fromCharCode(65+i)}. ${opt}</div>`;
    }).join('');

  } else if (q.type === 'true_false') {
    ['true', 'false'].forEach(val => {
      const isCorrect  = val === String(correct).toLowerCase();
      const isUserPick = val === String(userAnswer).toLowerCase() && !isCorrect;
      const cls    = isCorrect ? 'text-green-400' : isUserPick ? 'text-red-400' : 'text-gray-600';
      const prefix = isCorrect ? '✓' : isUserPick ? '✗' : '○';
      optionsHtml += `<div class="${cls}"><span class="mr-1.5">${prefix}</span>${val.charAt(0).toUpperCase()+val.slice(1)}</div>`;
    });

  } else if (q.type === 'multi_select') {
    const correctArr = Array.isArray(correct) ? correct.map(String) : [];
    const userArr    = Array.isArray(userAnswer) ? userAnswer.map(String) : [];
    optionsHtml = (q.options || []).map((opt, i) => {
      const si = String(i);
      const inCorrect = correctArr.includes(si);
      const inUser    = userArr.includes(si);
      let cls, prefix;
      if  (inCorrect && inUser)  { cls = 'text-green-400'; prefix = '☑'; }
      else if (inCorrect)        { cls = 'text-green-700'; prefix = '☐'; }  // missed
      else if (inUser)           { cls = 'text-red-400';   prefix = '☒'; }  // wrong pick
      else                       { cls = 'text-gray-600';  prefix = '○'; }
      return `<div class="${cls}"><span class="mr-1.5">${prefix}</span>${String.fromCharCode(65+i)}. ${opt}</div>`;
    }).join('');

  } else if (q.type === 'drag_drop') {
    const items = q.items || [];
    const order = q.correct_order || [];
    optionsHtml = '<div class="text-gray-500 mb-1">Correct order:</div>' +
      order.map((idx, pos) => `<div class="text-green-400">${pos+1}. ${items[idx] ?? idx}</div>`).join('');
  }

  const expHtml = q.explanation
    ? `<div class="mt-2 pt-2 border-t border-gray-700 text-gray-400 leading-relaxed">${q.explanation}</div>`
    : '';

  return `<div class="text-gray-200 text-xs font-medium mb-2">${q.question}</div>
    <div class="space-y-0.5 text-xs">${optionsHtml}</div>${expHtml}`;
}

function renderQuizSummary(summary) {
  const area = document.getElementById('quiz-area');
  if (!area) return;

  const resultRows = summary.results.map((r, i) => {
    const q = content?.questions.find(q => q.id === r.questionId);
    const qLabel = q ? (q.question.length > 70 ? q.question.slice(0, 70) + '…' : q.question) : `Q${i+1}`;
    return `
      <div class="result-row border border-gray-800 rounded mb-1 overflow-hidden" data-idx="${i}">
        <button class="result-toggle w-full flex items-center gap-2 text-left px-3 py-1.5 hover:bg-gray-800 transition-colors">
          <span class="shrink-0 w-4 text-center ${r.correct ? 'text-green-400' : 'text-red-400'}">${r.correct ? '✓' : '✗'}</span>
          <span class="text-gray-500 text-xs shrink-0">Q${i+1}</span>
          <span class="text-gray-300 text-xs truncate flex-1">${qLabel}</span>
          <span class="result-caret text-gray-600 text-xs shrink-0">▶</span>
        </button>
        <div class="result-detail hidden px-3 pb-3 pt-1 bg-gray-800/40 text-xs space-y-1">
          ${_buildReviewDetail(q, r.answer)}
        </div>
      </div>`;
  }).join('');

  area.innerHTML = `
    <div class="bg-gray-900 border border-gray-700 rounded p-6">
      <div class="text-center mb-5">
        <div class="text-4xl mb-3">${summary.score >= 80 ? '&#127942;' : summary.score >= 60 ? '&#128077;' : '&#128542;'}</div>
        <div class="text-2xl font-bold text-white mb-1">${summary.score}%</div>
        <div class="text-gray-400 text-sm mb-1">${summary.correct}/${summary.total} correct · +${summary.totalXP} XP earned</div>
        <div class="text-xs text-gray-600">Click any row to review the question</div>
      </div>
      <div id="quiz-result-list" class="mb-5 max-h-96 overflow-y-auto space-y-0.5 pr-1">${resultRows}</div>
      <div class="text-center">
        <button id="quiz-again" class="px-5 py-2 bg-green-700 hover:bg-green-600 text-white rounded font-semibold text-sm">
          Play Again
        </button>
      </div>
    </div>`;

  document.getElementById('quiz-result-list')?.addEventListener('click', e => {
    const toggle = e.target.closest('.result-toggle');
    if (!toggle) return;
    const row    = toggle.closest('.result-row');
    const detail = row?.querySelector('.result-detail');
    const caret  = toggle.querySelector('.result-caret');
    if (!detail) return;
    const open = !detail.classList.contains('hidden');
    detail.classList.toggle('hidden', open);
    if (caret) caret.textContent = open ? '▶' : '▼';
  });

  document.getElementById('quiz-again')?.addEventListener('click', () => {
    renderGrind();
    setTimeout(startQuiz, 0);
  });
}

// ─── Stats / Weak Area Dashboard ──────────────────────────────────────────────

/**
 * Renders a GitHub-style 12-week study heatmap into containerId.
 * Shows 84 days ending today. Hover/tap shows minutes for that day.
 */
function _renderHeatmap(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const studyLog = store.state.studyLog || {};
  const today    = new Date(); today.setHours(0, 0, 0, 0);

  // Build 84-day window: day 0 = 83 days ago, day 83 = today
  // Align start to Sunday of the week containing day 0
  const startDay = new Date(today);
  startDay.setDate(startDay.getDate() - 83);
  // Walk back to Sunday
  const dayOfWeek = startDay.getDay(); // 0=Sun
  startDay.setDate(startDay.getDate() - dayOfWeek);

  // Total cells from aligned start to today
  const msPerDay  = 86400000;
  const totalDays = Math.round((today - startDay) / msPerDay) + 1;
  const numWeeks  = Math.ceil(totalDays / 7);

  // Color by minutes
  function cellColor(mins) {
    if (!mins || mins === 0) return '#111827'; // gray-900
    if (mins < 21)  return '#14532d'; // green-900
    if (mins < 61)  return '#166534'; // green-800
    if (mins < 121) return '#15803d'; // green-700
    return '#22c55e';                 // green-500
  }

  // Month labels (show month name at first week of each month)
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthLabels = Array(numWeeks).fill('');
  for (let w = 0; w < numWeeks; w++) {
    const weekStart = new Date(startDay.getTime() + w * 7 * msPerDay);
    if (w === 0 || weekStart.getDate() <= 7) {
      monthLabels[w] = monthNames[weekStart.getMonth()];
    }
  }

  // Build week columns
  const weekCols = [];
  for (let w = 0; w < numWeeks; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const dt   = new Date(startDay.getTime() + (w * 7 + d) * msPerDay);
      const key  = dt.toISOString().slice(0, 10);
      const mins = studyLog[key] || 0;
      const isFuture = dt > today;
      const isToday  = dt.toDateString() === today.toDateString();
      days.push({ key, mins, isFuture, isToday });
    }
    weekCols.push(days);
  }

  const dayLabels = ['S','M','T','W','T','F','S'];

  container.innerHTML = `
    <div style="position:relative">
      <!-- Month labels row -->
      <div style="display:flex; padding-left:18px; margin-bottom:2px;">
        ${weekCols.map((_, w) => `<div style="width:14px; margin-right:2px; font-size:9px; color:#6b7280; flex-shrink:0">${monthLabels[w]}</div>`).join('')}
      </div>
      <div style="display:flex; gap:0">
        <!-- Day-of-week labels -->
        <div style="display:flex; flex-direction:column; margin-right:2px; padding-top:0">
          ${dayLabels.map((l, i) => `<div style="height:14px; margin-bottom:2px; font-size:9px; color:#4b5563; line-height:14px; width:14px; text-align:center">${i % 2 === 1 ? l : ''}</div>`).join('')}
        </div>
        <!-- Week columns -->
        ${weekCols.map(days => `
          <div style="display:flex; flex-direction:column; margin-right:2px">
            ${days.map(day => `
              <div class="heatmap-cell"
                style="width:14px; height:14px; border-radius:2px; margin-bottom:2px; background:${day.isFuture ? 'transparent' : cellColor(day.mins)}; ${day.isToday ? 'outline:2px solid #22c55e; outline-offset:-1px;' : ''} cursor:default;"
                data-date="${day.key}" data-mins="${day.mins}" data-future="${day.isFuture}">
              </div>`).join('')}
          </div>`).join('')}
      </div>
      <!-- Tooltip (hidden by default) -->
      <div id="heatmap-tip" style="display:none; position:absolute; background:#1f2937; border:1px solid #374151; border-radius:4px; padding:4px 8px; font-size:11px; color:#d1d5db; white-space:nowrap; pointer-events:none; z-index:10;"></div>
      <!-- Legend -->
      <div style="display:flex; align-items:center; gap:4px; margin-top:6px; justify-content:flex-end">
        <span style="font-size:10px; color:#6b7280">Less</span>
        ${['#111827','#14532d','#166534','#15803d','#22c55e'].map(c => `<div style="width:12px; height:12px; border-radius:2px; background:${c}"></div>`).join('')}
        <span style="font-size:10px; color:#6b7280">More</span>
      </div>
    </div>`;

  // Tooltip events
  const tip = document.getElementById('heatmap-tip');
  container.querySelectorAll('.heatmap-cell').forEach(cell => {
    const showTip = (e) => {
      if (cell.dataset.future === 'true') return;
      const mins = parseInt(cell.dataset.mins, 10);
      const dateStr = new Date(cell.dataset.date + 'T12:00:00').toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' });
      tip.textContent = mins > 0 ? `${dateStr}: ${Math.round(mins)} min studied` : `${dateStr}: no study time`;
      tip.style.display = 'block';
      const rect = cell.getBoundingClientRect();
      const cRect = container.getBoundingClientRect();
      tip.style.left = (rect.left - cRect.left) + 'px';
      tip.style.top  = (rect.top  - cRect.top - 28) + 'px';
    };
    cell.addEventListener('mouseenter', showTip);
    cell.addEventListener('touchstart', showTip, { passive: true });
    cell.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    cell.addEventListener('touchend',   () => setTimeout(() => { tip.style.display = 'none'; }, 1500));
  });
}

/**
 * Draws a radar/spider chart on a <canvas> element.
 * @param {string}   canvasId  - element id
 * @param {string[]} labels    - one label per axis
 * @param {number[]} values    - 0–100 per axis
 */
function _drawRadar(canvasId, labels, values) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const r  = Math.min(cx, cy) - 36;
  const n  = labels.length;
  const step = (Math.PI * 2) / n;
  const start = -Math.PI / 2; // 12 o'clock

  ctx.clearRect(0, 0, W, H);

  // Grid rings at 25%, 50%, 75%, 100%
  [0.25, 0.5, 0.75, 1.0].forEach(frac => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = start + i * step;
      const x = cx + Math.cos(a) * r * frac;
      const y = cy + Math.sin(a) * r * frac;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = frac === 1.0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Axes
  for (let i = 0; i < n; i++) {
    const a = start + i * step;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Data polygon fill
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a   = start + i * step;
    const val = Math.min(1, Math.max(0, (values[i] || 0) / 100));
    const x   = cx + Math.cos(a) * r * val;
    const y   = cy + Math.sin(a) * r * val;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle   = 'rgba(6,182,212,0.18)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(6,182,212,0.9)';
  ctx.lineWidth   = 2;
  ctx.stroke();

  // Data point dots
  for (let i = 0; i < n; i++) {
    const a   = start + i * step;
    const val = Math.min(1, Math.max(0, (values[i] || 0) / 100));
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r * val, cy + Math.sin(a) * r * val, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgb(6,182,212)';
    ctx.fill();
  }

  // Axis labels (abbreviated)
  const SHORT = {
    'Network Fundamentals':         'Net Fund.',
    'Network Access':               'Net Access',
    'IP Connectivity':              'IP Conn.',
    'IP Services':                  'IP Svc.',
    'Security Fundamentals':        'Security',
    'Automation & Programmability': 'Automation',
  };
  ctx.font         = '10px monospace';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const a  = start + i * step;
    const lx = cx + Math.cos(a) * (r + 26);
    const ly = cy + Math.sin(a) * (r + 26);
    // align left/right based on position
    ctx.textAlign = Math.cos(a) > 0.2 ? 'left' : Math.cos(a) < -0.2 ? 'right' : 'center';
    ctx.fillStyle = 'rgba(156,163,175,0.85)';
    ctx.fillText(SHORT[labels[i]] || labels[i], lx, ly);
    // Show value %
    ctx.fillStyle = values[i] >= 80 ? 'rgba(74,222,128,0.9)'
                  : values[i] >= 60 ? 'rgba(250,204,21,0.9)'
                  : values[i] > 0   ? 'rgba(248,113,113,0.9)'
                  : 'rgba(107,114,128,0.7)';
    ctx.textAlign = Math.cos(a) > 0.2 ? 'left' : Math.cos(a) < -0.2 ? 'right' : 'center';
    ctx.fillText(values[i] > 0 ? values[i] + '%' : '—', lx, ly + 12);
  }
}

function renderStats() {
  const view    = getView();
  const history = store.state.quizHistory || [];
  const domains = QuizEngine.domainsFrom(content.questions);

  // Aggregate all-time domain stats
  const domainTotals = {};
  domains.forEach(d => { domainTotals[d] = { correct: 0, total: 0 }; });

  // Aggregate all-time per-week stats
  const weekTotals = {};
  for (let w = 1; w <= 6; w++) weekTotals[w] = { correct: 0, total: 0 };

  history.forEach(session => {
    for (const [domain, stats] of Object.entries(session.domainStats || {})) {
      if (!domainTotals[domain]) domainTotals[domain] = { correct: 0, total: 0 };
      domainTotals[domain].correct += stats.correct;
      domainTotals[domain].total   += stats.total;
    }
    for (const [week, stats] of Object.entries(session.weekStats || {})) {
      const w = parseInt(week);
      if (w >= 1 && w <= 6) {
        weekTotals[w].correct += stats.correct;
        weekTotals[w].total   += stats.total;
      }
    }
  });

  const totalSessions = history.length;
  const recentSessions = history.slice(-10).reverse();

  // ── Readiness Score ─────────────────────────────────────────────────────────
  const totalQuestions = content.questions.filter(q => q.type !== 'cli_lab').length;
  const totalLabs      = content.labs?.length || 0;

  // Signal 1 — per-domain accuracy (avg, 30%)
  const domainAccuracies = domains.map(d => {
    const t = domainTotals[d];
    return t.total > 0 ? (t.correct / t.total) * 100 : 0;
  });
  const avgAccuracy = domains.length
    ? domainAccuracies.reduce((s, v) => s + v, 0) / domains.length : 0;

  // Signal 2 — questions attempted via SRS (20%)
  const srsSchedule   = store.state.reviewSchedule || {};
  const attempted     = Object.keys(srsSchedule).length;
  const attemptedPct  = totalQuestions > 0 ? Math.min(100, (attempted / totalQuestions) * 100) : 0;

  // Signal 3 — SRS mastered (20%)
  const masteredCount = Object.values(srsSchedule).filter(e => e.correctStreak >= 5).length;
  const masteredPct   = totalQuestions > 0 ? Math.min(100, (masteredCount / totalQuestions) * 100) : 0;

  // Signal 4 — study hours logged, 100hrs = full score (15%)
  const studyScore = Math.min(100, (store.studyHours / 100) * 100);

  // Signal 5 — labs completed (15%)
  const labsCompleted = store.state.completedLabs?.length || 0;
  const labScore      = totalLabs > 0 ? Math.min(100, (labsCompleted / totalLabs) * 100) : 0;

  const readiness = Math.round(
    0.30 * avgAccuracy +
    0.20 * attemptedPct +
    0.20 * masteredPct +
    0.15 * studyScore +
    0.15 * labScore
  );

  const readinessColor = readiness >= 85 ? 'text-blue-400'
    : readiness >= 70 ? 'text-green-400'
    : readiness >= 40 ? 'text-yellow-400'
    : 'text-red-400';
  const readinessBorder = readiness >= 85 ? 'border-blue-800'
    : readiness >= 70 ? 'border-green-800'
    : readiness >= 40 ? 'border-yellow-800'
    : 'border-red-800';
  const readinessLabel = readiness >= 85 ? 'Exam Ready'
    : readiness >= 70 ? 'On Track'
    : readiness >= 40 ? 'Developing'
    : 'Early Stage';

  // Radar chart values (per-domain accuracy)
  const radarValues = domains.map(d => {
    const t = domainTotals[d];
    return t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0;
  });

  // Weak areas: domains with accuracy data, sorted ascending (worst first)
  const weakDomains = domains
    .map(d => ({ domain: d, pct: domainTotals[d].total > 0 ? Math.round((domainTotals[d].correct / domainTotals[d].total) * 100) : null, total: domainTotals[d].total }))
    .filter(d => d.pct !== null)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 3);

  const weakAreaCards = weakDomains.length
    ? weakDomains.map(d => {
        const color = d.pct >= 80 ? 'text-green-400 border-green-900'
          : d.pct >= 60 ? 'text-yellow-400 border-yellow-900'
          : 'text-red-400 border-red-900';
        const tip = d.pct < 60
          ? 'Focus area — drill more questions here.'
          : d.pct < 80
          ? 'Getting there — a few more sessions will help.'
          : 'Strong — keep it up.';
        return `
          <div class="flex items-center justify-between border ${color} rounded px-3 py-2.5">
            <div class="flex-1 min-w-0 mr-3">
              <div class="text-xs text-gray-300 truncate">${d.domain}</div>
              <div class="text-[11px] text-gray-600 mt-0.5">${tip}</div>
            </div>
            <span class="font-mono font-bold text-sm ${color.split(' ')[0]} shrink-0 mr-3">${d.pct}%</span>
            <button class="drill-btn shrink-0 px-2.5 py-1 text-xs bg-green-900 hover:bg-green-700 text-green-300 rounded transition-colors" data-domain="${d.domain}">
              Drill
            </button>
          </div>`;
      }).join('')
    : '<p class="text-gray-600 text-xs py-2">Complete some quiz sessions to see weak areas.</p>';

  const domainRows = QuizEngine.domainsFrom(content.questions).map(domain => {
    const d   = domainTotals[domain];
    const pct = d.total > 0 ? Math.round((d.correct / d.total) * 100) : null;
    const barColor = pct === null ? 'bg-gray-700'
      : pct >= 80 ? 'bg-green-500'
      : pct >= 60 ? 'bg-yellow-500'
      : 'bg-red-500';
    const label = pct === null ? 'No data' : `${pct}% (${d.correct}/${d.total})`;
    return `
      <div class="space-y-1">
        <div class="flex justify-between text-xs">
          <span class="text-gray-300">${domain}</span>
          <span class="${pct === null ? 'text-gray-600' : pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400'} font-mono">${label}</span>
        </div>
        <div class="w-full bg-gray-800 rounded-full h-2">
          <div class="${barColor} h-2 rounded-full transition-all" style="width:${pct ?? 0}%"></div>
        </div>
      </div>`;
  }).join('');

  const weekRows = [1, 2, 3, 4, 5, 6].map(w => {
    const d = weekTotals[w];
    const pct = d.total > 0 ? Math.round((d.correct / d.total) * 100) : null;
    const barColor = pct === null ? 'bg-gray-700' : pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500';
    const textColor = pct === null ? 'text-gray-600' : pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400';
    const label = pct === null ? 'No data' : `${pct}% (${d.correct}/${d.total})`;
    const drillBtn = pct !== null && pct < 80
      ? `<button class="week-drill-btn shrink-0 ml-2 px-2 py-0.5 text-[10px] bg-green-900 hover:bg-green-700 text-green-300 rounded transition-colors" data-week="${w}">Drill</button>`
      : '';
    return `
      <div class="space-y-1">
        <div class="flex justify-between items-center text-xs">
          <span class="text-gray-300">Week ${w}</span>
          <div class="flex items-center gap-1">
            <span class="${textColor} font-mono">${label}</span>
            ${drillBtn}
          </div>
        </div>
        <div class="w-full bg-gray-800 rounded-full h-2">
          <div class="${barColor} h-2 rounded-full transition-all" style="width:${pct ?? 0}%"></div>
        </div>
      </div>`;
  }).join('');

  const recentRows = recentSessions.length
    ? recentSessions.map(s => {
        const modeLabel = s.mode === 'exam' ? '[EXAM]' : '[GRIND]';
        const date = new Date(s.date).toLocaleDateString();
        return `<div class="flex justify-between text-xs py-1 border-b border-gray-800">
          <span class="text-gray-500">${date} <span class="text-gray-700">${modeLabel}</span></span>
          <span class="${s.score >= 80 ? 'text-green-400' : s.score >= 60 ? 'text-yellow-400' : 'text-red-400'}">${s.score}%  ${s.correct}/${s.total}</span>
        </div>`;
      }).join('')
    : '<p class="text-gray-600 text-xs py-2">No sessions recorded yet.</p>';

  // Exam history (last 10 exam runs with per-domain breakdown)
  const examHistory = (store.state.examHistory || []).slice().reverse();
  const examHistoryRows = examHistory.length
    ? examHistory.map((run, i) => {
        const date = new Date(run.date).toLocaleDateString();
        const time = new Date(run.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const elapsed = run.elapsed ? _formatTime(run.elapsed) : '—';
        const pass = run.score >= 70;
        return `
          <div class="exam-stat-row border border-gray-800 rounded overflow-hidden" data-si="${i}">
            <button class="stat-hist-toggle w-full flex items-center gap-2 text-left px-3 py-2 hover:bg-gray-800 transition-colors text-xs">
              <span class="shrink-0 font-bold ${pass ? 'text-green-400' : 'text-red-400'}">${pass ? 'PASS' : 'FAIL'}</span>
              <span class="font-mono font-bold ${pass ? 'text-green-300' : 'text-red-300'} w-10 text-right">${run.score}%</span>
              <span class="text-gray-500">${run.correct}/${run.total}</span>
              <span class="text-gray-700 font-mono">${elapsed}</span>
              <span class="text-gray-600 flex-1 text-right">${date} ${time}</span>
              <span class="stat-hist-caret text-gray-600 shrink-0">▶</span>
            </button>
            <div class="stat-hist-detail hidden px-3 pb-3 pt-1 bg-gray-800/40 text-xs space-y-1">
              ${EXAM_DOMAIN_WEIGHTS.map(({ domain }) => {
                const d = run.domainStats?.[domain] || { correct: 0, total: 0 };
                const pct = d.total > 0 ? Math.round((d.correct / d.total) * 100) : null;
                return `<div class="flex justify-between py-0.5 border-b border-gray-700">
                  <span class="text-gray-400">${domain}</span>
                  <span class="${pct === null ? 'text-gray-600' : pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400'}">${pct !== null ? pct + '%' : '—'} (${d.correct}/${d.total})</span>
                </div>`;
              }).join('')}
            </div>
          </div>`;
      }).join('')
    : '<p class="text-gray-600 text-xs py-2">No exam runs recorded yet. Take an exam to see your history here.</p>';

  const studyHrs   = store.studyHours;
  const GOAL_HRS   = 300;
  const studyPct   = Math.min(100, Math.round((studyHrs / GOAL_HRS) * 100));
  const hrsLeft    = Math.max(0, GOAL_HRS - studyHrs);
  const studyLabel = studyHrs < 1
    ? `${Math.round(studyHrs * 60)} min`
    : `${studyHrs.toFixed(1)} hrs`;
  const studyBarColor = studyPct >= 80 ? 'bg-green-500' : studyPct >= 40 ? 'bg-cyan-500' : 'bg-blue-600';

  // Study Planner
  const daysLeft      = store.daysUntilExam;
  const examDateVal   = store.state.examDate || '';
  const dailyNeeded   = (daysLeft !== null && daysLeft > 0) ? (hrsLeft / daysLeft).toFixed(1) : null;
  const countdownText = daysLeft === null    ? 'No exam date set'
    : daysLeft === 0   ? 'Exam Day!'
    : daysLeft > 0     ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''} to exam`
    : `${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''} ago`;
  const countdownColor = daysLeft === null ? 'text-gray-600'
    : daysLeft === 0   ? 'text-yellow-400'
    : daysLeft <= 7    ? 'text-red-400'
    : daysLeft <= 30   ? 'text-yellow-400'
    : 'text-green-400';

  view.innerHTML = `
    <div class="max-w-2xl mx-auto p-6 space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-cyan-400 font-bold text-xl">Stats Dashboard</h2>
        <span class="text-xs text-gray-600">${totalSessions} session${totalSessions !== 1 ? 's' : ''} recorded</span>
      </div>

      <!-- Readiness Score hero card -->
      <div class="bg-gray-900 border ${readinessBorder} rounded p-5">
        <div class="flex items-start justify-between mb-4">
          <div>
            <h3 class="text-sm text-gray-400 uppercase tracking-widest">Exam Readiness Score</h3>
            <div class="flex items-baseline gap-3 mt-1">
              <span class="text-5xl font-bold font-mono ${readinessColor}">${readiness}%</span>
              <span class="text-sm ${readinessColor} font-semibold">${readinessLabel}</span>
            </div>
            <p class="text-xs text-gray-600 mt-1">
              ${readiness >= 85 ? 'You are well-prepared. Take a practice exam to confirm.'
                : readiness >= 70 ? 'Strong progress. Address weak areas to close the gap.'
                : readiness >= 40 ? 'Making progress. Keep grinding and completing labs.'
                : 'Just getting started. Daily sessions will move this fast.'}
            </p>
          </div>
          <!-- Mini gauge ring -->
          <div class="shrink-0 relative w-16 h-16">
            <svg viewBox="0 0 56 56" class="w-full h-full -rotate-90">
              <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="6"/>
              <circle cx="28" cy="28" r="22" fill="none"
                stroke="${readiness >= 85 ? '#60a5fa' : readiness >= 70 ? '#4ade80' : readiness >= 40 ? '#facc15' : '#f87171'}"
                stroke-width="6" stroke-linecap="round"
                stroke-dasharray="${Math.round(2 * Math.PI * 22 * readiness / 100)} 999"/>
            </svg>
            <span class="absolute inset-0 flex items-center justify-center text-[11px] font-mono font-bold ${readinessColor}">${readiness}%</span>
          </div>
        </div>
        <!-- Signal bars -->
        <div class="space-y-1.5 text-xs">
          ${[
            { label: 'Domain Accuracy', val: avgAccuracy, weight: '30%' },
            { label: 'Questions Attempted (SRS)', val: attemptedPct, weight: '20%' },
            { label: 'SRS Mastered', val: masteredPct, weight: '20%' },
            { label: 'Study Hours (100hr goal)', val: studyScore, weight: '15%' },
            { label: 'Labs Completed', val: labScore, weight: '15%' },
          ].map(sig => {
            const v = Math.round(sig.val);
            const c = v >= 80 ? 'bg-green-500' : v >= 60 ? 'bg-yellow-500' : v > 0 ? 'bg-red-500' : 'bg-gray-700';
            return `<div class="flex items-center gap-2">
              <span class="text-gray-500 w-44 shrink-0">${sig.label}</span>
              <div class="flex-1 bg-gray-800 rounded-full h-1.5">
                <div class="${c} h-1.5 rounded-full" style="width:${v}%"></div>
              </div>
              <span class="text-gray-500 w-8 text-right font-mono">${v}%</span>
              <span class="text-gray-700 w-7 text-right">${sig.weight}</span>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Radar chart + Weak areas -->
      <div class="grid grid-cols-1 gap-4" style="grid-template-columns:1fr 1fr">
        <div class="bg-gray-900 border border-gray-700 rounded p-4 flex flex-col items-center">
          <h3 class="text-sm text-gray-400 uppercase tracking-widest mb-3 self-start">Domain Radar</h3>
          <canvas id="radar-canvas" width="260" height="260"></canvas>
        </div>
        <div class="bg-gray-900 border border-gray-700 rounded p-4">
          <h3 class="text-sm text-gray-400 uppercase tracking-widest mb-3">Weak Areas</h3>
          <div id="weak-area-list" class="space-y-2">
            ${weakAreaCards}
          </div>
        </div>
      </div>

      <!-- Study Planner card -->
      <div class="bg-gray-900 border border-cyan-900 rounded p-5 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm text-gray-400 uppercase tracking-widest">Study Planner</h3>
          <span class="font-mono font-bold text-sm ${countdownColor}">${countdownText}</span>
        </div>
        <div class="flex flex-wrap gap-3 items-end">
          <div class="flex-1 min-w-0 space-y-1">
            <label class="text-xs text-gray-500" for="exam-date-input">Target Exam Date</label>
            <input id="exam-date-input" type="date" value="${examDateVal}"
              class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-white text-sm outline-none focus:border-cyan-500">
          </div>
          <button id="save-exam-date" class="px-4 py-1.5 bg-cyan-800 hover:bg-cyan-700 text-cyan-200 rounded text-sm font-semibold shrink-0 transition-colors">Save</button>
          ${examDateVal ? `<button id="clear-exam-date" class="px-3 py-1.5 text-xs text-gray-600 hover:text-red-400 transition-colors">Clear</button>` : ''}
        </div>
        ${dailyNeeded !== null ? `
        <div class="grid grid-cols-3 gap-3 pt-2 border-t border-gray-800 text-center">
          <div>
            <div class="text-xs text-gray-600 uppercase tracking-wider">Days Left</div>
            <div class="text-xl font-bold font-mono ${countdownColor}">${daysLeft}</div>
          </div>
          <div>
            <div class="text-xs text-gray-600 uppercase tracking-wider">Hrs/Day Needed</div>
            <div class="text-xl font-bold font-mono text-cyan-300">${dailyNeeded}</div>
          </div>
          <div>
            <div class="text-xs text-gray-600 uppercase tracking-wider">Hrs Remaining</div>
            <div class="text-xl font-bold font-mono text-gray-300">${hrsLeft.toFixed(1)}</div>
          </div>
        </div>` : ''}
      </div>

      <div class="bg-gray-900 border border-gray-700 rounded p-5 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm text-gray-400 uppercase tracking-widest">Study Time</h3>
          <span class="text-xs text-gray-600">~${GOAL_HRS} hrs recommended for CCNA</span>
        </div>
        <div class="flex items-end justify-between">
          <span class="text-2xl font-bold font-mono text-cyan-300">${studyLabel}</span>
          <span class="text-xs text-gray-500">${studyPct}% of goal · ${hrsLeft < 1 ? Math.round(hrsLeft * 60) + ' min' : hrsLeft.toFixed(1) + ' hrs'} to go</span>
        </div>
        <div class="w-full bg-gray-800 rounded-full h-2.5">
          <div class="${studyBarColor} h-2.5 rounded-full transition-all" style="width:${studyPct}%"></div>
        </div>
      </div>

      <div class="bg-gray-900 border border-gray-700 rounded p-5 space-y-4">
        <h3 class="text-sm text-gray-400 uppercase tracking-widest">All-Time Accuracy by Domain</h3>
        ${domainRows}
      </div>

      <div class="bg-gray-900 border border-gray-700 rounded p-5 space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm text-gray-400 uppercase tracking-widest">Accuracy by Week</h3>
          <span class="text-xs text-gray-600">Grind sessions only</span>
        </div>
        <div id="week-accuracy-list" class="space-y-3">${weekRows}</div>
      </div>

      <div class="bg-gray-900 border border-gray-700 rounded p-5">
        <h3 class="text-sm text-gray-400 uppercase tracking-widest mb-3">Recent Sessions (last 10)</h3>
        ${recentRows}
      </div>

      <div class="bg-gray-900 border border-yellow-900 rounded p-5">
        <h3 class="text-sm text-gray-400 uppercase tracking-widest mb-3">
          Exam History <span class="normal-case text-gray-600 text-xs">(last 10 · click to expand)</span>
        </h3>
        <div id="stats-exam-history" class="space-y-0.5">
          ${examHistoryRows}
        </div>
      </div>

      <!-- Study Heatmap -->
      <div class="bg-gray-900 border border-gray-700 rounded p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm text-gray-400 uppercase tracking-widest">Study Activity</h3>
          <span class="text-xs text-gray-600">12-week rolling window</span>
        </div>
        <div id="heatmap-container" class="overflow-x-auto"></div>
      </div>

      ${totalSessions > 0 ? `
      <div class="text-center flex justify-center gap-6">
        <button id="clear-history" class="text-xs text-gray-700 hover:text-red-400 transition-colors">
          Clear session history
        </button>
        <button id="clear-srs" class="text-xs text-gray-700 hover:text-red-400 transition-colors">
          Reset SRS schedule
        </button>
      </div>` : ''}
    </div>`;

  // Draw radar chart and heatmap after DOM is ready
  setTimeout(() => {
    _drawRadar('radar-canvas', domains, radarValues);
    _renderHeatmap('heatmap-container');
  }, 0);

  // Study Planner — save / clear exam date
  document.getElementById('save-exam-date')?.addEventListener('click', () => {
    const val = document.getElementById('exam-date-input')?.value;
    if (val) { store.setExamDate(val); renderStats(); }
  });
  document.getElementById('clear-exam-date')?.addEventListener('click', () => {
    store.setExamDate(null);
    renderStats();
  });

  // Drill buttons — navigate to Grind pre-filtered to the weak domain
  document.getElementById('weak-area-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.drill-btn');
    if (!btn) return;
    _grindPresetDomain = btn.dataset.domain;
    switchView('grind');
  });

  // Week drill buttons — pre-filter Grind to a specific week
  document.getElementById('week-accuracy-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.week-drill-btn');
    if (!btn) return;
    _grindPresetWeek = parseInt(btn.dataset.week, 10);
    switchView('grind');
  });

  document.getElementById('clear-history')?.addEventListener('click', () => {
    if (confirm('Clear all quiz history? This resets your accuracy stats.')) {
      store.clearQuizHistory();
      renderStats();
    }
  });

  document.getElementById('clear-srs')?.addEventListener('click', () => {
    if (confirm('Reset SRS schedule? All question intervals will restart from zero.')) {
      store.clearSRS();
      renderStats();
    }
  });

  document.getElementById('stats-exam-history')?.addEventListener('click', e => {
    const toggle = e.target.closest('.stat-hist-toggle');
    if (!toggle) return;
    const row    = toggle.closest('.exam-stat-row');
    const detail = row?.querySelector('.stat-hist-detail');
    const caret  = toggle.querySelector('.stat-hist-caret');
    if (!detail) return;
    const open = !detail.classList.contains('hidden');
    detail.classList.toggle('hidden', open);
    if (caret) caret.textContent = open ? '▶' : '▼';
  });
}

// ─── Exam Simulator ───────────────────────────────────────────────────────────

function renderExam() {
  if (examState?.timerId) clearInterval(examState.timerId);
  examState = null;
  const view = getView();

  const examHistory = (store.state.examHistory || []).slice().reverse(); // newest first
  const historyRows = examHistory.length
    ? examHistory.map((run, i) => {
        const date = new Date(run.date).toLocaleDateString();
        const time = new Date(run.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const elapsed = run.elapsed ? _formatTime(run.elapsed) : '—';
        const pass = run.score >= 70;
        return `
          <div class="exam-hist-row border border-gray-800 rounded overflow-hidden" data-hi="${i}">
            <button class="hist-toggle w-full flex items-center gap-2 text-left px-3 py-2 hover:bg-gray-800 transition-colors text-xs">
              <span class="shrink-0 font-bold ${pass ? 'text-green-400' : 'text-red-400'}">${pass ? 'PASS' : 'FAIL'}</span>
              <span class="font-mono font-bold ${pass ? 'text-green-300' : 'text-red-300'} w-10 text-right">${run.score}%</span>
              <span class="text-gray-500">${run.correct}/${run.total}</span>
              <span class="text-gray-700 font-mono">${elapsed}</span>
              <span class="text-gray-600 flex-1 text-right">${date} ${time}</span>
              <span class="hist-caret text-gray-600 shrink-0">▶</span>
            </button>
            <div class="hist-detail hidden px-3 pb-3 pt-1 bg-gray-800/40 text-xs space-y-1">
              ${EXAM_DOMAIN_WEIGHTS.map(({ domain }) => {
                const d = run.domainStats?.[domain] || { correct: 0, total: 0 };
                const pct = d.total > 0 ? Math.round((d.correct / d.total) * 100) : null;
                return `<div class="flex justify-between py-0.5 border-b border-gray-700">
                  <span class="text-gray-400">${domain}</span>
                  <span class="${pct === null ? 'text-gray-600' : pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400'}">${pct !== null ? pct + '%' : '—'} (${d.correct}/${d.total})</span>
                </div>`;
              }).join('')}
            </div>
          </div>`;
      }).join('')
    : '<p class="text-gray-600 text-xs py-2">No exam runs recorded yet.</p>';

  view.innerHTML = `
    <div class="max-w-2xl mx-auto p-6 space-y-5">
      <div class="flex items-center justify-between">
        <h2 class="text-yellow-400 font-bold text-xl">Exam Simulator</h2>
        <span class="text-xs text-gray-600">CCNA 200-301 Format</span>
      </div>

      <div class="bg-gray-900 border border-yellow-900 rounded p-5 space-y-3">
        <h3 class="text-yellow-300 font-semibold">Exam Parameters</h3>
        <div class="grid grid-cols-2 gap-2 text-xs text-gray-400">
          ${EXAM_DOMAIN_WEIGHTS.map(w =>
            `<div class="flex justify-between">
              <span>${w.domain}</span>
              <span class="text-yellow-600">${w.count} questions</span>
            </div>`
          ).join('')}
        </div>
        <div class="border-t border-gray-800 pt-3 text-xs text-gray-500">
          120 questions · 120-minute timer · No XP (assessment only) · Pass threshold: 70%
        </div>
        <button id="start-exam" class="w-full py-2.5 bg-yellow-800 hover:bg-yellow-700 text-yellow-200 rounded font-semibold text-sm transition-colors">
          Begin Exam
        </button>
      </div>

      <div class="bg-gray-900 border border-gray-700 rounded p-5">
        <h3 class="text-sm text-gray-400 uppercase tracking-widest mb-3">
          Exam History <span class="normal-case text-gray-600 text-xs">(last 10 · click to expand)</span>
        </h3>
        <div id="exam-history-list" class="space-y-0.5">
          ${historyRows}
        </div>
      </div>

      <div id="exam-area" class="hidden"></div>
    </div>`;

  document.getElementById('start-exam')?.addEventListener('click', startExam);

  document.getElementById('exam-history-list')?.addEventListener('click', e => {
    const toggle = e.target.closest('.hist-toggle');
    if (!toggle) return;
    const row    = toggle.closest('.exam-hist-row');
    const detail = row?.querySelector('.hist-detail');
    const caret  = toggle.querySelector('.hist-caret');
    if (!detail) return;
    const open = !detail.classList.contains('hidden');
    detail.classList.toggle('hidden', open);
    if (caret) caret.textContent = open ? '▶' : '▼';
  });
}

function startExam() {
  // Build proportional session by sampling from each domain
  const allQ = content.questions.filter(q => q.type !== 'cli_lab');
  const session = [];

  for (const { domain, count } of EXAM_DOMAIN_WEIGHTS) {
    const pool = allQ.filter(q => q.domain === domain);
    // Shuffle and take `count`
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    session.push(...shuffled.slice(0, count));
  }

  // Final shuffle so domains are interleaved
  session.sort(() => Math.random() - 0.5);

  examState = {
    session,
    currentIdx: 0,
    results: [],
    startTime: Date.now(),
    timerId: null,
    secondsLeft: EXAM_TIME_SECONDS,
  };

  document.querySelector('#exam-area')?.classList.remove('hidden');
  document.querySelector('button#start-exam')?.closest('.bg-gray-900')?.classList.add('hidden');

  // Start countdown
  examState.timerId = setInterval(() => {
    examState.secondsLeft--;
    const el = document.getElementById('exam-timer');
    if (el) el.textContent = _formatTime(examState.secondsLeft);
    if (el) el.className = `font-mono font-bold ${examState.secondsLeft < 300 ? 'text-red-400' : 'text-yellow-300'}`;
    if (examState.secondsLeft <= 0) {
      clearInterval(examState.timerId);
      renderExamSummary();
    }
  }, 1000);

  renderExamQuestion();
}

function renderExamQuestion() {
  const area = document.getElementById('exam-area');
  if (!area || !examState) return;

  const q = examState.session[examState.currentIdx];
  if (!q) { renderExamSummary(); return; }

  const { currentIdx, session, secondsLeft } = examState;
  const total = session.length;

  // For drag_drop: pre-shuffle items (track original indices for answer submission)
  let _examDdItems = [];
  if (q.type === 'drag_drop' || q.type === 'ordering') {
    _examDdItems = (q.items || []).map((text, i) => ({ text, origIdx: i }));
    for (let i = _examDdItems.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [_examDdItems[i], _examDdItems[j]] = [_examDdItems[j], _examDdItems[i]];
    }
  }

  const _examFlagged = store.isFlagged(q.id);
  area.innerHTML = `
    <div class="bg-gray-900 border border-gray-700 rounded p-5">
      <div class="flex items-center justify-between text-xs text-gray-500 mb-3">
        <span>${q.domain}</span>
        <span id="exam-timer" class="font-mono font-bold text-yellow-300">${_formatTime(secondsLeft)}</span>
        <div class="flex items-center gap-2">
          <button id="exam-flag-btn" class="font-mono text-[11px] transition-colors ${_examFlagged ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-500'}" title="Flag for review">
            ${_examFlagged ? '⚑ Flagged' : '⚐ Flag'}
          </button>
          <span>${currentIdx + 1} / ${total}</span>
        </div>
      </div>
      <div class="w-full bg-gray-700 rounded-full h-1 mb-4">
        <div class="bg-yellow-500 h-1 rounded-full transition-all" style="width:${(currentIdx / total) * 100}%"></div>
      </div>
      ${q.scenario_text ? `
      <div class="mb-4 p-3 bg-blue-950/40 border border-blue-900/50 rounded text-xs text-blue-200 leading-relaxed">
        <div class="text-[10px] text-blue-500 font-mono uppercase tracking-wider mb-1">&#128196; Scenario</div>
        ${q.scenario_text}
      </div>` : ''}
      <p class="text-white font-medium mb-4 leading-relaxed">${q.question}</p>
      ${q.type === 'multiple_choice' ? '<p class="text-[10px] text-gray-600 font-mono mb-2">Press 1–4 or A–D to answer</p>'
        : q.type === 'true_false'    ? '<p class="text-[10px] text-gray-600 font-mono mb-2">Press T = True · F = False</p>'
        : q.type === 'multi_select'  ? '<p class="text-[10px] text-gray-600 font-mono mb-2">Press 1–4 / A–D to toggle · Enter to submit</p>'
        : ''}

      ${q.type === 'multiple_choice' ? `
        <div class="space-y-2">
          ${q.options.map((opt, i) => `
            <button data-answer="${i}" class="exam-option w-full text-left px-4 py-2.5 border border-gray-600 hover:border-yellow-500 hover:bg-yellow-900/20 rounded text-sm text-gray-200 transition-colors">
              <span class="text-gray-500 mr-2">${String.fromCharCode(65+i)}.</span>${opt}
            </button>`).join('')}
        </div>` : q.type === 'true_false' ? `
        <div class="flex gap-3">
          <button data-answer="true"  class="exam-option flex-1 py-3 border border-gray-600 hover:border-yellow-500 rounded text-sm text-gray-200">True</button>
          <button data-answer="false" class="exam-option flex-1 py-3 border border-gray-600 hover:border-red-500 rounded text-sm text-gray-200">False</button>
        </div>` : q.type === 'multi_select' ? `
        <div class="space-y-2">
          <p class="text-xs text-yellow-400 font-mono mb-2">Select all that apply:</p>
          ${q.options.map((opt, i) => `
            <label data-idx="${i}" class="multi-label flex items-start gap-3 px-4 py-2.5 border border-gray-600 hover:border-yellow-500 rounded cursor-pointer transition-colors">
              <input type="checkbox" value="${i}" class="multi-check mt-0.5 w-4 h-4 accent-yellow-500" style="flex-shrink:0">
              <span class="text-sm text-gray-200"><span class="text-gray-500 mr-1">${String.fromCharCode(65+i)}.</span>${opt}</span>
            </label>`).join('')}
        </div>
        <button id="exam-submit-multi" disabled class="mt-3 w-full py-2 bg-yellow-900 hover:bg-yellow-700 text-yellow-300 border border-yellow-800 rounded font-semibold text-sm opacity-50 transition-colors">
          Submit Selection
        </button>` : (q.type === 'drag_drop' || q.type === 'ordering') ? `
        <p class="text-xs text-cyan-400 font-mono mb-2">Drag items or use ▲▼ to arrange in the correct order:</p>
        <ul id="exam-drag-list" class="space-y-2">
          ${_examDdItems.map(item => `
            <li class="drag-item flex items-center gap-2 px-3 py-2.5 border border-gray-600 rounded bg-gray-800 cursor-grab touch-none"
                data-orig-idx="${item.origIdx}">
              <span class="text-gray-500 text-sm select-none">⠿</span>
              <span class="text-sm text-gray-200 flex-1">${item.text}</span>
              <div class="flex flex-col gap-0.5 shrink-0">
                <button class="drag-up text-gray-500 hover:text-yellow-400 text-xs px-1 py-0.5 leading-none" title="Move up">▲</button>
                <button class="drag-dn text-gray-500 hover:text-yellow-400 text-xs px-1 py-0.5 leading-none" title="Move down">▼</button>
              </div>
            </li>`).join('')}
        </ul>
        <button id="exam-submit-drag" class="mt-3 w-full py-2 bg-cyan-900 hover:bg-cyan-700 text-cyan-300 border border-cyan-800 rounded font-semibold text-sm transition-colors">
          Submit Order
        </button>` : `
        <input id="exam-fill-answer" type="text" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm outline-none focus:border-yellow-500" placeholder="Type your answer...">
        <button id="exam-submit-fill" class="mt-2 px-4 py-1.5 bg-yellow-700 hover:bg-yellow-600 text-white text-sm rounded">Submit</button>`}

      <div id="exam-feedback" class="hidden mt-4 p-3 rounded text-sm"></div>
    </div>`;

  document.querySelectorAll('.exam-option').forEach(btn => {
    btn.addEventListener('click', () => submitExamAnswer(btn.dataset.answer));
  });
  document.getElementById('exam-submit-fill')?.addEventListener('click', () => {
    submitExamAnswer(document.getElementById('exam-fill-answer')?.value || '');
  });
  _initPointerDragSort('exam-drag-list', 'exam-submit-drag', order => submitExamAnswer(order));
  document.getElementById('exam-flag-btn')?.addEventListener('click', () => {
    const nowFlagged = store.toggleFlag(q.id);
    const btn = document.getElementById('exam-flag-btn');
    if (btn) {
      btn.textContent = nowFlagged ? '⚑ Flagged' : '⚐ Flag';
      btn.className = `font-mono text-[11px] transition-colors ${nowFlagged ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-500'}`;
    }
  });
  // multi_select: enable submit once at least one box is checked
  document.querySelectorAll('.multi-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const anyChecked = [...document.querySelectorAll('.multi-check')].some(c => c.checked);
      const btn = document.getElementById('exam-submit-multi');
      if (btn) { btn.disabled = !anyChecked; btn.classList.toggle('opacity-50', !anyChecked); }
    });
  });
  document.getElementById('exam-submit-multi')?.addEventListener('click', () => {
    const answer = [...document.querySelectorAll('.multi-check')]
      .filter(c => c.checked).map(c => c.value);
    submitExamAnswer(answer);
  });

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  _removeQuizKeyHandler();
  if (q && q.type !== 'fill_blank') {
    _quizKeyHandler = (e) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      const k = e.key.toUpperCase();
      if (q.type === 'multiple_choice') {
        const idx = ['1','2','3','4'].indexOf(k) >= 0 ? +k - 1
                  : ['A','B','C','D'].indexOf(k) >= 0 ? ['A','B','C','D'].indexOf(k)
                  : -1;
        if (idx >= 0 && idx < (q.options?.length ?? 0)) {
          e.preventDefault();
          _removeQuizKeyHandler();
          submitExamAnswer(String(idx));
        }
      } else if (q.type === 'true_false') {
        if (k === 'T' || k === 'Y') { e.preventDefault(); _removeQuizKeyHandler(); submitExamAnswer('true'); }
        if (k === 'F' || k === 'N') { e.preventDefault(); _removeQuizKeyHandler(); submitExamAnswer('false'); }
      } else if (q.type === 'multi_select') {
        const idx = ['1','2','3','4'].indexOf(k) >= 0 ? +k - 1
                  : ['A','B','C','D'].indexOf(k) >= 0 ? ['A','B','C','D'].indexOf(k)
                  : -1;
        if (idx >= 0 && idx < (q.options?.length ?? 0)) {
          e.preventDefault();
          const cb = document.querySelectorAll('.multi-check')[idx];
          if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        }
        if ((e.key === 'Enter' || e.key === ' ')) {
          const btn = document.getElementById('exam-submit-multi');
          if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
        }
      }
    };
    document.addEventListener('keydown', _quizKeyHandler);
  }
}

function submitExamAnswer(answer) {
  if (!examState) return;
  _removeQuizKeyHandler();
  const q       = examState.session[examState.currentIdx];
  const isRight = _checkAnswer(q, answer);

  examState.results.push({ questionId: q.id, domain: q.domain, correct: isRight, answer, correctAnswer: q.correct_answer });

  const feedback = document.getElementById('exam-feedback');
  if (feedback) {
    feedback.classList.remove('hidden');
    feedback.className = `mt-4 p-3 rounded text-sm ${isRight ? 'bg-green-900 border border-green-700 text-green-200' : 'bg-red-900 border border-red-700 text-red-200'}`;
    feedback.innerHTML = `
      <span class="font-bold">${isRight ? '✓ Correct' : '✗ Incorrect'}</span>
      ${!isRight && q.explanation ? `<p class="mt-1 text-xs opacity-80">${q.explanation}</p>` : ''}`;
  }

  document.querySelectorAll('.exam-option').forEach(b => { b.disabled = true; b.style.pointerEvents = 'none'; });
  if (q.type === 'multi_select') _revealMultiSelect(q, answer);

  examState.currentIdx++;

  if (examState.currentIdx >= examState.session.length) {
    setTimeout(() => { clearInterval(examState.timerId); renderExamSummary(); }, 1200);
  } else {
    setTimeout(() => renderExamQuestion(), 1500);
  }
}

function renderExamSummary() {
  if (!examState) return;
  clearInterval(examState.timerId);

  const results  = examState.results;
  const elapsed  = Math.round((Date.now() - examState.startTime) / 1000);
  const correct  = results.filter(r => r.correct).length;
  const total    = results.length;
  const score    = total > 0 ? Math.round((correct / total) * 100) : 0;

  // Per-domain breakdown
  const domainStats = {};
  results.forEach(r => {
    if (!domainStats[r.domain]) domainStats[r.domain] = { correct: 0, total: 0 };
    domainStats[r.domain].total++;
    if (r.correct) domainStats[r.domain].correct++;
  });

  // Record to store
  store.recordQuizSession({ total, correct, score, mode: 'exam', domainStats });
  store.recordExamRun({ score, correct, total, elapsed, domainStats });

  const domainRows = EXAM_DOMAIN_WEIGHTS.map(({ domain }) => {
    const d   = domainStats[domain] || { correct: 0, total: 0 };
    const pct = d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0;
    return `<div class="flex justify-between text-xs py-1 border-b border-gray-800">
      <span class="text-gray-400">${domain}</span>
      <span class="${pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400'}">${pct}%  (${d.correct}/${d.total})</span>
    </div>`;
  }).join('');

  const view = getView();
  view.innerHTML = `
    <div class="max-w-2xl mx-auto p-6 space-y-5">
      <h2 class="text-yellow-400 font-bold text-xl">Exam Results</h2>

      <div class="bg-gray-900 border ${score >= 70 ? 'border-green-700' : 'border-red-700'} rounded p-6 text-center">
        <div class="text-5xl mb-3">${score >= 70 ? '&#127942;' : '&#128542;'}</div>
        <div class="text-4xl font-bold ${score >= 70 ? 'text-green-400' : 'text-red-400'} mb-1">${score}%</div>
        <div class="text-gray-400 text-sm">${correct} / ${total} correct · ${_formatTime(elapsed)} elapsed</div>
        <div class="text-xs mt-1 ${score >= 70 ? 'text-green-600' : 'text-red-600'}">${score >= 70 ? 'PASS — 70% is the passing threshold' : 'FAIL — 70% required to pass'}</div>
      </div>

      <div class="bg-gray-900 border border-gray-700 rounded p-5">
        <h3 class="text-sm text-gray-400 uppercase tracking-widest mb-3">Score by Domain</h3>
        ${domainRows}
      </div>

      <div class="flex gap-3 justify-center">
        <button id="exam-retry" class="px-5 py-2 bg-yellow-800 hover:bg-yellow-700 text-yellow-200 rounded font-semibold text-sm">Retake Exam</button>
        <button id="exam-stats" class="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm">View Stats Dashboard</button>
      </div>

      <div class="bg-gray-900 border border-gray-700 rounded p-5">
        <h3 class="text-sm text-gray-400 uppercase tracking-widest mb-3">Question Review <span class="text-gray-600 normal-case text-xs">(click to expand)</span></h3>
        <div id="exam-result-list" class="space-y-0.5 max-h-96 overflow-y-auto pr-1">
          ${results.map((r, i) => {
            const q = content?.questions.find(q => q.id === r.questionId);
            const qLabel = q ? (q.question.length > 70 ? q.question.slice(0, 70) + '…' : q.question) : `Q${i+1}`;
            return `
              <div class="result-row border border-gray-800 rounded overflow-hidden" data-idx="${i}">
                <button class="result-toggle w-full flex items-center gap-2 text-left px-3 py-1.5 hover:bg-gray-800 transition-colors">
                  <span class="shrink-0 w-4 text-center ${r.correct ? 'text-green-400' : 'text-red-400'}">${r.correct ? '✓' : '✗'}</span>
                  <span class="text-gray-500 text-xs shrink-0">Q${i+1}</span>
                  <span class="text-gray-300 text-xs truncate flex-1">${qLabel}</span>
                  <span class="result-caret text-gray-600 text-xs shrink-0">▶</span>
                </button>
                <div class="result-detail hidden px-3 pb-3 pt-1 bg-gray-800/40 text-xs">
                  ${_buildReviewDetail(q, r.answer)}
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;

  document.getElementById('exam-result-list')?.addEventListener('click', e => {
    const toggle = e.target.closest('.result-toggle');
    if (!toggle) return;
    const row    = toggle.closest('.result-row');
    const detail = row?.querySelector('.result-detail');
    const caret  = toggle.querySelector('.result-caret');
    if (!detail) return;
    const open = !detail.classList.contains('hidden');
    detail.classList.toggle('hidden', open);
    if (caret) caret.textContent = open ? '▶' : '▼';
  });

  document.getElementById('exam-retry')?.addEventListener('click', () => { examState = null; renderExam(); });
  document.getElementById('exam-stats')?.addEventListener('click', () => switchView('stats'));
}

function _formatTime(seconds) {
  const m = Math.floor(Math.abs(seconds) / 60).toString().padStart(2, '0');
  const s = (Math.abs(seconds) % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function _checkAnswer(q, answer) {
  if (q.type === 'multiple_choice') return String(answer) === String(q.correct_answer);
  if (q.type === 'true_false') return String(answer).toLowerCase() === String(q.correct_answer).toLowerCase();
  if (q.type === 'multi_select') {
    if (!Array.isArray(answer) || !Array.isArray(q.correct_answer)) return false;
    const norm = arr => [...arr].map(String).sort().join(',');
    return norm(answer) === norm(q.correct_answer);
  }
  if (q.type === 'fill_blank') {
    const norm = s => String(s).toLowerCase().trim();
    if (Array.isArray(q.correct_answer)) return q.correct_answer.some(a => norm(a) === norm(answer));
    return norm(answer) === norm(q.correct_answer);
  }
  return false;
}

/**
 * After submitting a multi_select answer, colour-code each option label:
 *   green  = selected + correct
 *   red    = selected + wrong
 *   yellow = not selected + should have been (missed)
 */
function _revealMultiSelect(q, userAnswer) {
  const correct  = new Set(q.correct_answer.map(String));
  const selected = new Set((userAnswer || []).map(String));

  document.querySelectorAll('.multi-label').forEach(label => {
    const idx        = String(label.dataset.idx);
    const inCorrect  = correct.has(idx);
    const inSelected = selected.has(idx);
    label.querySelector('.multi-check').disabled = true;

    if (inCorrect && inSelected) {
      label.classList.replace('border-gray-600', 'border-green-500');
      label.classList.add('bg-green-900/25');
    } else if (!inCorrect && inSelected) {
      label.classList.replace('border-gray-600', 'border-red-500');
      label.classList.add('bg-red-900/20');
    } else if (inCorrect && !inSelected) {
      label.classList.replace('border-gray-600', 'border-yellow-500');
      label.classList.add('bg-yellow-900/20');
    }
  });
  const btn = document.getElementById('submit-multi') || document.getElementById('exam-submit-multi');
  if (btn) btn.disabled = true;
}

// ─── Boss Battle ──────────────────────────────────────────────────────────────

function renderBoss() {
  const state    = store.state;
  const week     = state.currentWeek;
  const bosses   = content.bossBattles.filter(b => b.week <= week);
  const view     = getView();

  view.innerHTML = `
    <div class="max-w-2xl mx-auto p-6 space-y-4">
      <h2 class="text-red-400 font-bold text-xl">Boss Battles</h2>
      ${bosses.map(b => {
        const defeated = state.bossesDefeated.includes(b.id);
        const locked   = state.level < (b.unlockLevel || 1);
        return `<div class="bg-gray-900 border ${defeated ? 'border-green-700' : 'border-red-900'} rounded p-4 flex items-center gap-4">
          <div class="text-5xl">${b.avatar}</div>
          <div class="flex-1">
            <div class="font-bold text-lg ${defeated ? 'text-green-400' : 'text-red-300'}">${b.name}</div>
            <div class="text-sm text-gray-400">${b.description}</div>
            <div class="text-xs text-yellow-400 mt-1">${b.xpReward} XP reward · Week ${b.week}</div>
          </div>
          <button data-boss="${b.id}" class="${locked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-red-700 cursor-pointer'} boss-start-btn px-4 py-2 bg-red-900 border border-red-700 text-red-200 rounded text-sm font-semibold" ${locked ? 'disabled' : ''}>
            ${defeated ? 'Rematch' : locked ? `LVL ${b.unlockLevel} req.` : 'Challenge'}
          </button>
        </div>`;
      }).join('')}
      ${!bosses.length ? '<p class="text-gray-500 text-center py-8">No bosses unlocked yet. Complete Story Mode.</p>' : ''}
      <div id="battle-area" class="hidden"></div>
    </div>`;

  document.querySelectorAll('.boss-start-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      const bossData = content.bossBattles.find(b => b.id === btn.dataset.boss);
      if (bossData) startBossBattle(bossData);
    });
  });
}

function startBossBattle(bossData) {
  boss = new BossBattle(bossData, store);
  boss.start();

  const view = getView();
  view.innerHTML = `
    <div class="max-w-xl mx-auto p-6 space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="text-4xl">${bossData.avatar}</span>
          <div>
            <div class="text-red-300 font-bold">${bossData.name}</div>
            <div class="text-xs text-gray-500">Boss HP</div>
            <div class="w-40 bg-gray-700 rounded-full h-2 mt-1">
              <div id="boss-hp-bar" class="bg-red-500 h-2 rounded-full transition-all" style="width:100%"></div>
            </div>
          </div>
        </div>
        <div>
          <div class="text-xs text-gray-500">Your HP</div>
          <div class="w-32 bg-gray-700 rounded-full h-2 mt-1">
            <div id="player-hp-bar" class="bg-green-500 h-2 rounded-full transition-all" style="width:100%"></div>
          </div>
          <div id="player-hp-text" class="text-xs text-green-400 mt-0.5 text-right">100 HP</div>
        </div>
      </div>

      <div id="boss-phase-banner" class="hidden text-center py-1 text-xs font-bold tracking-widest rounded mb-1"></div>
      <div id="boss-question-area" class="bg-gray-900 border border-gray-800 rounded p-5"></div>

      <div class="flex justify-between gap-2 items-center">
        <div class="flex items-center gap-2">
          <div id="boss-phase-label" class="text-xs text-gray-600 font-mono">Phase: EASY</div>
          <div id="boss-perfect-track" class="text-xs text-yellow-500 hidden">&#11088; Perfect run!</div>
        </div>
        <div class="flex gap-2">
          <button id="boss-hint-btn" class="px-3 py-1.5 text-xs bg-yellow-800 hover:bg-yellow-700 text-yellow-200 rounded">
            Use Hint (${store.state.hints} free / 75 XP)
          </button>
          <div id="boss-timer" class="text-xs text-gray-500 self-center">0s</div>
        </div>
      </div>
    </div>`;

  // Show perfect run tracker at start
  setTimeout(() => {
    document.getElementById('boss-perfect-track')?.classList.remove('hidden');
  }, 100);

  // Sync HP via events
  bus.on('boss:damage', ({ hp }) => {
    const pct = Math.max(0, (hp / 100) * 100);
    document.getElementById('player-hp-bar').style.width = pct + '%';
    document.getElementById('player-hp-text').textContent = `${hp} HP`;
  });
  bus.on('boss:tick', ({ elapsed, bossHp }) => {
    const el = document.getElementById('boss-timer');
    if (el) el.textContent = `${elapsed}s`;
    const bbar = document.getElementById('boss-hp-bar');
    if (bbar) bbar.style.width = bossHp + '%';
  });

  document.getElementById('boss-hint-btn')?.addEventListener('click', () => {
    const result = boss.useHint();
    if (result.success) alert(`Hint: ${result.hint}`);
    else alert(result.message || 'No hints available.');
  });

  renderBossQuestion();
}

function renderBossQuestion() {
  const area = document.getElementById('boss-question-area');
  if (!area || !boss) return;

  const q = boss.currentQuestion;
  if (!q) return;

  area.innerHTML = `
    <p class="text-white font-medium mb-4">${q.question}</p>
    ${q.type === 'multiple_choice' ? `
      <div class="space-y-2">
        ${q.options.map((opt, i) => `
          <button data-answer="${i}" class="boss-answer w-full text-left px-4 py-2.5 border border-gray-600 hover:border-red-500 rounded text-sm text-gray-200 transition-colors">
            <span class="text-gray-500 mr-2">${String.fromCharCode(65+i)}.</span>${opt}
          </button>`).join('')}
      </div>` : `
      <div class="flex gap-2">
        <button data-answer="true"  class="boss-answer flex-1 py-2 border border-gray-600 hover:border-green-500 rounded text-sm text-gray-200">True</button>
        <button data-answer="false" class="boss-answer flex-1 py-2 border border-gray-600 hover:border-red-500 rounded text-sm text-gray-200">False</button>
      </div>`}
    <div id="boss-feedback" class="hidden mt-3 p-2 rounded text-xs"></div>`;

  document.querySelectorAll('.boss-answer').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.boss-answer').forEach(b => { b.disabled = true; b.style.pointerEvents = 'none'; });
      submitBossAnswer(btn.dataset.answer);
    });
  });
}

function submitBossAnswer(answer) {
  if (!boss) return;
  const result = boss.answer(answer);
  const feedback = document.getElementById('boss-feedback');

  if (feedback) {
    feedback.classList.remove('hidden');
    feedback.className = `mt-3 p-2 rounded text-xs ${result.correct ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'}`;
    feedback.textContent = result.feedback || (result.correct ? 'Correct!' : 'Incorrect!');
  }

  // Update perfect-run tracker and phase label
  const perfectEl = document.getElementById('boss-perfect-track');
  if (perfectEl) {
    if (!result.correct) perfectEl.classList.add('hidden');
    else if (boss.wrong === 0) perfectEl.classList.remove('hidden');
  }
  if (result.phaseChanged) _showBossPhaseBanner(result.phase);
  const phaseLabel = document.getElementById('boss-phase-label');
  if (phaseLabel && result.phase) phaseLabel.textContent = `Phase: ${result.phase.toUpperCase()}`;

  if (result.done) {
    setTimeout(() => renderBossEnd(result), 1500);
  } else {
    setTimeout(() => renderBossQuestion(), 1500);
  }
}

function _showBossPhaseBanner(phase) {
  const el = document.getElementById('boss-phase-banner');
  if (!el) return;
  const styles = {
    easy:   'bg-green-900/60 border border-green-700 text-green-300',
    medium: 'bg-yellow-900/60 border border-yellow-700 text-yellow-300',
    hard:   'bg-red-900/60 border border-red-700 text-red-300',
  };
  const labels = { easy: 'PHASE 1 — EASY', medium: 'PHASE 2 — MEDIUM', hard: 'PHASE 3 — HARD (increased damage!)' };
  el.className = `text-center py-1 text-xs font-bold tracking-widest rounded mb-1 ${styles[phase] || ''}`;
  el.textContent = labels[phase] || phase.toUpperCase();
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

function renderBossEnd(result) {
  const view = getView();
  view.innerHTML = `
    <div class="max-w-md mx-auto p-8 text-center">
      <div class="text-6xl mb-4">${result.victory ? '&#127942;' : '&#128128;'}</div>
      <h2 class="text-2xl font-bold ${result.victory ? 'text-green-300' : 'text-red-300'} mb-2">
        ${result.victory ? 'BOSS DEFEATED!' : 'DEFEATED...'}
      </h2>
      <p class="text-gray-400 text-sm mb-2">Score: ${result.finalScore}%  ·  Time: ${result.elapsed}s</p>
      ${result.perfectRun ? '<p class="text-yellow-400 font-bold text-sm mb-1">&#11088; PERFECT RUN! +100 XP Bonus</p>' : ''}
      <div class="flex justify-center gap-3 mt-6">
        <button onclick="window.switchView?.('boss')" class="px-5 py-2 bg-red-900 hover:bg-red-800 border border-red-700 text-red-200 rounded text-sm">Try Again</button>
        <button onclick="window.switchView?.('grind')" class="px-5 py-2 bg-green-800 hover:bg-green-700 text-green-200 rounded text-sm">Back to Grind</button>
      </div>
    </div>`;
}

// ─── Subnetting Tool ──────────────────────────────────────────────────────────

function renderSubnet() {
  const view = getView();
  view.innerHTML = `
    <div class="max-w-2xl mx-auto p-6 space-y-5">
      <div class="flex items-center justify-between">
        <h2 class="text-cyan-400 font-bold text-xl">Subnetting Trainer</h2>
        <div class="flex gap-2">
          <select id="subnet-diff" class="bg-gray-800 border border-gray-600 text-gray-300 rounded px-2 py-1 text-xs">
            <option value="easy">Easy (/24–/28)</option>
            <option value="medium" selected>Medium (/19–/28)</option>
            <option value="hard">Hard (/16–/30)</option>
          </select>
          <button id="new-problem" class="px-4 py-1 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-sm font-semibold">New Problem</button>
        </div>
      </div>

      <div id="subnet-problem" class="bg-gray-900 border border-gray-700 rounded p-5 font-mono">
        <p class="text-gray-500 text-sm text-center">Press "New Problem" to begin.</p>
      </div>

      <div id="subnet-results" class="hidden space-y-1 text-sm font-mono"></div>
    </div>`;

  document.getElementById('new-problem')?.addEventListener('click', generateSubnetProblem);
}

function generateSubnetProblem() {
  const diff    = document.getElementById('subnet-diff')?.value || 'medium';
  const problem = generateIPv4Problem(diff);
  const panel   = document.getElementById('subnet-problem');
  if (!panel) return;

  panel.dataset.problem = JSON.stringify(problem);

  const fields = [
    { key: 'networkId',    label: 'Network ID' },
    { key: 'subnetMask',   label: 'Subnet Mask' },
    { key: 'broadcast',    label: 'Broadcast Address' },
    { key: 'firstUsable',  label: 'First Usable Host' },
    { key: 'lastUsable',   label: 'Last Usable Host' },
    { key: 'totalHosts',   label: 'Total Usable Hosts' },
  ];

  panel.innerHTML = `
    <div class="text-center mb-5">
      <div class="text-yellow-400 text-xs uppercase tracking-widest mb-1">Given Address</div>
      <div class="text-white text-3xl font-bold">${problem.notation}</div>
      ${store.hasItem('subnet_calc_pro') ? `<div class="text-cyan-400 text-xs mt-1">🔬 Subnet Calc Pro: /${problem.cidr} = ${problem.answers.subnetMask}</div>` : ''}
    </div>
    <div class="space-y-3">
      ${fields.map(f => `
        <div class="flex items-center gap-3">
          <label class="w-40 text-gray-400 text-xs text-right shrink-0">${f.label}:</label>
          <input type="text" data-field="${f.key}" autocomplete="off" spellcheck="false"
            class="subnet-input flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1 text-white text-sm outline-none focus:border-cyan-500 transition-colors"
            placeholder="e.g. ${f.key === 'totalHosts' ? '254' : '0.0.0.0'}">
        </div>`).join('')}
    </div>
    <div class="flex justify-between mt-5">
      <button id="subnet-hint-btn" class="px-3 py-1.5 text-xs bg-yellow-800 hover:bg-yellow-700 text-yellow-200 rounded">Hint</button>
      <button id="subnet-submit" class="px-5 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white rounded font-semibold text-sm">Check Answers</button>
    </div>`;

  let hintIdx = 0;
  document.getElementById('subnet-hint-btn')?.addEventListener('click', () => {
    if (store.useHint()) {
      alert(`Hint ${hintIdx + 1}: ${problem.hints[hintIdx % problem.hints.length]}`);
      hintIdx++;
    } else {
      alert('Not enough hints or XP.');
    }
  });

  document.getElementById('subnet-submit')?.addEventListener('click', () => checkSubnetAnswers(problem));
}

function checkSubnetAnswers(problem) {
  const inputs   = {};
  document.querySelectorAll('.subnet-input').forEach(i => { inputs[i.dataset.field] = i.value; });
  const result   = validateIPv4(inputs, problem.answers);
  const resultsEl = document.getElementById('subnet-results');
  if (!resultsEl) return;

  resultsEl.classList.remove('hidden');
  resultsEl.innerHTML = `
    <div class="font-bold text-lg ${result.pass ? 'text-green-400' : 'text-red-400'} mb-2">
      ${result.pass ? `PERFECT! +${result.passed * 5} XP` : `${result.passed}/${result.total} correct`}
    </div>`;

  document.querySelectorAll('.subnet-input').forEach(input => {
    const field = input.dataset.field;
    const err   = result.errors[field];
    if (!err) {
      input.classList.add('border-green-500');
    } else {
      input.classList.add('border-red-500');
      const hint = document.createElement('div');
      hint.className = 'text-red-400 text-xs mt-0.5';
      hint.textContent = `Expected: ${err.expected}`;
      input.parentElement?.appendChild(hint);
    }
  });

  if (result.pass) {
    store.addXP(result.passed * 5, 'subnetting');
    store.unlockAchievement('subnet_ace', 'Subnet Ace');
  }
}

// ─── Flashcards ───────────────────────────────────────────────────────────────

/** Derive a human-readable answer string from a question object. */
function _flashAnswer(q) {
  if (q.type === 'multiple_choice') {
    const idx = parseInt(q.correct_answer, 10);
    return q.options?.[idx] ?? String(q.correct_answer);
  }
  if (q.type === 'true_false') {
    return String(q.correct_answer).charAt(0).toUpperCase() + String(q.correct_answer).slice(1).toLowerCase();
  }
  if (q.type === 'multi_select') {
    const ans = Array.isArray(q.correct_answer) ? q.correct_answer : [q.correct_answer];
    return ans.map(i => q.options?.[parseInt(i, 10)] ?? i).join(' · ');
  }
  if (q.type === 'drag_drop' || q.type === 'ordering') {
    const ans = Array.isArray(q.correct_answer) ? q.correct_answer : [q.correct_answer];
    return ans.join(' → ');
  }
  return Array.isArray(q.correct_answer) ? q.correct_answer.join(' / ') : String(q.correct_answer);
}

function renderFlash() {
  flashState = null;
  const view = getView();
  const domains = QuizEngine.domainsFrom(content.questions);

  view.innerHTML = `
    <style>
      .fc-inner { transition: transform 0.38s cubic-bezier(.4,0,.2,1); transform-style: preserve-3d; }
      .fc-inner.flipped { transform: rotateY(180deg); }
      .fc-front, .fc-back { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
      .fc-back { transform: rotateY(180deg); }
      @keyframes swipe-right { to { transform: translateX(120%) rotate(8deg); opacity:0; } }
      @keyframes swipe-left  { to { transform: translateX(-120%) rotate(-8deg); opacity:0; } }
      .swipe-right { animation: swipe-right 0.3s ease forwards; }
      .swipe-left  { animation: swipe-left  0.3s ease forwards; }
    </style>
    <div class="max-w-xl mx-auto p-6 space-y-5">
      <div class="flex items-center justify-between">
        <h2 class="text-purple-400 font-bold text-xl">Flashcards</h2>
        <span class="text-xs text-gray-600">Tap card to flip · ← / → to rate</span>
      </div>

      <div class="bg-gray-900 border border-gray-700 rounded p-4 space-y-3">
        <div class="grid grid-cols-2 gap-3 text-xs">
          <div class="space-y-1">
            <label class="text-gray-500">Domain</label>
            <select id="flash-domain" class="w-full bg-gray-800 border border-gray-600 text-gray-300 rounded px-2 py-1.5">
              <option value="all">All Domains</option>
              ${domains.map(d => `<option value="${d}">${d}</option>`).join('')}
            </select>
          </div>
          <div class="space-y-1">
            <label class="text-gray-500">Week</label>
            <select id="flash-week" class="w-full bg-gray-800 border border-gray-600 text-gray-300 rounded px-2 py-1.5">
              <option value="all">All Weeks</option>
              ${[1,2,3,4,5,6].map(w => `<option value="${w}">Week ${w}</option>`).join('')}
            </select>
          </div>
          <div class="space-y-1">
            <label class="text-gray-500">Show</label>
            <select id="flash-show" class="w-full bg-gray-800 border border-gray-600 text-gray-300 rounded px-2 py-1.5">
              <option value="all">All Questions</option>
              <option value="due">SRS Due</option>
              <option value="flagged">Flagged</option>
              <option value="mistakes">Mistake Notebook</option>
            </select>
          </div>
          <div class="space-y-1">
            <label class="text-gray-500">Session Size</label>
            <select id="flash-count" class="w-full bg-gray-800 border border-gray-600 text-gray-300 rounded px-2 py-1.5">
              <option value="10">10 cards</option>
              <option value="20" selected>20 cards</option>
              <option value="50">50 cards</option>
            </select>
          </div>
        </div>
        <button id="flash-start" class="w-full py-2.5 bg-purple-800 hover:bg-purple-700 text-purple-200 rounded font-semibold text-sm transition-colors">
          Start Session
        </button>
      </div>

      <div id="flash-area" class="hidden"></div>
    </div>`;

  document.getElementById('flash-start')?.addEventListener('click', startFlash);
}

function startFlash() {
  const domain  = document.getElementById('flash-domain')?.value || 'all';
  const week    = document.getElementById('flash-week')?.value || 'all';
  const show    = document.getElementById('flash-show')?.value || 'all';
  const count   = parseInt(document.getElementById('flash-count')?.value || '20', 10);

  let pool = content.questions.filter(q => q.type !== 'cli_lab' && q.type !== 'drag_drop' && q.type !== 'ordering');
  if (domain !== 'all') pool = pool.filter(q => q.domain === domain);
  if (week   !== 'all') pool = pool.filter(q => q.week == week);

  if (show === 'due') {
    const now = Date.now();
    const srs = store.state.reviewSchedule || {};
    pool = pool.filter(q => { const e = srs[q.id]; return !e || e.dueDate <= now; });
  } else if (show === 'flagged') {
    const flags = store.getFlaggedIds();
    pool = pool.filter(q => flags.includes(q.id));
  } else if (show === 'mistakes') {
    const mistakes = store.getMistakeIds(1);
    pool = pool.filter(q => mistakes.includes(q.id));
  }

  // Shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const cards = pool.slice(0, count);

  if (!cards.length) {
    document.getElementById('flash-area').innerHTML =
      '<p class="text-center text-gray-500 text-sm py-8">No cards match the selected filters.</p>';
    document.getElementById('flash-area').classList.remove('hidden');
    return;
  }

  flashState = { cards, currentIdx: 0, results: [], flipped: false, pointerStartX: null };
  document.querySelector('.bg-gray-900.border.border-gray-700')?.classList.add('hidden');
  document.getElementById('flash-area').classList.remove('hidden');
  renderFlashCard();
}

function renderFlashCard() {
  const area = document.getElementById('flash-area');
  if (!area || !flashState) return;

  const { cards, currentIdx } = flashState;
  if (currentIdx >= cards.length) { renderFlashSummary(); return; }

  const q    = cards[currentIdx];
  const ans  = _flashAnswer(q);
  const prog = `${currentIdx + 1} / ${cards.length}`;
  const srsState = store.getSRSState(q.id);
  const srsBadge = {
    new:      '<span class="px-1.5 py-0.5 rounded text-[10px] bg-cyan-900 text-cyan-300 border border-cyan-700">NEW</span>',
    due:      '<span class="px-1.5 py-0.5 rounded text-[10px] bg-yellow-900 text-yellow-300 border border-yellow-700">DUE</span>',
    learning: '<span class="px-1.5 py-0.5 rounded text-[10px] bg-blue-900 text-blue-300 border border-blue-700">LEARNING</span>',
    mastered: '<span class="px-1.5 py-0.5 rounded text-[10px] bg-green-900 text-green-400 border border-green-700">MASTERED</span>',
  }[srsState] || '';

  flashState.flipped = false;

  area.innerHTML = `
    <div class="space-y-4">
      <!-- Progress bar -->
      <div class="flex items-center gap-2 text-xs text-gray-500">
        <span>${prog}</span>
        <div class="flex-1 bg-gray-800 rounded-full h-1">
          <div class="bg-purple-500 h-1 rounded-full" style="width:${(currentIdx / cards.length) * 100}%"></div>
        </div>
        ${srsBadge}
      </div>

      <!-- 3D flip card -->
      <div id="flash-card-wrap" class="relative" style="perspective:1200px; min-height:240px; cursor:pointer">
        <div id="flash-card-inner" class="fc-inner relative w-full" style="min-height:240px">

          <!-- Front -->
          <div class="fc-front absolute inset-0 bg-gray-900 border border-purple-800 rounded-xl p-6 flex flex-col justify-between">
            <div>
              <div class="text-[10px] text-gray-600 uppercase tracking-widest mb-2">${q.domain} · ${q.type.replace('_', ' ')}</div>
              <p class="text-white text-base leading-relaxed font-medium">${q.question}</p>
            </div>
            <p class="text-center text-xs text-gray-600 mt-4">Tap to reveal answer · Space</p>
          </div>

          <!-- Back -->
          <div class="fc-back absolute inset-0 bg-gray-900 border border-cyan-800 rounded-xl p-6 flex flex-col justify-between">
            <div>
              <div class="text-[10px] text-gray-600 uppercase tracking-widest mb-1">Answer</div>
              <p class="text-cyan-300 text-base font-semibold leading-relaxed mb-3">${ans}</p>
              ${q.explanation ? `<p class="text-gray-400 text-sm leading-relaxed border-t border-gray-800 pt-3">${q.explanation}</p>` : ''}
            </div>
            <div class="flex gap-3 mt-4">
              <button id="flash-missed" class="flex-1 py-2.5 bg-red-900 hover:bg-red-700 border border-red-700 text-red-200 rounded-lg font-semibold text-sm transition-colors">
                ✗ Missed  ←
              </button>
              <button id="flash-got" class="flex-1 py-2.5 bg-green-900 hover:bg-green-700 border border-green-700 text-green-200 rounded-lg font-semibold text-sm transition-colors">
                ✓ Got It  →
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="text-center text-xs text-gray-700">Space = flip · ← Missed · → Got It</div>
    </div>`;

  // Flip on card click/tap
  document.getElementById('flash-card-wrap')?.addEventListener('click', e => {
    if (e.target.closest('#flash-missed') || e.target.closest('#flash-got')) return;
    _flipCard();
  });

  // Rate buttons
  document.getElementById('flash-missed')?.addEventListener('click', () => _rateCard(false));
  document.getElementById('flash-got')?.addEventListener('click',    () => _rateCard(true));

  // Pointer Events swipe (mobile + desktop)
  const wrap = document.getElementById('flash-card-wrap');
  if (wrap) {
    wrap.addEventListener('pointerdown', e => { flashState.pointerStartX = e.clientX; });
    wrap.addEventListener('pointerup',   e => {
      if (flashState.pointerStartX === null) return;
      const dx = e.clientX - flashState.pointerStartX;
      flashState.pointerStartX = null;
      if (!flashState.flipped) return; // only rate when card is flipped
      if (Math.abs(dx) < 60) return;
      _rateCard(dx > 0);
    });
  }

  // Keyboard shortcuts — attach fresh handler
  _removeQuizKeyHandler();
  _quizKeyHandler = e => {
    if (document.activeElement?.tagName === 'INPUT') return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); _flipCard(); }
    if (e.key === 'ArrowRight' && flashState?.flipped) { e.preventDefault(); _rateCard(true); }
    if (e.key === 'ArrowLeft'  && flashState?.flipped) { e.preventDefault(); _rateCard(false); }
  };
  document.addEventListener('keydown', _quizKeyHandler);
}

function _flipCard() {
  if (!flashState) return;
  flashState.flipped = !flashState.flipped;
  document.getElementById('flash-card-inner')?.classList.toggle('flipped', flashState.flipped);
}

function _rateCard(correct) {
  if (!flashState) return;
  if (!flashState.flipped) { _flipCard(); return; } // flip first if not yet revealed
  _removeQuizKeyHandler();

  const q = flashState.cards[flashState.currentIdx];
  store.updateSRS(q.id, correct);
  flashState.results.push({ questionId: q.id, correct });

  // Animate swipe off
  const inner = document.getElementById('flash-card-inner');
  if (inner) {
    inner.classList.add(correct ? 'swipe-right' : 'swipe-left');
    setTimeout(() => {
      flashState.currentIdx++;
      renderFlashCard();
    }, 280);
  } else {
    flashState.currentIdx++;
    renderFlashCard();
  }
}

function renderFlashSummary() {
  const area = document.getElementById('flash-area');
  if (!area || !flashState) return;
  _removeQuizKeyHandler();

  const { results, cards } = flashState;
  const gotIt  = results.filter(r => r.correct).length;
  const missed = results.length - gotIt;
  const pct    = results.length > 0 ? Math.round((gotIt / results.length) * 100) : 0;

  area.innerHTML = `
    <div class="bg-gray-900 border border-purple-800 rounded-xl p-6 text-center space-y-4">
      <div class="text-4xl">${pct >= 80 ? '⚡' : pct >= 60 ? '📖' : '💡'}</div>
      <div class="text-3xl font-bold font-mono ${pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400'}">${pct}%</div>
      <div class="flex justify-center gap-8 text-sm">
        <div><span class="text-green-400 font-bold text-xl">${gotIt}</span><div class="text-gray-500 text-xs">Got It</div></div>
        <div><span class="text-red-400 font-bold text-xl">${missed}</span><div class="text-gray-500 text-xs">Missed</div></div>
        <div><span class="text-gray-300 font-bold text-xl">${cards.length}</span><div class="text-gray-500 text-xs">Total</div></div>
      </div>
      <p class="text-xs text-gray-600">SRS updated for all ${results.length} rated cards.</p>
      <div class="flex gap-3 justify-center pt-2">
        <button id="flash-again" class="px-5 py-2 bg-purple-800 hover:bg-purple-700 text-purple-200 rounded font-semibold text-sm">Study Again</button>
        <button id="flash-back"  class="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm">New Session</button>
      </div>
    </div>`;

  document.getElementById('flash-again')?.addEventListener('click', () => {
    // Re-shuffle the same card set and restart
    const cards = flashState.cards;
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    flashState = { cards, currentIdx: 0, results: [], flipped: false, pointerStartX: null };
    renderFlashCard();
  });
  document.getElementById('flash-back')?.addEventListener('click', () => { flashState = null; renderFlash(); });
}

// ─── Concept Reference Library ────────────────────────────────────────────────

function renderReference() {
  const view = getView();

  const T = (h, rows, cls='') => `
    <div class="overflow-x-auto"><table class="w-full text-xs ${cls}">
      <thead><tr>${h.map(c=>`<th class="text-left text-gray-500 font-semibold py-1 pr-3 border-b border-gray-700">${c}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r=>`<tr class="border-b border-gray-800">${r.map((c,i)=>`<td class="py-1 pr-3 ${i===0?'text-cyan-300 font-mono':i===1?'text-gray-300':'text-gray-500'}">${c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;

  const sections = [
    {
      id: 'cidr', title: 'Subnetting & CIDR',
      content: T(
        ['CIDR','Subnet Mask','Block Size','Hosts/Subnet','Subnets from /24'],
        [
          ['/8', '255.0.0.0','N/A','16,777,214','—'],
          ['/16','255.255.0.0','N/A','65,534','—'],
          ['/24','255.255.255.0','256','254','1'],
          ['/25','255.255.255.128','128','126','2'],
          ['/26','255.255.255.192','64','62','4'],
          ['/27','255.255.255.224','32','30','8'],
          ['/28','255.255.255.240','16','14','16'],
          ['/29','255.255.255.248','8','6','32'],
          ['/30','255.255.255.252','4','2','64  ← point-to-point'],
          ['/31','255.255.255.254','2','0 (RFC 3021 p2p)','128'],
          ['/32','255.255.255.255','1','host route','256'],
        ]
      ) + `<div class="mt-3 text-xs text-gray-600 space-y-0.5">
        <p>Usable hosts = 2<sup>host bits</sup> − 2 &nbsp;·&nbsp; Network ID = first addr &nbsp;·&nbsp; Broadcast = last addr</p>
        <p>Wildcard mask = 255.255.255.255 − subnet mask &nbsp;·&nbsp; Magic number = block size</p>
      </div>`
    },
    {
      id: 'ports', title: 'Well-Known Ports',
      content: T(
        ['Port','Protocol','Transport','Description'],
        [
          ['20','FTP Data','TCP','File transfer data channel'],
          ['21','FTP Control','TCP','File transfer commands'],
          ['22','SSH','TCP','Secure shell / SFTP / SCP'],
          ['23','Telnet','TCP','Unencrypted remote CLI'],
          ['25','SMTP','TCP','Email sending'],
          ['49','TACACS+','TCP','Cisco AAA'],
          ['53','DNS','TCP/UDP','Name resolution (TCP for zone transfers)'],
          ['67','DHCP Server','UDP','Server listens'],
          ['68','DHCP Client','UDP','Client listens'],
          ['69','TFTP','UDP','Trivial file transfer'],
          ['80','HTTP','TCP','Web (unencrypted)'],
          ['88','EIGRP','IP proto 88','Cisco routing (not a port)'],
          ['89','OSPF','IP proto 89','Link-state routing (not a port)'],
          ['110','POP3','TCP','Email retrieval'],
          ['123','NTP','UDP','Time sync'],
          ['143','IMAP','TCP','Email retrieval (keep on server)'],
          ['161','SNMP','UDP','Queries to agent'],
          ['162','SNMP Trap','UDP','Agent → manager notifications'],
          ['179','BGP','TCP','Border Gateway Protocol'],
          ['389','LDAP','TCP/UDP','Directory services'],
          ['443','HTTPS','TCP','Web (TLS encrypted)'],
          ['445','SMB','TCP','Windows file sharing'],
          ['500','ISAKMP/IKE','UDP','VPN key exchange'],
          ['514','Syslog','UDP','Log messages'],
          ['520','RIP','UDP','Routing Information Protocol'],
          ['1812','RADIUS Auth','UDP','Authentication'],
          ['1813','RADIUS Acct','UDP','Accounting'],
          ['3389','RDP','TCP','Remote Desktop Protocol'],
          ['5060','SIP','TCP/UDP','VoIP signaling'],
        ]
      )
    },
    {
      id: 'osi', title: 'OSI vs TCP/IP Model',
      content: T(
        ['OSI Layer','TCP/IP Layer','PDU','Key Protocols'],
        [
          ['7 — Application','Application','Data','HTTP, HTTPS, DNS, DHCP, FTP, SSH, SNMP, SMTP'],
          ['6 — Presentation','Application','Data','SSL/TLS, JPEG, ASCII encoding'],
          ['5 — Session','Application','Data','NetBIOS, RPC'],
          ['4 — Transport','Transport','Segment (TCP) / Datagram (UDP)','TCP, UDP'],
          ['3 — Network','Internet','Packet','IP, ICMP, OSPF, EIGRP, BGP'],
          ['2 — Data Link','Network Access','Frame','Ethernet, 802.11, ARP, PPP, HDLC'],
          ['1 — Physical','Network Access','Bits','Cables, hubs, repeaters, NIC'],
        ]
      ) + `<div class="mt-3 text-xs text-gray-500 space-y-0.5">
        <p><span class="text-cyan-300">TCP:</span> connection-oriented · 3-way handshake (SYN→SYN-ACK→ACK) · reliable, ordered, flow control</p>
        <p><span class="text-cyan-300">UDP:</span> connectionless · no handshake · best-effort · low overhead · used by DNS, DHCP, TFTP, VoIP, streaming</p>
      </div>`
    },
    {
      id: 'routing', title: 'Routing Protocol Comparison',
      content: T(
        ['Protocol','Type','Admin Distance','Algorithm','Metric','Timers'],
        [
          ['Directly Connected','—','0','—','—','—'],
          ['Static Route','—','1','—','—','—'],
          ['eBGP','Path Vector','20','Best-path selection','AS path, weight, MED, local pref…','60s keepalive / 180s hold'],
          ['EIGRP (internal)','Advanced DV','90','DUAL','BW + Delay (K-values)','Hello 5s / Hold 15s (LAN)'],
          ['OSPF','Link State','110','Dijkstra (SPF)','Cost = ref BW / iface BW (ref: 100 Mbps default)','Hello 10s / Dead 40s (broadcast)'],
          ['IS-IS','Link State','115','Dijkstra','Metric (default 10/interface)','—'],
          ['RIP v2','Distance Vector','120','Bellman-Ford','Hop count (max 15; 16=unreachable)','Update 30s / Invalid 180s / Flush 240s'],
          ['EIGRP (external)','—','170','—','—','—'],
          ['iBGP','—','200','—','—','—'],
        ]
      ) + `<div class="mt-3 text-xs text-gray-500 space-y-0.5">
        <p>OSPF cost = 100,000,000 ÷ BW(bps). FastEthernet = cost 1; Serial (1.544 Mbps) = cost 64.</p>
        <p>EIGRP feasibility condition: RD of successor must be &lt; FD of current best path.</p>
      </div>`
    },
    {
      id: 'stp', title: 'STP — States, Roles & Timers',
      content: `<div class="space-y-3">` +
        T(['Port State','Sends BPDUs','Learns MACs','Forwards Traffic','Duration'],
          [
            ['Disabled','No','No','No','Admin shutdown'],
            ['Blocking','No','No','No','Max Age: 20s'],
            ['Listening','Yes','No','No','Forward Delay: 15s'],
            ['Learning','Yes','Yes','No','Forward Delay: 15s'],
            ['Forwarding','Yes','Yes','Yes','Until topology change'],
          ]
        ) +
        `<div class="mt-3">` +
        T(['Port Role','Description'],
          [
            ['Root Port','One per non-root switch; lowest-cost path to root bridge'],
            ['Designated Port','One per segment; forwards traffic toward root; on root bridge = all ports'],
            ['Non-Designated','Blocked; no forwarding; prevents loops'],
            ['PortFast','Skips Listening/Learning (access ports only); use with BPDU Guard'],
          ]) +
        `</div><div class="mt-3">` +
        T(['STP Variant','Standard','Speed','Notes'],
          [
            ['802.1D (STP)','IEEE','Slow (~50s)','Original; one instance for all VLANs'],
            ['802.1w (RSTP)','IEEE','Fast (<1s)','Rapid convergence; proposal/agreement'],
            ['PVST+','Cisco','Slow','Per-VLAN STP; uses 802.1D'],
            ['Rapid PVST+','Cisco','Fast','Per-VLAN RSTP; Cisco default'],
            ['802.1s (MST)','IEEE','Fast','Maps multiple VLANs to instances'],
          ]) +
        `</div><div class="mt-2 text-xs text-gray-500 space-y-0.5">
          <p>Root Bridge election: lowest Bridge ID = Priority (default 32768) + VLAN ID + lowest MAC.</p>
          <p>Total STP convergence: Max Age (20s) + 2×Forward Delay (30s) = ~50s.</p>
        </div></div>`
    },
    {
      id: 'ospf', title: 'OSPF LSA Types & Area Types',
      content: T(['LSA Type','Generated By','Scope','Description'],
        [
          ['Type 1 — Router','Every router','Within area','Describes router links; every router creates one'],
          ['Type 2 — Network','DR (multi-access)','Within area','Describes routers on multi-access segment'],
          ['Type 3 — Summary','ABR','Inter-area','Advertises networks between areas'],
          ['Type 4 — ASBR Summary','ABR','Inter-area','Tells other areas how to reach ASBR'],
          ['Type 5 — AS External','ASBR','Entire OSPF domain','External routes; blocked in stub/totally stubby'],
          ['Type 7 — NSSA External','ASBR in NSSA','NSSA area only','Like Type 5 but for NSSA; ABR converts to Type 5'],
        ]
      ) + `<div class="mt-3">` +
      T(['Area Type','Receives LSA Types','Default Route','Use Case'],
        [
          ['Backbone (Area 0)','1,2,3,4,5','No auto','All inter-area traffic transits here'],
          ['Standard','1,2,3,4,5','No','Normal area'],
          ['Stub','1,2,3','Yes (ABR injects)','No external routes; small spoke sites'],
          ['Totally Stubby','1,2','Yes (ABR injects)','No inter-area or external; Cisco-only'],
          ['NSSA','1,2,3,7','Optional','Has ASBR but no Type 5; uses Type 7'],
        ]
      ) + `</div>`
    },
    {
      id: 'ipv6', title: 'IPv6 Address Types',
      content: T(['Type','Prefix','Scope','Notes'],
        [
          ['Global Unicast','2000::/3','Global (internet)','Like public IPv4; routable everywhere'],
          ['Link-Local','FE80::/10','Link only','Required on all IPv6 interfaces; never routed'],
          ['Unique Local','FC00::/7 (FD00::/8)','Organisation','Like RFC 1918 private; not routed on internet'],
          ['Loopback','::1/128','Host','Like 127.0.0.1'],
          ['Unspecified','::/128','—','Source before address assigned'],
          ['Multicast','FF00::/8','Varies','Replaces broadcast; FF02::1=all nodes, FF02::2=all routers'],
          ['Anycast','From unicast space','—','Same addr on multiple interfaces; nearest responds'],
        ]
      ) + `<div class="mt-3">` +
      T(['Multicast Address','Group'],
        [
          ['FF02::1','All nodes (link-local)'],
          ['FF02::2','All routers (link-local)'],
          ['FF02::5','OSPF all routers'],
          ['FF02::6','OSPF DRs/BDRs'],
          ['FF02::9','RIPng routers'],
          ['FF02::A','EIGRP routers'],
          ['FF02::1:FF xx:xxxx','Solicited-node (NDP)'],
        ]
      ) + `</div><div class="mt-2 text-xs text-gray-500 space-y-0.5">
        <p>EUI-64: split 48-bit MAC at middle → insert FF:FE → flip bit 7 (Universal/Local bit).</p>
        <p>SLAAC: host uses RA prefix + EUI-64 (or random). Stateless; no server needed.</p>
        <p>DHCPv6: stateful (full config) or stateless (extra options only; SLAAC for address).</p>
      </div>`
    },
    {
      id: 'fhrp', title: 'HSRP / VRRP / GLBP',
      content: T(
        ['Feature','HSRP','VRRP','GLBP'],
        [
          ['Standard','Cisco proprietary','RFC 5798 (open)','Cisco proprietary'],
          ['Roles','Active + Standby','Master + Backup(s)','AVG + up to 4 AVFs'],
          ['Load Balancing','No (active/standby)','No','Yes — up to 4 routers share traffic'],
          ['Virtual IP','Separate from real IPs','Can use real IP of master','Separate from real IPs'],
          ['Default Priority','100','100','100'],
          ['Preemption','Disabled by default','Enabled by default','Disabled by default'],
          ['Hello/Hold Timers','3s / 10s','1s / 3s','3s / 10s'],
          ['Multicast (v1)','224.0.0.2','224.0.0.18','224.0.0.102'],
          ['Multicast (v2)','224.0.0.102','224.0.0.18','224.0.0.102'],
          ['Virtual MAC prefix','00:00:0C:07:AC:xx','00:00:5E:00:01:xx','00:07:B4:00:01:xx'],
        ]
      ) + `<div class="mt-2 text-xs text-gray-500">HSRP v2 supports IPv6 and uses 224.0.0.102. GLBP AVG = Active Virtual Gateway; AVF = Active Virtual Forwarder.</div>`
    },
    {
      id: 'snmp', title: 'SNMP Versions',
      content: T(
        ['Feature','SNMPv1','SNMPv2c','SNMPv3'],
        [
          ['Security model','Community string','Community string','User-based (USM)'],
          ['Authentication','None (plaintext)','None (plaintext)','MD5 or SHA'],
          ['Encryption','None','None','DES or AES'],
          ['Message integrity','None','None','HMAC'],
          ['Bulk retrieval','No','GetBulk','GetBulk'],
          ['Inform messages','No','Yes','Yes'],
          ['Error handling','Basic','Improved codes','Improved codes'],
          ['RFC','1157','1901–1908','3411–3418'],
        ]
      ) + `<div class="mt-3">` +
      T(['SNMPv3 Security Level','Auth','Encrypt'],
        [
          ['noAuthNoPriv','No','No'],
          ['authNoPriv','Yes (MD5/SHA)','No'],
          ['authPriv','Yes (MD5/SHA)','Yes (DES/AES)'],
        ]
      ) + `</div><div class="mt-2 text-xs text-gray-500">
        Ports: 161 UDP (agent queries) · 162 UDP (traps/informs). Components: Manager (NMS), Agent, MIB.
      </div>`
    },
    {
      id: 'aaa', title: 'AAA / TACACS+ / RADIUS',
      content: `<div class="text-xs text-gray-400 mb-3">
        <span class="text-cyan-300">AAA</span> = Authentication (who are you?) · Authorization (what can you do?) · Accounting (what did you do?)
      </div>` +
      T(
        ['Feature','TACACS+','RADIUS'],
        [
          ['Standard','Cisco proprietary','Open standard (RFC 2865/2866)'],
          ['Transport','TCP port 49','UDP ports 1812 (auth) / 1813 (acct)'],
          ['Packet encryption','Entire packet encrypted','Password field only encrypted'],
          ['Auth + Authz','Separated (flexible)','Combined in Access-Accept'],
          ['Primary use','Device administration (CLI)','Network access (VPN, 802.1X, dial-up)'],
          ['Accounting','Full support','Full support'],
          ['Multiprotocol','Yes','Limited'],
        ]
      ) + `<div class="mt-3 text-xs text-gray-500 space-y-0.5">
        <p>802.1X (port-based NAC): Supplicant (client) → Authenticator (switch) → Authentication Server (RADIUS).</p>
        <p>EAP: Extensible Authentication Protocol — carried inside RADIUS for 802.1X.</p>
      </div>`
    },
    {
      id: 'cli', title: 'CLI Command Quick-Reference',
      content: [
        ['Interfaces', [
          ['interface &lt;type&gt; &lt;slot/port&gt;','Enter interface config mode (e.g. int g0/0)'],
          ['ip address &lt;ip&gt; &lt;mask&gt;','Assign IPv4 address'],
          ['ipv6 address &lt;prefix&gt;/&lt;len&gt; [eui-64]','Assign IPv6 address'],
          ['no shutdown','Enable interface'],
          ['description &lt;text&gt;','Label the interface'],
          ['show interfaces','Detailed stats per interface'],
          ['show ip interface brief','One-line status per interface'],
        ]],
        ['VLANs & Trunking', [
          ['vlan &lt;id&gt; / name &lt;name&gt;','Create VLAN and name it (global or VLAN DB mode)'],
          ['switchport mode access|trunk','Set port mode'],
          ['switchport access vlan &lt;id&gt;','Assign port to VLAN'],
          ['switchport trunk allowed vlan &lt;list&gt;','Permit VLANs on trunk'],
          ['switchport trunk encapsulation dot1q','Set 802.1Q (required on some platforms)'],
          ['show vlan brief','VLAN list and port assignments'],
          ['show interfaces trunk','Active trunks and allowed VLANs'],
        ]],
        ['Routing', [
          ['ip route &lt;net&gt; &lt;mask&gt; &lt;next-hop|exit-int&gt;','Static route'],
          ['router ospf &lt;pid&gt; / network &lt;ip&gt; &lt;wc&gt; area &lt;id&gt;','Enable OSPF'],
          ['router eigrp &lt;asn&gt; / network &lt;ip&gt; &lt;wc&gt;','Enable EIGRP'],
          ['router rip / version 2 / network &lt;ip&gt; / no auto-summary','Enable RIPv2'],
          ['show ip route','IP routing table'],
          ['show ip ospf neighbor','OSPF adjacency table'],
          ['show ip eigrp neighbors','EIGRP neighbor table'],
          ['show ip bgp summary','BGP peer summary'],
        ]],
        ['ACLs', [
          ['access-list &lt;1-99&gt; permit|deny &lt;ip&gt; &lt;wc&gt;','Standard ACL (src only)'],
          ['access-list &lt;100-199&gt; permit|deny &lt;proto&gt; &lt;src&gt; &lt;dst&gt;','Extended ACL'],
          ['ip access-list extended &lt;name&gt;','Named extended ACL'],
          ['ip access-group &lt;acl&gt; in|out','Apply ACL to interface'],
          ['show access-lists','View all ACLs and hit counts'],
        ]],
        ['NAT', [
          ['ip nat inside / ip nat outside','Mark interface as inside/outside NAT'],
          ['ip nat inside source static &lt;local&gt; &lt;global&gt;','Static NAT'],
          ['ip nat inside source list &lt;acl&gt; interface &lt;int&gt; overload','PAT (NAT overload)'],
          ['ip nat inside source list &lt;acl&gt; pool &lt;name&gt;','Dynamic NAT pool'],
          ['show ip nat translations','Active NAT table'],
        ]],
        ['DHCP', [
          ['ip dhcp excluded-address &lt;start&gt; [end]','Reserve addresses'],
          ['ip dhcp pool &lt;name&gt;','Create pool'],
          ['network &lt;ip&gt; &lt;mask&gt;','Pool subnet'],
          ['default-router &lt;ip&gt;','Gateway for clients'],
          ['dns-server &lt;ip&gt;','DNS for clients'],
          ['show ip dhcp binding','Active leases'],
          ['ip helper-address &lt;ip&gt;','DHCP relay on interface'],
        ]],
        ['STP & Port Security', [
          ['spanning-tree vlan &lt;id&gt; priority &lt;0-61440&gt;','Set STP priority (increments of 4096)'],
          ['spanning-tree portfast','Skip L/L states (access ports)'],
          ['spanning-tree bpduguard enable','Err-disable if BPDU received on PortFast port'],
          ['switchport port-security maximum &lt;n&gt;','Max MACs on port'],
          ['switchport port-security violation restrict|protect|shutdown','Violation action'],
          ['show spanning-tree','STP topology and root info'],
          ['show port-security interface &lt;int&gt;','Port security stats'],
        ]],
        ['Troubleshooting', [
          ['ping &lt;ip&gt; / traceroute &lt;ip&gt;','Connectivity and path testing'],
          ['show running-config / show startup-config','View configs'],
          ['show version','IOS version, uptime, hardware'],
          ['show cdp neighbors [detail]','Directly connected Cisco devices'],
          ['show lldp neighbors','LLDP neighbor info'],
          ['show mac address-table','Switch MAC table'],
          ['debug ip ospf events / undebug all','OSPF debug (use with care)'],
        ]],
      ].map(([topic, cmds]) => `
        <div class="mb-3">
          <div class="text-xs text-yellow-400 font-semibold uppercase tracking-wider mb-1">${topic}</div>
          ${T(['Command','Purpose'], cmds)}
        </div>`
      ).join('')
    },
  ];

  const sectionHtml = sections.map(s => `
    <div class="ref-section" data-ref-id="${s.id}">
      <button class="ref-toggle w-full flex items-center justify-between text-left px-4 py-3 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded transition-colors">
        <span class="text-sm font-semibold text-gray-200">${s.title}</span>
        <span class="ref-caret text-gray-500 text-xs">▶</span>
      </button>
      <div class="ref-body hidden border border-t-0 border-gray-700 rounded-b px-4 py-4 bg-gray-950">
        ${s.content}
      </div>
    </div>`
  ).join('');

  view.innerHTML = `
    <div class="max-w-3xl mx-auto p-6 space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-orange-400 font-bold text-xl">Concept Reference</h2>
        <button id="ref-expand-all" class="text-xs text-gray-600 hover:text-orange-400 transition-colors">Expand all</button>
      </div>
      <input id="ref-search" type="text" placeholder="Search reference (e.g. ospf, port 22, hsrp)..."
        class="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm outline-none focus:border-orange-500">
      <div id="ref-list" class="space-y-2">
        ${sectionHtml}
      </div>
      <p id="ref-no-results" class="hidden text-center text-gray-600 text-sm py-8">No sections match your search.</p>
    </div>`;

  // Collapse toggle
  document.getElementById('ref-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.ref-toggle');
    if (!btn) return;
    const section = btn.closest('.ref-section');
    const body    = section?.querySelector('.ref-body');
    const caret   = btn.querySelector('.ref-caret');
    if (!body) return;
    const open = !body.classList.contains('hidden');
    body.classList.toggle('hidden', open);
    if (caret) caret.textContent = open ? '▶' : '▼';
    btn.classList.toggle('rounded-b', open);
    btn.classList.toggle('rounded', !open);
  });

  // Expand all toggle
  let allExpanded = false;
  document.getElementById('ref-expand-all')?.addEventListener('click', () => {
    allExpanded = !allExpanded;
    document.querySelectorAll('.ref-section .ref-body').forEach(b => b.classList.toggle('hidden', !allExpanded));
    document.querySelectorAll('.ref-section .ref-caret').forEach(c => c.textContent = allExpanded ? '▼' : '▶');
    document.getElementById('ref-expand-all').textContent = allExpanded ? 'Collapse all' : 'Expand all';
  });

  // Keyword search — show/hide sections
  document.getElementById('ref-search')?.addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    let visible = 0;
    document.querySelectorAll('.ref-section').forEach(sec => {
      const text = sec.textContent.toLowerCase();
      const match = !q || text.includes(q);
      sec.classList.toggle('hidden', !match);
      if (match) {
        visible++;
        if (q) { // auto-open matched sections
          sec.querySelector('.ref-body')?.classList.remove('hidden');
          sec.querySelector('.ref-caret') && (sec.querySelector('.ref-caret').textContent = '▼');
        }
      }
    });
    const noResults = document.getElementById('ref-no-results');
    if (noResults) noResults.classList.toggle('hidden', visible > 0);
  });
}

// ─── Mistake Notebook ─────────────────────────────────────────────────────────

function renderNotebook() {
  const view        = getView();
  const mistakeIds  = store.getMistakeIds(2);  // wrong ≥ 2 times
  const allMistakes = Object.entries(store.state.mistakeNotebook || {})
    .sort(([, a], [, b]) => b - a);            // most wrong first
  const flaggedIds  = store.getFlaggedIds();

  // Map question IDs to question objects
  const questionMap = {};
  content.questions.forEach(q => { questionMap[q.id] = q; });

  const mistakeQs = mistakeIds
    .map(id => questionMap[id])
    .filter(Boolean);

  const notebookRows = allMistakes.slice(0, 50).map(([id, count]) => {
    const q = questionMap[id];
    if (!q) return '';
    const inQueue = count >= 2;
    return `<div class="flex items-start gap-3 py-2 border-b border-gray-800 text-xs">
      <span class="w-5 text-center font-bold ${count >= 4 ? 'text-red-400' : count >= 2 ? 'text-yellow-400' : 'text-gray-500'}">${count}✗</span>
      <div class="flex-1 min-w-0">
        <div class="text-gray-300 truncate">${q.question?.substring(0, 80) || id}...</div>
        <div class="text-gray-600 mt-0.5">${q.domain} · ${q.difficulty}</div>
      </div>
      ${inQueue ? '<span class="text-green-600 text-[10px] shrink-0">in queue</span>' : ''}
    </div>`;
  }).join('');

  const flaggedQs   = flaggedIds.map(id => questionMap[id]).filter(Boolean);
  const flaggedRows = flaggedIds.slice(0, 50).map(id => {
    const q = questionMap[id];
    if (!q) return '';
    return `<div class="flex items-start gap-3 py-2 border-b border-gray-800 text-xs">
      <span class="text-yellow-400 text-sm shrink-0">⚑</span>
      <div class="flex-1 min-w-0">
        <div class="text-gray-300 truncate">${q.question?.substring(0, 80) || id}...</div>
        <div class="text-gray-600 mt-0.5">${q.domain} · ${q.difficulty}</div>
      </div>
      <button data-unflag="${id}" class="text-gray-700 hover:text-red-400 text-[10px] shrink-0 transition-colors">unflag</button>
    </div>`;
  }).join('');

  view.innerHTML = `
    <div class="max-w-2xl mx-auto p-6 space-y-5">
      <div class="flex items-center justify-between">
        <h2 class="text-orange-400 font-bold text-xl">Mistake Notebook</h2>
        <span class="text-xs text-gray-600">${mistakeQs.length} mistake${mistakeQs.length !== 1 ? 's' : ''} · ${flaggedIds.length} flagged</span>
      </div>

      <!-- Flagged Questions -->
      <div class="bg-gray-900 border border-yellow-900/50 rounded p-5 space-y-3">
        <h3 class="text-sm text-yellow-600 uppercase tracking-widest">⚑ Flagged Questions</h3>
        <p class="text-gray-400 text-xs">Questions you've flagged during quizzes or exams for later review.</p>
        ${flaggedQs.length > 0 ? `
        <button id="start-flag-drill" class="w-full py-2.5 bg-yellow-900 hover:bg-yellow-800 text-yellow-200 rounded font-semibold text-sm">
          Drill Flagged Questions (${flaggedQs.length})
        </button>
        <div class="mt-2 space-y-0">${flaggedRows}</div>
        <div class="text-right">
          <button id="clear-flags" class="text-xs text-gray-700 hover:text-red-400 transition-colors">Clear all flags</button>
        </div>` : `
        <p class="text-gray-600 text-xs italic">No flagged questions yet. Use the ⚐ Flag button during any quiz to mark tricky questions.</p>`}
      </div>

      <!-- Mistake Drill -->
      <div class="bg-gray-900 border border-orange-900/50 rounded p-5 space-y-3">
        <h3 class="text-sm text-orange-600 uppercase tracking-widest">✗ Mistake Drill</h3>
        <p class="text-gray-400 text-xs">Questions you've answered wrong 2+ times are queued here for targeted review.</p>
        ${mistakeQs.length > 0 ? `
        <button id="start-notebook-drill" class="w-full py-2.5 bg-orange-800 hover:bg-orange-700 text-orange-200 rounded font-semibold text-sm">
          Start Notebook Drill (${mistakeQs.length} questions)
        </button>` : `
        <p class="text-gray-600 text-xs italic">No questions in queue yet. Questions you get wrong twice will appear here.</p>`}
      </div>

      <div class="bg-gray-900 border border-gray-700 rounded p-5">
        <h3 class="text-sm text-gray-400 uppercase tracking-widest mb-3">Mistake History (top 50)</h3>
        ${notebookRows || '<p class="text-gray-600 text-xs">No mistakes recorded yet.</p>'}
      </div>

      ${allMistakes.length > 0 ? `
      <div class="text-center">
        <button id="clear-notebook" class="text-xs text-gray-700 hover:text-red-400 transition-colors">
          Clear mistake history
        </button>
      </div>` : ''}
    </div>`;

  document.getElementById('start-flag-drill')?.addEventListener('click', () => {
    startNotebookDrill(flaggedQs);
  });

  document.getElementById('clear-flags')?.addEventListener('click', () => {
    if (confirm('Clear all flagged questions?')) {
      store.clearFlags();
      renderNotebook();
    }
  });

  // Per-question unflag buttons
  document.querySelectorAll('[data-unflag]').forEach(btn => {
    btn.addEventListener('click', () => {
      store.toggleFlag(btn.dataset.unflag);
      renderNotebook();
    });
  });

  document.getElementById('start-notebook-drill')?.addEventListener('click', () => {
    startNotebookDrill(mistakeQs);
  });

  document.getElementById('clear-notebook')?.addEventListener('click', () => {
    if (confirm('Clear all mistake history?')) {
      store.clearNotebook();
      renderNotebook();
    }
  });
}

function startNotebookDrill(questions) {
  if (!questions.length) return;
  // Reuse grind quiz area but with mistake questions
  switchView('grind');
  // Wait for grind view to render, then inject notebook quiz
  setTimeout(() => {
    quiz = new QuizEngine(questions, store, {
      count:        questions.length,
      shuffle:      true,
      requeueWrong: false,
      domain:       'all',
      difficulty:   'all',
    });
    if (!quiz.start()) return;
    document.getElementById('quiz-prompt')?.classList.add('hidden');
    // Override header text
    const h2 = getView().querySelector('h2');
    if (h2) h2.textContent = 'Notebook Drill';
    renderQuizQuestion();
  }, 50);
}

// ─── Inventory View ───────────────────────────────────────────────────────────

function renderInventory() {
  const view  = getView();
  const state = store.state;
  view.innerHTML = `
    <div class="max-w-xl mx-auto p-6 space-y-4">
      <h2 class="text-yellow-400 font-bold text-xl">Inventory & Achievements</h2>

      <div>
        <h3 class="text-sm text-gray-500 uppercase tracking-widest mb-2">Items (${state.inventory.length})</h3>
        <ul id="inventory-list" class="space-y-1"></ul>
      </div>

      <div>
        <h3 class="text-sm text-gray-500 uppercase tracking-widest mb-2 mt-4">Achievements (${state.achievements.length})</h3>
        ${state.achievements.length
          ? state.achievements.map(a => `<div class="text-purple-300 text-sm py-1 border-b border-gray-800">${a.name}</div>`).join('')
          : '<p class="text-gray-600 text-sm">No achievements yet.</p>'}
      </div>

      <div class="mt-6 pt-4 border-t border-gray-800">
        <h3 class="text-sm text-gray-500 uppercase tracking-widest mb-2">Danger Zone</h3>
        <button id="reset-btn" class="px-4 py-2 bg-red-900 hover:bg-red-800 border border-red-700 text-red-300 rounded text-sm">
          Reset All Progress
        </button>
      </div>
    </div>`;

  // Re-render inventory list via HUD
  const ul = view.querySelector('#inventory-list');
  if (ul) {
    const { inventory } = state;
    if (!inventory.length) {
      ul.innerHTML = '<li class="text-gray-500 text-sm italic">No items yet. Gain levels to unlock items.</li>';
    } else {
      const rarityColors = { common: 'text-gray-300', uncommon: 'text-green-300', rare: 'text-blue-300', legendary: 'text-yellow-300' };
      inventory.forEach(item => {
        const li = document.createElement('li');
        li.className = `py-1.5 border-b border-gray-800 ${rarityColors[item.rarity] || 'text-gray-300'}`;
        li.innerHTML = `<span class="font-semibold">${item.name}</span> <span class="text-xs opacity-60">[${item.rarity}]</span><div class="text-xs opacity-50 mt-0.5">${item.description}</div>`;
        ul.appendChild(li);
      });
    }
  }

  document.getElementById('reset-btn')?.addEventListener('click', () => {
    if (confirm('Reset ALL progress? This cannot be undone.')) {
      store.reset();
      switchView('story');
    }
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function getView() {
  return document.getElementById('app-view');
}

// Expose for inline onclick fallback (boss end screen)
window.switchView = switchView;

// ─── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
