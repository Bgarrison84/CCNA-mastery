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
import { generateIPv4Problem, validateIPv4, buildChallenge, calculateVLSM, solveSubnet } from './engine/Subnetting.js';
import { ScriptingEngine, py, sh } from './engine/ScriptingEngine.js';

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
let _confKeyHandler  = null;   // keyboard handler for confidence rating panel
let _confidenceMode  = false;  // whether confidence rating is enabled for current session
let _smartDifficulty     = false;  // whether adaptive difficulty weighting is enabled
let _sessionStartTime    = null;   // Date.now() when startQuiz() called — for time-on-task
let _lastSessionQuality  = null;   // { score, accuracy, srsScore, newScore, timeScore, elapsedMins, srsReviewed, newQs }
let _adaptiveInfo    = null;   // { weights, accuracy, alloc, boosted } from last adaptive pool build
let _viewEnterTime   = null;   // timestamp when current view was entered (for study timer)
let _grindPresetDomain = null; // pre-select domain when drilling from Stats
let _grindPresetWeek   = null; // pre-select week when drilling from Stats weak-area
let flashState = null;         // { cards, currentIdx, results, flipped, pointerStartX }

// ─── Prerequisite Concept Links (Phase 10 Item 4) ─────────────────────────
// Maps question tag strings to the reference section or story beat to review.
// type 'reference' → switchView('reference') + open that section
// type 'story'     → switchView('story') + story.showBeat(id)
const PREREQ_MAP = {
  osi:           { type: 'reference', id: 'osi',              label: 'OSI vs TCP/IP Model' },
  tcp_udp:       { type: 'story',     id: 'w1_tcp_udp',       label: 'TCP vs UDP' },
  ports:         { type: 'reference', id: 'ports',            label: 'Well-Known Ports' },
  switching:     { type: 'story',     id: 'w1_switching',     label: 'Ethernet Switching' },
  subnetting:    { type: 'reference', id: 'cidr',             label: 'Subnetting & CIDR' },
  ipv6:          { type: 'reference', id: 'ipv6',             label: 'IPv6 Address Types' },
  vlan:          { type: 'story',     id: 'w2_vlan_concept',  label: 'VLANs' },
  trunking:      { type: 'story',     id: 'w2_trunk_explain', label: '802.1Q Trunking' },
  stp:           { type: 'reference', id: 'stp',              label: 'STP States & Timers' },
  etherchannel:  { type: 'story',     id: 'w2_etherchannel',  label: 'EtherChannel' },
  wireless:      { type: 'story',     id: 'w2_wireless_intro',label: 'Wireless Concepts' },
  ospf:          { type: 'reference', id: 'ospf',             label: 'OSPF LSA Types' },
  routing:       { type: 'reference', id: 'routing',          label: 'Routing Protocol Comparison' },
  static_routes: { type: 'story',     id: 'w3_ad_explain',    label: 'Static Routes & AD' },
  fhrp:          { type: 'story',     id: 'w3_fhrp',          label: 'FHRP / HSRP' },
  dhcp:          { type: 'story',     id: 'w4_dora',          label: 'DHCP DORA Process' },
  nat:           { type: 'story',     id: 'w4_nat',           label: 'NAT / PAT' },
  dns:           { type: 'story',     id: 'w4_dns',           label: 'DNS' },
  ntp:           { type: 'story',     id: 'w4_ntp',           label: 'NTP' },
  snmp:          { type: 'reference', id: 'snmp',             label: 'SNMP Versions' },
  qos:           { type: 'story',     id: 'w4_qos',           label: 'QoS' },
  acl:           { type: 'story',     id: 'w5_acl_intro',     label: 'ACLs' },
  threats:       { type: 'story',     id: 'w5_threats',       label: 'Security Threats' },
  aaa:           { type: 'reference', id: 'aaa',              label: 'AAA / TACACS+ / RADIUS' },
  port_security: { type: 'story',     id: 'w5_port_security', label: 'Port Security' },
  ipsec:         { type: 'story',     id: 'w5_ipsec_vpn',     label: 'IPsec VPN' },
  sdn:           { type: 'story',     id: 'w6_sdn_intro',     label: 'SDN' },
  ansible:       { type: 'story',     id: 'w6_ansible',       label: 'Ansible' },
  netconf:       { type: 'story',     id: 'w6_yang',          label: 'NETCONF / YANG' },
  cloud:         { type: 'reference', id: 'cloud',            label: 'Cloud Computing' },
};

function _removeQuizKeyHandler() {
  if (_quizKeyHandler) { document.removeEventListener('keydown', _quizKeyHandler); _quizKeyHandler = null; }
}

function _removeConfKeyHandler() {
  if (_confKeyHandler) { document.removeEventListener('keydown', _confKeyHandler); _confKeyHandler = null; }
}

/**
 * Build "Review this first →" HTML for wrong-answer feedback.
 * Returns empty string if no matching tags, or if tags produce no PREREQ_MAP hits.
 */
function _prereqLinksHtml(tags) {
  if (!tags?.length) return '';
  const links = tags
    .map(tag => PREREQ_MAP[tag])
    .filter(Boolean)
    .map(entry => {
      const icon  = entry.type === 'reference' ? '📚' : '📖';
      const where = entry.type === 'reference' ? 'Reference' : 'Story';
      return `<button class="prereq-link inline-flex items-center gap-1 text-[11px] bg-gray-800 hover:bg-gray-700 border border-gray-600 hover:border-blue-500 text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded transition-colors" data-prereq-type="${entry.type}" data-prereq-id="${entry.id}">${icon} ${entry.label} <span class="text-gray-500 text-[10px]">(${where})</span> →</button>`;
    });
  if (!links.length) return '';
  return `<div class="mt-2 border-t border-gray-700 pt-2">
    <p class="text-[10px] font-mono text-gray-500 mb-1.5">REVIEW THIS FIRST:</p>
    <div class="flex flex-wrap gap-1.5">${links.join('')}</div>
  </div>`;
}

/**
 * Navigate to a prereq target — called when a .prereq-link button is clicked.
 */
function _goToPrereq(type, id) {
  if (type === 'reference') {
    switchView('reference');
    // After renderReference() runs, open and scroll to the target section
    setTimeout(() => {
      const sec = document.querySelector(`.ref-section[data-ref-id="${id}"]`);
      if (!sec) return;
      sec.querySelector('.ref-body')?.classList.remove('hidden');
      const caret = sec.querySelector('.ref-caret');
      if (caret) caret.textContent = '▼';
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  } else {
    switchView('story');
    setTimeout(() => {
      if (story) story.showBeat(id);
    }, 150);
  }
}

/**
 * Routes answer selection through the confidence panel when confidence mode is on,
 * or directly to submitQuizAnswer when it's off.
 */
function _handleAnswerSelection(answer) {
  if (_confidenceMode) {
    _removeQuizKeyHandler();
    _selectAnswerForConfidence(answer);
  } else {
    submitQuizAnswer(answer);
  }
}

/**
 * Shows the confidence rating panel after an answer is selected.
 * Disables all answer inputs, highlights the chosen option, then waits
 * for a 1–5 rating before calling submitQuizAnswer(answer, confidence).
 */
function _selectAnswerForConfidence(answer) {
  // Disable all answer inputs to prevent re-selection
  document.querySelectorAll('.quiz-option').forEach(b => { b.disabled = true; b.style.pointerEvents = 'none'; });
  document.getElementById('submit-multi')?.setAttribute('disabled', 'true');
  document.getElementById('submit-drag')?.setAttribute('disabled', 'true');
  document.getElementById('submit-fill')?.setAttribute('disabled', 'true');

  // Highlight the selected MC / T-F option (before correctness is revealed)
  const selectedBtn = typeof answer === 'string' ? document.querySelector(`.quiz-option[data-answer="${answer}"]`) : null;
  if (selectedBtn) selectedBtn.classList.add('border-purple-500', 'bg-purple-900/20');

  const feedback = document.getElementById('quiz-feedback');
  if (!feedback) { submitQuizAnswer(answer); return; }
  feedback.classList.remove('hidden');
  feedback.className = 'mt-4 p-3 rounded text-sm bg-gray-900 border border-purple-900/50';

  const LABELS  = ['Guess','Unsure','Maybe','Sure','Certain'];
  const BORDERS = ['border-red-900','border-orange-900','border-yellow-900','border-lime-900','border-green-900'];
  const TEXTS   = ['text-red-400','text-orange-400','text-yellow-400','text-lime-400','text-green-400'];
  const HOVERS  = ['hover:bg-red-900/30','hover:bg-orange-900/30','hover:bg-yellow-900/30','hover:bg-lime-900/30','hover:bg-green-900/30'];

  feedback.innerHTML = `
    <p class="text-gray-400 text-xs mb-2 font-mono">&#127919; How confident were you?</p>
    <div class="flex gap-1.5 mb-1">
      ${[1,2,3,4,5].map(n => `
        <button data-conf="${n}" class="conf-btn flex-1 py-2 rounded border text-xs font-mono ${BORDERS[n-1]} ${TEXTS[n-1]} ${HOVERS[n-1]} transition-colors">
          ${n}<br><span class="text-[10px] opacity-60">${LABELS[n-1]}</span>
        </button>`).join('')}
    </div>
    <p class="text-[10px] text-gray-600">Press 1–5 or click to rate</p>`;

  feedback.querySelectorAll('.conf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _removeConfKeyHandler();
      submitQuizAnswer(answer, +btn.dataset.conf);
    });
  });

  _removeConfKeyHandler();
  _confKeyHandler = (e) => {
    if (['1','2','3','4','5'].includes(e.key)) {
      e.preventDefault();
      _removeConfKeyHandler();
      submitQuizAnswer(answer, +e.key);
    }
  };
  document.addEventListener('keydown', _confKeyHandler);
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

// ─── Micro-animation helpers ───────────────────────────────────────────────────

/** Spawn a floating "+N XP" label near an anchor element (or viewport centre). */
function spawnFloatingXP(amount, anchorEl) {
  if (!amount || amount <= 0) return;
  const el = document.createElement('div');
  el.className = 'float-xp';
  el.textContent = `+${amount} XP`;

  // Position near anchor or fallback to bottom-centre of viewport
  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    el.style.left = `${rect.left + rect.width / 2 - 28}px`;
    el.style.top  = `${rect.top - 8}px`;
  } else {
    el.style.left = '50%';
    el.style.top  = '60%';
    el.style.transform = 'translateX(-50%)';
  }

  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

// ─── Loading / Error overlays ─────────────────────────────────────────────────

// ─── Progressive Content Loading ──────────────────────────────────────────────

const WEEK_NUMS = [1, 2, 3, 4, 5, 6];

// Tracks which week files have been fetched: 'pending' | 'loading' | 'loaded' | 'error'
const _weekState = {};
WEEK_NUMS.forEach(w => { _weekState[w] = 'pending'; });

/** Flatten scenario questions from a raw questions array. */
function _flattenQuestions(rawQuestions) {
  const out = [];
  for (const q of rawQuestions) {
    if (q.type !== 'scenario') { out.push(q); continue; }
    (q.sub_questions || []).forEach((sub, i) => {
      out.push({
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
  return out;
}

/** Fetch and merge a single week's questions into content.questions. No-op if already loaded. */
async function _loadWeek(weekNum) {
  if (_weekState[weekNum] === 'loaded' || _weekState[weekNum] === 'loading') return;
  _weekState[weekNum] = 'loading';
  try {
    const r = await fetch(`./data/week${weekNum}.json`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const flattened = _flattenQuestions(data.questions || []);
    // Remove any placeholder entries for this week, then append
    content.questions = content.questions.filter(q => String(q.week) !== String(weekNum));
    content.questions.push(...flattened);
    _weekState[weekNum] = 'loaded';
  } catch (e) {
    console.warn(`[content] Failed to load week${weekNum}.json:`, e);
    _weekState[weekNum] = 'error';
  }
}

/** Returns a Promise that resolves once all 6 week files are loaded. */
let _allWeeksPromise = null;
function _ensureAllWeeksLoaded() {
  if (!_allWeeksPromise) {
    _allWeeksPromise = Promise.all(WEEK_NUMS.map(w => _loadWeek(w)));
  }
  return _allWeeksPromise;
}

/** Returns true if all week files are in 'loaded' state. */
function _allWeeksLoaded() {
  return WEEK_NUMS.every(w => _weekState[w] === 'loaded');
}

/** Minimal loading overlay for return visits while content.json fetches. */
function showLoadingOverlay() {
  const el = document.createElement('div');
  el.id = 'loading-overlay';
  el.style.cssText = [
    'position:fixed;inset:0;z-index:10001',
    'background:#0a0a0a',
    'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px',
  ].join(';');

  // Scanlines
  const scan = document.createElement('div');
  scan.style.cssText = 'position:absolute;inset:0;pointer-events:none;' +
    'background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,255,65,0.015) 2px,rgba(0,255,65,0.015) 4px);';
  el.appendChild(scan);

  const inner = document.createElement('div');
  inner.style.cssText = 'position:relative;z-index:1;text-align:center;font-family:\'JetBrains Mono\',monospace;';
  inner.innerHTML = `
    <div style="color:#00ff41;font-size:1.1rem;font-weight:800;
      text-shadow:0 0 12px rgba(0,255,65,0.7);margin-bottom:16px;letter-spacing:0.1em;">
      CCNA_MASTERY
    </div>
    <div id="loading-spinner" style="color:#4a7a4a;font-size:0.78rem;letter-spacing:0.08em;">
      ▶ loading content<span id="loading-dots">...</span>
    </div>`;
  el.appendChild(inner);
  document.body.appendChild(el);

  // Animate dots
  const dots = ['·  ', '·· ', '···', ' ··', '  ·'];
  let i = 0;
  const iv = setInterval(() => {
    const d = document.getElementById('loading-dots');
    if (d) d.textContent = dots[i++ % dots.length];
    else clearInterval(iv);
  }, 180);
  el._stopDots = () => clearInterval(iv);
}

function hideLoadingOverlay() {
  const el = document.getElementById('loading-overlay');
  if (!el) return;
  if (el._stopDots) el._stopDots();
  el.style.transition = 'opacity 0.35s ease';
  el.style.opacity = '0';
  setTimeout(() => el.remove(), 350);
}

/** Full-screen error shown when content.json fails to load. Returns a promise
 *  that resolves when the user clicks Retry (caller should re-run init). */
function showContentError() {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.id = 'content-error-screen';
    el.style.cssText = [
      'position:fixed;inset:0;z-index:10002',
      'background:#0a0a0a',
      'display:flex;flex-direction:column;align-items:center;justify-content:center',
      'padding:24px;text-align:center',
      'font-family:\'JetBrains Mono\',\'Fira Code\',Consolas,monospace',
    ].join(';');

    const scan = document.createElement('div');
    scan.style.cssText = 'position:absolute;inset:0;pointer-events:none;' +
      'background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,255,65,0.015) 2px,rgba(0,255,65,0.015) 4px);';
    el.appendChild(scan);

    const box = document.createElement('div');
    box.style.cssText = 'position:relative;z-index:1;max-width:440px;';
    box.innerHTML = `
      <div style="font-size:2rem;margin-bottom:16px;">⚠</div>
      <div style="color:#ff4444;font-size:1rem;font-weight:800;letter-spacing:0.06em;margin-bottom:10px;
        text-shadow:0 0 10px rgba(255,68,68,0.6);">OFFLINE — CONTENT FAILED TO LOAD</div>
      <p style="color:#6a6a6a;font-size:0.78rem;line-height:1.7;margin-bottom:8px;">
        Could not fetch content data files (<code style="color:#8fbc8f;">meta.json</code> / <code style="color:#8fbc8f;">week*.json</code>).
      </p>
      <p style="color:#5a5a5a;font-size:0.72rem;line-height:1.6;margin-bottom:28px;">
        If you are offline, try installing the app as a PWA — the service worker will cache all assets so the app works without a connection.
      </p>
      <button id="error-retry-btn" style="
        background:#00ff41;color:#000;border:none;cursor:pointer;
        font-family:inherit;font-size:0.8rem;font-weight:700;
        letter-spacing:0.08em;padding:12px 32px;border-radius:4px;
        transition:box-shadow 0.2s;
      ">↺ RETRY</button>
      <div style="margin-top:14px;font-size:0.68rem;color:#3a3a3a;">
        Your progress is saved locally and will not be lost.
      </div>`;
    el.appendChild(box);
    document.body.appendChild(el);

    document.getElementById('error-retry-btn').addEventListener('click', () => {
      el.remove();
      resolve();
    });
  });
}

// ─── Animated Boot Sequence ───────────────────────────────────────────────────

function showBoot(contentPromise) {
  return new Promise(resolve => {
    let skipped = false;

    // ── Overlay ──
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:10001',
      'background:#0a0a0a',
      'display:flex;flex-direction:column;align-items:center;justify-content:center',
      'padding:24px',
      'transition:opacity 0.5s ease',
    ].join(';');

    // Scanlines
    const scanlines = document.createElement('div');
    scanlines.style.cssText = [
      'position:absolute;inset:0;pointer-events:none',
      'background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,255,65,0.015) 2px,rgba(0,255,65,0.015) 4px)',
    ].join(';');
    overlay.appendChild(scanlines);

    // Terminal box
    const box = document.createElement('div');
    box.style.cssText = [
      'position:relative;z-index:1',
      'width:100%;max-width:560px',
      'font-family:\'JetBrains Mono\',\'Fira Code\',Consolas,monospace',
      'font-size:0.82rem;line-height:1.8',
      'color:#c8ffc8',
    ].join(';');

    // Header
    const header = document.createElement('div');
    header.innerHTML = `<span style="color:#00ff41;font-size:1.1rem;font-weight:800;
      text-shadow:0 0 12px rgba(0,255,65,0.8);">CCNA-MASTERY OS v1.0</span>`;
    header.style.marginBottom = '4px';

    const divider = document.createElement('div');
    divider.style.cssText = 'color:#2a4a2a;margin-bottom:16px;';
    divider.textContent = '━'.repeat(48);

    // Lines container
    const lines = document.createElement('div');

    // Skip hint
    const skipHint = document.createElement('div');
    skipHint.style.cssText = 'margin-top:24px;font-size:0.65rem;color:#2a4a2a;letter-spacing:0.08em;';
    skipHint.textContent = 'Press any key to skip...';

    box.appendChild(header);
    box.appendChild(divider);
    box.appendChild(lines);
    box.appendChild(skipHint);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // ── Skip handler ──
    function skip() {
      if (skipped) return;
      skipped = true;
      fadeOut();
    }
    document.addEventListener('keydown', skip, { once: true });
    overlay.addEventListener('pointerdown', skip, { once: true });

    function fadeOut() {
      overlay.style.opacity = '0';
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve();
      }, 500);
    }

    // ── Line printer ──
    function addLine(text, color = '#8fbc8f') {
      const el = document.createElement('div');
      el.style.color = color;
      el.innerHTML = text;
      lines.appendChild(el);
      return el;
    }

    function pad(label, width = 38) {
      const dots = Math.max(1, width - label.length);
      return label + '<span style="color:#2a4a2a">' + '.'.repeat(dots) + '</span>';
    }

    function delay(ms) {
      return new Promise(r => setTimeout(r, skipped ? 0 : ms));
    }

    // ── Boot sequence ──
    async function runBoot() {
      // Timestamp helper
      let t = 0;
      function ts() {
        const s = (t / 1000).toFixed(3);
        t += Math.floor(Math.random() * 120) + 40;
        return `<span style="color:#2a4a2a">[${s.padStart(9)}]</span> `;
      }

      await delay(120);
      addLine(ts() + pad('Initializing game engine') +
        '<span style="color:#00ff41"> OK</span>');

      await delay(180);
      addLine(ts() + pad('Loading player state') +
        '<span style="color:#00ff41"> OK</span>  ' +
        `<span style="color:#4a7a4a">${store.state.playerName}</span>`);

      await delay(200);
      addLine(ts() + pad('Checking streak') +
        '<span style="color:#00ff41"> OK</span>  ' +
        `<span style="color:#4a7a4a">🔥 ${store.state.streak.current} day${store.state.streak.current !== 1 ? 's' : ''}</span>`);

      await delay(220);
      // Content line — spins until fetch resolves
      const contentLine = addLine(ts() + pad('Loading content database') +
        '<span id="boot-spinner" style="color:#ffb000"> ···</span>', '#8fbc8f');

      // Animate spinner while waiting for content
      const spinFrames = ['···', '••·', '•••', '·••', '···'];
      let spinIdx = 0;
      const spinInterval = setInterval(() => {
        const s = document.getElementById('boot-spinner');
        if (s) s.textContent = ' ' + spinFrames[spinIdx++ % spinFrames.length];
      }, 160);

      // Wait for content fetch (initialPromise resolves to [meta, weekData])
      const result = await contentPromise;
      clearInterval(spinInterval);

      const [metaResult, weekResult] = Array.isArray(result) ? result : [result, null];
      const qCount   = weekResult?.questions?.length ?? metaResult?.questions?.length ?? 0;
      const labCount = metaResult?.labs?.length ?? 0;
      const spinner = document.getElementById('boot-spinner');
      if (spinner) {
        spinner.style.color = '#00ff41';
        spinner.textContent = ' OK';
      }
      contentLine.innerHTML += `  <span style="color:#4a7a4a">${qCount.toLocaleString()} questions · ${labCount} labs</span>`;

      await delay(180);
      addLine(ts() + pad('Mounting interface') +
        '<span style="color:#00ff41"> OK</span>');

      await delay(200);
      addLine(ts() + pad('Starting session') +
        '<span style="color:#00ff41"> OK</span>');

      await delay(120);
      const readyLine = document.createElement('div');
      readyLine.style.cssText = 'margin-top:16px;color:#00ff41;font-weight:700;' +
        'text-shadow:0 0 8px rgba(0,255,65,0.7);';
      readyLine.textContent = '▶ SYSTEM READY';
      lines.appendChild(readyLine);

      await delay(600);
      document.removeEventListener('keydown', skip);
      overlay.removeEventListener('pointerdown', skip);
      fadeOut();
    }

    runBoot();
  });
}

// ─── Onboarding / First-Run Tour ──────────────────────────────────────────────

function showOnboarding() {
  return new Promise(resolve => {
    const SLIDES = [
      {
        icon: '📖',
        title: 'Story Mode',
        body: 'Follow a 6-week narrative campaign that introduces every CCNA topic through character-driven beats. Each week unlocks a boss battle — defeat it to advance.',
        hint: 'Start here if you\'re new to CCNA.',
      },
      {
        icon: '⚡',
        title: 'The Grind',
        body: '4,186 questions across all 6 CCNA domains. Use the spaced repetition (SRS) toggle so the engine schedules reviews automatically — the most efficient way to retain material.',
        hint: 'Aim for 20–30 questions per day.',
      },
      {
        icon: '⌨️',
        title: 'CLI Labs',
        body: '33 terminal simulation labs with real Cisco IOS command validation. The actual CCNA exam includes simulation tasks — muscle memory built here directly transfers.',
        hint: 'Complete at least one lab per study session.',
      },
    ];

    let slide = 0;

    // ── Overlay ──
    const overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:10000',
      'background:rgba(0,0,0,0.85)',
      'display:flex;align-items:center;justify-content:center',
      'padding:16px',
      'backdrop-filter:blur(2px)',
    ].join(';');

    // ── Modal ──
    const modal = document.createElement('div');
    modal.style.cssText = [
      'background:#111',
      'border:1px solid rgba(0,255,65,0.25)',
      'box-shadow:0 0 40px rgba(0,255,65,0.08)',
      'border-radius:8px',
      'width:100%;max-width:480px',
      'padding:32px',
      'position:relative',
      'font-family:\'JetBrains Mono\',\'Fira Code\',Consolas,monospace',
      'color:#c8ffc8',
    ].join(';');

    function renderSlide() {
      const s = SLIDES[slide];
      const isLast = slide === SLIDES.length - 1;

      modal.innerHTML = `
        <!-- Skip link -->
        <button id="ob-skip" style="
          position:absolute;top:14px;right:16px;
          background:none;border:none;cursor:pointer;
          font-size:0.7rem;letter-spacing:0.05em;color:#3a5a3a;
          font-family:inherit;
        ">Skip tour ›</button>

        <!-- Progress dots -->
        <div style="display:flex;gap:6px;margin-bottom:24px;">
          ${SLIDES.map((_, i) => `
            <div style="
              height:3px;flex:1;border-radius:2px;
              background:${i <= slide ? '#00ff41' : 'rgba(0,255,65,0.15)'};
              transition:background 0.3s;
            "></div>
          `).join('')}
        </div>

        <!-- Icon + title -->
        <div style="font-size:2rem;margin-bottom:12px;">${s.icon}</div>
        <div style="font-size:0.65rem;letter-spacing:0.12em;color:#4a7a4a;margin-bottom:6px;">
          ${String(slide + 1).padStart(2,'0')} / ${String(SLIDES.length).padStart(2,'0')}
        </div>
        <h2 style="font-size:1.25rem;font-weight:800;color:#00ff41;
                   text-shadow:0 0 8px rgba(0,255,65,0.6);margin-bottom:12px;">
          ${s.title}
        </h2>
        <p style="font-size:0.78rem;line-height:1.7;color:#8fbc8f;margin-bottom:10px;">
          ${s.body}
        </p>
        <div style="
          font-size:0.7rem;padding:8px 12px;border-radius:4px;margin-bottom:28px;
          background:rgba(0,255,65,0.05);border-left:2px solid rgba(0,255,65,0.3);
          color:#5a9a5a;
        ">💡 ${s.hint}</div>

        <!-- Navigation -->
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <button id="ob-back" style="
            background:none;border:1px solid rgba(0,255,65,0.2);
            color:#4a7a4a;font-family:inherit;font-size:0.75rem;
            padding:9px 18px;border-radius:4px;cursor:pointer;
            ${slide === 0 ? 'visibility:hidden;' : ''}
          ">← Back</button>

          <button id="ob-next" style="
            background:#00ff41;color:#000;font-family:inherit;
            font-size:0.75rem;font-weight:700;letter-spacing:0.06em;
            padding:10px 24px;border-radius:4px;cursor:pointer;border:none;
          ">${isLast ? 'Set Callsign →' : 'Next →'}</button>
        </div>
      `;

      // Wire buttons
      modal.querySelector('#ob-skip').addEventListener('click', showCallsign);
      if (slide > 0) {
        modal.querySelector('#ob-back').addEventListener('click', () => { slide--; renderSlide(); });
      }
      modal.querySelector('#ob-next').addEventListener('click', () => {
        if (isLast) showCallsign();
        else { slide++; renderSlide(); }
      });
    }

    function showCallsign() {
      modal.innerHTML = `
        <!-- Skip link removed on callsign screen -->
        <div style="font-size:0.65rem;letter-spacing:0.12em;color:#4a7a4a;margin-bottom:16px;">
          CCNA_MASTERY // SYSTEM INIT
        </div>
        <div style="font-size:1.5rem;font-weight:800;color:#00ff41;
                    text-shadow:0 0 8px rgba(0,255,65,0.6);margin-bottom:8px;">
          Enter Your Callsign
        </div>
        <p style="font-size:0.78rem;color:#6a9a6a;margin-bottom:24px;line-height:1.6;">
          This is your in-game handle. It appears on the HUD and in your stats. You can change it later in Stats.
        </p>
        <div style="position:relative;margin-bottom:8px;">
          <span style="
            position:absolute;left:12px;top:50%;transform:translateY(-50%);
            color:#00ff41;font-size:0.8rem;pointer-events:none;
          ">›</span>
          <input id="ob-name-input" type="text" maxlength="24"
            placeholder="Network Cadet"
            style="
              width:100%;padding:12px 12px 12px 28px;
              background:#0a0a0a;border:1px solid rgba(0,255,65,0.35);
              border-radius:4px;color:#00ff41;font-family:inherit;font-size:0.85rem;
              caret-color:#00ff41;outline:none;
            "
          />
        </div>
        <div id="ob-name-err" style="
          font-size:0.7rem;color:#ff4444;margin-bottom:16px;min-height:1.2em;
        "></div>
        <button id="ob-confirm" style="
          width:100%;background:#00ff41;color:#000;font-family:inherit;
          font-size:0.8rem;font-weight:700;letter-spacing:0.08em;
          padding:12px;border-radius:4px;cursor:pointer;border:none;
        ">CONFIRM CALLSIGN →</button>
        <button id="ob-use-default" style="
          display:block;width:100%;margin-top:10px;
          background:none;border:none;color:#3a5a3a;font-family:inherit;
          font-size:0.7rem;cursor:pointer;text-align:center;
        ">Use default (Network Cadet)</button>
      `;

      const input = modal.querySelector('#ob-name-input');
      const errEl = modal.querySelector('#ob-name-err');

      input.focus();

      function confirm() {
        const val = input.value.trim();
        if (!val) { errEl.textContent = 'Callsign cannot be blank.'; return; }
        finish(val);
      }

      modal.querySelector('#ob-confirm').addEventListener('click', confirm);
      modal.querySelector('#ob-use-default').addEventListener('click', () => finish('Network Cadet'));
      input.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); });
    }

    function finish(name) {
      store.setPlayerName(name);
      store.completeOnboarding();
      document.body.removeChild(overlay);
      resolve();
    }

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    renderSlide();
  });
}

async function init() {
  // Wait for IndexedDB to initialise (may upgrade state from IDB if localStorage was cleared)
  await store.ready;

  // Determine which week to load first (user's current week, default 1)
  const firstWeek = Math.min(Math.max(store.state.currentWeek || 1, 1), 6);

  // Kick off meta + first week fetch in parallel immediately
  const fetchJson = url => fetch(url)
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .catch(e => { console.error(`[main] Failed: ${url}`, e); return null; });

  const metaPromise    = fetchJson('./data/meta.json');
  const firstWkPromise = fetchJson(`./data/week${firstWeek}.json`);
  const initialPromise = Promise.all([metaPromise, firstWkPromise]);

  // First visit: animated boot sequence; return visit: minimal overlay
  if (!store.state.onboardingDone) {
    await showBoot(initialPromise);
  } else {
    showLoadingOverlay();
  }

  let [meta, firstWkData] = await initialPromise;

  // Retry on failure
  while (!meta || !firstWkData) {
    hideLoadingOverlay();
    await showContentError();
    showLoadingOverlay();
    if (!meta)        meta        = await fetchJson('./data/meta.json');
    if (!firstWkData) firstWkData = await fetchJson(`./data/week${firstWeek}.json`);
  }

  hideLoadingOverlay();

  // Build initial content object: meta fields + first-week questions
  content = {
    labs:        meta.labs        || [],
    bossBattles: meta.bossBattles || [],
    storyBeats:  meta.storyBeats  || [],
    questions:   _flattenQuestions(firstWkData.questions || []),
  };
  _weekState[firstWeek] = 'loaded';

  // Daily streak check
  store.checkStreak();
  _viewEnterTime = Date.now();

  // First-run onboarding
  if (!store.state.onboardingDone) {
    await showOnboarding();
  }

  initHUD();
  initNav();
  switchView('story');

  // Background-load all remaining weeks after initial render
  setTimeout(() => {
    WEEK_NUMS.filter(w => w !== firstWeek).forEach(w => _loadWeek(w));
  }, 200);
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
  initThemePicker();
  initPomodoro();
}

// ─── Pomodoro Timer (Phase 10 Item 5) ────────────────────────────────────────

const POMODORO_WORK_SECS  = 25 * 60;   // 25 minutes
const POMODORO_BREAK_SECS = 5  * 60;   // 5-minute break

let _pomo = {
  state:     'idle',   // 'idle' | 'work' | 'break'
  remaining: 0,        // seconds left
  _interval: null,
};

function initPomodoro() {
  // Sync total count badge
  _syncPomodoroCount();

  const btn = document.getElementById('hud-pomodoro-btn');
  if (!btn) return;
  btn.addEventListener('click', _togglePomodoro);
}

function _syncPomodoroCount() {
  const el = document.getElementById('hud-pomodoro-total');
  if (el) el.textContent = store.pomodoroCount;
}

function _togglePomodoro() {
  if (_pomo.state === 'idle') {
    _startPomodoroWork();
  } else {
    _stopPomodoro(true); // user-cancelled
  }
}

function _startPomodoroWork() {
  _pomo.state     = 'work';
  _pomo.remaining = POMODORO_WORK_SECS;
  _pomo._interval = setInterval(_pomodoroTick, 1000);
  _renderPomodoroHUD();
}

function _startPomodoroBreak() {
  _pomo.state     = 'break';
  _pomo.remaining = POMODORO_BREAK_SECS;
  _pomo._interval = setInterval(_pomodoroTick, 1000);
  _renderPomodoroHUD();
}

function _stopPomodoro(cancelled = false) {
  clearInterval(_pomo._interval);
  _pomo._interval = null;
  _pomo.state     = 'idle';
  _pomo.remaining = 0;
  _renderPomodoroHUD();
  if (!cancelled) return;
  // Cancelled mid-session — toast
  const btn = document.getElementById('hud-pomodoro-btn');
  if (btn) btn.title = 'Start a 25-minute Pomodoro focus session';
}

function _pomodoroTick() {
  _pomo.remaining--;
  _renderPomodoroHUD();

  if (_pomo.remaining > 0) return;

  // Timer expired
  clearInterval(_pomo._interval);
  _pomo._interval = null;

  if (_pomo.state === 'work') {
    // Work block done — record, notify, start break
    store.recordPomodoro();
    store.addStudyTime(25);  // credit 25 min to study timer
    _syncPomodoroCount();
    _pomodoroToast(
      `&#127813; Pomodoro #${store.pomodoroCount} complete! +25 min study time. Take a 5-minute break.`,
      'green'
    );
    _startPomodoroBreak();
  } else {
    // Break done — return to idle, prompt to start another
    _pomo.state = 'idle';
    _renderPomodoroHUD();
    _pomodoroToast('&#9749; Break over! Click &#127813; to start your next Pomodoro.', 'blue');
  }
}

function _renderPomodoroHUD() {
  const btn   = document.getElementById('hud-pomodoro-btn');
  const label = document.getElementById('hud-pomodoro-label');
  if (!btn || !label) return;

  if (_pomo.state === 'idle') {
    label.textContent = 'Pomodoro';
    btn.className = 'flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors cursor-pointer select-none';
    btn.title = 'Start a 25-minute Pomodoro focus session';
    return;
  }

  const mins = String(Math.floor(_pomo.remaining / 60)).padStart(2, '0');
  const secs = String(_pomo.remaining % 60).padStart(2, '0');
  const display = `${mins}:${secs}`;

  if (_pomo.state === 'work') {
    label.textContent = `${display} — click to cancel`;
    btn.className = 'flex items-center gap-1 text-red-400 font-mono font-bold cursor-pointer select-none animate-pulse';
    btn.title = `Focus session: ${display} remaining. Click to cancel.`;
  } else {
    label.textContent = `\u2615 ${display} break`;
    btn.className = 'flex items-center gap-1 text-blue-400 font-mono cursor-pointer select-none';
    btn.title = `Break: ${display} remaining. Click to skip.`;
  }
}

function showToast(msg, duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'bg-gray-800 border border-gray-600 text-gray-200 rounded px-3 py-2 text-xs max-w-xs shadow-lg';
  div.textContent = msg;
  container.appendChild(div);
  setTimeout(() => div.remove(), duration);
}

function _pomodoroToast(msg, colour = 'green') {
  const colourMap = { green: 'bg-green-900 border-green-600 text-green-200', blue: 'bg-blue-900 border-blue-600 text-blue-200' };
  const cls = colourMap[colour] || colourMap.green;
  const container = document.getElementById('toast-container');
  if (!container) return;
  const div = document.createElement('div');
  div.className = `${cls} border rounded px-3 py-2 text-xs max-w-xs shadow-lg`;
  div.innerHTML = msg;
  container.appendChild(div);
  setTimeout(() => div.remove(), 6000);
}

// ─── Theming ──────────────────────────────────────────────────────────────────

const THEME_UNLOCK = { amber: 5, blue: 8 }; // min level required

/** Apply a theme by setting data-theme on <html> and persisting to store. */
function applyTheme(theme) {
  const level = store.state.level;
  // Enforce level gates
  if (THEME_UNLOCK[theme] && level < THEME_UNLOCK[theme]) return;

  const html = document.documentElement;
  if (theme === 'terminal-green') {
    html.removeAttribute('data-theme');
  } else {
    html.setAttribute('data-theme', theme);
  }
  store.setTheme(theme);
  _syncThemeSwatches(theme);
}

/** Sync swatch active state and lock/unlock classes based on current level. */
function _syncThemeSwatches(activeTheme) {
  const level = store.state.level;
  document.querySelectorAll('.theme-swatch').forEach(btn => {
    const t = btn.dataset.themeId;
    const minLevel = THEME_UNLOCK[t];
    const unlocked = !minLevel || level >= minLevel;

    btn.classList.toggle('active', t === activeTheme);
    btn.classList.toggle('locked', !unlocked);

    // Update lock icon visibility and title
    const lockEl = btn.querySelector('.lock-icon');
    if (lockEl) lockEl.style.display = unlocked ? 'none' : '';
    if (minLevel) {
      btn.title = unlocked
        ? (t === 'amber' ? 'Amber (unlocked at Level 5)' : 'Cyan (unlocked at Level 8)')
        : (t === 'amber' ? `Amber — unlocks at Level 5 (you are Level ${level})` : `Cyan — unlocks at Level 8 (you are Level ${level})`);
    }
  });
}

function initThemePicker() {
  const currentTheme = store.state.settings?.theme || 'terminal-green';

  // Apply stored theme immediately
  if (currentTheme !== 'terminal-green') {
    const level = store.state.level;
    if (!THEME_UNLOCK[currentTheme] || level >= THEME_UNLOCK[currentTheme]) {
      document.documentElement.setAttribute('data-theme', currentTheme);
    }
  }
  _syncThemeSwatches(currentTheme);

  // Wire swatch clicks
  document.querySelectorAll('.theme-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('locked')) return;
      applyTheme(btn.dataset.themeId);
    });
  });

  // Re-sync swatches on level-up (may unlock a new theme)
  bus.on('level:up', ({ level }) => {
    _syncThemeSwatches(store.state.settings?.theme || 'terminal-green');
    // Notify player if a theme just unlocked
    if (level === THEME_UNLOCK.amber) {
      setTimeout(() => {
        const tc = document.getElementById('toast-container');
        if (tc) {
          const t = document.createElement('div');
          t.className = 'px-4 py-3 rounded border text-sm bg-yellow-900 border-yellow-600 text-yellow-200';
          t.innerHTML = '🎨 Amber theme unlocked! Select it in the sidebar.';
          tc.appendChild(t);
          setTimeout(() => t.remove(), 4000);
        }
      }, 600);
    }
    if (level === THEME_UNLOCK.blue) {
      setTimeout(() => {
        const tc = document.getElementById('toast-container');
        if (tc) {
          const t = document.createElement('div');
          t.className = 'px-4 py-3 rounded border text-sm bg-cyan-900 border-cyan-600 text-cyan-200';
          t.innerHTML = '🎨 Cyan theme unlocked! Select it in the sidebar.';
          tc.appendChild(t);
          setTimeout(() => t.remove(), 4000);
        }
      }, 600);
    }
  });
}

// ─── Navigation & Discoverability ─────────────────────────────────────────────

const VIEW_META = {
  story:     { label: 'Story Mode',   desc: 'Narrative campaign — 6 weeks, 1 boss per week',
               tip: 'Read each beat, then complete the suggested quiz and lab to unlock the next chapter. Follow the weeks in order.' },
  grind:     { label: 'The Grind',    desc: '4,186 questions · SRS · domain filtering',
               tip: 'Enable SRS for the most efficient study — the engine schedules reviews at optimal intervals. Aim for 20–30 questions per session.' },
  lab:       { label: 'The Lab',      desc: '33 CLI labs · Cisco IOS simulation',
               tip: 'Type commands exactly as you would on real Cisco hardware. Use the "hint" button if stuck. Complete at least one lab per study session.' },
  exam:      { label: 'Exam Sim',     desc: '120 questions · 120 minutes · real CCNA format',
               tip: 'Take a full exam at the end of each week to measure your readiness. Aim for 85%+ before booking the real thing (820/1000 = pass).' },
  boss:      { label: 'Boss Battles', desc: 'End-of-week combat encounters',
               tip: 'Bosses unlock when you reach the right week. Answer quickly — wrong answers cost HP. Perfect runs earn bonus XP.' },
  stats:     { label: 'Stats',        desc: 'Readiness score, radar, heatmap, planner',
               tip: 'Set your exam date in the Study Planner to unlock the daily hours target and countdown. Check the radar chart weekly to spot weak domains.' },
  subnet:    { label: 'Subnetting',   desc: 'Rapid-fire subnet drill',
               tip: 'Practice until /24–/30 splits take under 30 seconds. The real exam includes subnetting in many questions — speed matters.' },
  flash:     { label: 'Flashcards',   desc: 'SRS-rated flip cards · swipe gestures',
               tip: 'Space to flip, ← for Missed, → for Got It. Self-rating feeds the SRS scheduler — be honest. Filter to "SRS Due" for the most efficient review.' },
  reference: { label: 'Reference',   desc: 'Offline cheat-sheet library',
               tip: 'Use keyword search to find any topic instantly. Great to have open alongside a quiz session or CLI lab for quick look-ups.' },
  notebook:  { label: 'Notebook',    desc: 'Mistakes and flagged questions',
               tip: 'Questions you get wrong twice appear here automatically. Use "Drill" to re-quiz just your weak spots. Review before every study session.' },
  inventory: { label: 'Inventory',   desc: 'Items and achievements',
               tip: 'Each item has a passive mechanical effect — Console Cable adds hints, Packet Sniffer gives +10% lab XP. Earn items by reaching new levels.' },
};

/** Update the top-bar breadcrumb label and optional context string. */
function _updateBreadcrumb(view, context = '') {
  const meta = VIEW_META[view];
  const labelEl   = document.getElementById('current-view-label');
  const contextEl = document.getElementById('view-context');
  if (labelEl)   labelEl.textContent = meta ? meta.label : view;
  if (contextEl) {
    contextEl.textContent = context ? ` › ${context}` : (meta ? ` · ${meta.desc}` : '');
  }
}

/** Show a dismissable tip banner at the top of the view area on first visit. */
function _showTipBannerIfNew(view, viewEl) {
  if (!viewEl || store.hasVisitedView(view)) return;
  store.markViewVisited(view);

  const meta = VIEW_META[view];
  if (!meta?.tip) return;

  const banner = document.createElement('div');
  banner.id = 'tip-banner';
  banner.style.cssText = [
    'display:flex;align-items:flex-start;gap:10px',
    'margin:12px 16px 0',
    'padding:10px 14px',
    'background:rgba(0,255,65,0.05)',
    'border:1px solid rgba(0,255,65,0.18)',
    'border-left:3px solid rgba(0,255,65,0.5)',
    'border-radius:4px',
    'font-family:\'JetBrains Mono\',monospace',
    'font-size:0.72rem',
    'line-height:1.6',
    'color:#6a9a6a',
    'animation:fadeUp 0.4s ease both',
  ].join(';');

  banner.innerHTML = `
    <span style="color:#00ff41;font-size:1rem;flex-shrink:0;margin-top:1px;">💡</span>
    <span style="flex:1;"><strong style="color:#8fbc8f;">First time here?</strong> ${meta.tip}</span>
    <button id="tip-dismiss" style="
      background:none;border:none;cursor:pointer;color:#3a5a3a;
      font-size:1rem;line-height:1;padding:0 0 0 8px;flex-shrink:0;
      font-family:inherit;
    " title="Dismiss" aria-label="Dismiss tip">✕</button>`;

  // Prepend inside the first child container or directly
  const firstChild = viewEl.firstElementChild;
  if (firstChild) {
    viewEl.insertBefore(banner, firstChild);
  } else {
    viewEl.appendChild(banner);
  }

  banner.querySelector('#tip-dismiss').addEventListener('click', () => {
    banner.style.transition = 'opacity 0.25s';
    banner.style.opacity = '0';
    setTimeout(() => banner.remove(), 250);
  });

  // Auto-dismiss after 12s
  setTimeout(() => {
    if (banner.isConnected) {
      banner.style.transition = 'opacity 0.6s';
      banner.style.opacity = '0';
      setTimeout(() => banner.remove(), 600);
    }
  }, 12000);
}

/** Keyboard shortcut cheat-sheet modal (opened with `?`). */
function showShortcutsModal() {
  if (document.getElementById('shortcuts-modal')) return; // already open

  const overlay = document.createElement('div');
  overlay.id = 'shortcuts-modal';
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:10000',
    'background:rgba(0,0,0,0.82)',
    'display:flex;align-items:center;justify-content:center',
    'padding:16px',
    'backdrop-filter:blur(2px)',
  ].join(';');

  const modal = document.createElement('div');
  modal.style.cssText = [
    'background:#111;border:1px solid rgba(0,255,65,0.25)',
    'box-shadow:0 0 40px rgba(0,255,65,0.07)',
    'border-radius:8px;width:100%;max-width:520px;max-height:85vh;overflow-y:auto',
    'padding:28px',
    'font-family:\'JetBrains Mono\',\'Fira Code\',Consolas,monospace',
    'color:#c8ffc8',
  ].join(';');

  const sections = [
    {
      title: 'Quiz & Exam',
      rows: [
        ['1 / 2 / 3 / 4  or  A / B / C / D', 'Select multiple-choice option'],
        ['T  or  Y', 'Answer True'],
        ['F  or  N', 'Answer False'],
        ['1–4  (multi-select)', 'Toggle checkbox options'],
        ['Enter  or  Space', 'Submit multi-select answer'],
        ['N  or  →', 'Next question (after reveal)'],
      ],
    },
    {
      title: 'Flashcards',
      rows: [
        ['Space', 'Flip card (question → answer)'],
        ['→  or  C', 'Got it ✓ (correct)'],
        ['←  or  X', 'Missed ✗ (wrong)'],
      ],
    },
    {
      title: 'General',
      rows: [
        ['?', 'Open this shortcuts guide'],
        ['Escape', 'Close any modal'],
      ],
    },
  ];

  const sectionsHtml = sections.map(s => `
    <div style="margin-bottom:20px;">
      <div style="font-size:0.65rem;letter-spacing:0.12em;color:#4a7a4a;text-transform:uppercase;margin-bottom:10px;">
        ${s.title}
      </div>
      ${s.rows.map(([key, desc]) => `
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:5px 0;border-bottom:1px solid rgba(0,255,65,0.06);">
          <code style="background:rgba(0,255,65,0.08);border:1px solid rgba(0,255,65,0.2);
                       padding:2px 8px;border-radius:3px;font-size:0.72rem;
                       color:#00ff41;letter-spacing:0.04em;">${key}</code>
          <span style="font-size:0.74rem;color:#6a9a6a;text-align:right;max-width:60%;">${desc}</span>
        </div>`).join('')}
    </div>`).join('');

  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <div>
        <div style="font-size:0.65rem;letter-spacing:0.12em;color:#4a7a4a;margin-bottom:4px;">// KEYBOARD_SHORTCUTS</div>
        <div style="font-size:1.1rem;font-weight:800;color:#00ff41;
                    text-shadow:0 0 8px rgba(0,255,65,0.6);">Shortcut Reference</div>
      </div>
      <button id="shortcuts-close" style="
        background:none;border:1px solid rgba(0,255,65,0.2);color:#4a7a4a;
        font-family:inherit;font-size:0.75rem;padding:6px 14px;border-radius:4px;cursor:pointer;
      ">Close ✕</button>
    </div>
    ${sectionsHtml}
    <div style="font-size:0.65rem;color:#2a4a2a;text-align:center;margin-top:4px;">
      Press <code style="color:#3a6a3a;">Escape</code> or click outside to close
    </div>`;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  function close() { overlay.remove(); }
  modal.querySelector('#shortcuts-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
  });
}

function initNav() {
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.nav));
  });

  bus.on('nav:switch', ({ view }) => switchView(view));

  // `?` opens keyboard shortcut guide (when not typing in an input/textarea)
  document.addEventListener('keydown', e => {
    if (e.key === '?' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) {
      showShortcutsModal();
    }
  });

  // Mobile long-press (500ms) on nav buttons shows a floating tooltip
  document.querySelectorAll('.nav-btn[title]').forEach(btn => {
    let pressTimer = null;
    let tipEl = null;

    function showTip() {
      if (tipEl) return;
      tipEl = document.createElement('div');
      tipEl.style.cssText = [
        'position:fixed;z-index:9990',
        'background:#1a1a1a;border:1px solid rgba(0,255,65,0.3)',
        'border-radius:4px;padding:8px 12px',
        'font-family:\'JetBrains Mono\',monospace;font-size:0.7rem;color:#8fbc8f',
        'max-width:220px;line-height:1.5;pointer-events:none',
        'box-shadow:0 4px 20px rgba(0,0,0,0.6)',
      ].join(';');
      tipEl.textContent = btn.getAttribute('title');
      document.body.appendChild(tipEl);

      const rect = btn.getBoundingClientRect();
      tipEl.style.left = `${rect.right + 8}px`;
      tipEl.style.top  = `${rect.top}px`;
    }
    function hideTip() {
      if (tipEl) { tipEl.remove(); tipEl = null; }
      clearTimeout(pressTimer);
    }

    btn.addEventListener('pointerdown', () => { pressTimer = setTimeout(showTip, 500); });
    btn.addEventListener('pointerup',   hideTip);
    btn.addEventListener('pointerleave',hideTip);
  });

  // ── Story gating: unlock next beat on milestone events ──────────────────

  // Quiz completion → mark gate, record domain stats, refresh story if visible
  bus.on('quiz:completed', (summary) => {
    if (!summary.results) return; // guard against Store's own completeQuiz() event
    const week = store.state.currentWeek;
    store.updateStoryProgress(`quiz_w${week}_complete`, { seen: true, score: summary.score });

    // Build per-domain, per-week, and per-difficulty breakdown from results
    const domainStats     = {};
    const weekStats       = {};
    const difficultyStats = {};
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
      const d = q.difficulty || 'medium';
      if (!difficultyStats[d]) difficultyStats[d] = { correct: 0, total: 0 };
      difficultyStats[d].total++;
      if (r.correct) difficultyStats[d].correct++;
    });
    store.recordQuizSession({
      total: summary.total,
      correct: summary.correct,
      score: summary.score,
      mode: 'grind',
      domainStats,
      weekStats,
      difficultyStats,
      streakMultiplier: store.streakMultiplier,
    });

    // ── Session Quality Score ────────────────────────────────────────────────
    // After the session, check SRS records: totalSeen===1 → was new; >1 → was reviewed
    const elapsedMins = _sessionStartTime ? (Date.now() - _sessionStartTime) / 60000 : 0;
    _sessionStartTime = null;
    let srsReviewed = 0, newQs = 0;
    summary.results.forEach(r => {
      const srs = store.state.reviewSchedule?.[r.questionId];
      if (srs && srs.totalSeen > 1) srsReviewed++;
      else newQs++;
    });
    const accuracyPts = summary.score * 0.40;
    const srsPts      = Math.min(srsReviewed / 8,  1.0) * 20;
    const newPts      = Math.min(newQs      / 5,  1.0) * 20;
    const timePts     = Math.min(elapsedMins / 20, 1.0) * 20;
    const qualScore   = Math.round(Math.min(accuracyPts + srsPts + newPts + timePts, 100));
    _lastSessionQuality = {
      score: qualScore,
      accuracy: Math.round(accuracyPts),
      srsScore: Math.round(srsPts),
      newScore: Math.round(newPts),
      timeScore: Math.round(timePts),
      elapsedMins: Math.round(elapsedMins),
      srsReviewed,
      newQs,
    };
    store.recordSessionQuality({
      score: qualScore,
      accuracy: Math.round(accuracyPts),
      srsScore: Math.round(srsPts),
      newScore: Math.round(newPts),
      timeScore: Math.round(timePts),
      elapsedMins: Math.round(elapsedMins),
      total: summary.total,
      correct: summary.correct,
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

  _updateBreadcrumb(view);

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
    case 'projects':  renderProjects();  break;
    case 'megalabs':  renderMegaLabs();  break;
    case 'scripting': renderScripting(); break;
    default: break;
  }

  // Show first-visit tip banner (skipped for story/lab/grind — they have rich enough entry UX)
  if (!['story', 'lab'].includes(view)) {
    _showTipBannerIfNew(view, getView());
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
/** Deterministic hash of a date string → stable index for daily question pick. */
function _dailySeed(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h;
}

function _pickDailyQuestion() {
  // Pool: MC and true/false questions only (simple to answer inline)
  const pool = content.questions.filter(q =>
    (q.type === 'multiple_choice' || q.type === 'true_false') && !q.scenario_text
  );
  if (!pool.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  const idx = _dailySeed(today) % pool.length;
  return pool[idx];
}

function _renderDailyChallenge() {
  const el = document.getElementById('daily-challenge-card');
  if (!el) return;

  const q = _pickDailyQuestion();
  if (!q) { el.innerHTML = ''; return; }

  // Register today's question in store (idempotent)
  store.setDailyChallengeQuestion(q.id);
  const entry = store.getDailyChallengeEntry();
  const done  = entry?.completed;

  if (done) {
    // Greyed-out completed state
    el.innerHTML = `
      <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-3 opacity-60">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-mono text-gray-600 uppercase tracking-widest">⚡ Daily Challenge</span>
          <span class="text-xs text-green-600 font-bold">✓ Completed · +${entry.xpAwarded} XP</span>
        </div>
        <p class="text-gray-600 text-xs italic">Come back tomorrow for a new challenge.</p>
      </div>`;
    return;
  }

  // Active challenge
  const optionsHtml = q.type === 'multiple_choice'
    ? (q.options || []).map((opt, i) => `
        <button class="dc-opt w-full text-left px-3 py-2 text-xs border border-gray-700
          hover:border-green-600 hover:bg-green-900/20 rounded transition-colors"
          data-idx="${i}">${String.fromCharCode(65 + i)}. ${opt}</button>`).join('')
    : `<div class="flex gap-2">
        <button class="dc-opt flex-1 py-2 text-xs border border-gray-700 hover:border-green-500 rounded transition-colors" data-idx="true">True</button>
        <button class="dc-opt flex-1 py-2 text-xs border border-gray-700 hover:border-red-500 rounded transition-colors" data-idx="false">False</button>
      </div>`;

  el.innerHTML = `
    <div id="dc-card" class="bg-gray-900 border border-yellow-900/60 rounded-lg p-4 mb-3">
      <div class="flex items-center justify-between mb-3">
        <span class="text-xs font-mono text-yellow-600 uppercase tracking-widest">⚡ Daily Challenge</span>
        <span class="text-xs font-bold text-yellow-500 bg-yellow-900/40 border border-yellow-800 rounded px-2 py-0.5">+50 XP bonus</span>
      </div>
      <p class="text-sm text-gray-200 mb-3 leading-relaxed">${q.question}</p>
      <div id="dc-options" class="space-y-1.5">${optionsHtml}</div>
      <div id="dc-feedback" class="hidden mt-3 text-xs p-2 rounded"></div>
      <div class="mt-2 text-right">
        <span class="text-[10px] text-gray-700 font-mono">${q.domain} · ${q.difficulty || 'medium'}</span>
      </div>
    </div>`;

  // Wire answer buttons
  el.querySelectorAll('.dc-opt').forEach(btn => {
    btn.addEventListener('click', () => _submitDailyChallenge(q, btn.dataset.idx, el));
  });
}

function _submitDailyChallenge(q, answer, containerEl) {
  // Disable all buttons immediately
  containerEl.querySelectorAll('.dc-opt').forEach(b => {
    b.disabled = true; b.style.pointerEvents = 'none';
  });

  const correct = String(q.correct_answer) === String(answer);
  const feedback = containerEl.querySelector('#dc-feedback');

  // Highlight chosen button
  const chosenBtn = containerEl.querySelector(`.dc-opt[data-idx="${answer}"]`);
  if (chosenBtn) {
    if (correct) {
      chosenBtn.classList.add('border-green-500', 'bg-green-900/30', 'text-green-300');
      chosenBtn.classList.remove('border-gray-700');
      spawnFloatingXP(50, chosenBtn);
    } else {
      chosenBtn.classList.add('border-red-600', 'bg-red-900/20', 'text-red-300');
      chosenBtn.classList.remove('border-gray-700');
      // Show correct answer
      const correctBtn = containerEl.querySelector(`.dc-opt[data-idx="${q.correct_answer}"]`);
      if (correctBtn) correctBtn.classList.add('border-green-600', 'bg-green-900/20', 'text-green-400');
    }
  }

  if (feedback) {
    feedback.classList.remove('hidden');
    feedback.className = `mt-3 text-xs p-2 rounded ${correct
      ? 'bg-green-900 border border-green-700 text-green-300'
      : 'bg-red-900 border border-red-800 text-red-300'}`;
    feedback.innerHTML = `<strong>${correct ? '✓ Correct!' : '✗ Incorrect'}</strong>
      ${correct ? ' +50 XP bonus awarded.' : ''}
      ${q.explanation ? `<span class="opacity-80 ml-1">${q.explanation}</span>` : ''}`;
  }

  // Award XP and mark complete (regardless of correct/wrong — daily challenges reward participation)
  store.completeDailyChallenge(q.id);

  // Fade card to greyed state after a short delay
  setTimeout(() => {
    const card = containerEl.querySelector('#dc-card');
    if (card) {
      card.style.transition = 'opacity 0.6s';
      card.style.opacity = '0.55';
      card.style.borderColor = 'rgba(107,114,128,0.3)';
    }
    const header = containerEl.querySelector('.text-yellow-600');
    if (header) header.textContent = '⚡ Daily Challenge';
    const badge = containerEl.querySelector('.text-yellow-500');
    if (badge) { badge.textContent = '✓ Completed · +50 XP'; badge.className = 'text-xs font-bold text-green-600'; }
  }, 2500);
}

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

function renderStory() {
  const view = getView();
  view.innerHTML = `
    <div class="max-w-3xl mx-auto">
      <div id="week-timeline" class="px-6 pt-5 pb-1"></div>
      <div id="mission-card" class="px-6 pb-1"></div>
      <div id="daily-challenge-card" class="px-6 pb-1"></div>
      <div id="weak-card" class="px-6 pb-1"></div>
      <div id="story-container" class="p-6"></div>
    </div>`;
  _renderWeekTimeline();
  _renderMissionCard();
  _renderDailyChallenge();
  _renderWeakCard();
  story = new StoryMode(content.storyBeats, store, document.getElementById('story-container'));
  story.showCurrentBeat();
}

function _renderWeekTimeline() {
  const el = document.getElementById('week-timeline');
  if (!el) return;
  const state = store.state;
  const currentWeek = state.currentWeek;
  const WEEK_TOPICS = ['Network Fundamentals', 'Network Access', 'IP Connectivity', 'IP Services', 'Security Fundamentals', 'Automation'];

  // Count beats per week and how many are seen
  const beatsByWeek = {};
  (content.storyBeats || []).forEach(b => {
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

  // Connector lines between nodes
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
          <label class="flex items-center gap-1 cursor-pointer select-none border border-gray-600 rounded px-2 py-1" title="Confidence: after selecting an answer, rate how sure you were (1–5). Affects SRS — low-confidence correct answers are re-scheduled as wrong.">
            <input type="checkbox" id="quiz-confidence" class="accent-purple-500">
            <span class="text-gray-300">Confidence</span>
          </label>
          <label class="flex items-center gap-1 cursor-pointer select-none border border-gray-600 rounded px-2 py-1" title="Smart difficulty: weights question selection toward tiers you're struggling with (requires 20+ answers per tier to activate).">
            <input type="checkbox" id="quiz-smart" class="accent-blue-500">
            <span class="text-gray-300">Smart</span>
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

/**
 * Build a difficulty-weighted question pool for Smart Difficulty mode.
 * Analyses quizHistory to find which difficulty tiers have low accuracy,
 * then over-samples from those tiers proportionally.
 *
 * Weight tiers:
 *   accuracy < 60% → 3× (struggling)
 *   60–74%         → 2× (needs work)
 *   ≥75%           → 1× (proficient)
 *   < 20 answers   → 1× (not enough data)
 *
 * @param {object[]} basePool  Questions pre-filtered by week (all types, all domains)
 * @param {string}   domain    Domain filter ('all' or specific domain)
 * @returns {{ pool: object[], info: object|null }}
 */
function _computeAdaptivePool(basePool, domain) {
  const questions = (domain === 'all' ? basePool : basePool.filter(q => q.domain === domain))
    .filter(q => q.type !== 'cli_lab');

  // Aggregate per-difficulty totals across all recorded sessions
  const history = store.state.quizHistory || [];
  const diffAcc = { easy: { c: 0, t: 0 }, medium: { c: 0, t: 0 }, hard: { c: 0, t: 0 } };
  history.forEach(s => {
    Object.entries(s.difficultyStats || {}).forEach(([diff, stat]) => {
      if (diffAcc[diff]) { diffAcc[diff].c += stat.correct; diffAcc[diff].t += stat.total; }
    });
  });

  // Compute weights and accuracy values
  const MIN_ANSWERS = 20;
  const weights  = {};
  const accuracy = {};
  ['easy', 'medium', 'hard'].forEach(tier => {
    const { c, t } = diffAcc[tier];
    if (t < MIN_ANSWERS) {
      weights[tier]  = 1.0;
      accuracy[tier] = null;
    } else {
      const acc = c / t;
      accuracy[tier] = acc;
      weights[tier]  = acc < 0.60 ? 3.0 : acc < 0.75 ? 2.0 : 1.0;
    }
  });

  // Split pool into difficulty buckets; zero weight for empty buckets
  const buckets = {
    easy:   questions.filter(q => q.difficulty === 'easy'),
    medium: questions.filter(q => q.difficulty === 'medium'),
    hard:   questions.filter(q => q.difficulty === 'hard'),
  };
  ['easy', 'medium', 'hard'].forEach(t => { if (!buckets[t].length) weights[t] = 0; });

  const totalW = weights.easy + weights.medium + weights.hard;
  if (totalW === 0) return { pool: questions, info: null };

  // Allocate session of 20 questions proportionally to weights
  const SESSION = 20;
  const alloc = { easy: 0, medium: 0, hard: 0 };
  let allocated = 0;
  const tiers = ['easy', 'medium', 'hard'];
  tiers.forEach((tier, i) => {
    if (!buckets[tier].length || weights[tier] === 0) return;
    if (i < tiers.length - 1) {
      alloc[tier]  = Math.max(1, Math.round(SESSION * weights[tier] / totalW));
      alloc[tier]  = Math.min(alloc[tier], buckets[tier].length);
      allocated   += alloc[tier];
    } else {
      alloc[tier] = Math.min(buckets[tier].length, Math.max(1, SESSION - allocated));
    }
  });

  const _shuffle = arr => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const combined = [
    ..._shuffle(buckets.easy).slice(0, alloc.easy),
    ..._shuffle(buckets.medium).slice(0, alloc.medium),
    ..._shuffle(buckets.hard).slice(0, alloc.hard),
  ];

  // Identify the tier with highest boost (highest weight > 1.0)
  const boosted = tiers
    .filter(t => weights[t] > 1.0)
    .sort((a, b) => weights[b] - weights[a])[0] || null;

  return { pool: _shuffle(combined), info: { weights, accuracy, alloc, boosted } };
}

function startQuiz() {
  const domain     = document.getElementById('quiz-domain')?.value || 'all';
  const week       = document.getElementById('quiz-week')?.value   || 'all';
  const difficulty = document.getElementById('quiz-difficulty')?.value || 'all';
  const srsOn      = document.getElementById('quiz-srs')?.checked ?? true;
  const requeueOn  = document.getElementById('quiz-requeue')?.checked ?? false;
  _confidenceMode  = document.getElementById('quiz-confidence')?.checked ?? false;
  _smartDifficulty = document.getElementById('quiz-smart')?.checked ?? false;

  // If "all weeks" selected and not yet fully loaded, wait and retry
  if (week === 'all' && !_allWeeksLoaded()) {
    const prompt = document.getElementById('quiz-prompt');
    if (prompt) {
      prompt.classList.remove('hidden');
      prompt.innerHTML = `
        <div class="inline-flex flex-col items-center gap-3 py-10">
          <div class="text-xl animate-pulse">⏳</div>
          <p class="text-yellow-400 font-semibold text-sm">Loading remaining weeks…</p>
          <p class="text-gray-500 text-xs">This takes a few seconds on first load.</p>
        </div>`;
    }
    _ensureAllWeeksLoaded().then(() => {
      if (prompt) prompt.classList.add('hidden');
      startQuiz();
    });
    return;
  }

  // Pre-filter by week if selected (QuizEngine handles domain/difficulty internally)
  // Merge custom questions into the pool (✏️ badge shown during quiz when q._custom)
  const customQs = store.getCustomQuestions();
  const basePool = week === 'all' ? [...content.questions, ...customQs] : [...content.questions.filter(q => String(q.week) === String(week)), ...customQs.filter(q => week === 'all' || String(q.week) === String(week))];
  const pool = basePool;

  // Smart difficulty: pre-weight pool toward historically weak tiers (Item 2)
  // + adaptive in-session selection toward 60–70% challenge zone (Item 13)
  // Both only activate when difficulty is 'all' and SRS is off.
  const useAdaptive = _smartDifficulty && difficulty === 'all' && !srsOn;
  if (_smartDifficulty && difficulty === 'all') {
    const { pool: adaptedPool, info } = _computeAdaptivePool(pool, domain);
    _adaptiveInfo = info;
    quiz = new QuizEngine(adaptedPool, store, { domain: 'all', difficulty: 'all', count: 20, shuffle: !srsOn, srs: srsOn, requeueWrong: requeueOn, adaptive: useAdaptive });
  } else {
    _adaptiveInfo = null;
    quiz = new QuizEngine(pool, store, { domain, difficulty, count: 20, shuffle: !srsOn, srs: srsOn, requeueWrong: requeueOn, adaptive: false });
  }

  _sessionStartTime = Date.now();

  if (!quiz.start()) {
    // No questions matched the current filters — show inline empty state
    const prompt = document.getElementById('quiz-prompt');
    if (prompt) {
      prompt.classList.remove('hidden');
      prompt.innerHTML = `
        <div class="inline-flex flex-col items-center gap-3 py-10">
          <div class="text-3xl opacity-40">🔍</div>
          <p class="text-yellow-400 font-semibold text-sm">No questions match these filters</p>
          <p class="text-gray-500 text-xs max-w-xs">
            Try a different domain, week, or difficulty — or clear all filters to drill the full question bank.
          </p>
          <button onclick="document.getElementById('quiz-domain').value='all';
                           document.getElementById('quiz-week').value='all';
                           document.getElementById('quiz-difficulty').value='all';"
            class="mt-1 px-4 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-600 transition-colors">
            Clear filters
          </button>
        </div>`;
    }
    return;
  }
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
  const customBadge = q._custom
    ? '<span class="px-1.5 py-0.5 rounded text-[10px] bg-purple-950 text-purple-300 border border-purple-800" title="Your custom question">&#9998; Custom</span>'
    : '';
  const smartBadge = (_smartDifficulty && _adaptiveInfo)
    ? (() => {
        // If adaptive in-session mode is active, show live per-tier accuracy
        const adaptStats = quiz?.adaptiveStats;
        if (adaptStats) {
          const parts = ['E','M','H'].map((ltr, i) => {
            const tier = ['easy','medium','hard'][i];
            const s = adaptStats[tier];
            if (!s) return `<span class="text-gray-600">${ltr}:?</span>`;
            const color = s.acc >= 60 && s.acc <= 70 ? 'text-green-400'
                        : s.acc < 60 ? 'text-red-400' : 'text-yellow-400';
            return `<span class="${color}">${ltr}:${s.acc}%</span>`;
          }).join(' ');
          const tip = 'Smart adaptive — live difficulty balance toward 60–70% challenge zone';
          return `<span class="px-1.5 py-0.5 rounded text-[10px] bg-blue-950 text-blue-400 border border-blue-900 font-mono" title="${tip}">&#9650; ${parts}</span>`;
        }
        // Fall back to historical-pool badge (SRS on, or first question)
        const { boosted, accuracy, alloc } = _adaptiveInfo;
        if (boosted) {
          const acc = accuracy[boosted];
          const pct = acc !== null ? ` ${Math.round(acc * 100)}%` : '';
          const label = boosted.charAt(0).toUpperCase() + boosted.slice(1);
          const tip = `Smart difficulty — boosting ${label}${pct} accuracy. Pool: ${alloc.easy}E/${alloc.medium}M/${alloc.hard}H`;
          return `<span class="px-1.5 py-0.5 rounded text-[10px] bg-blue-950 text-blue-400 border border-blue-900" title="${tip}">&#9650; ${label}</span>`;
        }
        return `<span class="px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-500 border border-gray-700" title="Smart difficulty — all tiers balanced">Smart: &#9646;</span>`;
      })()
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
          ${smartBadge}
          ${customBadge}
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
    btn.addEventListener('click', () => _handleAnswerSelection(btn.dataset.answer));
  });
  document.getElementById('submit-fill')?.addEventListener('click', () => {
    _handleAnswerSelection(document.getElementById('fill-answer')?.value || '');
  });
  _initPointerDragSort('drag-list', 'submit-drag', order => _handleAnswerSelection(order));
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
    _handleAnswerSelection(answer);
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
          _handleAnswerSelection(String(idx));
        }
      } else if (_q.type === 'true_false') {
        if (k === 'T' || k === 'Y') { e.preventDefault(); _removeQuizKeyHandler(); _handleAnswerSelection('true'); }
        if (k === 'F' || k === 'N') { e.preventDefault(); _removeQuizKeyHandler(); _handleAnswerSelection('false'); }
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

function submitQuizAnswer(answer, confidence = null) {
  if (!quiz) return;
  _removeQuizKeyHandler();
  _removeConfKeyHandler();
  const currentQ = quiz.currentQuestion;
  const result   = quiz.answer(answer, confidence);

  // Track mistakes for Notebook (wrong answers accumulate)
  if (!result.correct && currentQ) store.recordMistake(currentQ.id);

  const feedback = document.getElementById('quiz-feedback');
  if (feedback) {
    const CONF_LABELS = ['Guess','Unsure','Maybe','Sure','Certain'];
    const confLabel = confidence !== null
      ? ` <span class="text-purple-400 text-xs ml-2">&#127919; ${CONF_LABELS[confidence - 1]}</span>`
      : '';
    let srsNote = '';
    if (quiz.opts.srs && confidence !== null && result.correct) {
      if (confidence <= 2) srsNote = ' <span class="text-amber-700 text-[10px] ml-1">(SRS reset — low confidence)</span>';
      else if (confidence === 3) srsNote = ' <span class="text-amber-800 text-[10px] ml-1">(SRS: half-step)</span>';
    }

    // Distractor notes: shown when question has distractor_notes field (MC only)
    let distractorHtml = '';
    if (currentQ?.type === 'multiple_choice' && currentQ.distractor_notes?.length) {
      const correctIdx = String(currentQ.correct_answer);
      const noteItems = (currentQ.options || []).map((opt, i) => {
        if (String(i) === correctIdx) return '';
        const note = currentQ.distractor_notes[i];
        if (!note) return '';
        const isUserPick = String(i) === String(answer);
        return `<div class="text-xs leading-relaxed ${isUserPick ? 'text-amber-300' : 'text-gray-500'}">
          <span class="font-mono mr-1 ${isUserPick ? 'text-amber-500' : 'text-gray-600'}">${String.fromCharCode(65 + i)}.</span>${isUserPick ? '<span class="text-amber-500 text-[10px] font-semibold">your pick — </span>' : ''}${note}
        </div>`;
      }).filter(Boolean).join('');
      if (noteItems) {
        if (result.correct) {
          distractorHtml = `<details class="mt-2 border-t border-gray-700 pt-2">
            <summary class="text-[10px] text-gray-600 font-mono cursor-pointer hover:text-gray-400 select-none">WHY OTHERS PICK WRONG &#9658;</summary>
            <div class="mt-1.5 space-y-1.5">${noteItems}</div>
          </details>`;
        } else {
          distractorHtml = `<div class="mt-2 border-t border-red-900 pt-2">
            <p class="text-[10px] font-mono mb-1.5 text-red-500">WHY PEOPLE PICK THESE:</p>
            <div class="space-y-1.5">${noteItems}</div>
          </div>`;
        }
      }
    }

    // Prereq links — only shown on wrong answers
    const prereqHtml = !result.correct ? _prereqLinksHtml(currentQ?.tags) : '';

    feedback.classList.remove('hidden');
    feedback.className = `mt-4 p-3 rounded text-sm ${result.correct ? 'bg-green-900 border border-green-600 text-green-200' : 'bg-red-900 border border-red-700 text-red-200'}`;
    feedback.innerHTML = `
      <span class="font-bold">${result.correct ? '✓ Correct!' : '✗ Incorrect'}</span>
      ${result.xpGained ? ` <span class="text-green-400 text-xs ml-2">+${result.xpGained} XP</span>` : ''}
      ${confLabel}${srsNote}
      ${result.explanation ? `<p class="mt-1 text-xs opacity-80">${result.explanation}</p>` : ''}
      ${_citationHtml(currentQ?.source_ref)}
      ${distractorHtml}${prereqHtml}`;

    // Wire up prereq navigation buttons
    feedback.querySelectorAll('.prereq-link').forEach(btn => {
      btn.addEventListener('click', () => _goToPrereq(btn.dataset.prereqType, btn.dataset.prereqId));
    });
  }

  // Flash/shake the chosen answer button
  const chosenBtn = document.querySelector(`.quiz-option[data-answer="${answer}"]`);
  if (chosenBtn) {
    if (result.correct) {
      chosenBtn.classList.add('answer-flash-correct');
      if (result.xpGained) spawnFloatingXP(result.xpGained, chosenBtn);
    } else {
      chosenBtn.classList.add('answer-shake');
    }
    chosenBtn.addEventListener('animationend', () => {
      chosenBtn.classList.remove('answer-flash-correct', 'answer-shake');
    }, { once: true });
  } else if (result.correct && result.xpGained) {
    // Fallback: no specific button matched (drag/fill), still show float
    spawnFloatingXP(result.xpGained, feedback);
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

/** Returns a collapsible 📖 Source badge for a question's source_ref, or '' if absent. */
function _citationHtml(sourceRef, extraClass = '') {
  if (!sourceRef) return '';
  return `<details class="mt-1.5 ${extraClass}">
    <summary class="text-[10px] text-gray-500 font-mono cursor-pointer hover:text-gray-300 select-none inline-flex items-center gap-1">&#128218; Source &#9658;</summary>
    <p class="mt-1 text-[11px] text-gray-500 leading-relaxed pl-1">${sourceRef}</p>
  </details>`;
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
    <div class="space-y-0.5 text-xs">${optionsHtml}</div>${expHtml}${_citationHtml(q.source_ref)}`;
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

  // Build session quality panel if data is available
  let qualityHtml = '';
  if (_lastSessionQuality) {
    const q = _lastSessionQuality;
    const label = q.score >= 90 ? 'Excellent' : q.score >= 75 ? 'Great' : q.score >= 60 ? 'Good' : q.score >= 40 ? 'Fair' : 'Weak';
    const labelColor = q.score >= 90 ? 'text-green-400' : q.score >= 75 ? 'text-green-500' : q.score >= 60 ? 'text-yellow-400' : q.score >= 40 ? 'text-orange-400' : 'text-red-400';
    const barColor   = q.score >= 75 ? 'bg-green-500' : q.score >= 50 ? 'bg-yellow-500' : 'bg-red-500';
    function miniBar(pts, max, color) {
      const pct = Math.round((pts / max) * 100);
      return `<div class="flex items-center gap-2">
        <div class="flex-1 bg-gray-800 rounded-full h-1.5">
          <div class="${color} h-1.5 rounded-full transition-all" style="width:${pct}%"></div>
        </div>
        <span class="text-gray-400 w-6 text-right text-[10px]">${pts}</span>
      </div>`;
    }
    qualityHtml = `
    <div class="bg-gray-900 border border-gray-700 rounded p-4 mb-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-xs text-gray-500 uppercase tracking-widest">Session Quality</h3>
        <div class="flex items-baseline gap-1.5">
          <span class="text-2xl font-bold ${labelColor}">${q.score}</span>
          <span class="text-xs ${labelColor} font-semibold">${label}</span>
          <span class="text-gray-600 text-xs">/100</span>
        </div>
      </div>
      <div class="w-full bg-gray-800 rounded-full h-2 mb-3">
        <div class="${barColor} h-2 rounded-full transition-all" style="width:${q.score}%"></div>
      </div>
      <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        <div>
          <div class="text-gray-600 mb-0.5">Accuracy <span class="text-gray-700">(×0.40)</span></div>
          ${miniBar(q.accuracy, 40, 'bg-blue-500')}
        </div>
        <div>
          <div class="text-gray-600 mb-0.5">SRS Reviews <span class="text-gray-700">${q.srsReviewed} items</span></div>
          ${miniBar(q.srsScore, 20, 'bg-purple-500')}
        </div>
        <div>
          <div class="text-gray-600 mb-0.5">New Questions <span class="text-gray-700">${q.newQs} seen</span></div>
          ${miniBar(q.newScore, 20, 'bg-teal-500')}
        </div>
        <div>
          <div class="text-gray-600 mb-0.5">Time on Task <span class="text-gray-700">${q.elapsedMins}m</span></div>
          ${miniBar(q.timeScore, 20, 'bg-amber-500')}
        </div>
      </div>
    </div>`;
  }

  area.innerHTML = `
    <div class="bg-gray-900 border border-gray-700 rounded p-6">
      <div class="text-center mb-5">
        <div class="text-4xl mb-3">${summary.score >= 80 ? '&#127942;' : summary.score >= 60 ? '&#128077;' : '&#128542;'}</div>
        <div class="text-2xl font-bold text-white mb-1">${summary.score}%</div>
        <div class="text-gray-400 text-sm mb-1">${summary.correct}/${summary.total} correct · +${summary.totalXP} XP earned</div>
        <div class="text-xs text-gray-600">Click any row to review the question</div>
      </div>
      ${qualityHtml}
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

  // Animate polygon growing from centre over 650ms with easeOutCubic
  const startTime = performance.now();
  const duration  = 650;
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function frame(now) {
    const progress = easeOut(Math.min(1, (now - startTime) / duration));
    _drawRadarFrame(canvas, labels, values, progress);
    if (progress < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function _drawRadarFrame(canvas, labels, values, progress) {
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

  // Data polygon fill — scaled by animation progress
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a   = start + i * step;
    const val = Math.min(1, Math.max(0, (values[i] || 0) / 100)) * progress;
    const x   = cx + Math.cos(a) * r * val;
    const y   = cy + Math.sin(a) * r * val;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle   = `rgba(6,182,212,${0.18 * progress})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(6,182,212,${0.9 * progress})`;
  ctx.lineWidth   = 2;
  ctx.stroke();

  // Data point dots — fade in with progress
  for (let i = 0; i < n; i++) {
    const a   = start + i * step;
    const val = Math.min(1, Math.max(0, (values[i] || 0) / 100)) * progress;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r * val, cy + Math.sin(a) * r * val, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(6,182,212,${progress})`;
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

/**
 * Renders a sparkline SVG of session quality scores into containerId.
 * Shows the last N sessions (up to 30).
 */
function _renderSessionSparkline(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const history = store.sessionHistory;
  if (history.length < 2) {
    container.innerHTML = '<p class="text-gray-600 text-xs italic">Complete 2+ Grind sessions to see your quality trend.</p>';
    return;
  }

  const W = container.clientWidth || 480;
  const H = 56;
  const PAD_X = 4, PAD_Y = 6;
  const scores = history.map(s => s.score);
  const minV = 0, maxV = 100;

  function xOf(i) { return PAD_X + (i / (scores.length - 1)) * (W - PAD_X * 2); }
  function yOf(v) { return PAD_Y + (1 - (v - minV) / (maxV - minV)) * (H - PAD_Y * 2); }

  // Build polyline points
  const pts = scores.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');

  // Filled area path (close down to bottom)
  const areaPath = `M${xOf(0).toFixed(1)},${yOf(scores[0]).toFixed(1)} ` +
    scores.map((v, i) => `L${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ') +
    ` L${xOf(scores.length - 1).toFixed(1)},${H} L${xOf(0).toFixed(1)},${H} Z`;

  // Last value dot + label
  const lastScore = scores[scores.length - 1];
  const lastX = xOf(scores.length - 1);
  const lastY = yOf(lastScore);
  const dotColor = lastScore >= 75 ? '#22c55e' : lastScore >= 50 ? '#eab308' : '#ef4444';

  // Avg line
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const avgY = yOf(avg).toFixed(1);

  container.innerHTML = `
    <svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="overflow:visible">
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#22c55e" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#22c55e" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <!-- Avg reference line -->
      <line x1="${PAD_X}" y1="${avgY}" x2="${W - PAD_X}" y2="${avgY}"
            stroke="#374151" stroke-width="1" stroke-dasharray="3,3"/>
      <text x="${PAD_X + 2}" y="${Number(avgY) - 3}" font-size="8" fill="#4b5563" font-family="monospace">avg ${avg}</text>
      <!-- Fill area -->
      <path d="${areaPath}" fill="url(#spark-grad)"/>
      <!-- Line -->
      <polyline points="${pts}" fill="none" stroke="#22c55e" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
      <!-- Last point dot -->
      <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3" fill="${dotColor}" stroke="#111827" stroke-width="1.5"/>
    </svg>
    <div class="flex justify-between text-[10px] text-gray-600 mt-0.5 font-mono">
      <span>${history.length} sessions</span>
      <span>Latest: <span style="color:${dotColor}">${lastScore}</span>/100</span>
    </div>`;
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
    : `<div class="py-4 text-center">
        <p class="text-gray-600 text-xs">No sessions recorded yet.</p>
        <p class="text-gray-700 text-xs mt-1">Complete your first Grind or Exam session to see history here.</p>
        <button onclick="window.switchView('grind')"
          class="mt-3 px-4 py-1.5 text-xs bg-green-900 hover:bg-green-800 text-green-300 rounded border border-green-800 transition-colors">
          ▶ Start a Session
        </button>
      </div>`;

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
    : `<div class="py-4 text-center">
        <p class="text-gray-600 text-xs">No exam runs recorded yet.</p>
        <p class="text-gray-700 text-xs mt-1">Take a full timed exam to track your domain scores and readiness progress.</p>
        <button onclick="window.switchView('exam')"
          class="mt-3 px-4 py-1.5 text-xs bg-yellow-900 hover:bg-yellow-800 text-yellow-300 rounded border border-yellow-800 transition-colors">
          ▶ Take Exam Sim
        </button>
      </div>`;

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

      <!-- Session Quality Sparkline -->
      <div class="bg-gray-900 border border-gray-700 rounded p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm text-gray-400 uppercase tracking-widest">Session Quality</h3>
          <span class="text-xs text-gray-600">last 30 Grind sessions</span>
        </div>
        <div class="text-[10px] text-gray-600 mb-2 grid grid-cols-4 gap-x-2">
          <span><span class="text-blue-400">■</span> Accuracy ×0.40</span>
          <span><span class="text-purple-400">■</span> SRS reviews ×0.20</span>
          <span><span class="text-teal-400">■</span> New Qs ×0.20</span>
          <span><span class="text-amber-400">■</span> Time ×0.20</span>
        </div>
        <div id="session-sparkline-container"></div>
      </div>

      <!-- Study Heatmap -->
      <div class="bg-gray-900 border border-gray-700 rounded p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm text-gray-400 uppercase tracking-widest">Study Activity</h3>
          <span class="text-xs text-gray-600">12-week rolling window</span>
        </div>
        <div id="heatmap-container" class="overflow-x-auto"></div>
      </div>

      <!-- Save Management -->
      <div class="bg-gray-900 border border-green-900/40 rounded p-5">
        <h3 class="text-sm text-green-700 uppercase tracking-widest mb-3">Save Management</h3>
        <p class="text-xs text-gray-600 mb-4">
          All progress is stored in your browser. Export a backup before clearing cache or to transfer to another device.
        </p>
        <div class="flex flex-wrap gap-3">
          <button id="export-save" class="px-4 py-2 bg-green-900/30 border border-green-700 text-green-400 text-xs rounded hover:bg-green-900/60 transition-colors">
            &#8595; Export Save
          </button>
          <label id="import-save-label" class="px-4 py-2 bg-blue-900/30 border border-blue-700 text-blue-400 text-xs rounded hover:bg-blue-900/60 transition-colors cursor-pointer">
            &#8593; Import Save
            <input id="import-save-input" type="file" accept=".json,application/json" class="hidden">
          </label>
        </div>
      </div>

      <!-- Share Progress -->
      <div class="bg-gray-900 border border-gray-700 rounded p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm text-gray-400 uppercase tracking-widest">Share Progress</h3>
          <span class="text-xs text-gray-600">Discord / Reddit / group chat</span>
        </div>
        <p class="text-xs text-gray-600 mb-3">Generates a plain-text summary card you can paste anywhere. No server needed.</p>
        <div id="share-preview" class="bg-gray-950 border border-gray-800 rounded p-3 font-mono text-xs text-green-400 whitespace-pre-wrap leading-relaxed mb-3 hidden"></div>
        <div class="flex gap-2">
          <button id="share-generate" class="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs border border-gray-600 rounded transition-colors">
            Generate Card
          </button>
          <button id="share-copy" class="hidden px-4 py-2 bg-green-900/40 hover:bg-green-900/70 text-green-300 text-xs border border-green-800 rounded transition-colors">
            Copy to Clipboard
          </button>
        </div>
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

  // Draw radar chart, sparkline, and heatmap after DOM is ready
  setTimeout(() => {
    _drawRadar('radar-canvas', domains, radarValues);
    _renderSessionSparkline('session-sparkline-container');
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

  // Share Progress — generate plain-text summary card
  document.getElementById('share-generate')?.addEventListener('click', () => {
    const allTime = history.reduce((acc, s) => {
      acc.correct += s.correct || 0;
      acc.total   += s.total   || 0;
      return acc;
    }, { correct: 0, total: 0 });
    const overallAcc = allTime.total > 0 ? Math.round((allTime.correct / allTime.total) * 100) : 0;

    const topWeak = weakDomains.slice(0, 3).map(d => `  • ${d.domain} — ${d.pct}%`).join('\n');
    const streakLine = store.state.streak?.current > 0
      ? `🔥 Streak: ${store.state.streak.current} day${store.state.streak.current !== 1 ? 's' : ''} (longest: ${store.state.streak.longest || store.state.streak.current})`
      : '🔥 Streak: —';

    const daysLine = store.daysUntilExam !== null
      ? `📅 Exam in: ${store.daysUntilExam} day${store.daysUntilExam !== 1 ? 's' : ''}`
      : '';

    const labLine = `🖥  Labs done: ${store.state.completedLabs?.length || 0}/${content.labs?.length || 0}`;

    const sessionQualLine = store.sessionHistory.length > 0
      ? `📊 Last session quality: ${store.sessionHistory[store.sessionHistory.length - 1].score}/100`
      : '';

    const lines = [
      '```',
      '╔══════════════════════════════════╗',
      '║     CCNA MASTERY — PROGRESS      ║',
      '╚══════════════════════════════════╝',
      `👤 ${store.state.playerName}  |  Lv.${store.state.level}  |  ${store.state.xp.toLocaleString()} XP`,
      `🎯 Readiness: ${readiness}% (${readinessLabel})`,
      `✅ Accuracy: ${overallAcc}% over ${allTime.total} questions`,
      streakLine,
      labLine,
      sessionQualLine,
      daysLine,
      topWeak ? `\n🔍 Weakest domains:\n${topWeak}` : '',
      '',
      '🚀 CCNA Mastery — free, offline, gamified',
      '   ccna-mastery.pages.dev',
      '```',
    ].filter(Boolean).join('\n');

    const preview = document.getElementById('share-preview');
    const copyBtn = document.getElementById('share-copy');
    if (preview) { preview.textContent = lines; preview.classList.remove('hidden'); }
    if (copyBtn) copyBtn.classList.remove('hidden');
    copyBtn._shareText = lines;
  });

  document.getElementById('share-copy')?.addEventListener('click', function() {
    const text = this._shareText || '';
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      const orig = this.textContent;
      this.textContent = 'Copied!';
      this.classList.add('bg-green-800');
      setTimeout(() => { this.textContent = orig; this.classList.remove('bg-green-800'); }, 2000);
    }).catch(() => {
      // Fallback for browsers without clipboard API
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Copied to clipboard!', 2000);
    });
  });

  // Export save — download game state as .json file
  document.getElementById('export-save')?.addEventListener('click', () => {
    const json = store.exportSave();
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ccna-mastery-save-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Import save — read .json file and restore game state
  document.getElementById('import-save-input')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const container = document.getElementById('toast-container');
      const showToast = (msg, cls) => {
        if (!container) return;
        const el = document.createElement('div');
        el.className = `px-4 py-2 border rounded shadow-lg text-sm transition-all duration-300 opacity-0 translate-y-2 ${cls}`;
        el.textContent = msg;
        container.appendChild(el);
        requestAnimationFrame(() => el.classList.remove('opacity-0', 'translate-y-2'));
        setTimeout(() => {
          el.classList.add('opacity-0', 'translate-y-2');
          el.addEventListener('transitionend', () => el.remove(), { once: true });
        }, 3000);
      };
      try {
        store.importSave(ev.target.result);
        renderStats();
        showToast('Save imported successfully!', 'bg-green-900 border-green-500 text-green-200');
      } catch {
        showToast('Failed to import — invalid save file.', 'bg-red-900 border-red-500 text-red-200');
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-imported if needed
    e.target.value = '';
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
  // Exam needs all weeks — if still loading, wait and retry
  if (!_allWeeksLoaded()) {
    const area = document.getElementById('exam-area');
    if (area) {
      area.classList.remove('hidden');
      area.innerHTML = `<div class="flex flex-col items-center gap-3 py-16 text-center">
        <div class="text-2xl animate-pulse">⏳</div>
        <p class="text-yellow-400 font-semibold">Loading question bank…</p>
        <p class="text-gray-500 text-xs">Starting exam once all weeks are ready.</p>
      </div>`;
    }
    _ensureAllWeeksLoaded().then(() => startExam());
    return;
  }

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
      ${!isRight && q.explanation ? `<p class="mt-1 text-xs opacity-80">${q.explanation}</p>` : ''}
      ${_citationHtml(q.source_ref)}`;
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
    const bar = document.getElementById('player-hp-bar');
    if (bar) {
      bar.style.width = pct + '%';
      bar.classList.remove('hp-damage-flash');
      // Force reflow to restart animation
      void bar.offsetWidth;
      bar.classList.add('hp-damage-flash');
      bar.addEventListener('animationend', () => bar.classList.remove('hp-damage-flash'), { once: true });
    }
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

  // Phase breakdown bars
  const phaseOrder = ['easy', 'medium', 'hard'];
  const phaseColors = { easy: 'bg-green-500', medium: 'bg-yellow-500', hard: 'bg-red-500' };
  const phaseRows = phaseOrder
    .filter(p => (result.phaseStats?.[p]?.total || 0) > 0)
    .map(p => {
      const { correct = 0, total = 0 } = result.phaseStats?.[p] || {};
      const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
      return `
        <div class="flex items-center gap-2 text-xs">
          <span class="w-14 text-gray-500 capitalize">${p}</span>
          <div class="flex-1 bg-gray-800 rounded h-2 overflow-hidden">
            <div class="${phaseColors[p]} h-full rounded" style="width:${pct}%"></div>
          </div>
          <span class="w-16 text-right ${pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400'}">${correct}/${total} (${pct}%)</span>
        </div>`;
    }).join('');

  // HP bar
  const hpPct = result.victory ? Math.round((100 - (result.correct / Math.max(result.total, 1)) * 100)) : 0;

  view.innerHTML = `
    <div class="max-w-md mx-auto p-8 space-y-5">
      <div class="text-center">
        <div class="text-6xl mb-3">${result.victory ? '&#127942;' : '&#128128;'}</div>
        <h2 class="text-2xl font-bold ${result.victory ? 'text-green-300' : 'text-red-300'} mb-1">
          ${result.victory ? 'BOSS DEFEATED!' : 'DEFEATED...'}
        </h2>
        <p class="text-gray-400 text-sm">Score: <span class="font-bold text-white">${result.finalScore}%</span>  ·  Time: <span class="font-mono">${result.elapsed}s</span>  ·  <span class="${result.victory ? 'text-green-400' : 'text-red-400'}">${result.correctCount ?? '?'}/${result.total ?? '?'} correct</span></p>
        ${result.perfectRun ? '<p class="text-yellow-400 font-bold text-sm mt-1">&#11088; PERFECT RUN! +100 XP Bonus</p>' : ''}
      </div>

      ${phaseRows ? `
      <div class="bg-gray-900 border border-gray-700 rounded p-4 space-y-2">
        <div class="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">Phase Breakdown</div>
        ${phaseRows}
      </div>` : ''}

      <div class="flex justify-center gap-3">
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
        <div class="flex gap-1 border border-gray-700 rounded overflow-hidden">
          <button id="tab-basic" class="subnet-tab px-3 py-1 text-xs bg-cyan-800 text-cyan-200 font-semibold" data-tab="basic">Basic</button>
          <button id="tab-vlsm"  class="subnet-tab px-3 py-1 text-xs bg-gray-800 text-gray-400 hover:bg-gray-700" data-tab="vlsm">VLSM</button>
        </div>
      </div>

      <!-- Basic mode -->
      <div id="subnet-basic-panel">
        <div class="flex items-center justify-between mb-4">
          <select id="subnet-diff" class="bg-gray-800 border border-gray-600 text-gray-300 rounded px-2 py-1 text-xs">
            <option value="easy">Easy (/24–/28)</option>
            <option value="medium" selected>Medium (/19–/28)</option>
            <option value="hard">Hard (/16–/30)</option>
          </select>
          <button id="new-problem" class="px-4 py-1 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-sm font-semibold">New Problem</button>
        </div>
        <div id="subnet-problem" class="bg-gray-900 border border-gray-700 rounded p-5 font-mono">
          <p class="text-gray-500 text-sm text-center">Press "New Problem" to begin.</p>
        </div>
        <div id="subnet-results" class="hidden space-y-1 text-sm font-mono mt-3"></div>
      </div>

      <!-- VLSM mode -->
      <div id="subnet-vlsm-panel" class="hidden space-y-4">
        <div class="bg-gray-900 border border-gray-700 rounded p-4 text-xs text-gray-400 space-y-1">
          <p><span class="text-cyan-300 font-semibold">VLSM Challenge:</span> Given a base network, allocate subnets to meet each department's host requirements. Subnets are allocated largest-first.</p>
          <p class="text-gray-600">Enter the Network Address and CIDR for each subnet.</p>
        </div>
        <div class="flex justify-end">
          <button id="vlsm-new" class="px-4 py-1 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-sm font-semibold">New Challenge</button>
        </div>
        <div id="vlsm-problem" class="bg-gray-900 border border-gray-700 rounded p-5 font-mono">
          <p class="text-gray-500 text-sm text-center">Press "New Challenge" to begin.</p>
        </div>
      </div>
    </div>`;

  // Tab switching
  document.querySelectorAll('.subnet-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.subnet-tab').forEach(b => {
        b.className = 'subnet-tab px-3 py-1 text-xs bg-gray-800 text-gray-400 hover:bg-gray-700';
      });
      btn.className = 'subnet-tab px-3 py-1 text-xs bg-cyan-800 text-cyan-200 font-semibold';
      const isVlsm = btn.dataset.tab === 'vlsm';
      document.getElementById('subnet-basic-panel').classList.toggle('hidden', isVlsm);
      document.getElementById('subnet-vlsm-panel').classList.toggle('hidden', !isVlsm);
    });
  });

  document.getElementById('new-problem')?.addEventListener('click', generateSubnetProblem);
  document.getElementById('vlsm-new')?.addEventListener('click', generateVLSMChallenge);
}

function generateVLSMChallenge() {
  const panel = document.getElementById('vlsm-problem');
  if (!panel) return;

  // Random /24 base network
  const oct1 = [10, 172, 192][Math.floor(Math.random() * 3)];
  const oct2 = Math.floor(Math.random() * 254) + 1;
  const oct3 = Math.floor(Math.random() * 254) + 1;
  const baseNet = `${oct1}.${oct2}.${oct3}.0`;
  const baseCidr = 24;

  // Random host requirements (4 departments, sorted largest-first by VLSM)
  const DEPT_NAMES = ['Sales', 'Engineering', 'Management', 'IT Support', 'Operations', 'Finance', 'HR', 'Security'];
  const shuffled = [...DEPT_NAMES].sort(() => Math.random() - 0.5).slice(0, 4);
  const HOST_REQS = [
    [60, 28, 12, 2],
    [50, 25, 10, 2],
    [100, 50, 20, 6],
    [30, 14, 6, 2],
  ][Math.floor(Math.random() * 4)];

  const depts = shuffled.map((name, i) => ({ name, hosts: HOST_REQS[i] }))
                        .sort((a, b) => b.hosts - a.hosts);

  const solutions = calculateVLSM(baseNet, baseCidr, depts.map(d => d.hosts));

  panel.dataset.solutions = JSON.stringify(solutions);
  panel.dataset.depts     = JSON.stringify(depts);

  panel.innerHTML = `
    <div class="mb-4 text-center">
      <div class="text-yellow-400 text-xs uppercase tracking-widest mb-1">Base Network</div>
      <div class="text-white text-2xl font-bold">${baseNet}/${baseCidr}</div>
      <div class="text-gray-500 text-xs mt-1">Allocate subnets largest-first</div>
    </div>
    <div class="space-y-3">
      ${depts.map((d, i) => `
        <div class="flex items-center gap-3 flex-wrap">
          <div class="w-28 shrink-0">
            <div class="text-gray-300 text-xs font-semibold">${d.name}</div>
            <div class="text-gray-600 text-xs">${d.hosts} hosts needed</div>
          </div>
          <input type="text" data-vlsm-net="${i}" autocomplete="off" spellcheck="false"
            placeholder="Network (e.g. 192.168.1.0)"
            class="vlsm-net-input flex-1 min-w-32 bg-gray-800 border border-gray-600 rounded px-3 py-1 text-white text-sm outline-none focus:border-cyan-500 transition-colors font-mono" />
          <span class="text-gray-500 text-xs">/</span>
          <input type="number" data-vlsm-cidr="${i}" min="16" max="30"
            placeholder="CIDR"
            class="vlsm-cidr-input w-16 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm outline-none focus:border-cyan-500 transition-colors font-mono" />
        </div>`).join('')}
    </div>
    <div class="flex justify-between items-center mt-5">
      <button id="vlsm-hint-btn" class="px-3 py-1.5 text-xs bg-yellow-800 hover:bg-yellow-700 text-yellow-200 rounded">Hint</button>
      <button id="vlsm-submit" class="px-5 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white rounded font-semibold text-sm">Check Answers</button>
    </div>
    <div id="vlsm-results" class="hidden mt-4 space-y-2 text-xs font-mono"></div>`;

  let hintUsed = 0;
  document.getElementById('vlsm-hint-btn')?.addEventListener('click', () => {
    const s = solutions[hintUsed % solutions.length];
    const d = depts[hintUsed % depts.length];
    if (store.useHint()) {
      alert(`Hint: ${d.name} (${d.hosts} hosts) → /${s.cidr} subnet mask: ${s.subnetMask}\nStarting from: ${s.networkId}`);
      hintUsed++;
    } else {
      alert('Not enough hints or XP.');
    }
  });

  document.getElementById('vlsm-submit')?.addEventListener('click', () => checkVLSMAnswers(solutions, depts));
}

function checkVLSMAnswers(solutions, depts) {
  const resultsEl = document.getElementById('vlsm-results');
  if (!resultsEl) return;
  resultsEl.classList.remove('hidden');

  let allCorrect = true;
  const rows = solutions.map((sol, i) => {
    const netInput  = document.querySelector(`[data-vlsm-net="${i}"]`);
    const cidrInput = document.querySelector(`[data-vlsm-cidr="${i}"]`);
    if (!netInput || !cidrInput) return '';

    const userNet  = (netInput.value || '').trim();
    const userCidr = parseInt(cidrInput.value, 10);
    const netOk    = userNet === sol.networkId;
    const cidrOk   = userCidr === sol.cidr;
    const rowOk    = netOk && cidrOk;
    if (!rowOk) allCorrect = false;

    netInput.classList.toggle('border-green-500', netOk);
    netInput.classList.toggle('border-red-500',   !netOk);
    cidrInput.classList.toggle('border-green-500', cidrOk);
    cidrInput.classList.toggle('border-red-500',   !cidrOk);

    return `<div class="flex gap-2 items-center ${rowOk ? 'text-green-400' : 'text-red-400'}">
      <span>${rowOk ? '✓' : '✗'}</span>
      <span class="w-20 text-gray-400">${depts[i]?.name}</span>
      <span class="text-gray-500">→</span>
      <span>${sol.networkId}/${sol.cidr}</span>
      <span class="text-gray-600">(${sol.subnetMask} · ${sol.totalHosts} hosts · bcast: ${sol.broadcast})</span>
    </div>`;
  });

  resultsEl.innerHTML = `
    <div class="font-bold ${allCorrect ? 'text-green-400' : 'text-yellow-400'} mb-2">
      ${allCorrect ? '✓ PERFECT VLSM! +75 XP' : 'Solution:'}
    </div>
    ${rows.join('')}`;

  if (allCorrect) {
    store.addXP(75, 'vlsm_perfect');
    store.unlockAchievement('vlsm_master', 'VLSM Master');
  }
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

  let pool = [...content.questions, ...store.getCustomQuestions()].filter(q => q.type !== 'cli_lab' && q.type !== 'drag_drop' && q.type !== 'ordering');
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
              <div class="text-[10px] text-gray-600 uppercase tracking-widest mb-2">${q.domain} · ${q.type.replace('_', ' ')}${q._custom ? ' · <span class="text-purple-500">&#9998; custom</span>' : ''}</div>
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
              ${_citationHtml(q.source_ref, 'border-t border-gray-800 pt-2')}
              ${(() => {
                if (q.type !== 'multiple_choice' || !q.distractor_notes?.length) return '';
                const correctIdx = String(q.correct_answer);
                const noteItems = (q.options || []).map((opt, i) => {
                  if (String(i) === correctIdx) return '';
                  const note = q.distractor_notes[i];
                  if (!note) return '';
                  return `<div class="text-xs text-gray-500 leading-relaxed"><span class="font-mono text-gray-600 mr-1">${String.fromCharCode(65+i)}.</span>${note}</div>`;
                }).filter(Boolean).join('');
                if (!noteItems) return '';
                return `<details class="mt-2 border-t border-gray-800 pt-2">
                  <summary class="text-[10px] text-gray-600 font-mono cursor-pointer hover:text-gray-400 select-none">WHY OTHERS PICK WRONG &#9658;</summary>
                  <div class="mt-1.5 space-y-1.5">${noteItems}</div>
                </details>`;
              })()}
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

  // SRS distribution across all cards in the session
  const allIds = cards.map(c => c.id).filter(Boolean);
  const srsStats = store.getSRSStats(allIds);
  const srsBars = [
    { label: 'NEW',      count: srsStats.new,      color: 'bg-gray-500',   text: 'text-gray-400'   },
    { label: 'DUE',      count: srsStats.due,       color: 'bg-red-500',    text: 'text-red-400'    },
    { label: 'LEARNING', count: srsStats.learning,  color: 'bg-yellow-500', text: 'text-yellow-400' },
    { label: 'MASTERED', count: srsStats.mastered,  color: 'bg-green-500',  text: 'text-green-400'  },
  ].map(b => {
    const pctBar = allIds.length > 0 ? Math.round((b.count / allIds.length) * 100) : 0;
    return `
      <div class="flex items-center gap-2 text-xs">
        <span class="w-16 ${b.text} font-mono">${b.label}</span>
        <div class="flex-1 bg-gray-800 rounded h-2 overflow-hidden">
          <div class="${b.color} h-full rounded" style="width:${pctBar}%"></div>
        </div>
        <span class="w-8 text-right ${b.text}">${b.count}</span>
      </div>`;
  }).join('');

  area.innerHTML = `
    <div class="bg-gray-900 border border-purple-800 rounded-xl p-6 space-y-4">
      <div class="text-center space-y-2">
        <div class="text-4xl">${pct >= 80 ? '⚡' : pct >= 60 ? '📖' : '💡'}</div>
        <div class="text-3xl font-bold font-mono ${pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400'}">${pct}%</div>
        <div class="flex justify-center gap-8 text-sm">
          <div><span class="text-green-400 font-bold text-xl">${gotIt}</span><div class="text-gray-500 text-xs">Got It</div></div>
          <div><span class="text-red-400 font-bold text-xl">${missed}</span><div class="text-gray-500 text-xs">Missed</div></div>
          <div><span class="text-gray-300 font-bold text-xl">${cards.length}</span><div class="text-gray-500 text-xs">Total</div></div>
        </div>
      </div>

      ${allIds.length > 0 ? `
      <div class="border-t border-gray-800 pt-3 space-y-1.5">
        <div class="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">SRS Deck Health</div>
        ${srsBars}
        <p class="text-xs text-gray-700 mt-1">SRS updated for all ${results.length} rated cards.</p>
      </div>` : ''}

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
      id: 'cidr', title: 'Subnetting & CIDR', diagramId: 'subnetting',
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
      id: 'ports', title: 'Well-Known Ports', diagramId: 'ports',
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
      id: 'osi', title: 'OSI vs TCP/IP Model', diagramId: 'osi',
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
      id: 'routing', title: 'Routing Protocol Comparison', diagramId: 'routing',
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
      id: 'stp', title: 'STP — States, Roles & Timers', diagramId: 'stp',
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
      id: 'ospf', title: 'OSPF LSA Types & Area Types', diagramId: 'ospf',
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
      id: 'ipv6', title: 'IPv6 Address Types', diagramId: 'ipv6',
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
      id: 'fhrp', title: 'HSRP / VRRP / GLBP', diagramId: 'hsrp',
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
      id: 'snmp', title: 'SNMP Versions', diagramId: 'snmp',
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
      id: 'aaa', title: 'AAA / TACACS+ / RADIUS', diagramId: 'aaa',
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
      id: 'cloud', title: '☁️ Cloud Computing', diagramId: 'cloud',
      content: `<div class="text-xs text-gray-400 mb-3">
        <span class="text-blue-300">IaaS</span> — rent compute/storage/network &nbsp;·&nbsp;
        <span class="text-purple-300">PaaS</span> — deploy code, provider manages runtime &nbsp;·&nbsp;
        <span class="text-green-300">SaaS</span> — consume the application
      </div>` +
      T(
        ['Model','You Manage','Provider Manages','Examples'],
        [
          ['On-Prem','Everything','Nothing','Your own DC'],
          ['IaaS','OS, runtime, apps','Servers, storage, network','AWS EC2, Azure VMs, GCP'],
          ['PaaS','Applications only','OS, runtime, middleware','Heroku, App Service, Elastic Beanstalk'],
          ['SaaS','Configuration only','Everything','Gmail, Salesforce, M365'],
        ]
      ) + `<div class="mt-2 text-xs text-gray-500">Use the interactive diagram above to explore service models, deployment types, virtual networking mappings, and SD-WAN/SASE.</div>`
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
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-gray-200">${s.title}</span>
          ${s.diagramId ? `<span class="text-xs text-green-600 border border-green-900 rounded px-1.5 py-0.5">📐 diagram</span>` : ''}
        </div>
        <span class="ref-caret text-gray-500 text-xs">▶</span>
      </button>
      <div class="ref-body hidden border border-t-0 border-gray-700 rounded-b px-4 py-4 bg-gray-950">
        ${s.content}
        ${s.diagramId ? `
        <div class="mt-4 border-t border-gray-800 pt-4">
          <button class="ref-deepdive-btn flex items-center gap-2 text-xs text-green-500 hover:text-green-300 transition-colors" data-diagram="${s.diagramId}">
            <span class="ref-deepdive-caret">▶</span> 📐 Interactive Diagram
          </button>
          <div class="ref-deepdive-panel hidden mt-3 p-3 bg-black border border-green-900/40 rounded"></div>
        </div>` : ''}
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

  // Deep Dive diagram toggle (event delegation on ref-list)
  document.getElementById('ref-list')?.addEventListener('click', e => {
    const ddBtn = e.target.closest('.ref-deepdive-btn');
    if (ddBtn) {
      const panel  = ddBtn.parentElement.querySelector('.ref-deepdive-panel');
      const caret  = ddBtn.querySelector('.ref-deepdive-caret');
      const isOpen = !panel.classList.contains('hidden');
      panel.classList.toggle('hidden', isOpen);
      if (caret) caret.textContent = isOpen ? '▶' : '▼';
      if (!isOpen && panel.dataset.loaded !== '1') {
        panel.dataset.loaded = '1';
        renderDiagram(ddBtn.dataset.diagram, panel);
      }
      return;
    }
  });

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

function _exportNotebook() {
  const questionMap = {};
  content.questions.forEach(q => { questionMap[q.id] = q; });

  const flaggedIds  = store.getFlaggedIds();
  const allMistakes = Object.entries(store.state.mistakeNotebook || {})
    .sort(([, a], [, b]) => b - a);

  const today = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  const lines = [];

  lines.push('# CCNA Mastery — Study Notebook Export');
  lines.push(`Generated: ${today}  ·  Player: ${store.state.playerName}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  function formatQuestion(q, prefix = '') {
    if (!q) return [];
    const out = [];
    out.push(`**Q:** ${q.question}`);
    out.push('');

    if (q.type === 'multiple_choice' && q.options) {
      out.push('**Options:**');
      q.options.forEach((opt, i) => {
        const letter = String.fromCharCode(65 + i);
        const isCorrect = String(i) === String(q.correct_answer);
        out.push(`- ${letter}. ${opt}${isCorrect ? ' ← ✓ CORRECT' : ''}`);
      });
      out.push('');
      const correctLetter = String.fromCharCode(65 + Number(q.correct_answer));
      out.push(`**Answer:** ${correctLetter}. ${q.options[q.correct_answer] || ''}`);
    } else if (q.type === 'true_false') {
      const ans = String(q.correct_answer).toLowerCase() === 'true' ? 'True' : 'False';
      out.push(`**Answer:** ${ans}`);
    } else if (q.type === 'multi_select' && q.options) {
      out.push('**Options (select all that apply):**');
      const correct = Array.isArray(q.correct_answer) ? q.correct_answer.map(String) : [String(q.correct_answer)];
      q.options.forEach((opt, i) => {
        const isCorrect = correct.includes(String(i));
        out.push(`- [${isCorrect ? 'x' : ' '}] ${opt}`);
      });
    } else if (q.type === 'drag_drop') {
      out.push('**Correct order:**');
      const items = Array.isArray(q.correct_answer) ? q.correct_answer : [];
      items.forEach((item, i) => out.push(`${i + 1}. ${item}`));
    }

    if (q.explanation) {
      out.push('');
      out.push(`**Explanation:** ${q.explanation}`);
    }
    if (q.source_ref) {
      out.push('');
      out.push(`**Source:** ${q.source_ref}`);
    }
    out.push('');
    out.push(`*${q.domain || ''}${q.difficulty ? ' · ' + q.difficulty : ''}${q.week != null ? ' · Week ' + q.week : ''}*`);
    return out;
  }

  // ── Flagged Questions ──
  lines.push(`## ⚑ Flagged Questions (${flaggedIds.length})`);
  lines.push('');
  if (flaggedIds.length === 0) {
    lines.push('*No flagged questions. Use the ⚐ Flag button during any quiz to mark tricky questions.*');
  } else {
    flaggedIds.forEach((id, idx) => {
      const q = questionMap[id];
      if (!q) return;
      lines.push(`### ${idx + 1}.`);
      lines.push(...formatQuestion(q));
      lines.push('---');
      lines.push('');
    });
  }

  lines.push('');
  lines.push(`## ✗ Mistake Questions (${allMistakes.length} tracked)`);
  lines.push('');
  if (allMistakes.length === 0) {
    lines.push('*No mistakes recorded yet.*');
  } else {
    allMistakes.forEach(([id, count], idx) => {
      const q = questionMap[id];
      if (!q) return;
      lines.push(`### ${idx + 1}. *(wrong ${count}×)*`);
      lines.push(...formatQuestion(q));
      lines.push('---');
      lines.push('');
    });
  }

  // ── Custom Questions ──
  const customQs = store.getCustomQuestions();
  lines.push('');
  lines.push(`## ✏️ Custom Questions (${customQs.length})`);
  lines.push('');
  if (customQs.length === 0) {
    lines.push('*No custom questions created yet. Use the Create Question form in the Notebook view.*');
  } else {
    customQs.forEach((q, idx) => {
      lines.push(`### ${idx + 1}.`);
      lines.push(...formatQuestion(q));
      lines.push('---');
      lines.push('');
    });
  }

  lines.push('');
  lines.push('---');
  lines.push('*Exported from CCNA Mastery — free, offline, gamified CCNA 200-301 study app.*');

  const md = lines.join('\n');
  const dateSlug = new Date().toISOString().slice(0, 10);
  const filename = `ccna-notebook-${dateSlug}.md`;

  const blob = new Blob([md], { type: 'text/markdown; charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function _exportToAnki() {
  const questionMap = {};
  content.questions.forEach(q => { questionMap[q.id] = q; });

  const flaggedIds  = store.getFlaggedIds();
  const mistakeIds  = Object.keys(store.state.mistakeNotebook || {});
  const customQs    = store.getCustomQuestions();

  // Deduplicate: flagged + mistakes + custom, preserve order
  const seen = new Set();
  const ids = [...flaggedIds, ...mistakeIds];
  const dedupedQs = [];
  ids.forEach(id => {
    if (!seen.has(id)) { seen.add(id); dedupedQs.push(questionMap[id]); }
  });
  customQs.forEach(q => {
    if (!seen.has(q.id)) { seen.add(q.id); dedupedQs.push(q); }
  });

  function ankiFront(q) {
    if (!q) return '';
    let front = q.question || '';
    if ((q.type === 'multiple_choice' || q.type === 'multi_select') && q.options) {
      front += '\n\n' + q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n');
      if (q.type === 'multi_select') front += '\n\n(Select all that apply)';
    } else if (q.type === 'drag_drop' && q.items) {
      front += '\n\nArrange in correct order:\n' + q.items.map((item, i) => `${i + 1}. ${item}`).join('\n');
    }
    // Escape for Anki (basic HTML encoding)
    return front.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  }

  function ankiBack(q) {
    if (!q) return '';
    let back = '';
    if (q.type === 'multiple_choice' && q.options) {
      const idx = Number(q.correct_answer);
      back = `<b>${String.fromCharCode(65 + idx)}. ${q.options[idx] || ''}</b>`;
    } else if (q.type === 'true_false') {
      const ans = String(q.correct_answer).toLowerCase() === 'true' ? 'True' : 'False';
      back = `<b>${ans}</b>`;
    } else if (q.type === 'multi_select' && q.options) {
      const correct = Array.isArray(q.correct_answer) ? q.correct_answer.map(String) : [String(q.correct_answer)];
      const letters = correct.map(i => String.fromCharCode(65 + Number(i))).join(', ');
      const answers = correct.map(i => q.options[Number(i)]).join('; ');
      back = `<b>${letters}: ${answers}</b>`;
    } else if (q.type === 'drag_drop') {
      const items = Array.isArray(q.correct_answer) ? q.correct_answer : [];
      back = '<b>Correct order:</b><br>' + items.map((item, i) => `${i + 1}. ${item}`).join('<br>');
    } else {
      back = `<b>${q.correct_answer || ''}</b>`;
    }
    if (q.explanation) {
      back += `<br><br>${q.explanation.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}`;
    }
    return back;
  }

  function ankiTags(q) {
    if (!q) return 'ccna';
    const tags = ['ccna'];
    if (q.domain) tags.push(q.domain.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
    if (q.difficulty) tags.push(q.difficulty);
    if (q.week != null) tags.push(`week_${q.week}`);
    if (q._custom) tags.push('custom');
    if (flaggedIds.includes(q.id)) tags.push('flagged');
    if (store.state.mistakeNotebook?.[q.id]) tags.push('mistake');
    return tags.join(' ');
  }

  const lines = [
    '#separator:tab',
    '#html:true',
    '#notetype:Basic',
    '#deck:CCNA Mastery',
    '#tags column:3',
  ];

  let exported = 0;
  dedupedQs.forEach(q => {
    if (!q) return;
    const front = ankiFront(q);
    const back  = ankiBack(q);
    if (!front || !back) return;
    lines.push(`${front}\t${back}\t${ankiTags(q)}`);
    exported++;
  });

  if (exported === 0) {
    alert('No questions to export. Flag questions or make some mistakes first!');
    return;
  }

  const dateSlug = new Date().toISOString().slice(0, 10);
  const filename = `ccna-anki-${dateSlug}.txt`;
  const blob = new Blob([lines.join('\n')], { type: 'text/plain; charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`Exported ${exported} cards → ${filename}. Import via Anki → File → Import.`, 4000);
}

function renderNotebook() {
  const view        = getView();
  const mistakeIds  = store.getMistakeIds(2);  // wrong ≥ 2 times
  const allMistakes = Object.entries(store.state.mistakeNotebook || {})
    .sort(([, a], [, b]) => b - a);            // most wrong first
  const flaggedIds  = store.getFlaggedIds();
  const customQs    = store.getCustomQuestions();

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

  const DOMAINS_LIST = QuizEngine.domainsFrom(content.questions);
  const customRows = customQs.map((q, idx) => `
    <div class="flex items-start gap-3 py-2 border-b border-gray-800 text-xs">
      <span class="text-purple-400 shrink-0">&#9998;</span>
      <div class="flex-1 min-w-0">
        <div class="text-gray-300 truncate">${q.question?.substring(0, 80) || ''}...</div>
        <div class="text-gray-600 mt-0.5">${q.domain} · ${q.difficulty} · Week ${q.week}</div>
      </div>
      <button data-delete-custom="${q.id}" class="text-gray-700 hover:text-red-400 text-[10px] shrink-0 transition-colors">delete</button>
    </div>`).join('');

  view.innerHTML = `
    <div class="max-w-2xl mx-auto p-6 space-y-5">
      <div class="flex items-center justify-between">
        <h2 class="text-orange-400 font-bold text-xl">Mistake Notebook</h2>
        <div class="flex items-center gap-3">
          <span class="text-xs text-gray-600">${mistakeQs.length} mistake${mistakeQs.length !== 1 ? 's' : ''} · ${flaggedIds.length} flagged · ${customQs.length} custom</span>
          <button id="export-notebook-btn"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 hover:border-gray-500 rounded transition-colors"
            title="Download flagged + mistake questions as a Markdown file">
            ↓ Export Notes
          </button>
          <button id="export-anki-btn"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-900/40 hover:bg-blue-900/70 text-blue-300 border border-blue-800 hover:border-blue-600 rounded transition-colors"
            title="Export flagged + mistake questions in Anki import format (.txt)">
            ↓ Anki Export
          </button>
        </div>
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

      <!-- ✏️ Custom Questions -->
      <div class="bg-gray-900 border border-purple-900/50 rounded p-5 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm text-purple-400 uppercase tracking-widest">&#9998; Custom Questions</h3>
          <span class="text-xs text-gray-600">${customQs.length} created</span>
        </div>
        <p class="text-gray-400 text-xs">Create your own MC questions. They appear in Grind and Flashcard with a ✏️ badge.</p>

        ${customQs.length > 0 ? `
        <button id="start-custom-drill" class="w-full py-2.5 bg-purple-900 hover:bg-purple-800 text-purple-200 rounded font-semibold text-sm">
          Drill Custom Questions (${customQs.length})
        </button>
        <div class="mt-2 space-y-0">${customRows}</div>` : `
        <p class="text-gray-600 text-xs italic">No custom questions yet. Use the form below to create one.</p>`}

        <!-- Create Question Form -->
        <details id="create-q-details" class="mt-2">
          <summary class="cursor-pointer text-xs text-purple-500 hover:text-purple-300 font-mono select-none">+ Create a New Question ▶</summary>
          <form id="create-q-form" class="mt-3 space-y-3">
            <div>
              <label class="block text-[11px] text-gray-500 mb-1">Question text *</label>
              <textarea id="cq-question" rows="3" required
                class="w-full bg-gray-800 border border-gray-700 focus:border-purple-600 rounded px-2 py-1.5 text-sm text-gray-200 resize-y"
                placeholder="Enter your question..."></textarea>
            </div>
            <div class="space-y-2">
              <label class="block text-[11px] text-gray-500">Options * <span class="text-gray-600">(select the correct one)</span></label>
              ${[0,1,2,3].map(i => `
              <div class="flex items-center gap-2">
                <input type="radio" name="cq-correct" value="${i}" id="cq-radio-${i}" class="accent-purple-500" ${i === 0 ? 'checked' : ''}>
                <label for="cq-radio-${i}" class="text-purple-400 font-mono text-xs w-4">${String.fromCharCode(65+i)}.</label>
                <input type="text" id="cq-opt-${i}" required
                  class="flex-1 bg-gray-800 border border-gray-700 focus:border-purple-600 rounded px-2 py-1 text-xs text-gray-200"
                  placeholder="Option ${String.fromCharCode(65+i)}">
              </div>`).join('')}
            </div>
            <div>
              <label class="block text-[11px] text-gray-500 mb-1">Explanation <span class="text-gray-600">(optional)</span></label>
              <textarea id="cq-explanation" rows="2"
                class="w-full bg-gray-800 border border-gray-700 focus:border-purple-600 rounded px-2 py-1.5 text-xs text-gray-200 resize-y"
                placeholder="Why is this the correct answer?"></textarea>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="block text-[11px] text-gray-500 mb-1">Domain</label>
                <select id="cq-domain" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200">
                  ${DOMAINS_LIST.map(d => `<option value="${d}">${d}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-[11px] text-gray-500 mb-1">Difficulty</label>
                <select id="cq-difficulty" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200">
                  <option value="easy">Easy</option>
                  <option value="medium" selected>Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div>
                <label class="block text-[11px] text-gray-500 mb-1">Week</label>
                <select id="cq-week" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200">
                  ${[1,2,3,4,5,6].map(w => `<option value="${w}">Week ${w}</option>`).join('')}
                </select>
              </div>
            </div>
            <div id="cq-error" class="hidden text-xs text-red-400"></div>
            <button type="submit"
              class="w-full py-2 bg-purple-800 hover:bg-purple-700 text-purple-100 rounded font-semibold text-sm transition-colors">
              Save Question
            </button>
          </form>
        </details>
      </div>

    </div>`;

  document.getElementById('export-notebook-btn')?.addEventListener('click', _exportNotebook);
  document.getElementById('export-anki-btn')?.addEventListener('click', _exportToAnki);

  document.getElementById('start-flag-drill')?.addEventListener('click', () => {
    startNotebookDrill(flaggedQs);
  });

  document.getElementById('start-custom-drill')?.addEventListener('click', () => {
    startNotebookDrill(customQs);
  });

  // Delete custom question buttons
  document.querySelectorAll('[data-delete-custom]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Delete this custom question?')) {
        store.deleteCustomQuestion(btn.dataset.deleteCustom);
        renderNotebook();
      }
    });
  });

  // Create question form submission
  document.getElementById('create-q-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const errorEl = document.getElementById('cq-error');
    const question    = document.getElementById('cq-question').value.trim();
    const opts        = [0,1,2,3].map(i => document.getElementById(`cq-opt-${i}`).value.trim());
    const correctVal  = document.querySelector('input[name="cq-correct"]:checked')?.value ?? '0';
    const explanation = document.getElementById('cq-explanation').value.trim();
    const domain      = document.getElementById('cq-domain').value;
    const difficulty  = document.getElementById('cq-difficulty').value;
    const week        = Number(document.getElementById('cq-week').value);

    if (!question) { errorEl.textContent = 'Question text is required.'; errorEl.classList.remove('hidden'); return; }
    if (opts.some(o => !o)) { errorEl.textContent = 'All four options are required.'; errorEl.classList.remove('hidden'); return; }
    errorEl.classList.add('hidden');

    store.addCustomQuestion({ question, options: opts, correct_answer: correctVal, explanation, domain, difficulty, week });
    renderNotebook();
    // Re-open the form details in case the user wants to add more
    setTimeout(() => {
      document.getElementById('create-q-details')?.setAttribute('open', '');
    }, 50);
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

// ─── Diagram Dispatcher ───────────────────────────────────────────────────────

const DIAGRAM_MODULES = {
  osi:        './js/diagrams/osi.js',
  tcp:        './js/diagrams/tcp.js',
  stp:        './js/diagrams/stp.js',
  ospf:       './js/diagrams/ospf.js',
  ethernet:   './js/diagrams/ethernet.js',
  nat:        './js/diagrams/nat.js',
  vlan:       './js/diagrams/vlan.js',
  ipv6:       './js/diagrams/ipv6.js',
  acl:        './js/diagrams/acl.js',
  subnetting: './js/diagrams/subnetting.js',
  ports:      './js/diagrams/ports.js',
  routing:    './js/diagrams/routing.js',
  hsrp:       './js/diagrams/hsrp.js',
  snmp:       './js/diagrams/snmp.js',
  aaa:        './js/diagrams/aaa.js',
  cloud:      './js/diagrams/cloud.js',
};

async function renderDiagram(diagramId, containerEl) {
  const path = DIAGRAM_MODULES[diagramId];
  if (!path || !containerEl) return;
  try {
    const mod = await import(path);
    mod.render(containerEl);
  } catch (e) {
    containerEl.innerHTML = `<p class="text-red-400 text-xs">Diagram failed to load: ${diagramId}</p>`;
  }
}

// Expose so StoryMode (separate file) can call it
window.renderDiagram = renderDiagram;

// ─── Projects ─────────────────────────────────────────────────────────────────

const PROJECTS = [
  {
    id: 'proj_small_office',
    title: 'Build a Small Office Network',
    icon: '🏢',
    difficulty: 'medium',
    xp: 400,
    minLevel: 1,
    description: 'Set up core LAN infrastructure for a 50-person office: router interfaces, DHCP, VLANs, and internet access.',
    briefing: 'You have just been hired as the network engineer at a growing startup. The office has raw hardware. Your job: get 50 employees connected with proper VLAN segmentation and internet access.',
    phases: [
      {
        id: 'p0', type: 'quiz', title: 'Pre-Flight Knowledge Check', xp: 50,
        questions: [
          { q: 'Which command assigns an IP address to a router interface?', opts: ['ip address <ip> <mask>', 'set ip address <ip>/<cidr>', 'interface ip <ip>', 'ip assign <ip>'], ans: 0, exp: 'ip address <ip> <mask> is the IOS command to assign an IPv4 address under interface config mode.' },
          { q: 'A /24 subnet provides how many usable host addresses?', opts: ['254', '256', '255', '252'], ans: 0, exp: '2^8 - 2 = 254. The network address and broadcast address are not usable.' },
          { q: 'Which command enables a shutdown interface?', opts: ['enable', 'no shutdown', 'interface up', 'activate'], ans: 1, exp: 'no shutdown removes the administrative shutdown and brings the interface up.' }
        ]
      },
      {
        id: 'p1', type: 'cli', title: 'Configure the Edge Router', xp: 150,
        objectives: ['Set hostname to OfficeRouter', 'Assign 10.0.0.1/24 to Gi0/0 (LAN)', 'Assign 203.0.113.2/30 to Gi0/1 (WAN)', 'Add default route 0.0.0.0/0 via 203.0.113.1', 'No shutdown on both interfaces'],
        hints: ['hostname OfficeRouter', 'interface Gi0/0 → ip address 10.0.0.1 255.255.255.0 → no shutdown', 'interface Gi0/1 → ip address 203.0.113.2 255.255.255.252 → no shutdown', 'ip route 0.0.0.0 0.0.0.0 203.0.113.1'],
        targetConfig: {
          hostname: 'OfficeRouter',
          interfaces: {
            'GigabitEthernet0/0': { ip: '10.0.0.1', mask: '255.255.255.0', shutdown: false },
            'GigabitEthernet0/1': { ip: '203.0.113.2', mask: '255.255.255.252', shutdown: false }
          },
          routes: [{ dest: '0.0.0.0', mask: '0.0.0.0', next: '203.0.113.1' }]
        }
      },
      {
        id: 'p2', type: 'cli', title: 'Configure VLANs on the Access Switch', xp: 200,
        objectives: ['Set hostname to OfficeSwitch', 'Create VLAN 10 (name Staff)', 'Create VLAN 20 (name Guest)', 'Set Gi0/1 as trunk (dot1q)', 'Assign Gi0/2 to VLAN 10 access', 'Assign Gi0/3 to VLAN 20 access'],
        hints: ['hostname OfficeSwitch', 'vlan 10 → name Staff; vlan 20 → name Guest', 'interface Gi0/1 → switchport mode trunk', 'interface Gi0/2 → switchport mode access → switchport access vlan 10'],
        targetConfig: {
          hostname: 'OfficeSwitch',
          vlans: { '10': { name: 'Staff' }, '20': { name: 'Guest' } },
          interfaces: {
            'GigabitEthernet0/1': { switchportMode: 'trunk' },
            'GigabitEthernet0/2': { switchportMode: 'access', accessVlan: 10 },
            'GigabitEthernet0/3': { switchportMode: 'access', accessVlan: 20 }
          }
        }
      }
    ]
  },
  {
    id: 'proj_secure_branch',
    title: 'Secure a Branch Router',
    icon: '🔐',
    difficulty: 'easy',
    xp: 250,
    minLevel: 1,
    description: 'Harden a branch router: replace Telnet with SSH, enforce local AAA, add login banners, and restrict VTY access.',
    briefing: 'Security audit reveals the branch router uses Telnet with a weak enable password. Lock it down before the penetration test next week.',
    phases: [
      {
        id: 'p0', type: 'cli', title: 'Harden Authentication', xp: 100,
        objectives: ['Set hostname to BranchRouter', 'Set enable secret Cisco123', 'Configure ip domain-name branch.local', 'Generate RSA key modulus 2048', 'Enable SSH version 2', 'Create user admin privilege 15 secret Admin@123'],
        hints: ['enable secret Cisco123', 'ip domain-name branch.local', 'crypto key generate rsa modulus 2048', 'ip ssh version 2', 'username admin privilege 15 secret Admin@123'],
        targetConfig: {
          hostname: 'BranchRouter',
          enableSecret: 'Cisco123',
          ssh: { domain: 'branch.local', modulus: 2048, version: 2 },
          users: { admin: { privilege: 15, secret: 'Admin@123' } }
        }
      },
      {
        id: 'p1', type: 'quiz', title: 'Device Hardening Concepts', xp: 50,
        questions: [
          { q: 'Which password storage type in IOS provides the strongest protection?', opts: ['Type 0 (cleartext)', 'Type 7 (Vigenère)', 'Type 5 (MD5 — enable secret)', 'Type 1 (DES)'], ans: 2, exp: 'Type 5 (MD5 hash) used by enable secret is the most secure of the common IOS types. Type 7 is easily reversed.' },
          { q: 'What is the purpose of "exec-timeout 5 0" on VTY lines?', opts: ['Allow 5 concurrent sessions', 'Disconnect idle sessions after 5 minutes', 'Retry login 5 times before lockout', 'Set SSH keepalive to 5 seconds'], ans: 1, exp: 'exec-timeout <min> <sec> — 5 0 means disconnect after 5 minutes of idle time, reducing risk from unattended sessions.' },
          { q: 'Which banner is displayed BEFORE the login prompt?', opts: ['banner exec', 'banner motd', 'banner login', 'banner incoming'], ans: 2, exp: 'banner login appears before the login prompt. banner motd appears before banner login. banner exec appears after successful login.' }
        ]
      },
      {
        id: 'p2', type: 'cli', title: 'Enable AAA + Restrict VTY', xp: 100,
        objectives: ['Enable aaa new-model', 'Configure aaa authentication login default local', 'Set VTY lines transport input ssh only', 'Set exec-timeout 5 0 on VTY', 'Add login banner: AUTHORIZED ACCESS ONLY'],
        hints: ['aaa new-model', 'aaa authentication login default local', 'line vty 0 4 → transport input ssh → exec-timeout 5 0', 'banner login ^ AUTHORIZED ACCESS ONLY ^'],
        targetConfig: {
          aaa: { newModel: true, authentication: { login: { default: 'local' } }, authorization: {} },
          vty: { transport: 'ssh' }
        }
      }
    ]
  },
  {
    id: 'proj_ospf_design',
    title: 'OSPF Multi-Area Design',
    icon: '🔀',
    difficulty: 'hard',
    xp: 450,
    minLevel: 3,
    description: 'Design and configure a two-area OSPF network: backbone area 0 with ABR connecting area 1.',
    briefing: 'The network has grown past a single OSPF area. You must configure a two-area design with an ABR, summarisation, and passive interfaces to reduce LSA flooding.',
    phases: [
      {
        id: 'p0', type: 'quiz', title: 'OSPF Fundamentals', xp: 75,
        questions: [
          { q: 'What is the role of an ABR in OSPF?', opts: ['Connects OSPF to BGP', 'Connects two OSPF areas — has interfaces in both areas and generates Type 3 LSAs', 'Elects the DR on broadcast segments', 'Maintains the LSDB for all areas globally'], ans: 1, exp: 'ABR (Area Border Router) sits on the boundary between two OSPF areas. It generates Type 3 Summary LSAs to advertise routes between areas.' },
          { q: 'Which OSPF LSA type is generated by an ABR to summarise routes between areas?', opts: ['Type 1 (Router LSA)', 'Type 2 (Network LSA)', 'Type 3 (Summary LSA)', 'Type 5 (AS External LSA)'], ans: 2, exp: 'Type 3 Summary LSAs are generated by ABRs to advertise routes from one area into another. Area 0 (backbone) must be at the centre of all inter-area routing.' },
          { q: 'What does "passive-interface" do in OSPF?', opts: ['Stops OSPF hellos on the interface but still advertises the network', 'Removes the interface from OSPF entirely', 'Changes the interface cost to infinite', 'Forces the interface to be a DR'], ans: 0, exp: 'passive-interface prevents Hello packets being sent on that interface (no neighbours form), but the connected network is still advertised into OSPF.' }
        ]
      },
      {
        id: 'p1', type: 'cli', title: 'Configure the ABR', xp: 225,
        objectives: ['Set hostname to ABRouter', 'Assign 10.0.0.1/24 to Gi0/0 (area 0)', 'Assign 10.1.0.1/24 to Gi0/1 (area 1)', 'Enable OSPF process 1, router-id 1.1.1.1', 'Advertise Gi0/0 network into area 0', 'Advertise Gi0/1 network into area 1', 'Set Gi0/0 passive-interface'],
        hints: ['hostname ABRouter', 'router ospf 1 → router-id 1.1.1.1', 'network 10.0.0.0 0.0.0.255 area 0', 'network 10.1.0.0 0.0.0.255 area 1', 'passive-interface GigabitEthernet0/0'],
        targetConfig: {
          hostname: 'ABRouter',
          interfaces: {
            'GigabitEthernet0/0': { ip: '10.0.0.1', mask: '255.255.255.0', shutdown: false },
            'GigabitEthernet0/1': { ip: '10.1.0.1', mask: '255.255.255.0', shutdown: false }
          },
          ospf: { processId: 1, routerId: '1.1.1.1', networks: [{ network: '10.0.0.0', wildcard: '0.0.0.255', area: 0 }, { network: '10.1.0.0', wildcard: '0.0.0.255', area: 1 }], passive: ['GigabitEthernet0/0'] }
        }
      },
      {
        id: 'p2', type: 'quiz', title: 'OSPF Verification', xp: 150,
        questions: [
          { q: 'Which show command displays OSPF neighbour adjacency states?', opts: ['show ip route ospf', 'show ip ospf neighbor', 'show ip ospf database', 'show ip ospf interface'], ans: 1, exp: 'show ip ospf neighbor displays all OSPF neighbours, their state (Full/2-Way/etc.), Dead timer, and interface.' },
          { q: 'In OSPF, what state indicates a fully formed adjacency with a DR/BDR?', opts: ['2-Way', 'ExStart', 'Full', 'Loading'], ans: 2, exp: 'Full state means the routers have exchanged LSDBs and are fully adjacent. On P2P links, all neighbours reach Full. On broadcast links, DROther routers reach 2-Way with each other but Full with DR/BDR.' }
        ]
      }
    ]
  },
  {
    id: 'proj_nat_dhcp',
    title: 'NAT + DHCP + ACL Lab',
    icon: '🌐',
    difficulty: 'medium',
    xp: 380,
    minLevel: 2,
    description: 'Configure a router as DHCP server, implement PAT for internet access, and apply ACLs to restrict traffic.',
    briefing: 'The branch office needs DHCP addresses for 50 clients, PAT for internet access through a single public IP, and an ACL to block direct access to the management network.',
    phases: [
      {
        id: 'p0', type: 'cli', title: 'Configure DHCP Server', xp: 100,
        objectives: ['Set hostname to NATRouter', 'Configure Gi0/0 ip 192.168.1.1/24 (LAN)', 'Configure Gi0/1 ip 203.0.113.1/30 (WAN)', 'Create DHCP pool LAN-POOL for 192.168.1.0/24', 'Set default-router 192.168.1.1', 'Set dns-server 8.8.8.8', 'Exclude 192.168.1.1–192.168.1.10 from pool'],
        hints: ['ip dhcp excluded-address 192.168.1.1 192.168.1.10', 'ip dhcp pool LAN-POOL → network 192.168.1.0 255.255.255.0 → default-router 192.168.1.1 → dns-server 8.8.8.8'],
        targetConfig: {
          hostname: 'NATRouter',
          interfaces: {
            'GigabitEthernet0/0': { ip: '192.168.1.1', mask: '255.255.255.0', shutdown: false },
            'GigabitEthernet0/1': { ip: '203.0.113.1', mask: '255.255.255.252', shutdown: false }
          },
          dhcp: { excluded: [{ start: '192.168.1.1', end: '192.168.1.10' }], pools: { 'LAN-POOL': { network: '192.168.1.0', mask: '255.255.255.0', defaultRouter: '192.168.1.1', dns: '8.8.8.8' } } }
        }
      },
      {
        id: 'p1', type: 'cli', title: 'Implement PAT (NAT Overload)', xp: 150,
        objectives: ['Create ACL 1 permitting 192.168.1.0/24', 'Configure ip nat inside on Gi0/0', 'Configure ip nat outside on Gi0/1', 'Apply NAT overload: ip nat inside source list 1 interface Gi0/1 overload'],
        hints: ['access-list 1 permit 192.168.1.0 0.0.0.255', 'interface Gi0/0 → ip nat inside', 'interface Gi0/1 → ip nat outside', 'ip nat inside source list 1 interface GigabitEthernet0/1 overload'],
        targetConfig: {
          acls: { '1': [{ action: 'permit', source: '192.168.1.0', wildcard: '0.0.0.255' }] },
          interfaces: { 'GigabitEthernet0/0': { natInside: true }, 'GigabitEthernet0/1': { natOutside: true } },
          nat: { insideSource: [{ type: 'list', acl: '1', interface: 'GigabitEthernet0/1', overload: true }] }
        }
      },
      {
        id: 'p2', type: 'quiz', title: 'NAT & DHCP Concepts', xp: 130,
        questions: [
          { q: 'What is the difference between NAT and PAT?', opts: ['NAT supports UDP only; PAT supports TCP only', 'NAT maps one private IP to one public IP; PAT maps many private IPs to one public IP using port numbers', 'PAT requires a pool of public IPs; NAT uses only one', 'They are identical — PAT is just Cisco terminology for NAT'], ans: 1, exp: 'NAT (static/dynamic) maps private IPs 1:1 to public IPs. PAT (Port Address Translation / NAT overload) maps multiple private IPs to one public IP, differentiating sessions by port number.' },
          { q: 'Which DHCP message does the client send first to discover available servers?', opts: ['DHCP Offer', 'DHCP Request', 'DHCP Discover', 'DHCP ACK'], ans: 2, exp: 'DORA: Discover → Offer → Request → ACK. The client broadcasts a DHCP Discover to find available servers. Servers reply with Offer. Client selects one and sends Request. Server confirms with ACK.' },
          { q: 'ip dhcp excluded-address must be configured BEFORE the pool to take effect. True or False?', opts: ['True — excluded addresses must be defined first', 'False — order does not matter; excluded-address applies regardless of pool order'], ans: 1, exp: 'False — ip dhcp excluded-address can be configured in any order relative to the pool and still works correctly. IOS processes exclusions independently of pool creation order.' }
        ]
      }
    ]
  },
  {
    id: 'proj_ipv6_dual',
    title: 'IPv6 Dual-Stack Migration',
    icon: '6️⃣',
    difficulty: 'hard',
    xp: 500,
    minLevel: 3,
    description: 'Add IPv6 to an existing IPv4 network without disrupting services — dual-stack configuration with static IPv6 routing.',
    briefing: 'The CTO wants IPv6 readiness before the ISP migrates the WAN link. Enable dual-stack on the edge router: keep IPv4 working, add IPv6 addressing, and configure a default IPv6 route.',
    phases: [
      {
        id: 'p0', type: 'quiz', title: 'IPv6 Fundamentals', xp: 75,
        questions: [
          { q: 'Which IPv6 address type is equivalent to a private RFC 1918 address and is only valid within a site?', opts: ['Global Unicast (2000::/3)', 'Link-Local (FE80::/10)', 'Unique Local (FC00::/7)', 'Multicast (FF00::/8)'], ans: 2, exp: 'Unique Local Addresses (ULAs, FC00::/7) are routable within an organisation but not on the internet — analogous to IPv4 RFC 1918 private space.' },
          { q: 'What command enables IPv6 routing on an IOS router?', opts: ['ip routing ipv6', 'ipv6 unicast-routing', 'ipv6 routing enable', 'enable ipv6'], ans: 1, exp: 'ipv6 unicast-routing (global config) enables the router to forward IPv6 packets. Without it, the router only processes IPv6 locally.' },
          { q: 'Which IPv6 address is automatically assigned to every interface and is used for local link communication?', opts: ['Global Unicast', 'Loopback ::1', 'Link-Local FE80::/10', 'Anycast'], ans: 2, exp: 'Link-local addresses (FE80::/10) are automatically configured on every IPv6-enabled interface. They are used for neighbour discovery, routing protocol hellos, and other link-scoped communication.' }
        ]
      },
      {
        id: 'p1', type: 'cli', title: 'Enable Dual-Stack on the Router', xp: 275,
        objectives: ['Set hostname to DualRouter', 'Enable ipv6 unicast-routing', 'Assign 10.0.0.1/24 to Gi0/0 (existing IPv4 — keep it)', 'Assign 2001:db8:1::1/64 to Gi0/0 (IPv6)', 'Assign 2001:db8:2::1/64 to Gi0/1 (WAN IPv6)', 'Add default IPv6 route via 2001:db8:2::254'],
        hints: ['ipv6 unicast-routing', 'interface Gi0/0 → ipv6 address 2001:db8:1::1/64', 'interface Gi0/1 → ipv6 address 2001:db8:2::1/64', 'ipv6 route ::/0 2001:db8:2::254'],
        targetConfig: {
          hostname: 'DualRouter',
          ipv6Routing: true,
          interfaces: {
            'GigabitEthernet0/0': { ip: '10.0.0.1', mask: '255.255.255.0', shutdown: false, ipv6: ['2001:db8:1::1/64'] },
            'GigabitEthernet0/1': { shutdown: false, ipv6: ['2001:db8:2::1/64'] }
          },
          ipv6Routes: [{ dest: '::/0', next: '2001:db8:2::254' }]
        }
      },
      {
        id: 'p2', type: 'quiz', title: 'IPv6 Verification', xp: 150,
        questions: [
          { q: 'Which command shows IPv6 routes on an IOS router?', opts: ['show ip route ipv6', 'show ipv6 route', 'show route ipv6', 'show ipv6 table'], ans: 1, exp: 'show ipv6 route displays the IPv6 routing table. The IPv4 equivalent is show ip route. Note the different command structure.' },
          { q: 'What is SLAAC in IPv6?', opts: ['A DHCPv6 variant requiring a server', 'Stateless Address Autoconfiguration — hosts self-generate a global address from the RA prefix + EUI-64', 'Static Link-local Address Auto-Config', 'A protocol for IPv6 over IPv4 tunnelling'], ans: 1, exp: 'SLAAC (Stateless Address Autoconfiguration) allows hosts to generate their own IPv6 global unicast address using the prefix from a Router Advertisement (RA) combined with their EUI-64 interface ID.' }
        ]
      }
    ]
  },
  {
    id: 'proj_zero_trust',
    title: 'Zero-Trust Branch Hardening',
    icon: '🛡️',
    difficulty: 'hard',
    xp: 550,
    minLevel: 4,
    description: 'Start from a deliberately misconfigured router and fix 6 security violations: weak passwords, Telnet, missing AAA, permissive ACLs, exposed management, and no banners.',
    briefing: 'You inherited a router from the previous engineer. The security audit found 6 critical findings. Fix them all before the compliance review on Friday.',
    phases: [
      {
        id: 'p0', type: 'quiz', title: 'Identify the Vulnerabilities', xp: 100,
        questions: [
          { q: 'Which of the following is a critical security misconfiguration on an IOS device?', opts: ['SSH version 2 enabled', 'Telnet enabled on VTY lines with no ACL', 'exec-timeout set to 5 minutes', 'enable secret configured'], ans: 1, exp: 'Telnet sends all data including passwords in cleartext. Combined with no ACL restriction, anyone on the network can attempt to log in. Replace with SSH + VTY ACL.' },
          { q: 'What security risk does CDP pose on external-facing interfaces?', opts: ['No risk — CDP is encrypted', 'Reveals device model, IOS version, and IP addresses to anyone on the connected segment', 'Causes routing loops on trunk ports', 'Allows attackers to inject VLAN traffic'], ans: 1, exp: 'CDP advertises device details (platform, IOS version, IP addresses) in cleartext on all enabled interfaces. Disable CDP on external/untrusted interfaces with "no cdp enable" or globally with "no cdp run".' },
          { q: 'An ACL that ends with only "deny" statements (no explicit permit) is dangerous because:', opts: ['It permits all traffic not matching a deny rule', 'The implicit deny any at the end blocks all unmatched traffic including legitimate traffic if no permits are present', 'It causes the router to reboot', 'Deny-only ACLs are not supported on IOS'], ans: 1, exp: 'Every ACL has an implicit "deny any" at the end. If your ACL has only deny statements and no permit, ALL traffic is blocked — including legitimate traffic. Always include permit rules for what you want to allow.' }
        ]
      },
      {
        id: 'p1', type: 'cli', title: 'Fix Authentication + SSH', xp: 200,
        objectives: ['Set hostname to HardenedRouter', 'Set enable secret SecurePass99', 'Configure ip domain-name secure.local', 'Generate RSA key modulus 2048', 'Enable SSH version 2', 'Create user netadmin privilege 15 secret N3tAdm1n!', 'Enable aaa new-model', 'Configure aaa authentication login default local'],
        hints: ['enable secret SecurePass99', 'ip domain-name secure.local', 'crypto key generate rsa modulus 2048', 'ip ssh version 2', 'username netadmin privilege 15 secret N3tAdm1n!', 'aaa new-model → aaa authentication login default local'],
        targetConfig: {
          hostname: 'HardenedRouter',
          enableSecret: 'SecurePass99',
          ssh: { domain: 'secure.local', modulus: 2048, version: 2 },
          users: { netadmin: { privilege: 15, secret: 'N3tAdm1n!' } },
          aaa: { newModel: true, authentication: { login: { default: 'local' } }, authorization: {} }
        }
      },
      {
        id: 'p2', type: 'cli', title: 'Lock Down VTY + Apply ACLs', xp: 250,
        objectives: ['Set VTY transport input ssh only', 'Set exec-timeout 5 0 on VTY', 'Create ACL 10 permitting only 10.0.0.0/24 (management subnet)', 'Apply ACL 10 to VTY lines with access-class 10 in', 'Create extended ACL 110: deny tcp any any eq 23 (block Telnet), permit ip any any', 'Apply ACL 110 inbound on Gi0/1 (WAN)'],
        hints: ['line vty 0 4 → transport input ssh → exec-timeout 5 0 → access-class 10 in', 'access-list 10 permit 10.0.0.0 0.0.0.255', 'access-list 110 deny tcp any any eq 23 → access-list 110 permit ip any any', 'interface Gi0/1 → ip access-group 110 in'],
        targetConfig: {
          acls: {
            '10': [{ action: 'permit', source: '10.0.0.0', wildcard: '0.0.0.255' }],
            '110': [{ action: 'deny', protocol: 'tcp', source: 'any', dest: 'any', destPort: 23 }, { action: 'permit', protocol: 'ip', source: 'any', dest: 'any' }]
          },
          vty: { transport: 'ssh', accessClass: '10' },
          interfaces: { 'GigabitEthernet0/1': { shutdown: false } }
        }
      }
    ]
  },
  {
    id: 'proj_cloud_hq',
    title: 'Cloud-Connected HQ',
    icon: '☁️',
    difficulty: 'hard',
    xp: 500,
    minLevel: 4,
    description: 'Design the network architecture for a cloud-connected HQ: understand VPC design, connectivity options, and security responsibilities.',
    briefing: 'The company is moving its web servers to AWS. You must design the network architecture, understand the shared responsibility model, and validate the connectivity plan before the migration.',
    phases: [
      {
        id: 'p0', type: 'quiz', title: 'Cloud Architecture Planning', xp: 150,
        questions: [
          { q: 'The web servers need to be reachable from the internet. Which AWS component must be attached to the VPC?', opts: ['NAT Gateway', 'Internet Gateway (IGW)', 'VPN Gateway', 'Transit Gateway'], ans: 1, exp: 'An Internet Gateway (IGW) must be attached to the VPC and a route 0.0.0.0/0 → IGW must exist in the public subnet route table. Without an IGW, no internet connectivity is possible.' },
          { q: 'The database servers must NOT be directly reachable from the internet. Which subnet type should they be in?', opts: ['Public subnet (with Security Group blocking inbound)', 'Private subnet (no route to Internet Gateway)', 'DMZ subnet', 'Isolated subnet with ACL 0.0.0.0/0 deny'], ans: 1, exp: 'Private subnets have no route to an Internet Gateway — they cannot receive unsolicited inbound connections from the internet. A NAT Gateway in the public subnet allows outbound-only internet access.' },
          { q: 'Which AWS feature provides a stateful firewall at the INSTANCE level?', opts: ['Network ACL', 'Security Group', 'VPC Flow Logs', 'AWS WAF'], ans: 1, exp: 'Security Groups are stateful instance-level firewalls — return traffic for established connections is automatically permitted. NACLs are stateless subnet-level filters.' }
        ]
      },
      {
        id: 'p1', type: 'quiz', title: 'Connectivity & VPN Design', xp: 175,
        questions: [
          { q: 'The company wants a low-latency, dedicated private connection from on-prem to AWS. Which service provides this?', opts: ['Site-to-Site VPN Gateway', 'AWS Direct Connect', 'NAT Gateway', 'AWS Transit Gateway'], ans: 1, exp: 'AWS Direct Connect provides a dedicated private physical circuit from on-prem to AWS — bypassing the public internet. Lower latency, consistent bandwidth, but higher cost than VPN.' },
          { q: 'If Direct Connect is too expensive, what is the alternative for on-prem to AWS connectivity?', opts: ['NAT Gateway', 'Site-to-Site VPN over the internet via a Virtual Private Gateway (VGW)', 'Internet Gateway', 'VPC Peering'], ans: 1, exp: 'A Site-to-Site IPsec VPN from the on-prem router to an AWS Virtual Private Gateway (VGW) creates an encrypted tunnel over the public internet. Lower cost than Direct Connect but variable latency.' },
          { q: 'Which SD-WAN/SASE concept eliminates the need to backhaul branch traffic through HQ for internet access?', opts: ['DMVPN hub-and-spoke', 'Direct internet breakout at each branch via SASE PoP', 'MPLS QoS queuing', 'BGP route policy'], ans: 1, exp: 'SASE (Secure Access Service Edge) allows branches to break out directly to the internet through a nearby cloud PoP with integrated security (FWaaS, SWG, CASB) — eliminating HQ backhauling latency.' }
        ]
      },
      {
        id: 'p2', type: 'quiz', title: 'Shared Responsibility & Compliance', xp: 175,
        questions: [
          { q: 'In AWS (IaaS), patching the operating system on EC2 instances is whose responsibility?', opts: ['AWS — they manage the full OS lifecycle', 'The customer — they manage OS and above in IaaS', 'Shared equally between AWS and customer', 'The EC2 instance auto-patches itself'], ans: 1, exp: 'In IaaS (EC2), AWS manages hypervisor/hardware/physical security. The customer manages OS patching, application updates, network config (SGs, NACLs), and data encryption.' },
          { q: 'Which of the following is the CUSTOMER\'s responsibility in a SaaS model?', opts: ['Patching the application', 'Managing the underlying servers', 'Configuring access controls and managing their data', 'Updating the database engine'], ans: 2, exp: 'In SaaS, the provider manages everything technical. The customer is responsible for: user account management, access controls/permissions, and the security of the data they put into the application.' }
        ]
      }
    ]
  },
  {
    id: 'proj_vlan_portsec',
    title: 'VLAN Segmentation + Port Security',
    icon: '🔌',
    difficulty: 'medium',
    xp: 350,
    minLevel: 2,
    description: 'Segment a flat network into VLANs for security, configure inter-VLAN routing via SVIs, and harden access ports with port security.',
    briefing: 'A flat /16 network is a security disaster — any device can reach any other. Segment the network into Staff, Servers, and Guest VLANs, route between them with ACL restrictions, and lock down access ports.',
    phases: [
      {
        id: 'p0', type: 'quiz', title: 'VLAN and Security Concepts', xp: 75,
        questions: [
          { q: 'Which port security violation mode drops violating frames AND logs a syslog message without disabling the port?', opts: ['protect', 'restrict', 'shutdown', 'err-disable'], ans: 1, exp: 'restrict drops frames from unknown MACs and increments a violation counter + sends syslog/SNMP trap. protect drops silently. shutdown (default) places the port in err-disable state.' },
          { q: 'What is a VLAN hopping attack?', opts: ['An attacker gaining access to a different VLAN by exploiting trunk port misconfiguration', 'Overflowing the MAC address table of a switch', 'Sending excessive DHCP Discovers to exhaust the IP pool', 'Flooding the network with ARP replies'], ans: 0, exp: 'VLAN hopping exploits trunk port misconfiguration. Double-tagging: attacker sends frames with two 802.1Q tags — the switch strips the outer (native VLAN) tag and forwards on the inner VLAN. Mitigated by changing native VLAN away from user-accessible VLANs.' },
          { q: 'What is required on a Layer 3 switch to route between VLANs using SVIs?', opts: ['A separate router with router-on-a-stick', 'The ip routing command and a Switched Virtual Interface (SVI) per VLAN', 'Sub-interfaces on a trunk port', 'OSPF running between VLANs'], ans: 1, exp: 'Layer 3 switches support inter-VLAN routing via SVIs (interface vlan N) — one SVI per VLAN acting as the gateway. The ip routing command must be enabled to activate Layer 3 forwarding.' }
        ]
      },
      {
        id: 'p1', type: 'cli', title: 'Configure VLANs and SVIs', xp: 150,
        objectives: ['Set hostname to L3Switch', 'Enable ip routing', 'Create VLAN 10 (Staff), VLAN 20 (Servers), VLAN 30 (Guest)', 'Create SVI for VLAN 10: 10.10.10.1/24', 'Create SVI for VLAN 20: 10.20.20.1/24', 'Create SVI for VLAN 30: 10.30.30.1/24', 'Set Gi0/1 access VLAN 10, Gi0/2 access VLAN 20, Gi0/3 access VLAN 30'],
        hints: ['ip routing', 'vlan 10 → name Staff; vlan 20 → name Servers; vlan 30 → name Guest', 'interface Vlan10 → ip address 10.10.10.1 255.255.255.0 → no shutdown', 'interface Gi0/1 → switchport mode access → switchport access vlan 10'],
        targetConfig: {
          hostname: 'L3Switch',
          ipRouting: true,
          vlans: { '10': { name: 'Staff' }, '20': { name: 'Servers' }, '30': { name: 'Guest' } },
          interfaces: {
            'Vlan10': { ip: '10.10.10.1', mask: '255.255.255.0', shutdown: false },
            'Vlan20': { ip: '10.20.20.1', mask: '255.255.255.0', shutdown: false },
            'Vlan30': { ip: '10.30.30.1', mask: '255.255.255.0', shutdown: false },
            'GigabitEthernet0/1': { switchportMode: 'access', accessVlan: 10 },
            'GigabitEthernet0/2': { switchportMode: 'access', accessVlan: 20 },
            'GigabitEthernet0/3': { switchportMode: 'access', accessVlan: 30 }
          }
        }
      },
      {
        id: 'p2', type: 'quiz', title: 'Port Security Verification', xp: 125,
        questions: [
          { q: 'Which command shows port security status including violation counts on an interface?', opts: ['show interfaces security', 'show port-security interface <if>', 'show switchport security', 'show security status'], ans: 1, exp: 'show port-security interface <interface> shows: port security enabled/disabled, violation mode, maximum/current MAC count, violation count, and last violation MAC.' },
          { q: 'After a port enters err-disabled state due to a port security violation, what must an admin do?', opts: ['Port recovers automatically after 30 seconds', 'Run shutdown then no shutdown to re-enable the port', 'Run clear port-security on the interface', 'Reload the switch'], ans: 1, exp: 'An err-disabled port must be manually recovered: "shutdown" then "no shutdown" in interface config. Alternatively, configure errdisable recovery cause psecure-violation for automatic recovery.' }
        ]
      }
    ]
  }
];

function renderProjects() {
  const view = getView();
  const state = store.state;

  view.innerHTML = `
    <div class="p-4 space-y-4 max-w-5xl mx-auto">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-green-400 font-bold text-sm uppercase tracking-widest">Guided Projects</h2>
          <p class="text-gray-500 text-xs mt-0.5">Multi-phase projects combining CLI configuration and conceptual checkpoints. Complete phases in order to earn XP.</p>
        </div>
        <div class="text-right text-xs text-gray-600">
          ${PROJECTS.filter(p => store.isProjectComplete(p.id, p.phases.length)).length} / ${PROJECTS.length} complete
        </div>
      </div>

      <div class="grid grid-cols-1 gap-3">
        ${PROJECTS.map(p => {
          const prog     = store.getProjectProgress(p.id);
          const done     = prog?.completedPhases?.length ?? 0;
          const total    = p.phases.length;
          const complete = done >= total;
          const locked   = state.level < (p.minLevel || 1);
          const pct      = total > 0 ? Math.round((done / total) * 100) : 0;
          const diffColor = { easy: 'text-green-400', medium: 'text-amber-400', hard: 'text-red-400' }[p.difficulty] || 'text-gray-400';
          const borderCls = complete ? 'border-green-700 bg-green-950/30' : locked ? 'border-gray-800 opacity-60' : 'border-gray-700 hover:border-green-600 cursor-pointer';

          return `
            <div class="proj-card rounded border ${borderCls} p-4 transition-colors" data-proj="${p.id}">
              <div class="flex items-start gap-3">
                <div class="text-3xl shrink-0 mt-0.5">${p.icon}</div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-white font-semibold text-sm">${p.title}</span>
                    <span class="${diffColor} text-xs">${p.difficulty}</span>
                    <span class="text-gray-500 text-xs">${p.xp} XP</span>
                    ${complete ? '<span class="text-green-400 text-xs font-semibold">✓ Complete</span>' : ''}
                    ${locked ? `<span class="text-gray-600 text-xs">🔒 Requires Level ${p.minLevel}</span>` : ''}
                  </div>
                  <p class="text-gray-400 text-xs mt-1">${p.description}</p>

                  <!-- Phase progress bar -->
                  <div class="mt-2 flex items-center gap-2">
                    <div class="flex gap-1 flex-1">
                      ${p.phases.map((ph, i) => {
                        const phDone = prog?.completedPhases?.includes(i);
                        const typeIcon = ph.type === 'cli' ? '💻' : '❓';
                        return `<div class="flex-1 rounded h-1.5 ${phDone ? 'bg-green-500' : 'bg-gray-700'}" title="Phase ${i+1}: ${ph.title} (${ph.type})"></div>`;
                      }).join('')}
                    </div>
                    <span class="text-gray-600 text-xs shrink-0">${done}/${total}</span>
                  </div>

                  <!-- Phase chips -->
                  <div class="mt-1.5 flex gap-1 flex-wrap">
                    ${p.phases.map((ph, i) => {
                      const phDone = prog?.completedPhases?.includes(i);
                      return `<span class="text-xs px-1.5 py-0.5 rounded ${phDone ? 'bg-green-900 text-green-300' : 'bg-gray-800 text-gray-500'}">${ph.type === 'cli' ? '💻' : '❓'} ${ph.title}</span>`;
                    }).join('')}
                  </div>
                </div>

                ${!locked ? `<button class="proj-start-btn shrink-0 px-3 py-1.5 text-xs rounded border ${complete ? 'border-green-700 text-green-400' : 'border-green-600 text-green-300 hover:bg-green-900/30'} transition-colors" data-proj="${p.id}">
                  ${complete ? '↺ Replay' : done > 0 ? '▶ Continue' : '▶ Start'}
                </button>` : ''}
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`;

  view.querySelectorAll('.proj-start-btn, .proj-card:not(.opacity-60)').forEach(el => {
    el.addEventListener('click', e => {
      const btn = e.target.closest('[data-proj]');
      if (!btn) return;
      const proj = PROJECTS.find(p => p.id === btn.dataset.proj);
      if (!proj || state.level < (proj.minLevel || 1)) return;
      _renderProjectDetail(proj);
    });
  });
}

function _renderProjectDetail(project) {
  const view = getView();
  const prog = store.getProjectProgress(project.id);
  const completedPhases = prog?.completedPhases || [];
  // Find first incomplete phase (or 0 if starting fresh / allow replay from 0)
  let startPhase = 0;
  for (let i = 0; i < project.phases.length; i++) {
    if (!completedPhases.includes(i)) { startPhase = i; break; }
    if (i === project.phases.length - 1) startPhase = 0; // all done — replay from start
  }

  const diffColor = { easy: 'text-green-400', medium: 'text-amber-400', hard: 'text-red-400' }[project.difficulty] || 'text-gray-400';

  view.innerHTML = `
    <div class="p-4 space-y-4 max-w-3xl mx-auto">
      <!-- Header -->
      <div class="flex items-center gap-3">
        <button id="proj-back" class="text-gray-500 hover:text-gray-300 text-xs px-2 py-1 border border-gray-700 rounded">← Back</button>
        <div>
          <div class="flex items-center gap-2">
            <span class="text-2xl">${project.icon}</span>
            <span class="text-white font-bold text-sm">${project.title}</span>
            <span class="${diffColor} text-xs">${project.difficulty}</span>
            <span class="text-gray-500 text-xs">${project.xp} XP total</span>
          </div>
        </div>
      </div>

      <!-- Briefing -->
      <div class="rounded border border-blue-900 bg-blue-950/40 p-3">
        <div class="text-blue-400 text-xs font-semibold mb-1">📋 MISSION BRIEFING</div>
        <p class="text-gray-300 text-xs">${project.briefing}</p>
      </div>

      <!-- Phase stepper -->
      <div class="space-y-2">
        <div class="text-gray-500 text-xs uppercase tracking-widest">Phases</div>
        ${project.phases.map((ph, i) => {
          const done = completedPhases.includes(i);
          const isNext = i === startPhase && !completedPhases.includes(i);
          const locked = !done && !isNext;
          return `
            <div class="rounded border ${done ? 'border-green-700 bg-green-950/20' : isNext ? 'border-amber-700 bg-amber-950/20' : 'border-gray-800'} p-3">
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                  <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${done ? 'bg-green-700 text-green-100' : isNext ? 'bg-amber-700 text-amber-100' : 'bg-gray-800 text-gray-600'}">${done ? '✓' : i+1}</span>
                  <div>
                    <div class="text-xs font-semibold ${done ? 'text-green-300' : isNext ? 'text-amber-300' : 'text-gray-600'}">${ph.title}</div>
                    <div class="text-gray-600 text-xs">${ph.type === 'cli' ? '💻 CLI Configuration' : '❓ Knowledge Check'} · ${ph.xp} XP</div>
                  </div>
                </div>
                ${!locked && !done ? `<button class="phase-launch-btn text-xs px-3 py-1 rounded border ${isNext ? 'border-amber-600 text-amber-300 hover:bg-amber-900/30' : 'border-gray-700 text-gray-400'} transition-colors" data-phase="${i}">
                  ${isNext ? '▶ Start Phase' : 'Redo'}
                </button>` : done ? '<span class="text-green-500 text-xs">✓ Complete</span>' : '<span class="text-gray-700 text-xs">🔒 Locked</span>'}
              </div>
              ${isNext && ph.type === 'cli' ? `<ul class="mt-2 space-y-0.5 text-xs text-gray-500 pl-8">${ph.objectives.map(o => `<li>• ${o}</li>`).join('')}</ul>` : ''}
            </div>`;
        }).join('')}
      </div>

      <!-- Phase workspace -->
      <div id="phase-workspace" class="space-y-3"></div>
    </div>`;

  document.getElementById('proj-back')?.addEventListener('click', () => renderProjects());

  view.querySelectorAll('.phase-launch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const phaseIdx = +btn.dataset.phase;
      _startProjectPhase(project, phaseIdx);
    });
  });

  // Auto-start next phase if only one phase remains
  if (startPhase < project.phases.length && !completedPhases.includes(startPhase)) {
    // Don't auto-start — let user read briefing and click
  }
}

function _startProjectPhase(project, phaseIdx) {
  const phase = project.phases[phaseIdx];
  if (!phase) return;
  const workspace = document.getElementById('phase-workspace');
  if (!workspace) return;
  workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (phase.type === 'quiz') {
    _runQuizProjectPhase(project, phaseIdx, phase, workspace);
  } else {
    _runCliProjectPhase(project, phaseIdx, phase, workspace);
  }
}

function _runQuizProjectPhase(project, phaseIdx, phase, container) {
  let currentQ = 0;
  let correct = 0;

  function showQuestion() {
    if (currentQ >= phase.questions.length) {
      const pass = correct >= Math.ceil(phase.questions.length * 0.67);
      container.innerHTML = `
        <div class="rounded border ${pass ? 'border-green-700 bg-green-950/30' : 'border-red-800 bg-red-950/30'} p-4 text-center space-y-3">
          <div class="text-2xl">${pass ? '✅' : '❌'}</div>
          <div class="text-sm font-semibold ${pass ? 'text-green-300' : 'text-red-300'}">${pass ? 'Phase Complete!' : 'Try Again'}</div>
          <div class="text-xs text-gray-400">${correct} / ${phase.questions.length} correct ${pass ? `· +${phase.xp} XP` : ''}</div>
          ${pass ? '' : `<button id="pq-retry" class="px-4 py-1.5 text-xs border border-amber-700 text-amber-300 rounded hover:bg-amber-900/30">↺ Retry</button>`}
        </div>`;
      if (pass) {
        store.recordProjectPhase(project.id, phaseIdx, phase.xp);
        // Check project completion
        const prog = store.getProjectProgress(project.id);
        if (prog && prog.completedPhases.length >= project.phases.length) {
          store.completeProject(project.id);
          store.addXP(Math.round(project.xp * 0.1), `project_bonus:${project.id}`); // 10% completion bonus
        }
        setTimeout(() => _renderProjectDetail(project), 1800);
      }
      container.querySelector('#pq-retry')?.addEventListener('click', () => {
        currentQ = 0; correct = 0; showQuestion();
      });
      return;
    }

    const q = phase.questions[currentQ];
    container.innerHTML = `
      <div class="rounded border border-gray-700 bg-gray-900 p-4 space-y-3">
        <div class="flex justify-between items-center">
          <span class="text-amber-400 text-xs font-semibold">❓ Knowledge Check — Phase ${phaseIdx + 1}</span>
          <span class="text-gray-600 text-xs">Q${currentQ + 1}/${phase.questions.length}</span>
        </div>
        <p class="text-white text-sm">${q.q}</p>
        <div class="space-y-2" id="pq-opts">
          ${q.opts.map((o, i) => `
            <button class="pq-opt w-full text-left px-3 py-2 text-xs rounded border border-gray-700 hover:border-green-600 text-gray-300 transition-colors" data-idx="${i}">
              <span class="text-gray-500 mr-2">${String.fromCharCode(65+i)}.</span>${o}
            </button>`).join('')}
        </div>
        <div id="pq-feedback" class="hidden text-xs p-2 rounded border"></div>
      </div>`;

    container.querySelectorAll('.pq-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const chosen = +btn.dataset.idx;
        const isRight = chosen === q.ans;
        if (isRight) correct++;
        const feedback = container.querySelector('#pq-feedback');
        feedback.classList.remove('hidden');
        feedback.className = `text-xs p-2 rounded border ${isRight ? 'border-green-700 bg-green-950 text-green-300' : 'border-red-800 bg-red-950 text-red-300'}`;
        feedback.textContent = (isRight ? '✓ Correct — ' : '✗ Incorrect — ') + q.exp;
        container.querySelectorAll('.pq-opt').forEach((b, i) => {
          b.disabled = true;
          if (i === q.ans) b.classList.add('border-green-600', 'text-green-300');
          else if (i === chosen && !isRight) b.classList.add('border-red-700', 'text-red-400');
        });
        setTimeout(() => { currentQ++; showQuestion(); }, 2000);
      });
    });
  }

  showQuestion();
}

function _runCliProjectPhase(project, phaseIdx, phase, container) {
  let projTerminal = null;
  let hintIdx = 0;

  container.innerHTML = `
    <div class="rounded border border-gray-700 space-y-0 overflow-hidden">
      <!-- Header -->
      <div class="flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-green-900">
        <div class="flex gap-1.5">
          <div class="w-2.5 h-2.5 rounded-full bg-red-500"></div>
          <div class="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>
          <div class="w-2.5 h-2.5 rounded-full bg-green-500"></div>
        </div>
        <span class="text-green-400 text-xs font-mono ml-1">💻 ${phase.title}</span>
        <div class="ml-auto flex gap-1.5">
          <button id="proj-hint-btn" class="px-2 py-0.5 text-xs bg-yellow-900/50 hover:bg-yellow-900 border border-yellow-700 text-yellow-300 rounded">Hint</button>
          <button id="proj-validate-btn" class="px-2 py-0.5 text-xs bg-green-900/50 hover:bg-green-900 border border-green-700 text-green-300 rounded">Validate</button>
          <button id="proj-reset-btn" class="px-2 py-0.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 rounded">Reset</button>
        </div>
      </div>

      <!-- Objectives -->
      <div class="px-3 py-2 bg-gray-950 border-b border-gray-800">
        <div class="text-gray-500 text-xs font-semibold mb-1 uppercase tracking-widest">Objectives</div>
        <ul id="proj-obj-list" class="space-y-0.5">
          ${phase.objectives.map((o, i) => `<li class="text-xs text-gray-500 flex gap-2" id="proj-obj-${i}"><span class="text-gray-700">□</span><span>${o}</span></li>`).join('')}
        </ul>
      </div>

      <!-- Terminal output -->
      <div id="proj-term-out" class="h-52 overflow-y-auto p-3 font-mono text-sm leading-relaxed bg-black"></div>

      <!-- Input -->
      <div class="flex items-center px-3 py-2 border-t border-green-900 bg-black">
        <span id="proj-term-prompt" class="text-yellow-400 font-mono text-sm select-none mr-2">Router> </span>
        <input id="proj-term-input" type="text" autocomplete="off" spellcheck="false"
          class="flex-1 bg-transparent text-white font-mono text-sm outline-none caret-green-400"
          placeholder="type a command...">
      </div>

      <!-- Validation results -->
      <div id="proj-val-results" class="hidden px-3 py-2 bg-gray-950 border-t border-gray-800 text-xs font-mono space-y-0.5"></div>
    </div>`;

  projTerminal = new Terminal({
    outputEl: document.getElementById('proj-term-out'),
    inputEl:  document.getElementById('proj-term-input'),
    promptEl: document.getElementById('proj-term-prompt'),
    store,
  });

  const inp = document.getElementById('proj-term-input');
  inp.focus();
  inp.addEventListener('focus', () => setTimeout(() => inp.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 300));

  document.getElementById('proj-hint-btn')?.addEventListener('click', () => {
    if (!phase.hints?.length) return;
    const hint = phase.hints[Math.min(hintIdx, phase.hints.length - 1)];
    hintIdx = Math.min(hintIdx + 1, phase.hints.length - 1);
    const out = document.getElementById('proj-term-out');
    if (out) out.innerHTML += `<div class="text-yellow-400 text-xs mt-1">💡 Hint: ${hint}</div>`;
    store.spendXP(25); // hints cost 25 XP in projects
  });

  document.getElementById('proj-reset-btn')?.addEventListener('click', () => projTerminal?.reset());

  document.getElementById('proj-validate-btn')?.addEventListener('click', () => {
    if (!projTerminal) return;

    // Use the phase targetConfig for validation
    projTerminal._targetConfig = phase.targetConfig;
    projTerminal._labId = `proj_${project.id}_${phaseIdx}`;
    const result = projTerminal.validate();

    const valDiv = document.getElementById('proj-val-results');
    valDiv.classList.remove('hidden');
    valDiv.innerHTML = result.checks.map(c =>
      `<div class="${c.pass ? 'text-green-400' : 'text-red-400'}">${c.pass ? '✓' : '✗'} ${c.label}</div>`
    ).join('') + `<div class="mt-1 border-t border-gray-800 pt-1 ${result.pass ? 'text-green-300' : 'text-amber-300'}">${result.pass ? `✅ Phase complete! +${phase.xp} XP` : `${result.score}% — fix the remaining items above`}</div>`;

    if (result.pass) {
      store.recordProjectPhase(project.id, phaseIdx, phase.xp);
      const prog = store.getProjectProgress(project.id);
      if (prog && prog.completedPhases.length >= project.phases.length) {
        store.completeProject(project.id);
        store.addXP(Math.round(project.xp * 0.1), `project_bonus:${project.id}`);
      }
      // Update objective checkboxes
      result.checks.forEach((c, i) => {
        const objEl = document.getElementById(`proj-obj-${i}`);
        if (objEl && c.pass) objEl.querySelector('span:first-child').textContent = '✓';
      });
      setTimeout(() => _renderProjectDetail(project), 2200);
    }
  });
}

// ─── Mega Labs ────────────────────────────────────────────────────────────────

const MEGA_LABS = [
  {
    id: 'mega_campus',
    title: 'Enterprise Campus Build',
    badge: { id: 'campus_architect', name: 'Campus Architect', icon: '🏛️', description: 'Completed the full Enterprise Campus Build Mega Lab' },
    difficulty: 'hard',
    xp: 800,
    minLevel: 5,
    estimatedMin: 90,
    description: 'Design and build a multi-layer campus network from scratch: VLANs, STP, inter-VLAN routing, OSPF, DHCP, PAT, and port security.',
    briefing: 'You are the lead network engineer for a 500-seat corporate campus. Greenfield build — every cable is run, every switch is racked. Get the network operational before Monday.',
    topology: `
      <div class="font-mono text-xs text-gray-500 space-y-1 leading-tight">
        <div class="text-center">        [ISP]</div>
        <div class="text-center">          |</div>
        <div class="text-center">       [Router] ← OSPF</div>
        <div class="text-center">          |</div>
        <div class="text-center">     [Core-SW] ← SVIs + ip routing</div>
        <div class="text-center">     /        \\</div>
        <div class="text-center">[Dist-SW1]  [Dist-SW2]</div>
        <div class="text-center">   |    \\    /    |</div>
        <div class="text-center">[Acc1] [Acc2] [Acc3] [Acc4]</div>
        <div class="text-center text-gray-600 mt-1">VLANs: 10(Staff) 20(Mgmt) 30(Guest)</div>
      </div>`,
    phases: [
      {
        id: 'p0', type: 'cli', title: 'VLANs + Trunking', xp: 120,
        hints: ['vlan 10 → name Staff; vlan 20 → name Mgmt; vlan 30 → name Guest', 'interface Gi0/1 → switchport mode trunk', 'Trunks carry all VLANs by default'],
        targetConfig: {
          hostname: 'Core-SW',
          vlans: { '10': { name: 'Staff' }, '20': { name: 'Mgmt' }, '30': { name: 'Guest' } },
          interfaces: {
            'GigabitEthernet0/1': { switchportMode: 'trunk' },
            'GigabitEthernet0/2': { switchportMode: 'trunk' },
          }
        }
      },
      {
        id: 'p1', type: 'cli', title: 'STP Root Bridge + PortFast', xp: 120,
        hints: ['spanning-tree vlan 10,20,30 priority 4096 — lower priority wins root', 'interface Gi0/3 → spanning-tree portfast (access ports only)', 'show spanning-tree to verify root bridge election'],
        targetConfig: {
          hostname: 'Core-SW',
          stp: { vlanPriority: { '10': 4096, '20': 4096, '30': 4096 } },
          interfaces: { 'GigabitEthernet0/3': { stpPortfast: true } }
        }
      },
      {
        id: 'p2', type: 'cli', title: 'Inter-VLAN Routing (SVIs)', xp: 160,
        hints: ['ip routing (global config)', 'interface Vlan10 → ip address 10.10.10.1 255.255.255.0 → no shutdown', 'Repeat for Vlan20 (10.20.20.1/24) and Vlan30 (10.30.30.1/24)'],
        targetConfig: {
          hostname: 'Core-SW',
          ipRouting: true,
          interfaces: {
            'Vlan10': { ip: '10.10.10.1', mask: '255.255.255.0', shutdown: false },
            'Vlan20': { ip: '10.20.20.1', mask: '255.255.255.0', shutdown: false },
            'Vlan30': { ip: '10.30.30.1', mask: '255.255.255.0', shutdown: false },
          }
        }
      },
      {
        id: 'p3', type: 'cli', title: 'OSPF to WAN Router', xp: 160,
        hints: ['router ospf 1 → router-id 2.2.2.2', 'network 10.10.10.0 0.0.0.255 area 0 (repeat for all SVIs)', 'network for uplink to router in area 0', 'passive-interface Vlan10, Vlan20, Vlan30'],
        targetConfig: {
          hostname: 'Core-SW',
          ospf: {
            processId: 1, routerId: '2.2.2.2',
            networks: [
              { network: '10.10.10.0', wildcard: '0.0.0.255', area: 0 },
              { network: '10.20.20.0', wildcard: '0.0.0.255', area: 0 },
              { network: '10.30.30.0', wildcard: '0.0.0.255', area: 0 },
            ],
            passive: ['Vlan10', 'Vlan20', 'Vlan30']
          }
        }
      },
      {
        id: 'p4', type: 'cli', title: 'PAT + ACL (Block Guest → Mgmt)', xp: 140,
        hints: ['access-list 1 permit 10.10.10.0 0.0.0.255 (Staff)', 'ip nat inside source list 1 interface Gi0/0 overload', 'access-list 110 deny ip 10.30.30.0 0.0.0.255 10.20.20.0 0.0.0.255 → permit ip any any', 'Apply ACL 110 inbound on Vlan30'],
        targetConfig: {
          hostname: 'Core-SW',
          acls: {
            '1': [{ action: 'permit', source: '10.10.10.0', wildcard: '0.0.0.255' }],
            '110': [
              { action: 'deny', protocol: 'ip', source: '10.30.30.0', srcWildcard: '0.0.0.255', dest: '10.20.20.0', destWildcard: '0.0.0.255' },
              { action: 'permit', protocol: 'ip', source: 'any', dest: 'any' }
            ]
          }
        }
      },
      {
        id: 'p5', type: 'quiz', title: 'Campus Architecture Validation', xp: 100,
        questions: [
          { q: 'In the campus hierarchy, which layer runs STP and acts as the gateway for VLANs?', opts: ['Access layer', 'Distribution layer', 'Core layer', 'WAN layer'], ans: 2, exp: 'In a 3-tier model: Access = end devices + port security. Distribution = policy enforcement (ACLs, QoS). Core = high-speed backbone. In a collapsed-core (2-tier), the core/distribution functions merge into one switch.' },
          { q: 'Why should PortFast ONLY be enabled on access ports connected to end devices?', opts: ['PortFast improves speed for trunk ports', 'PortFast skips Listening/Learning states — if enabled on a trunk, it could cause bridging loops by connecting to another switch', 'PortFast is required for VLAN assignment to work', 'PortFast disables BPDU Guard on the port'], ans: 1, exp: 'PortFast immediately moves the port to Forwarding, skipping the 30s Listening+Learning delay. On trunk/switch ports this is dangerous — a topology loop would form before STP converges. Always pair PortFast with BPDU Guard.' },
          { q: 'OSPF passive-interface on VLAN SVIs is best practice because:', opts: ['It prevents OSPF from routing between VLANs', 'It stops OSPF hellos on end-user VLANs (no neighbours possible there) while still advertising the network', 'It removes the SVI from the OSPF routing table', 'It required for PAT to work on SVI interfaces'], ans: 1, exp: 'End-user VLANs will never form OSPF neighbours, so sending hellos every 10s is wasteful and allows attackers to inject OSPF routes from client devices. Passive-interface prevents hello transmission while keeping the route advertised.' }
        ]
      }
    ]
  },
  {
    id: 'mega_branch_dr',
    title: 'Branch Office Disaster Recovery',
    badge: { id: 'resilience_engineer', name: 'Resilience Engineer', icon: '🔄', description: 'Completed the Branch Office Disaster Recovery Mega Lab' },
    difficulty: 'hard',
    xp: 700,
    minLevel: 5,
    estimatedMin: 75,
    description: 'Build a resilient branch WAN with OSPF, HSRP for gateway redundancy, and a floating static route as failover backup.',
    briefing: 'The branch office lost connectivity last month because the single router had no redundancy. Design a fault-tolerant architecture using dual routers, HSRP, and a floating static backup route.',
    topology: `
      <div class="font-mono text-xs text-gray-500 space-y-1 leading-tight">
        <div class="text-center">      [HQ Network 10.0.0.0/24]</div>
        <div class="text-center">               |</div>
        <div class="text-center">    [HQ-R1]——[HQ-R2] ← HSRP VIP 10.0.0.254</div>
        <div class="text-center">       |          |</div>
        <div class="text-center">    Primary    Standby</div>
        <div class="text-center">       \\        /</div>
        <div class="text-center">       [OSPF Area 0]</div>
        <div class="text-center">             |</div>
        <div class="text-center">       [Branch-R1]</div>
        <div class="text-center">             |</div>
        <div class="text-center">    [Branch LAN 192.168.1.0/24]</div>
      </div>`,
    phases: [
      {
        id: 'p0', type: 'cli', title: 'Interface Configuration (HQ Router)', xp: 120,
        hints: ['hostname HQ-R1', 'interface Gi0/0 → ip address 10.0.0.1/24 (LAN)', 'interface Gi0/1 → ip address 172.16.1.1/30 (WAN link to Branch)', 'no shutdown on both'],
        targetConfig: {
          hostname: 'HQ-R1',
          interfaces: {
            'GigabitEthernet0/0': { ip: '10.0.0.1', mask: '255.255.255.0', shutdown: false },
            'GigabitEthernet0/1': { ip: '172.16.1.1', mask: '255.255.255.252', shutdown: false }
          }
        }
      },
      {
        id: 'p1', type: 'cli', title: 'OSPF Area 0', xp: 160,
        hints: ['router ospf 1 → router-id 1.1.1.1', 'network 10.0.0.0 0.0.0.255 area 0', 'network 172.16.1.0 0.0.0.3 area 0', 'passive-interface GigabitEthernet0/0'],
        targetConfig: {
          hostname: 'HQ-R1',
          ospf: {
            processId: 1, routerId: '1.1.1.1',
            networks: [
              { network: '10.0.0.0', wildcard: '0.0.0.255', area: 0 },
              { network: '172.16.1.0', wildcard: '0.0.0.3', area: 0 }
            ],
            passive: ['GigabitEthernet0/0']
          }
        }
      },
      {
        id: 'p2', type: 'cli', title: 'HSRP Gateway Redundancy', xp: 180,
        hints: ['interface Gi0/0 (LAN interface)', 'standby 1 ip 10.0.0.254 (virtual IP)', 'standby 1 priority 110 (higher = active)', 'standby 1 preempt (reclaim active role on recovery)'],
        targetConfig: {
          hostname: 'HQ-R1',
          interfaces: {
            'GigabitEthernet0/0': {
              hsrp: { group: 1, virtualIp: '10.0.0.254', priority: 110, preempt: true }
            }
          }
        }
      },
      {
        id: 'p3', type: 'cli', title: 'Floating Static Route Backup', xp: 140,
        hints: ['ip route 192.168.1.0 255.255.255.0 172.16.2.1 200 — AD 200 is higher than OSPF (110), so it only activates when OSPF route is gone', 'Floating static: higher AD = lower preference = used only as fallback'],
        targetConfig: {
          hostname: 'HQ-R1',
          routes: [{ dest: '192.168.1.0', mask: '255.255.255.0', next: '172.16.2.1', ad: 200 }]
        }
      },
      {
        id: 'p4', type: 'quiz', title: 'Resilience Concepts', xp: 100,
        questions: [
          { q: 'What is the default HSRP hello timer and dead timer?', opts: ['1s hello / 3s dead', '3s hello / 10s dead', '10s hello / 30s dead', '5s hello / 15s dead'], ans: 1, exp: 'HSRP default: hello every 3 seconds, dead timer 10 seconds (misses 3 hellos). Timers can be tuned down to sub-second with millisecond timers for faster failover.' },
          { q: 'A floating static route has AD 200. The same destination is learned via OSPF (AD 110). Which route is installed in the RIB?', opts: ['The floating static (AD 200)', 'The OSPF route (AD 110) — lower AD wins', 'Both are installed (equal cost load-balance)', 'Neither — routing loops prevent installation'], ans: 1, exp: 'Lower Administrative Distance wins. AD 110 (OSPF) < AD 200 (floating static), so OSPF is preferred. The static route only activates if the OSPF route disappears (link failure), making it a true backup.' },
          { q: 'HSRP is a Cisco-proprietary protocol. Which IETF-standard protocol provides the same function?', opts: ['GLBP', 'VRRP (RFC 5798)', 'CARP', 'IRDP'], ans: 1, exp: 'VRRP (Virtual Router Redundancy Protocol, RFC 5798) is the open-standard equivalent of HSRP. GLBP is also Cisco-proprietary but adds load balancing. VRRP is supported by all major vendors.' }
        ]
      }
    ]
  },
  {
    id: 'mega_security_audit',
    title: 'Full Security Hardening Audit',
    badge: { id: 'security_auditor', name: 'Security Auditor', icon: '🔐', description: 'Completed the Full Security Hardening Audit Mega Lab' },
    difficulty: 'hard',
    xp: 750,
    minLevel: 5,
    estimatedMin: 80,
    description: 'Fix 12 deliberate security misconfigurations on a router: weak auth, Telnet, missing AAA, no ZBF, permissive ACLs, and more.',
    briefing: 'You inherited a router from an engineer who left no documentation. The penetration test found critical findings. Fix everything before the auditors arrive.',
    topology: `
      <div class="font-mono text-xs text-gray-500 space-y-1 leading-tight">
        <div class="text-center">  [Internet / Untrusted]</div>
        <div class="text-center">         |  Gi0/1 (OUTSIDE zone)</div>
        <div class="text-center">    [FW-Router] ← Zone-Based Firewall</div>
        <div class="text-center">         |  Gi0/0 (INSIDE zone)</div>
        <div class="text-center">  [Internal LAN 10.0.0.0/24]</div>
        <div class="text-center">         |  Gi0/2 (DMZ zone)</div>
        <div class="text-center">  [DMZ Servers 172.16.0.0/24]</div>
        <div class="text-center text-red-700 mt-1">⚠ Start state: Telnet on, no AAA, no ZBF, weak password</div>
      </div>`,
    phases: [
      {
        id: 'p0', type: 'cli', title: 'Fix Authentication + SSH', xp: 150,
        hints: ['enable secret AuditPass99 (replaces enable password)', 'username auditor privilege 15 secret Aud1t0r!', 'ip domain-name audit.local → crypto key generate rsa modulus 2048 → ip ssh version 2', 'line vty 0 4 → transport input ssh → exec-timeout 10 0'],
        targetConfig: {
          hostname: 'FW-Router',
          enableSecret: 'AuditPass99',
          users: { auditor: { privilege: 15, secret: 'Aud1t0r!' } },
          ssh: { domain: 'audit.local', modulus: 2048, version: 2 },
          vty: { transport: 'ssh' }
        }
      },
      {
        id: 'p1', type: 'cli', title: 'Enable AAA + Restrict Management', xp: 150,
        hints: ['aaa new-model', 'aaa authentication login default local', 'aaa authorization exec default local if-authenticated', 'access-list 10 permit 10.0.0.0 0.0.0.255 → line vty 0 4 → access-class 10 in'],
        targetConfig: {
          hostname: 'FW-Router',
          aaa: { newModel: true, authentication: { login: { default: 'local' } }, authorization: { exec: 'local' } },
          users: { auditor: { privilege: 15, secret: 'Aud1t0r!' } },
          acls: { '10': [{ action: 'permit', source: '10.0.0.0', wildcard: '0.0.0.255' }] },
          vty: { transport: 'ssh', accessClass: '10' }
        }
      },
      {
        id: 'p2', type: 'cli', title: 'Build Zone-Based Firewall', xp: 200,
        hints: ['zone security INSIDE; zone security OUTSIDE; zone security DMZ', 'interface Gi0/0 → zone-member security INSIDE', 'interface Gi0/1 → zone-member security OUTSIDE', 'interface Gi0/2 → zone-member security DMZ'],
        targetConfig: {
          hostname: 'FW-Router',
          zones: { INSIDE: true, OUTSIDE: true, DMZ: true },
          interfaces: {
            'GigabitEthernet0/0': { zone: 'INSIDE', shutdown: false },
            'GigabitEthernet0/1': { zone: 'OUTSIDE', shutdown: false },
            'GigabitEthernet0/2': { zone: 'DMZ', shutdown: false }
          }
        }
      },
      {
        id: 'p3', type: 'cli', title: 'ZBF Policy + Perimeter ACL', xp: 150,
        hints: ['class-map type inspect match-any INSIDE-TRAFFIC → match protocol http → match protocol https → match protocol dns', 'policy-map type inspect INSIDE-POLICY → class type inspect INSIDE-TRAFFIC → inspect', 'zone-pair security IN-TO-OUT source INSIDE destination OUTSIDE → service-policy type inspect INSIDE-POLICY', 'access-list 110 deny ip 10.0.0.0 0.255.255.255 any (block RFC1918 spoofing on WAN) → permit ip any any → ip access-group 110 in on Gi0/1'],
        targetConfig: {
          hostname: 'FW-Router',
          classMaps: { 'INSIDE-TRAFFIC': { type: 'inspect', matchAny: true, protocols: ['http', 'https', 'dns'] } },
          policyMaps: { 'INSIDE-POLICY': { type: 'inspect', classes: { 'INSIDE-TRAFFIC': 'inspect' } } },
          zonePairs: { 'IN-TO-OUT': { source: 'INSIDE', destination: 'OUTSIDE', servicePolicy: 'INSIDE-POLICY' } },
          acls: {
            '110': [
              { action: 'deny', protocol: 'ip', source: '10.0.0.0', srcWildcard: '0.255.255.255', dest: 'any' },
              { action: 'permit', protocol: 'ip', source: 'any', dest: 'any' }
            ]
          }
        }
      },
      {
        id: 'p4', type: 'quiz', title: 'Security Audit Review', xp: 100,
        questions: [
          { q: 'In ZBF, traffic between two interfaces in the SAME zone is:', opts: ['Denied by default', 'Permitted by default — intra-zone traffic is implicitly allowed', 'Inspected automatically', 'Requires a zone-pair with a pass action'], ans: 1, exp: 'ZBF permits intra-zone traffic (same zone, different interfaces) by default. Only inter-zone traffic (between different zones) requires an explicit zone-pair with a service-policy.' },
          { q: 'Blocking RFC 1918 source addresses inbound on the WAN interface prevents which attack?', opts: ['VLAN hopping', 'IP spoofing — attackers sending packets with private source IPs to bypass ACLs that permit internal hosts', 'SYN flood', 'MAC flooding'], ans: 1, exp: 'RFC 1918 addresses (10/8, 172.16/12, 192.168/16) should never arrive inbound from the internet — if they do, it is spoofed traffic. This "anti-spoofing" ACL is a standard perimeter hardening measure.' },
          { q: 'Why is "aaa authorization exec default local if-authenticated" preferred over just "aaa authorization exec default local"?', opts: ['It provides faster authentication', 'if-authenticated allows access even if the authorisation server is down, preventing lockout', 'It enables per-command authorisation', 'There is no difference'], ans: 1, exp: '"local if-authenticated" means: if the user authenticated successfully (via any method), allow exec access regardless of whether the authorisation lookup succeeds. Prevents lockout when AAA server is unreachable.' }
        ]
      }
    ]
  },
  {
    id: 'mega_cloud_edge',
    title: 'Cloud-Edge Integration',
    badge: { id: 'cloud_edge_architect', name: 'Cloud-Edge Architect', icon: '☁️', description: 'Completed the Cloud-Edge Integration Mega Lab' },
    difficulty: 'expert',
    xp: 850,
    minLevel: 7,
    estimatedMin: 100,
    description: 'Connect an on-prem network to a simulated cloud environment: OSPF, NAT/PAT, IPsec VPN stub, IPv6 dual-stack, and automation concepts.',
    briefing: 'The company is migrating 40% of workloads to a cloud provider. You must ensure seamless connectivity between on-prem (OSPF domain) and cloud (simulated via loopbacks), with internet access via PAT and a VPN for secure cloud traffic.',
    topology: `
      <div class="font-mono text-xs text-gray-500 space-y-1 leading-tight">
        <div class="flex justify-between px-4">
          <div class="text-center">On-Premises</div>
          <div class="text-center">Cloud (simulated)</div>
        </div>
        <div class="text-center">   [10.0.0.0/24]     [172.31.0.0/16 VPC]</div>
        <div class="text-center">        |                      |</div>
        <div class="text-center">   [Edge-Router] ←IPsec VPN→ [Cloud-GW Lo0]</div>
        <div class="text-center">        |</div>
        <div class="text-center">   OSPF + NAT/PAT</div>
        <div class="text-center">        |</div>
        <div class="text-center">   [Internet 203.0.113.0/30]</div>
        <div class="text-center text-cyan-700 mt-1">IPv6: 2001:db8::/32 dual-stack</div>
      </div>`,
    phases: [
      {
        id: 'p0', type: 'cli', title: 'On-Prem Interfaces + OSPF', xp: 150,
        hints: ['hostname Edge-Router', 'Gi0/0: 10.0.0.1/24 (LAN), Gi0/1: 203.0.113.1/30 (WAN)', 'router ospf 1 → router-id 1.1.1.1 → network 10.0.0.0 0.0.0.255 area 0 → passive-interface Gi0/0'],
        targetConfig: {
          hostname: 'Edge-Router',
          interfaces: {
            'GigabitEthernet0/0': { ip: '10.0.0.1', mask: '255.255.255.0', shutdown: false },
            'GigabitEthernet0/1': { ip: '203.0.113.1', mask: '255.255.255.252', shutdown: false }
          },
          ospf: { processId: 1, routerId: '1.1.1.1', networks: [{ network: '10.0.0.0', wildcard: '0.0.0.255', area: 0 }], passive: ['GigabitEthernet0/0'] }
        }
      },
      {
        id: 'p1', type: 'cli', title: 'NAT/PAT for Internet Access', xp: 150,
        hints: ['access-list 1 permit 10.0.0.0 0.0.0.255', 'ip nat inside on Gi0/0; ip nat outside on Gi0/1', 'ip nat inside source list 1 interface GigabitEthernet0/1 overload'],
        targetConfig: {
          hostname: 'Edge-Router',
          acls: { '1': [{ action: 'permit', source: '10.0.0.0', wildcard: '0.0.0.255' }] },
          interfaces: { 'GigabitEthernet0/0': { natInside: true }, 'GigabitEthernet0/1': { natOutside: true } },
          nat: { insideSource: [{ type: 'list', acl: '1', interface: 'GigabitEthernet0/1', overload: true }] }
        }
      },
      {
        id: 'p2', type: 'cli', title: 'IPv6 Dual-Stack', xp: 175,
        hints: ['ipv6 unicast-routing', 'interface Gi0/0 → ipv6 address 2001:db8:1::1/64', 'interface Gi0/1 → ipv6 address 2001:db8:2::1/64', 'ipv6 route ::/0 2001:db8:2::254'],
        targetConfig: {
          hostname: 'Edge-Router',
          ipv6Routing: true,
          interfaces: {
            'GigabitEthernet0/0': { shutdown: false, ipv6: ['2001:db8:1::1/64'] },
            'GigabitEthernet0/1': { shutdown: false, ipv6: ['2001:db8:2::1/64'] }
          },
          ipv6Routes: [{ dest: '::/0', next: '2001:db8:2::254' }]
        }
      },
      {
        id: 'p3', type: 'quiz', title: 'Cloud-Edge Architecture Review', xp: 175,
        questions: [
          { q: 'In a split-tunnelling VPN design, what traffic goes through the VPN tunnel?', opts: ['All traffic from the client', 'Only corporate/cloud-destined traffic; internet traffic breaks out locally', 'Only internet traffic; corporate traffic stays local', 'VoIP traffic only'], ans: 1, exp: 'Split tunnelling routes specific traffic (e.g., 10.0.0.0/8, cloud VPC CIDR) through the VPN tunnel while internet-bound traffic exits locally. Reduces latency for internet access and reduces VPN bandwidth.' },
          { q: 'Why is Direct Connect preferred over Site-to-Site VPN for latency-sensitive workloads?', opts: ['Direct Connect is cheaper than VPN', 'Direct Connect provides dedicated private bandwidth with consistent latency, avoiding internet congestion', 'Direct Connect supports IPv6; VPN does not', 'VPN only works with IPv4 subnets'], ans: 1, exp: 'Direct Connect provides a dedicated private physical circuit with guaranteed bandwidth and consistent, low latency. VPN tunnels share public internet paths where latency and packet loss vary — unsuitable for real-time applications.' },
          { q: 'In Ansible, what determines which managed devices a playbook runs against?', opts: ['The playbook filename', 'The hosts or group specified in the play\'s "hosts:" field, matched against the inventory', 'The username configured in ansible.cfg', 'The module used in the task'], ans: 1, exp: 'The "hosts:" field in a play (e.g., hosts: routers) references a group in the inventory file. Ansible runs the play only against matching hosts. Inventory can be static (hosts file) or dynamic (cloud API).' }
        ]
      },
      {
        id: 'p4', type: 'quiz', title: 'Final Integration Check', xp: 200,
        questions: [
          { q: 'A packet from 10.0.0.50 destined for 8.8.8.8 exits the router NAT\'d. What source IP does the internet see?', opts: ['10.0.0.50', '10.0.0.1 (LAN gateway)', '203.0.113.1 (WAN interface IP — PAT source)', '203.0.113.254'], ans: 2, exp: 'PAT (NAT overload) translates the private source IP to the WAN interface IP (203.0.113.1) with a unique source port. The destination sees the WAN IP, not the private LAN address.' },
          { q: 'The OSPF passive-interface command is applied to Gi0/0 (LAN). What is the effect?', opts: ['OSPF is completely disabled on Gi0/0', 'OSPF hellos are not sent on Gi0/0, but 10.0.0.0/24 is still advertised into OSPF', 'The LAN is removed from OSPF and not advertised', 'The interface becomes a stub area boundary'], ans: 1, exp: 'passive-interface stops OSPF hello packets on that interface — no neighbours can form. But the directly connected network (10.0.0.0/24) is still included in OSPF advertisements. This is best practice on end-user-facing interfaces.' }
        ]
      }
    ]
  },
  {
    id: 'mega_isp_core',
    title: 'ISP Core Simulation',
    badge: { id: 'isp_architect', name: 'ISP Architect', icon: '🌐', description: 'Completed the ISP Core Simulation Mega Lab' },
    difficulty: 'expert',
    xp: 900,
    minLevel: 8,
    estimatedMin: 110,
    description: 'Simulate an ISP core network: OSPF backbone, BGP iBGP/eBGP peering, route filtering, and QoS policy.',
    briefing: 'You are the backbone engineer at a regional ISP. Two customer edge routers need eBGP sessions to the core; four ISP core routers must run iBGP full mesh with OSPF as the IGP. Route filtering prevents customer routes leaking into the ISP core.',
    topology: `
      <div class="font-mono text-xs text-gray-500 space-y-1 leading-tight">
        <div class="text-center">  [CE-1]      [CE-2]    ← Customer Edge (eBGP)</div>
        <div class="text-center">    |              |</div>
        <div class="text-center">  [PE-1]——[P-1]——[PE-2] ← ISP Core (OSPF + iBGP)</div>
        <div class="text-center">            |</div>
        <div class="text-center">          [P-2]</div>
        <div class="text-center text-gray-600 mt-1">AS 65000 (ISP) | AS 65001/65002 (Customers)</div>
      </div>`,
    phases: [
      {
        id: 'p0', type: 'cli', title: 'OSPF IGP (ISP Core)', xp: 150,
        hints: ['hostname PE-1; router ospf 1 → router-id 1.1.1.1', 'network 10.0.0.0 0.0.0.255 area 0 (loopback + P2P links)', 'Loopback0: 1.1.1.1/32 → always up, stable router-id'],
        targetConfig: {
          hostname: 'PE-1',
          interfaces: {
            'Loopback0': { ip: '1.1.1.1', mask: '255.255.255.255', shutdown: false },
            'GigabitEthernet0/0': { ip: '10.0.12.1', mask: '255.255.255.252', shutdown: false }
          },
          ospf: { processId: 1, routerId: '1.1.1.1', networks: [{ network: '10.0.0.0', wildcard: '0.255.255.255', area: 0 }, { network: '1.1.1.1', wildcard: '0.0.0.0', area: 0 }] }
        }
      },
      {
        id: 'p1', type: 'quiz', title: 'BGP Fundamentals', xp: 150,
        questions: [
          { q: 'What distinguishes iBGP from eBGP?', opts: ['iBGP uses UDP; eBGP uses TCP', 'iBGP peers are in the same AS (TTL=255); eBGP peers are in different ASes (TTL=1 by default)', 'iBGP uses port 179; eBGP uses port 179 on a different interface', 'iBGP routes have lower administrative distance than eBGP'], ans: 1, exp: 'iBGP: peers within the same Autonomous System — typically uses loopback addresses with TTL=255 (ebgp-multihop not needed). eBGP: peers in different ASes — adjacent routers, TTL=1 (default). Both use TCP port 179.' },
          { q: 'Why does iBGP require a full mesh or route reflectors?', opts: ['BGP cannot run on Ethernet interfaces', 'iBGP does not re-advertise routes learned from one iBGP peer to another iBGP peer (split horizon rule)', 'iBGP uses a different AS path format', 'Full mesh is required for OSPF synchronisation'], ans: 1, exp: 'iBGP split horizon: routes learned from an iBGP peer are NOT forwarded to other iBGP peers — prevents routing loops. Without a full mesh, some routers never learn all routes. Route Reflectors (RR) solve this at scale by re-advertising iBGP routes.' },
          { q: 'Which BGP attribute is used to prevent routing loops in eBGP?', opts: ['LOCAL_PREF', 'MED', 'AS_PATH', 'WEIGHT'], ans: 2, exp: 'AS_PATH lists every AS the route has traversed. If a router receives a route containing its own AS number in the path, it discards the route — preventing loops. This is the primary eBGP loop prevention mechanism.' }
        ]
      },
      {
        id: 'p2', type: 'quiz', title: 'Route Filtering + Policy', xp: 175,
        questions: [
          { q: 'A prefix-list is used to filter BGP routes. Which statement is always true about prefix-lists?', opts: ['Prefix-lists use wildcard masks like ACLs', 'Prefix-lists have an implicit deny all at the end — unmatched prefixes are rejected', 'Prefix-lists only work with iBGP, not eBGP', 'Prefix-lists cannot filter specific prefix lengths'], ans: 1, exp: 'Like ACLs, prefix-lists have an implicit "deny any" at the end. You must explicitly permit all prefixes you want to allow. They support exact-match and range matching with ge/le keywords.' },
          { q: 'What is the purpose of a route-map in BGP?', opts: ['Enables BGP on a specific interface', 'Matches routes using ACLs or prefix-lists and applies policy actions (set attributes, permit/deny)', 'Defines the BGP update interval', 'Configures BGP authentication'], ans: 1, exp: 'Route-maps are powerful policy tools. They can match routes (using ACLs, prefix-lists, community lists) and then set BGP attributes (LOCAL_PREF, MED, next-hop, community). Applied with neighbor <ip> route-map <name> in|out.' },
          { q: 'LOCAL_PREF is used to influence which path is preferred for traffic LEAVING the AS. Higher or lower value is preferred?', opts: ['Lower LOCAL_PREF is preferred', 'Higher LOCAL_PREF is preferred', 'LOCAL_PREF only affects inbound traffic', 'LOCAL_PREF has no effect on path selection'], ans: 1, exp: 'Higher LOCAL_PREF wins. Default is 100. Set a higher value (e.g., 200) on the preferred exit path to steer outbound traffic. LOCAL_PREF is only shared within an AS (iBGP); it is stripped before sending to eBGP peers.' }
        ]
      },
      {
        id: 'p3', type: 'quiz', title: 'QoS + Advanced Routing', xp: 175,
        questions: [
          { q: 'In a QoS policy using MQC, what is the correct order of configuration steps?', opts: ['class-map → policy-map → service-policy', 'policy-map → class-map → service-policy', 'service-policy → policy-map → class-map', 'class-map → service-policy → policy-map'], ans: 0, exp: 'MQC (Modular QoS CLI) order: (1) class-map — define what traffic matches (DSCP, protocol, ACL), (2) policy-map — define what action (queue, police, shape, mark), (3) service-policy — apply to interface in or out direction.' },
          { q: 'DSCP EF (Expedited Forwarding) is used for which traffic class?', opts: ['Best-effort data', 'Video streaming (non-real-time)', 'Real-time voice (VoIP) — lowest latency, lowest jitter queue', 'Network management traffic'], ans: 2, exp: 'DSCP EF (value 46, binary 101110) is assigned to VoIP and real-time interactive traffic. It signals the network to provide low latency, low jitter, and low packet loss — typically served by a priority queue.' },
          { q: 'BGP uses which mechanism to prefer one path over another when all BGP attributes are equal?', opts: ['Router-ID — highest router-ID wins', 'IGP metric to the BGP next-hop — lowest metric wins', 'BGP weight — highest weight wins (Cisco-specific, local only)', 'MED — lowest MED wins'], ans: 2, exp: 'BGP path selection (simplified): WEIGHT (highest) → LOCAL_PREF (highest) → locally originated → AS_PATH (shortest) → ORIGIN (IGP < EGP < ?) → MED (lowest) → eBGP over iBGP → IGP metric (lowest) → Router-ID (lowest).' }
        ]
      },
      {
        id: 'p4', type: 'quiz', title: 'ISP Architecture Mastery', xp: 250,
        questions: [
          { q: 'What is a BGP Route Reflector and why is it used?', opts: ['A router that reflects BGP routes to the internet', 'A server that stores BGP routing tables for analytics', 'A designated iBGP router that re-advertises routes to iBGP clients, eliminating the need for a full mesh', 'A redundant BGP peer that mirrors the primary peer\'s routes'], ans: 2, exp: 'In a large ISP, a full iBGP mesh requires n(n-1)/2 sessions — unscalable. A Route Reflector (RR) breaks the iBGP split-horizon rule for its clients: it re-advertises routes received from one RR-client to all other RR-clients and non-client iBGP peers.' },
          { q: 'An ISP wants to prevent a customer\'s AS from being used as a transit path for other networks. Which BGP feature achieves this?', opts: ['AS_PATH prepending', 'Community: no-export', 'Prefix-list filtering inbound from customer', 'LOCAL_PREF set to 0'], ans: 2, exp: 'Filter inbound prefixes from the customer using a prefix-list that only permits their allocated prefix(es) — not any other routes. This prevents them from advertising routes they don\'t own and stops their AS from transiting traffic between other ASes.' },
          { q: 'Which Cisco IOS command verifies BGP neighbour session state and shows received/sent prefix counts?', opts: ['show ip route bgp', 'show ip bgp summary', 'show bgp neighbors', 'show ip bgp neighbors detail'], ans: 1, exp: 'show ip bgp summary displays all BGP neighbours, their AS, session state (Established/Active/Idle), and the number of prefixes received. This is the first command to check when troubleshooting BGP.' }
        ]
      }
    ]
  }
];

function renderMegaLabs() {
  const view  = getView();
  const state = store.state;
  const earnedBadgeIds = new Set((store.badges || []).map(b => b.id));

  view.innerHTML = `
    <div class="p-4 space-y-4 max-w-5xl mx-auto">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-red-400 font-bold text-sm uppercase tracking-widest">Mega Labs</h2>
          <p class="text-gray-500 text-xs mt-0.5">Expert-level enterprise scenarios. No guided objectives — figure it out. Hints cost <span class="text-red-400">−30 XP</span>. Completion earns a unique badge.</p>
        </div>
        ${store.badges?.length ? `<div class="text-right">
          <div class="text-xs text-gray-600 mb-1">Badges Earned</div>
          <div class="flex gap-1 justify-end">${store.badges.map(b => `<span title="${b.name}" class="text-xl">${b.icon}</span>`).join('')}</div>
        </div>` : ''}
      </div>

      <div class="grid grid-cols-1 gap-4">
        ${MEGA_LABS.map(lab => {
          const prog     = store.getMegaLabProgress(lab.id);
          const done     = prog?.completedPhases?.length ?? 0;
          const total    = lab.phases.length;
          const complete = done >= total;
          const locked   = state.level < (lab.minLevel || 1);
          const badge    = earnedBadgeIds.has(lab.badge.id);
          const diffColor = lab.difficulty === 'expert' ? 'text-purple-400' : 'text-red-400';
          const glowCls   = complete ? 'border-amber-600 shadow-lg shadow-amber-900/30' : locked ? 'border-gray-800 opacity-50' : 'border-red-900 hover:border-red-700';

          return `
            <div class="megalab-card rounded border ${glowCls} bg-gray-950 transition-all duration-200" data-lab="${lab.id}">
              <div class="p-4 flex items-start gap-4">
                <!-- Left: icon + badge -->
                <div class="shrink-0 text-center w-16">
                  <div class="text-4xl mb-1">${badge ? lab.badge.icon : '🔒'}</div>
                  ${badge ? `<div class="text-amber-400 text-xs font-semibold">${lab.badge.name}</div>` : `<div class="text-gray-700 text-xs">Badge locked</div>`}
                </div>

                <!-- Centre: info -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-white font-bold text-sm">${lab.title}</span>
                    <span class="${diffColor} text-xs font-semibold uppercase">${lab.difficulty}</span>
                    <span class="text-gray-500 text-xs">${lab.xp} XP · ~${lab.estimatedMin} min</span>
                    ${complete ? '<span class="text-amber-400 text-xs">★ Complete</span>' : ''}
                    ${locked ? `<span class="text-gray-600 text-xs">🔒 Level ${lab.minLevel} required</span>` : ''}
                  </div>
                  <p class="text-gray-500 text-xs mt-1">${lab.description}</p>

                  <!-- Phase progress -->
                  <div class="mt-2 flex items-center gap-2">
                    <div class="flex gap-0.5 flex-1">
                      ${lab.phases.map((ph, i) => {
                        const phDone = prog?.completedPhases?.includes(i);
                        return `<div class="flex-1 h-1.5 rounded ${phDone ? (lab.difficulty === 'expert' ? 'bg-purple-500' : 'bg-red-500') : 'bg-gray-800'}"></div>`;
                      }).join('')}
                    </div>
                    <span class="text-gray-600 text-xs shrink-0">${done}/${total} phases</span>
                  </div>
                </div>

                <!-- Right: action button -->
                ${!locked ? `<button class="megalab-start-btn shrink-0 px-3 py-1.5 text-xs rounded border ${complete ? 'border-amber-700 text-amber-400 hover:bg-amber-900/20' : 'border-red-800 text-red-300 hover:bg-red-900/20'} transition-colors" data-lab="${lab.id}">
                  ${complete ? '★ Replay' : done > 0 ? '▶ Continue' : '▶ Launch'}
                </button>` : ''}
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`;

  view.querySelectorAll('.megalab-start-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lab = MEGA_LABS.find(l => l.id === btn.dataset.lab);
      if (!lab || state.level < (lab.minLevel || 1)) return;
      _renderMegaLabDetail(lab);
    });
  });
}

function _renderMegaLabDetail(lab) {
  const view  = getView();
  const prog  = store.getMegaLabProgress(lab.id);
  const completedPhases = prog?.completedPhases || [];
  const hintsUsed = prog?.hintsUsed || 0;

  let startPhase = 0;
  for (let i = 0; i < lab.phases.length; i++) {
    if (!completedPhases.includes(i)) { startPhase = i; break; }
    if (i === lab.phases.length - 1) startPhase = 0;
  }

  const diffColor = lab.difficulty === 'expert' ? 'text-purple-400' : 'text-red-400';
  const badge = (store.badges || []).find(b => b.id === lab.badge.id);

  view.innerHTML = `
    <div class="p-4 space-y-4 max-w-3xl mx-auto">
      <!-- Header -->
      <div class="flex items-center gap-3">
        <button id="ml-back" class="text-gray-500 hover:text-gray-300 text-xs px-2 py-1 border border-gray-700 rounded">← Back</button>
        <div class="flex items-center gap-2 flex-1">
          <span class="text-white font-bold text-sm">${lab.title}</span>
          <span class="${diffColor} text-xs font-semibold uppercase">${lab.difficulty}</span>
          <span class="text-gray-500 text-xs">${lab.xp} XP · ~${lab.estimatedMin} min</span>
        </div>
        ${badge ? `<div class="text-center shrink-0"><span class="text-2xl">${lab.badge.icon}</span><div class="text-amber-400 text-xs">${lab.badge.name}</div></div>` : `<div class="text-gray-700 text-xs shrink-0">Badge: ${lab.badge.icon} ${lab.badge.name}</div>`}
      </div>

      <!-- Briefing -->
      <div class="rounded border border-red-900/50 bg-red-950/20 p-3">
        <div class="text-red-400 text-xs font-semibold mb-1">🎯 MISSION BRIEFING</div>
        <p class="text-gray-300 text-xs">${lab.briefing}</p>
      </div>

      <!-- Topology -->
      <div class="rounded border border-gray-800 bg-gray-950 p-3">
        <div class="text-gray-500 text-xs font-semibold mb-2 uppercase tracking-widest">Network Topology</div>
        ${lab.topology}
      </div>

      <!-- Stats bar -->
      <div class="flex gap-4 text-xs text-gray-600">
        <span>Phases: <span class="text-gray-400">${completedPhases.length}/${lab.phases.length}</span></span>
        <span>Hints used: <span class="${hintsUsed > 0 ? 'text-red-400' : 'text-gray-400'}">${hintsUsed}</span> <span class="text-gray-700">(each costs 30 XP)</span></span>
        ${prog?.xpEarned ? `<span>XP earned: <span class="text-green-400">${prog.xpEarned}</span></span>` : ''}
      </div>

      <!-- Phase stepper -->
      <div class="space-y-2">
        <div class="text-gray-600 text-xs uppercase tracking-widest">Phases <span class="text-gray-700 normal-case">(objectives hidden — exam mode)</span></div>
        ${lab.phases.map((ph, i) => {
          const done   = completedPhases.includes(i);
          const isNext = i === startPhase && !completedPhases.includes(i);
          const locked = !done && !isNext;
          return `
            <div class="rounded border ${done ? 'border-green-800 bg-green-950/20' : isNext ? 'border-red-800 bg-red-950/20' : 'border-gray-800'} p-3">
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                  <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${done ? 'bg-green-700 text-green-100' : isNext ? 'bg-red-800 text-red-100' : 'bg-gray-800 text-gray-600'}">${done ? '✓' : i+1}</span>
                  <div>
                    <div class="text-xs font-semibold ${done ? 'text-green-300' : isNext ? 'text-red-300' : 'text-gray-600'}">${ph.title}</div>
                    <div class="text-gray-700 text-xs">${ph.type === 'cli' ? '💻 CLI' : '❓ Quiz'} · ${ph.xp} XP</div>
                  </div>
                </div>
                ${!locked ? `<button class="ml-phase-btn text-xs px-3 py-1 rounded border ${done ? 'border-gray-700 text-gray-500 hover:text-gray-300' : 'border-red-700 text-red-300 hover:bg-red-900/30'} transition-colors" data-phase="${i}">
                  ${done ? 'Redo' : '▶ Start'}
                </button>` : '<span class="text-gray-800 text-xs">🔒</span>'}
              </div>
            </div>`;
        }).join('')}
      </div>

      <!-- Phase workspace -->
      <div id="ml-workspace" class="space-y-3"></div>
    </div>`;

  document.getElementById('ml-back')?.addEventListener('click', () => renderMegaLabs());

  view.querySelectorAll('.ml-phase-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const phaseIdx = +btn.dataset.phase;
      _startMegaPhase(lab, phaseIdx);
    });
  });
}

function _startMegaPhase(lab, phaseIdx) {
  const phase = lab.phases[phaseIdx];
  if (!phase) return;
  const workspace = document.getElementById('ml-workspace');
  if (!workspace) return;
  workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (phase.type === 'quiz') {
    _runMegaQuizPhase(lab, phaseIdx, phase, workspace);
  } else {
    _runMegaCliPhase(lab, phaseIdx, phase, workspace);
  }
}

function _runMegaQuizPhase(lab, phaseIdx, phase, container) {
  let currentQ = 0;
  let correct  = 0;

  function showQ() {
    if (currentQ >= phase.questions.length) {
      const pass = correct >= Math.ceil(phase.questions.length * 0.67);
      container.innerHTML = `
        <div class="rounded border ${pass ? 'border-green-700 bg-green-950/30' : 'border-red-800 bg-red-950/30'} p-4 text-center space-y-2">
          <div class="text-2xl">${pass ? '✅' : '❌'}</div>
          <div class="text-sm font-semibold ${pass ? 'text-green-300' : 'text-red-300'}">${pass ? `Phase ${phaseIdx+1} Complete — +${phase.xp} XP` : 'Try Again'}</div>
          <div class="text-xs text-gray-500">${correct}/${phase.questions.length} correct</div>
          ${!pass ? `<button id="ml-retry" class="px-3 py-1 text-xs border border-red-700 text-red-300 rounded hover:bg-red-900/30">↺ Retry</button>` : ''}
        </div>`;
      if (pass) {
        store.recordMegaLabPhase(lab.id, phaseIdx, phase.xp);
        _checkMegaCompletion(lab);
        setTimeout(() => _renderMegaLabDetail(lab), 1800);
      }
      container.querySelector('#ml-retry')?.addEventListener('click', () => { currentQ = 0; correct = 0; showQ(); });
      return;
    }

    const q = phase.questions[currentQ];
    container.innerHTML = `
      <div class="rounded border border-gray-700 bg-gray-950 p-4 space-y-3">
        <div class="flex justify-between">
          <span class="text-red-400 text-xs font-semibold">❓ ${phase.title}</span>
          <span class="text-gray-600 text-xs">Q${currentQ+1}/${phase.questions.length}</span>
        </div>
        <p class="text-white text-sm">${q.q}</p>
        <div class="space-y-2">
          ${q.opts.map((o, i) => `<button class="ml-opt w-full text-left px-3 py-2 text-xs rounded border border-gray-700 hover:border-red-700 text-gray-300 transition-colors" data-idx="${i}"><span class="text-gray-600 mr-2">${String.fromCharCode(65+i)}.</span>${o}</button>`).join('')}
        </div>
        <div id="ml-fb" class="hidden text-xs p-2 rounded border"></div>
      </div>`;

    container.querySelectorAll('.ml-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const chosen  = +btn.dataset.idx;
        const isRight = chosen === q.ans;
        if (isRight) correct++;
        const fb = container.querySelector('#ml-fb');
        fb.classList.remove('hidden');
        fb.className = `text-xs p-2 rounded border ${isRight ? 'border-green-700 bg-green-950 text-green-300' : 'border-red-800 bg-red-950 text-red-300'}`;
        fb.textContent = (isRight ? '✓ ' : '✗ ') + q.exp;
        container.querySelectorAll('.ml-opt').forEach((b, i) => {
          b.disabled = true;
          if (i === q.ans) b.classList.add('border-green-600', 'text-green-300');
          else if (i === chosen && !isRight) b.classList.add('border-red-700', 'text-red-400');
        });
        setTimeout(() => { currentQ++; showQ(); }, 2200);
      });
    });
  }

  showQ();
}

function _runMegaCliPhase(lab, phaseIdx, phase, container) {
  let mlTerminal = null;
  let hintIdx    = 0;

  container.innerHTML = `
    <div class="rounded border border-red-900 overflow-hidden">
      <div class="flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-red-900">
        <div class="flex gap-1.5">
          <div class="w-2.5 h-2.5 rounded-full bg-red-500"></div>
          <div class="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>
          <div class="w-2.5 h-2.5 rounded-full bg-green-500"></div>
        </div>
        <span class="text-red-400 text-xs font-mono flex-1">💻 ${phase.title}</span>
        <span class="text-gray-700 text-xs">Hint costs −30 XP</span>
        <div class="flex gap-1.5 ml-2">
          <button id="ml-hint-btn" class="px-2 py-0.5 text-xs bg-red-950 hover:bg-red-900 border border-red-800 text-red-400 rounded">Hint (−30 XP)</button>
          <button id="ml-validate-btn" class="px-2 py-0.5 text-xs bg-green-950 hover:bg-green-900 border border-green-800 text-green-400 rounded">Validate</button>
          <button id="ml-reset-btn" class="px-2 py-0.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-500 rounded">Reset</button>
        </div>
      </div>
      <div id="ml-term-out" class="h-56 overflow-y-auto p-3 font-mono text-sm leading-relaxed bg-black"></div>
      <div class="flex items-center px-3 py-2 border-t border-red-900 bg-black">
        <span id="ml-term-prompt" class="text-yellow-400 font-mono text-sm select-none mr-2">Router> </span>
        <input id="ml-term-input" type="text" autocomplete="off" spellcheck="false"
          class="flex-1 bg-transparent text-white font-mono text-sm outline-none caret-red-400"
          placeholder="type a command...">
      </div>
      <div id="ml-val-results" class="hidden px-3 py-2 bg-gray-950 border-t border-gray-800 text-xs font-mono space-y-0.5"></div>
    </div>`;

  mlTerminal = new Terminal({
    outputEl: document.getElementById('ml-term-out'),
    inputEl:  document.getElementById('ml-term-input'),
    promptEl: document.getElementById('ml-term-prompt'),
    store,
  });

  const inp = document.getElementById('ml-term-input');
  inp.focus();
  inp.addEventListener('focus', () => setTimeout(() => inp.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 300));

  document.getElementById('ml-hint-btn')?.addEventListener('click', () => {
    if (!phase.hints?.length) return;
    const hint = phase.hints[Math.min(hintIdx, phase.hints.length - 1)];
    hintIdx = Math.min(hintIdx + 1, phase.hints.length - 1);
    store.recordMegaLabHint(lab.id); // costs 30 XP
    const out = document.getElementById('ml-term-out');
    if (out) out.innerHTML += `<div class="text-red-400 text-xs mt-1">💡 Hint (−30 XP): ${hint}</div>`;
  });

  document.getElementById('ml-reset-btn')?.addEventListener('click', () => mlTerminal?.reset());

  document.getElementById('ml-validate-btn')?.addEventListener('click', () => {
    if (!mlTerminal) return;
    mlTerminal._targetConfig = phase.targetConfig;
    mlTerminal._labId = `mega_${lab.id}_${phaseIdx}`;
    const result = mlTerminal.validate();

    const valDiv = document.getElementById('ml-val-results');
    valDiv.classList.remove('hidden');
    valDiv.innerHTML = result.checks.map(c =>
      `<div class="${c.pass ? 'text-green-400' : 'text-red-400'}">${c.pass ? '✓' : '✗'} ${c.label}</div>`
    ).join('') + `<div class="mt-1 pt-1 border-t border-gray-800 ${result.pass ? 'text-green-300' : 'text-amber-300'}">${result.pass ? `✅ Phase cleared — +${phase.xp} XP` : `${result.score}% — keep going`}</div>`;

    if (result.pass) {
      store.recordMegaLabPhase(lab.id, phaseIdx, phase.xp);
      _checkMegaCompletion(lab);
      setTimeout(() => _renderMegaLabDetail(lab), 2200);
    }
  });
}

function _checkMegaCompletion(lab) {
  const prog = store.getMegaLabProgress(lab.id);
  if (prog && prog.completedPhases.length >= lab.phases.length) {
    store.completeMegaLab(lab.id, lab.badge);
    // Bonus XP
    store.addXP(Math.round(lab.xp * 0.15), `megalab_bonus:${lab.id}`);
    bus.emit('toast', { msg: `🏆 ${lab.badge.icon} Badge earned: ${lab.badge.name}!`, type: 'success' });
  }
}

// ─── Network Automation Scripting ─────────────────────────────────────────────

const SCRIPTING_LABS = [
  {
    id: 'scr_netmiko_basic', title: 'Hello, Netmiko!', lang: 'python',
    difficulty: 'easy', xp: 80, week: 6,
    description: 'Write a Python script that connects to a Cisco router via Netmiko and runs <code>show ip interface brief</code>, then disconnects cleanly.',
    objectives: [
      'Import ConnectHandler from the netmiko library',
      'Build a device dictionary with device_type, host, username, and password',
      'Establish a connection using ConnectHandler(**device)',
      'Send the show command and print the output',
      'Call disconnect() when done',
    ],
    hints: ['device_type for Cisco IOS is "cisco_ios"', 'Use send_command() for show commands'],
    template: `from netmiko import ConnectHandler\n\n# Define your device\ndevice = {\n    # fill in keys here\n}\n\n# Connect, run command, disconnect\n`,
    checks: [
      { label: 'Imports ConnectHandler from netmiko', test: py.importFrom('netmiko', 'ConnectHandler') },
      { label: 'device dict has device_type key',     test: py.dictKey('device_type') },
      { label: 'device dict has host key',            test: py.dictKey('host') },
      { label: 'device dict has username key',        test: py.dictKey('username') },
      { label: 'device dict has password key',        test: py.dictKey('password') },
      { label: 'Calls ConnectHandler(**device)',       test: /ConnectHandler\s*\(\s*\*\*/ },
      { label: 'Sends show ip interface brief',       test: /send_command\s*\(\s*['"]show ip interface brief['"]\s*\)/ },
      { label: 'Calls disconnect()',                  test: py.methodCall('disconnect') },
    ],
  },
  {
    id: 'scr_config_push', title: 'Push Config Commands', lang: 'python',
    difficulty: 'easy', xp: 90, week: 6,
    description: 'Write a Python script that uses Netmiko to push a list of configuration commands to a router using <code>send_config_set()</code>.',
    objectives: [
      'Build a list of IOS configuration commands',
      'Connect to the device with ConnectHandler',
      'Push the commands with send_config_set()',
      'Print the output and disconnect',
    ],
    hints: ['send_config_set() accepts a Python list of command strings', 'It automatically enters and exits config mode'],
    template: `from netmiko import ConnectHandler\n\ndevice = {\n    'device_type': 'cisco_ios',\n    'host': '10.0.0.1',\n    'username': 'admin',\n    'password': 'cisco',\n}\n\nconfig_commands = [\n    # add your IOS commands here\n]\n\n# connect and push\n`,
    checks: [
      { label: 'Imports ConnectHandler',              test: py.importFrom('netmiko', 'ConnectHandler') },
      { label: 'config_commands is a list',           test: /config_commands\s*=\s*\[/ },
      { label: 'List contains at least one command',  test: /config_commands\s*=\s*\[[^\]]+\]/ },
      { label: 'Calls ConnectHandler(**device)',       test: /ConnectHandler\s*\(\s*\*\*/ },
      { label: 'Uses send_config_set()',              test: py.methodCall('send_config_set') },
      { label: 'Calls disconnect()',                  test: py.methodCall('disconnect') },
    ],
  },
  {
    id: 'scr_multi_device', title: 'Loop Over Multiple Devices', lang: 'python',
    difficulty: 'medium', xp: 110, week: 6,
    description: 'Write a Python script that connects to a list of devices, runs <code>show version</code> on each, and prints the hostname + first 50 characters of output.',
    objectives: [
      'Define a list of two or more device dictionaries',
      'Use a for loop to iterate over the list',
      'Connect to each device and run show version',
      'Print the host IP and a snippet of output',
      'Disconnect after each device',
    ],
    hints: ['Use a list of dicts: devices = [{...}, {...}]', 'Access host with device["host"]', 'f-strings make formatting easy'],
    template: `from netmiko import ConnectHandler\n\ndevices = [\n    # add device dicts here\n]\n\nfor device in devices:\n    # connect, run, print, disconnect\n    pass\n`,
    checks: [
      { label: 'Imports ConnectHandler',              test: py.importFrom('netmiko', 'ConnectHandler') },
      { label: 'devices is a list of dicts',          test: /devices\s*=\s*\[/ },
      { label: 'for loop over devices',               test: /for\s+\w+\s+in\s+devices/ },
      { label: 'Sends show version',                  test: /send_command\s*\(\s*['"]show version['"]\s*\)/ },
      { label: 'Prints output (f-string or format)',  test: /print\s*\(/ },
      { label: 'Calls disconnect() inside loop',      test: py.methodCall('disconnect') },
    ],
  },
  {
    id: 'scr_parse_routes', title: 'Parse Show IP Route', lang: 'python',
    difficulty: 'medium', xp: 130, week: 6,
    description: 'Write a script that fetches <code>show ip route</code> and uses the <code>re</code> module to extract all Connected (C) network prefixes, printing each one.',
    objectives: [
      'Import the re module',
      'Run show ip route via Netmiko',
      'Split the output into lines',
      'Use re.search() with an IP/prefix pattern to extract prefixes from "C" lines',
      'Print each matched prefix',
    ],
    hints: ['Lines for connected routes start with "C"', 'Pattern r"(\\d+\\.\\d+\\.\\d+\\.\\d+/\\d+)" matches prefixes', 'Use .splitlines() to iterate lines'],
    template: `import re\nfrom netmiko import ConnectHandler\n\ndevice = {\n    'device_type': 'cisco_ios',\n    'host': '10.0.0.1',\n    'username': 'admin',\n    'password': 'cisco',\n}\n\n# connect, fetch route table, parse connected routes\n`,
    checks: [
      { label: 'Imports re module',                   test: py.imports('re') },
      { label: 'Imports ConnectHandler',              test: py.importFrom('netmiko', 'ConnectHandler') },
      { label: 'Runs show ip route',                  test: /send_command\s*\(\s*['"]show ip route['"]\s*\)/ },
      { label: 'Splits output into lines',            test: /\.splitlines\(\)|\.split\s*\(\s*['"]\\n['"]\s*\)/ },
      { label: 'Uses re.search or re.findall',        test: py.regex() },
      { label: 'Checks for connected (C) lines',      test: /['"]\s*C\s*['"]|startswith\s*\(\s*['"]C['"]/ },
      { label: 'Calls disconnect()',                  test: py.methodCall('disconnect') },
    ],
  },
  {
    id: 'scr_backup_python', title: 'Config Backup to File', lang: 'python',
    difficulty: 'medium', xp: 120, week: 6,
    description: 'Write a script that connects to a list of routers, fetches <code>show running-config</code>, and saves each config to a timestamped file like <code>backup_10.0.0.1_20260327.txt</code>.',
    objectives: [
      'Import datetime for timestamping',
      'Loop over a list of device hosts',
      'Fetch show running-config from each device',
      'Build a timestamped filename using the host IP and today\'s date',
      'Write the config to a file using open() in write mode',
    ],
    hints: ['datetime.datetime.now().strftime("%Y%m%d") gives YYYYMMDD', 'Use open(filename, "w") as f: f.write(config)'],
    template: `from netmiko import ConnectHandler\nimport datetime\n\ndevices = ['10.0.0.1', '10.0.0.2']\n\nfor host in devices:\n    device = {'device_type': 'cisco_ios', 'host': host, 'username': 'admin', 'password': 'cisco'}\n    # connect, get config, save to file, disconnect\n    pass\n`,
    checks: [
      { label: 'Imports datetime',                    test: py.imports('datetime') },
      { label: 'Imports ConnectHandler',              test: py.importFrom('netmiko', 'ConnectHandler') },
      { label: 'Fetches show running-config',         test: /send_command\s*\(\s*['"]show running-config['"]\s*\)/ },
      { label: 'Uses datetime for timestamp',         test: /datetime.*strftime|strftime.*datetime/ },
      { label: 'Opens file in write mode',            test: /open\s*\(.*,\s*['"]w['"]\s*\)/ },
      { label: 'Writes config to file',               test: /\.write\s*\(/ },
      { label: 'Calls disconnect()',                  test: py.methodCall('disconnect') },
    ],
  },
  {
    id: 'scr_bash_backup', title: 'Bash Config Backup', lang: 'bash',
    difficulty: 'easy', xp: 80, week: 6,
    description: 'Write a Bash script that loops over an array of router IPs, SSHs into each, runs <code>show running-config</code>, and saves the output to a dated <code>.txt</code> file.',
    objectives: [
      'Include a proper Bash shebang (#!/bin/bash)',
      'Define an array of host IP addresses',
      'Capture today\'s date in a variable',
      'Loop over the array using a for loop',
      'Use ssh to run the show command and redirect output to a file',
    ],
    hints: ['HOSTS=("10.0.0.1" "10.0.0.2") defines an array', 'DATE=$(date +%Y%m%d) captures the date', 'Redirect with > filename.txt'],
    template: `#!/bin/bash\n\nHOSTS=("10.0.0.1" "10.0.0.2")\nUSERNAME="admin"\n\n# Loop, SSH, save config\n`,
    checks: [
      { label: 'Has #!/bin/bash shebang',             test: sh.shebang() },
      { label: 'Defines array of hosts',              test: sh.array() },
      { label: 'Captures date in variable',           test: sh.dateCmd() },
      { label: 'Uses a for loop over hosts',          test: sh.forLoop() },
      { label: 'Uses ssh command',                    test: sh.sshCmd() },
      { label: 'Redirects output to a .txt file',     test: sh.redirect() },
    ],
  },
  {
    id: 'scr_bash_ping', title: 'Bash Ping Sweep', lang: 'bash',
    difficulty: 'easy', xp: 70, week: 6,
    description: 'Write a Bash script that sweeps all 254 host addresses in a /24 subnet, pinging each once, and prints "X.X.X.X is UP" for hosts that respond.',
    objectives: [
      'Include the Bash shebang',
      'Use a for loop with seq or brace expansion to iterate 1–254',
      'Run ping with -c 1 (single packet) per host',
      'Redirect ping output to /dev/null',
      'Check exit code with $? and print "is UP" for live hosts',
    ],
    hints: ['for i in $(seq 1 254) loops 1 to 254', 'ping -c 1 -W 1 $IP sends one packet with 1s timeout', '[ $? -eq 0 ] checks if the last command succeeded'],
    template: `#!/bin/bash\n\nSUBNET="192.168.1"\n\n# Sweep all 254 addresses\n`,
    checks: [
      { label: 'Has #!/bin/bash shebang',             test: sh.shebang() },
      { label: 'For loop over 1-254 range',           test: sh.seqRange() },
      { label: 'Uses ping with -c flag',              test: sh.pingCmd() },
      { label: 'Redirects to /dev/null',              test: sh.nullRedir() },
      { label: 'Checks exit code ($?)',               test: /\$\?/ },
      { label: 'Prints "is UP" for live hosts',       test: /is UP/ },
    ],
  },
  {
    id: 'scr_yaml_inventory', title: 'Read Ansible YAML Inventory', lang: 'python',
    difficulty: 'medium', xp: 100, week: 6,
    description: 'Write a Python script that loads a YAML inventory file, iterates over hosts in the <code>routers</code> group, and prints each hostname and its <code>ansible_host</code> IP.',
    objectives: [
      'Import the yaml module',
      'Open and read an inventory.yaml file',
      'Parse it with yaml.safe_load()',
      'Loop over the routers group hosts',
      'Print hostname and ansible_host value for each',
    ],
    hints: ['yaml.safe_load(f) parses YAML into a Python dict', 'Access nested keys with .get() or ["key"]', 'Loop with: for hostname, vars in hosts.items()'],
    template: `import yaml\n\nwith open('inventory.yaml', 'r') as f:\n    inventory = yaml.safe_load(f)\n\n# Iterate over routers group and print each host\n`,
    checks: [
      { label: 'Imports yaml',                        test: py.imports('yaml') },
      { label: 'Opens inventory.yaml file',           test: /open\s*\(\s*['"]inventory\.yaml['"]/ },
      { label: 'Uses yaml.safe_load()',               test: /yaml\.safe_load\s*\(/ },
      { label: 'Iterates with .items()',              test: py.methodCall('items') },
      { label: 'Accesses ansible_host field',         test: /['"]ansible_host['"]/ },
      { label: 'Prints hostname and IP',              test: /print\s*\(/ },
    ],
  },
  {
    id: 'scr_error_handling', title: 'Netmiko + Error Handling', lang: 'python',
    difficulty: 'hard', xp: 150, week: 6,
    description: 'Write a robust script that connects to multiple devices, handles <code>NetmikoTimeoutException</code> and <code>NetmikoAuthenticationException</code> separately, and stores results (or error codes) in a dict.',
    objectives: [
      'Import both NetmikoTimeoutException and NetmikoAuthenticationException',
      'Use a try/except block around the connection and command',
      'Catch timeout errors and store "TIMEOUT" in results',
      'Catch auth errors and store "AUTH_FAILED" in results',
      'Print all results after the loop',
    ],
    hints: ['from netmiko.exceptions import NetmikoTimeoutException, NetmikoAuthenticationException', 'results = {} before the loop; results[host] = ... inside'],
    template: `from netmiko import ConnectHandler\nfrom netmiko.exceptions import NetmikoTimeoutException, NetmikoAuthenticationException\n\ndevices = [\n    {'device_type': 'cisco_ios', 'host': '10.0.0.1', 'username': 'admin', 'password': 'cisco'},\n    {'device_type': 'cisco_ios', 'host': '10.0.0.99', 'username': 'admin', 'password': 'wrong'},\n]\n\nresults = {}\n# loop, try/except, store results\n`,
    checks: [
      { label: 'Imports NetmikoTimeoutException',     test: /NetmikoTimeoutException/ },
      { label: 'Imports NetmikoAuthenticationException', test: /NetmikoAuthenticationException/ },
      { label: 'Has try block',                       test: py.tryExcept() },
      { label: 'Catches timeout',                     test: /except\s+NetmikoTimeoutException/ },
      { label: 'Catches auth failure',                test: /except\s+NetmikoAuthenticationException/ },
      { label: 'Stores results in a dict',            test: /results\s*\[/ },
      { label: 'Calls disconnect() in try block',     test: py.methodCall('disconnect') },
    ],
  },
  {
    id: 'scr_restconf', title: 'RESTCONF API Call', lang: 'python',
    difficulty: 'hard', xp: 160, week: 6,
    description: 'Write a Python script that queries a router\'s RESTCONF API to list all interfaces. Use the correct Accept header, check the status code, and parse the JSON response.',
    objectives: [
      'Import the requests library',
      'Set Accept and Content-Type headers to application/yang-data+json',
      'Build the RESTCONF URL (path: /restconf/data/ietf-interfaces:interfaces)',
      'Use requests.get() with headers and auth parameters',
      'Check response.status_code == 200 before parsing',
      'Parse the JSON and print interface names',
    ],
    hints: ['requests.get(url, headers=headers, auth=(user, pass), verify=False)', 'RESTCONF uses yang-data+json content type', 'response.json() gives a Python dict'],
    template: `import requests\n\nheaders = {\n    'Accept': 'application/yang-data+json',\n    'Content-Type': 'application/yang-data+json',\n}\n\nurl = 'https://10.0.0.1/restconf/data/ietf-interfaces:interfaces'\n\n# make the request, check status, parse JSON, print interface names\n`,
    checks: [
      { label: 'Imports requests',                    test: py.imports('requests') },
      { label: 'Sets yang-data+json Accept header',   test: /yang-data\+json/ },
      { label: 'Uses RESTCONF data path',             test: /restconf\/data/ },
      { label: 'Uses requests.get()',                 test: /requests\.get\s*\(/ },
      { label: 'Passes auth parameter',               test: /auth\s*=/ },
      { label: 'Checks status code',                  test: /status_code/ },
      { label: 'Calls response.json()',               test: /\.json\s*\(\s*\)/ },
    ],
  },
];

// Theory reference panels
const SCRIPTING_THEORY = [
  {
    title: 'Netmiko Essentials',
    icon: '🔌',
    content: `<div class="space-y-3 text-xs">
<p class="text-gray-400">Netmiko is a Python library built on Paramiko that simplifies SSH connections to network devices. It handles the IOS prompt detection so you don't have to.</p>
<div class="bg-black/40 rounded p-3 font-mono text-green-300 space-y-1">
<div class="text-gray-500"># Install: pip install netmiko</div>
<div>from netmiko import ConnectHandler</div>
<div>&nbsp;</div>
<div>device = {</div>
<div>&nbsp;&nbsp;'device_type': 'cisco_ios',   <span class="text-gray-500"># cisco_ios | cisco_nxos | juniper | arista_eos</span></div>
<div>&nbsp;&nbsp;'host':        '192.168.1.1',</div>
<div>&nbsp;&nbsp;'username':    'admin',</div>
<div>&nbsp;&nbsp;'password':    'cisco',</div>
<div>&nbsp;&nbsp;'port':        22,             <span class="text-gray-500"># optional, default 22</span></div>
<div>}</div>
<div>&nbsp;</div>
<div>net_connect = ConnectHandler(**device)</div>
<div>output = net_connect.send_command('show ip route')   <span class="text-gray-500"># show commands</span></div>
<div>net_connect.send_config_set(['int gi0/0', 'no shut']) <span class="text-gray-500"># config commands</span></div>
<div>net_connect.save_config()                            <span class="text-gray-500"># write mem</span></div>
<div>net_connect.disconnect()</div>
</div>
<p class="text-amber-400">Common device_type values: cisco_ios · cisco_nxos · cisco_asa · cisco_xr · juniper · arista_eos · linux</p>
</div>`,
  },
  {
    title: 'Python for Network Engineers',
    icon: '🐍',
    content: `<div class="space-y-3 text-xs">
<p class="text-gray-400">You only need a small Python subset for most network automation tasks.</p>
<div class="bg-black/40 rounded p-3 font-mono text-green-300 space-y-1">
<div class="text-gray-500"># f-strings (format output)</div>
<div>print(f"Host: {device['host']} - Status: {status}")</div>
<div>&nbsp;</div>
<div class="text-gray-500"># list comprehension (filter devices)</div>
<div>ios_devices = [d for d in devices if d['device_type'] == 'cisco_ios']</div>
<div>&nbsp;</div>
<div class="text-gray-500"># dict for results</div>
<div>results = {}  <span class="text-gray-600">→</span>  results['10.0.0.1'] = 'UP'</div>
<div>&nbsp;</div>
<div class="text-gray-500"># file I/O</div>
<div>with open('backup.txt', 'w') as f:</div>
<div>&nbsp;&nbsp;f.write(running_config)</div>
<div>&nbsp;</div>
<div class="text-gray-500"># error handling</div>
<div>try:</div>
<div>&nbsp;&nbsp;conn = ConnectHandler(**device)</div>
<div>except NetmikoTimeoutException:</div>
<div>&nbsp;&nbsp;print(f"{device['host']}: UNREACHABLE")</div>
</div>
</div>`,
  },
  {
    title: 'Bash for Network Ops',
    icon: '🖥️',
    content: `<div class="space-y-3 text-xs">
<p class="text-gray-400">Bash scripts automate repetitive SSH-based tasks: ping sweeps, config backups, log collection.</p>
<div class="bg-black/40 rounded p-3 font-mono text-green-300 space-y-1">
<div>#!/bin/bash</div>
<div>&nbsp;</div>
<div class="text-gray-500"># Arrays</div>
<div>HOSTS=("10.0.0.1" "10.0.0.2" "10.0.0.3")</div>
<div>&nbsp;</div>
<div class="text-gray-500"># Loop over array</div>
<div>for HOST in "${HOSTS[@]}"; do</div>
<div>&nbsp;&nbsp;echo "Checking $HOST..."</div>
<div>done</div>
<div>&nbsp;</div>
<div class="text-gray-500"># Ping check + exit code</div>
<div>ping -c 1 -W 1 $HOST &gt; /dev/null 2&gt;&amp;1</div>
<div>if [ $? -eq 0 ]; then echo "$HOST UP"; fi</div>
<div>&nbsp;</div>
<div class="text-gray-500"># SSH + redirect to file</div>
<div>ssh admin@$HOST "show run" &gt; backup_${HOST}.txt</div>
<div>&nbsp;</div>
<div class="text-gray-500"># Date stamp</div>
<div>DATE=$(date +%Y%m%d)  <span class="text-gray-600">→</span>  20260327</div>
</div>
</div>`,
  },
  {
    title: 'RESTCONF & NETCONF',
    icon: '🌐',
    content: `<div class="space-y-3 text-xs">
<p class="text-gray-400">Model-driven programmability interfaces supported on modern IOS-XE / NX-OS / IOS-XR.</p>
<div class="bg-black/40 rounded p-3 font-mono text-green-300 space-y-1">
<div class="text-gray-500"># RESTCONF (HTTP/HTTPS, RFC 8040)</div>
<div>import requests</div>
<div>headers = {'Accept': 'application/yang-data+json'}</div>
<div>url = 'https://device/restconf/data/ietf-interfaces:interfaces'</div>
<div>r = requests.get(url, headers=headers, auth=('admin','cisco'), verify=False)</div>
<div>data = r.json()</div>
<div>&nbsp;</div>
<div class="text-gray-500"># NETCONF (SSH, RFC 6241) — ncclient library</div>
<div>from ncclient import manager</div>
<div>m = manager.connect(host='10.0.0.1', port=830,</div>
<div>&nbsp;&nbsp;&nbsp;&nbsp;username='admin', password='cisco',</div>
<div>&nbsp;&nbsp;&nbsp;&nbsp;hostkey_verify=False)</div>
<div>config = m.get_config(source='running')</div>
</div>
<table class="w-full text-xs border-collapse mt-2">
<tr class="border-b border-gray-700"><th class="text-left text-gray-400 py-1 pr-3">Feature</th><th class="text-left text-gray-400">RESTCONF</th><th class="text-left text-gray-400">NETCONF</th></tr>
<tr class="border-b border-gray-800"><td class="py-1 pr-3 text-gray-300">Transport</td><td>HTTPS</td><td>SSH (port 830)</td></tr>
<tr class="border-b border-gray-800"><td class="py-1 pr-3 text-gray-300">Data format</td><td>JSON / XML</td><td>XML only</td></tr>
<tr class="border-b border-gray-800"><td class="py-1 pr-3 text-gray-300">Operations</td><td>GET/POST/PUT/DELETE</td><td>get/get-config/edit-config</td></tr>
<tr><td class="py-1 pr-3 text-gray-300">YANG models</td><td>Yes</td><td>Yes</td></tr>
</table>
</div>`,
  },
  {
    title: 'Ansible for Network',
    icon: '⚙️',
    content: `<div class="space-y-3 text-xs">
<p class="text-gray-400">Ansible is agentless — it uses SSH (or NETCONF/RESTCONF) to configure devices. No software installed on routers.</p>
<div class="bg-black/40 rounded p-3 font-mono text-green-300 space-y-1">
<div class="text-gray-500"># inventory.yaml</div>
<div>routers:</div>
<div>&nbsp;&nbsp;hosts:</div>
<div>&nbsp;&nbsp;&nbsp;&nbsp;R1:</div>
<div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;ansible_host: 10.0.0.1</div>
<div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;ansible_network_os: ios</div>
<div>&nbsp;&nbsp;&nbsp;&nbsp;R2:</div>
<div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;ansible_host: 10.0.0.2</div>
<div>&nbsp;</div>
<div class="text-gray-500"># playbook.yaml</div>
<div>- name: Configure OSPF</div>
<div>&nbsp;&nbsp;hosts: routers</div>
<div>&nbsp;&nbsp;gather_facts: no</div>
<div>&nbsp;&nbsp;tasks:</div>
<div>&nbsp;&nbsp;&nbsp;&nbsp;- name: Enable OSPF</div>
<div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;cisco.ios.ios_config:</div>
<div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;lines:</div>
<div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- router ospf 1</div>
<div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- network 0.0.0.0 255.255.255.255 area 0</div>
</div>
<p class="text-amber-400">Key CCNA exam facts: agentless (no agent on devices), uses YAML playbooks, idempotent (safe to run multiple times), uses collections (cisco.ios, cisco.nxos, junipernetworks.junos)</p>
</div>`,
  },
];

let _scriptingLabId = null;

function renderScripting() {
  const view = getView();
  const prog = store.state.scriptingProgress || {};

  view.innerHTML = `
    <div class="space-y-4">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-bold text-green-300">Network Automation Scripting</h2>
          <p class="text-xs text-gray-400 mt-0.5">10 labs · Python + Bash · Netmiko · RESTCONF · Ansible</p>
        </div>
        <div class="text-xs text-gray-500 text-right">
          ${Object.keys(prog).length}/${SCRIPTING_LABS.length} labs done
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-2 border-b border-gray-800 pb-0">
        <button id="scr-tab-labs"   class="scr-tab px-3 py-1.5 text-xs font-semibold rounded-t border border-gray-700 bg-green-900/30 text-green-300">💻 Labs</button>
        <button id="scr-tab-theory" class="scr-tab px-3 py-1.5 text-xs font-semibold rounded-t border border-gray-800 text-gray-400 hover:text-gray-200">📖 Theory</button>
      </div>

      <!-- Labs panel -->
      <div id="scr-panel-labs" class="space-y-2">
        ${SCRIPTING_LABS.map(lab => {
          const done  = !!prog[lab.id];
          const dColor = { easy: 'text-green-400', medium: 'text-amber-400', hard: 'text-red-400' }[lab.difficulty] || 'text-gray-400';
          const langBadge = lab.lang === 'python'
            ? `<span class="px-1.5 py-0.5 rounded text-xs bg-blue-900/40 text-blue-300 border border-blue-800">Python</span>`
            : `<span class="px-1.5 py-0.5 rounded text-xs bg-yellow-900/40 text-yellow-300 border border-yellow-800">Bash</span>`;
          return `
            <div class="rounded border ${done ? 'border-green-800/60 bg-green-950/20' : 'border-gray-700 bg-gray-900/40'} p-3 flex items-center justify-between gap-3 cursor-pointer hover:border-green-700/60 transition-colors scr-lab-card" data-lab-id="${lab.id}">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  ${done ? '<span class="text-green-400 text-sm">✓</span>' : '<span class="text-gray-600 text-sm">○</span>'}
                  <span class="text-sm font-semibold ${done ? 'text-green-300' : 'text-white'}">${lab.title}</span>
                  ${langBadge}
                  <span class="text-xs ${dColor}">${lab.difficulty}</span>
                </div>
                <p class="text-xs text-gray-400 mt-0.5 ml-5">${lab.description.replace(/<[^>]+>/g, '')}</p>
              </div>
              <div class="text-right shrink-0">
                <div class="text-xs text-amber-400 font-semibold">+${lab.xp} XP</div>
              </div>
            </div>`;
        }).join('')}
      </div>

      <!-- Theory panel (hidden by default) -->
      <div id="scr-panel-theory" class="hidden space-y-3">
        ${SCRIPTING_THEORY.map((section, i) => `
          <div class="rounded border border-gray-700 overflow-hidden">
            <button class="w-full flex items-center justify-between px-4 py-3 text-left bg-gray-900/60 hover:bg-gray-800/60 scr-theory-toggle" data-idx="${i}">
              <span class="font-semibold text-sm text-green-300">${section.icon} ${section.title}</span>
              <span class="text-gray-500 text-xs scr-caret-${i}">▶</span>
            </button>
            <div id="scr-theory-body-${i}" class="hidden px-4 py-3 bg-black/20">${section.content}</div>
          </div>`).join('')}
      </div>

      <!-- Lab detail container -->
      <div id="scr-lab-detail"></div>
    </div>`;

  // Tab switching
  view.querySelector('#scr-tab-labs').addEventListener('click', () => {
    view.querySelector('#scr-panel-labs').classList.remove('hidden');
    view.querySelector('#scr-panel-theory').classList.add('hidden');
    view.querySelector('#scr-tab-labs').className   = 'scr-tab px-3 py-1.5 text-xs font-semibold rounded-t border border-gray-700 bg-green-900/30 text-green-300';
    view.querySelector('#scr-tab-theory').className = 'scr-tab px-3 py-1.5 text-xs font-semibold rounded-t border border-gray-800 text-gray-400 hover:text-gray-200';
  });
  view.querySelector('#scr-tab-theory').addEventListener('click', () => {
    view.querySelector('#scr-panel-labs').classList.add('hidden');
    view.querySelector('#scr-panel-theory').classList.remove('hidden');
    view.querySelector('#scr-tab-theory').className = 'scr-tab px-3 py-1.5 text-xs font-semibold rounded-t border border-gray-700 bg-green-900/30 text-green-300';
    view.querySelector('#scr-tab-labs').className   = 'scr-tab px-3 py-1.5 text-xs font-semibold rounded-t border border-gray-800 text-gray-400 hover:text-gray-200';
  });

  // Theory accordion
  view.querySelectorAll('.scr-theory-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx  = btn.dataset.idx;
      const body = view.querySelector(`#scr-theory-body-${idx}`);
      const caret = view.querySelector(`.scr-caret-${idx}`);
      const open = !body.classList.contains('hidden');
      body.classList.toggle('hidden', open);
      caret.textContent = open ? '▶' : '▼';
    });
  });

  // Lab cards
  view.querySelectorAll('.scr-lab-card').forEach(card => {
    card.addEventListener('click', () => {
      const lab = SCRIPTING_LABS.find(l => l.id === card.dataset.labId);
      if (lab) _renderScriptingLab(lab);
    });
  });
}

function _renderScriptingLab(lab) {
  _scriptingLabId = lab.id;
  const detail    = getView().querySelector('#scr-lab-detail');
  const done      = !!(store.state.scriptingProgress || {})[lab.id];

  detail.innerHTML = `
    <div class="rounded border border-green-900/50 bg-gray-950 overflow-hidden">
      <!-- Lab header -->
      <div class="flex items-center justify-between px-4 py-3 bg-gray-900/60 border-b border-gray-800">
        <div>
          <span class="text-green-300 font-bold text-sm">${lab.title}</span>
          <span class="ml-2 text-xs ${lab.lang === 'python' ? 'text-blue-300' : 'text-yellow-300'}">${lab.lang === 'python' ? 'Python' : 'Bash'}</span>
          <span class="ml-1 text-xs text-gray-500">· +${lab.xp} XP</span>
        </div>
        ${done ? '<span class="text-green-400 text-xs font-semibold">✓ COMPLETED</span>' : ''}
      </div>

      <div class="p-4 space-y-4">
        <!-- Description -->
        <p class="text-sm text-gray-300">${lab.description}</p>

        <!-- Objectives -->
        <div>
          <div class="text-xs font-semibold text-green-400 mb-1">Objectives</div>
          <ul class="space-y-0.5">
            ${lab.objectives.map(o => `<li class="text-xs text-gray-300 flex gap-2"><span class="text-gray-600 shrink-0">▸</span>${o}</li>`).join('')}
          </ul>
        </div>

        <!-- Hints accordion -->
        <div>
          <button id="scr-hints-toggle" class="text-xs text-amber-400 hover:text-amber-300">💡 Show hints (−25 XP)</button>
          <div id="scr-hints-body" class="hidden mt-1 space-y-0.5">
            ${lab.hints.map(h => `<p class="text-xs text-amber-200/80 pl-3 border-l border-amber-900">💡 ${h}</p>`).join('')}
          </div>
        </div>

        <!-- Code editor -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs text-gray-400">${lab.lang === 'python' ? '🐍 Python editor' : '🖥️ Bash editor'}</span>
            <button id="scr-reset-btn" class="text-xs text-gray-600 hover:text-gray-400">↺ Reset</button>
          </div>
          <textarea id="scr-code-editor"
            class="w-full h-52 bg-black text-green-300 font-mono text-xs p-3 rounded border border-gray-700 focus:border-green-700 focus:outline-none resize-y"
            spellcheck="false"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            placeholder="${lab.lang === 'python' ? '# Write your Python script here' : '#!/bin/bash\n# Write your Bash script here'}"
          >${done ? '' : lab.template}</textarea>
        </div>

        <!-- Action buttons -->
        <div class="flex gap-2 flex-wrap">
          <button id="scr-run-btn" class="px-4 py-2 text-xs font-semibold bg-green-800 hover:bg-green-700 text-green-100 rounded border border-green-700">▶ Run &amp; Validate</button>
        </div>

        <!-- Feedback -->
        <div id="scr-feedback" class="hidden rounded border border-gray-700 bg-black/40 p-3 space-y-1"></div>
      </div>
    </div>`;

  detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Hints
  let hintsRevealed = false;
  detail.querySelector('#scr-hints-toggle').addEventListener('click', () => {
    if (!hintsRevealed) { store.spendXP(25); hintsRevealed = true; }
    detail.querySelector('#scr-hints-body').classList.toggle('hidden');
  });

  // Reset
  detail.querySelector('#scr-reset-btn').addEventListener('click', () => {
    detail.querySelector('#scr-code-editor').value = lab.template;
    detail.querySelector('#scr-feedback').classList.add('hidden');
  });

  // Run & Validate
  detail.querySelector('#scr-run-btn').addEventListener('click', () => {
    const code   = detail.querySelector('#scr-code-editor').value;
    const result = ScriptingEngine.validate(code, lab.checks);
    const fb     = detail.querySelector('#scr-feedback');

    fb.classList.remove('hidden');
    fb.innerHTML = result.checks.map(c =>
      `<div class="${c.pass ? 'text-green-400' : 'text-red-400'} text-xs">${c.pass ? '✓' : '✗'} ${c.label}</div>`
    ).join('') + `
      <div class="mt-2 pt-2 border-t border-gray-800 text-xs ${result.pass ? 'text-green-300' : 'text-amber-300'} font-semibold">
        ${result.pass
          ? `✅ Lab complete — +${lab.xp} XP awarded!`
          : `${result.score}% — ${result.checks.filter(c => !c.pass).length} check(s) remaining`}
      </div>`;

    if (result.pass) {
      if (!store.state.scriptingProgress) store.state.scriptingProgress = {};
      if (!store.state.scriptingProgress[lab.id]) {
        store.state.scriptingProgress[lab.id] = { completedAt: Date.now() };
        store.addXP(lab.xp, `scripting:${lab.id}`);
        store._save();
        // Refresh the lab card to show ✓
        const card = getView().querySelector(`[data-lab-id="${lab.id}"]`);
        if (card) {
          card.classList.add('border-green-800/60', 'bg-green-950/20');
          card.classList.remove('border-gray-700');
          card.querySelector('span.text-gray-600')?.replaceWith((() => { const s = document.createElement('span'); s.className='text-green-400 text-sm'; s.textContent='✓'; return s; })());
        }
        // Update count
        const countEl = getView().querySelector('.text-gray-500.text-right');
        if (countEl) countEl.textContent = `${Object.keys(store.state.scriptingProgress).length}/${SCRIPTING_LABS.length} labs done`;
      }
    }
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    console.error('[CCNA Mastery] Fatal init error:', err);
    // Remove any loading overlays that might be blocking the view
    document.getElementById('loading-overlay')?.remove();
    document.getElementById('boot-overlay')?.remove();
    // Show a visible error in the app view so the user knows what failed
    const view = document.getElementById('app-view');
    if (view) {
      view.innerHTML = `
        <div style="padding:40px;max-width:600px;margin:0 auto;font-family:'JetBrains Mono',monospace;">
          <div style="color:#ff4444;font-size:1.1rem;font-weight:700;margin-bottom:12px;">⚠ App failed to start</div>
          <p style="color:#8fbc8f;font-size:0.8rem;margin-bottom:8px;">${err.message || 'Unknown error'}</p>
          <p style="color:#4a7a4a;font-size:0.75rem;margin-bottom:20px;">
            Make sure you're running the app through the HTTP server (launch.bat / launch.sh),
            not opening app.html directly as a file.
          </p>
          <button onclick="location.reload()"
            style="background:#00ff41;color:#000;border:none;padding:10px 24px;
                   font-family:inherit;font-size:0.8rem;font-weight:700;
                   border-radius:4px;cursor:pointer;">
            ↺ Retry
          </button>
          <details style="margin-top:16px;">
            <summary style="color:#3a5a3a;font-size:0.7rem;cursor:pointer;">Technical details</summary>
            <pre style="color:#3a5a3a;font-size:0.65rem;margin-top:8px;white-space:pre-wrap;">${err.stack || err}</pre>
          </details>
        </div>`;
    }
  });
});
