/**
 * acl.js — Interactive ACL Simulator
 *
 * Two tabs:
 *   Trace  — enter a source IP and watch the ACL evaluate top-down in real time
 *   Build  — drag-and-drop rule cards to reorder; see traffic-flow table update instantly
 *
 * Exported API: render(containerEl)
 */

// ── Shared helpers ──────────────────────────────────────────────────────────

function ipToInt(ip) {
  return ip.split('.').reduce((acc, o) => (acc << 8) | parseInt(o), 0) >>> 0;
}

function ipInNetwork(ip, network) {
  if (network === 'any') return true;
  if (!network.includes('/')) return ip === network;
  const [netIp, bits] = network.split('/');
  const prefixLen = parseInt(bits);
  const mask = ~((1 << (32 - prefixLen)) - 1) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(netIp) & mask);
}

function matchEntry(entry, testIp) {
  return ipInNetwork(testIp, entry.src);
}

function evaluateAcl(entries, testIp) {
  for (let i = 0; i < entries.length; i++) {
    if (matchEntry(entries[i], testIp)) return { idx: i, action: entries[i].action };
  }
  return { idx: entries.length, action: 'deny' }; // implicit deny
}

// ── ACL data ────────────────────────────────────────────────────────────────

const PRESET_ACLS = [
  {
    name: 'Standard ACL 10',
    type: 'standard',
    entries: [
      { seq: 10, action: 'permit', src: '192.168.1.0/24', proto: null, dport: null },
      { seq: 20, action: 'permit', src: '10.0.0.1/32',    proto: null, dport: null },
      { seq: 30, action: 'deny',   src: 'any',            proto: null, dport: null },
    ],
  },
  {
    name: 'Extended ACL 100',
    type: 'extended',
    entries: [
      { seq: 10, action: 'permit', src: '192.168.1.0/24', proto: 'TCP', dport: '80'  },
      { seq: 20, action: 'permit', src: '192.168.1.0/24', proto: 'TCP', dport: '443' },
      { seq: 30, action: 'deny',   src: '10.0.0.0/8',     proto: 'any', dport: null  },
      { seq: 40, action: 'permit', src: 'any',            proto: 'any', dport: null  },
    ],
  },
];

const TEST_IPS = ['192.168.1.50', '10.0.0.1', '172.16.5.5', '192.168.2.1'];

// ── Styles ──────────────────────────────────────────────────────────────────

const STYLE = `
  .acl-wrap { font-family:'JetBrains Mono','Fira Code',Consolas,monospace; background:#0a0a0f; border:1px solid #1f2937; border-radius:8px; padding:18px; color:#c9d1d9; }
  .acl-tab  { padding:5px 14px; border:1px solid #374151; border-radius:4px; font-size:0.7rem; cursor:pointer; font-family:monospace; transition:all .15s; }
  .acl-tab.active { background:#0f172a; border-color:#22d3ee; color:#22d3ee; }
  .acl-tab:hover:not(.active) { background:#1f2937; }
  .acl-entry { display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:4px; border:1px solid #1f2937; margin-bottom:3px; font-size:0.7rem; cursor:default; transition:all .2s; }
  .acl-entry.permit-row { background:rgba(74,222,128,.06); border-color:rgba(74,222,128,.2); }
  .acl-entry.deny-row   { background:rgba(248,113,113,.06); border-color:rgba(248,113,113,.2); }
  .acl-entry.active-row { outline:2px solid #fbbf24; }
  .acl-entry.matched-permit { background:rgba(74,222,128,.15); border-color:#4ade80; }
  .acl-entry.matched-deny   { background:rgba(248,113,113,.15); border-color:#f87171; }
  .acl-entry.passed-row { opacity:.4; }
  .acl-badge { padding:1px 7px; border-radius:3px; font-weight:700; font-size:0.62rem; }
  .acl-permit { background:rgba(74,222,128,.15); color:#4ade80; }
  .acl-deny   { background:rgba(248,113,113,.15); color:#f87171; }
  .acl-drag-handle { cursor:grab; color:#374151; font-size:1rem; padding:0 2px; user-select:none; }
  .acl-drag-handle:active { cursor:grabbing; }
  .acl-dragging { opacity:.5; background:#1e293b !important; border-color:#38bdf8 !important; }
  .acl-drag-over { border-top:2px solid #38bdf8 !important; }
  .acl-btn { padding:4px 12px; border:1px solid #374151; border-radius:3px; font-size:0.68rem; font-family:monospace; cursor:pointer; transition:all .15s; }
  .acl-btn:hover { background:#1f2937; border-color:#4b5563; }
  .acl-result-permit { background:rgba(74,222,128,.12); border:1px solid rgba(74,222,128,.4); color:#4ade80; border-radius:4px; padding:8px 14px; text-align:center; font-weight:700; font-size:0.75rem; }
  .acl-result-deny   { background:rgba(248,113,113,.12); border:1px solid rgba(248,113,113,.4); color:#f87171; border-radius:4px; padding:8px 14px; text-align:center; font-weight:700; font-size:0.75rem; }
  @keyframes acl-pop { 0%{transform:scaleY(0.85);opacity:0} 100%{transform:scaleY(1);opacity:1} }
  .acl-pop { animation:acl-pop .25s ease forwards; }
`;

// ── Main render ─────────────────────────────────────────────────────────────

export function render(containerEl) {
  let tab        = 'trace';
  let aclIdx     = 0;
  let testIp     = '192.168.1.50';
  let animStep   = -1;
  let animTimer  = null;

  // Deep-copy entries so build tab can mutate without affecting presets
  let buildEntries = JSON.parse(JSON.stringify(PRESET_ACLS[0].entries));

  containerEl.innerHTML = `<style>${STYLE}</style><div class="acl-wrap"></div>`;
  const wrap = containerEl.querySelector('.acl-wrap');

  // ── Tab switcher ────────────────────────────────────────────────────────

  function renderShell() {
    wrap.innerHTML = `
      <div style="display:flex;gap:6px;margin-bottom:14px;">
        <button class="acl-tab ${tab==='trace'?'active':''}" id="acl-tab-trace">▶ Trace</button>
        <button class="acl-tab ${tab==='build'?'active':''}" id="acl-tab-build">⠿ Build</button>
      </div>
      <div id="acl-body" class="acl-pop"></div>`;

    wrap.querySelector('#acl-tab-trace').addEventListener('click', () => { tab='trace'; renderShell(); });
    wrap.querySelector('#acl-tab-build').addEventListener('click', () => { tab='build'; renderShell(); });

    if (tab === 'trace') renderTrace();
    else                 renderBuild();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TRACE TAB
  // ══════════════════════════════════════════════════════════════════════════

  function renderTrace() {
    const body = wrap.querySelector('#acl-body');
    const acl  = PRESET_ACLS[aclIdx];
    const entries = acl.entries;

    // Compute match for display
    let matchIdx   = -1;
    let matchAction = null;
    for (let i = 0; i < entries.length; i++) {
      if (matchEntry(entries[i], testIp)) { matchIdx = i; matchAction = entries[i].action; break; }
    }
    const showImplicit = animStep === entries.length;

    body.innerHTML = `
      <p style="color:#6b7280;font-size:0.7rem;margin-bottom:12px;">
        ACLs evaluate top-down. The first matching entry wins. An implicit
        <span style="color:#f87171;">deny any</span> catches everything else.
      </p>

      <!-- ACL selector -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
        ${PRESET_ACLS.map((a,i)=>`
          <button class="acl-btn acl-sel" data-idx="${i}"
            style="${aclIdx===i?'border-color:#22d3ee;color:#22d3ee;background:#0f172a;':'color:#9ca3af;'}">${a.name}</button>`
        ).join('')}
        <div style="display:flex;align-items:center;gap:6px;margin-left:auto;">
          <span style="color:#6b7280;font-size:0.68rem;">Src IP:</span>
          <input id="acl-ip" type="text" value="${testIp}" style="
            width:130px;padding:3px 7px;background:#0d0d0d;border:1px solid #374151;border-radius:3px;
            color:#22d3ee;font-family:monospace;font-size:0.7rem;outline:none;">
          <button class="acl-btn" id="acl-run" style="color:#22d3ee;border-color:#22d3ee;">▶ Trace</button>
        </div>
      </div>

      <!-- Flowchart -->
      <div style="background:#0f1117;border:1px solid #1f2937;border-radius:6px;padding:12px;margin-bottom:10px;">
        <div style="text-align:center;margin-bottom:8px;">
          <div style="display:inline-block;padding:5px 18px;background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.3);border-radius:20px;color:#a5b4fc;font-size:0.7rem;">
            Packet arrives — src: ${testIp}
          </div>
        </div>

        ${entries.map((e, i) => {
          const isActive = animStep === i;
          const isPassed = animStep > i && animStep !== -1;
          const isMatch  = isActive && matchEntry(e, testIp);
          let cls = 'acl-entry ' + (e.action === 'permit' ? 'permit-row' : 'deny-row');
          if (isActive && isMatch) cls = 'acl-entry ' + (e.action==='permit'?'matched-permit':'matched-deny');
          else if (isPassed) cls += ' passed-row';
          else if (isActive) cls += ' active-row';
          return `
            <div style="text-align:center;color:#374151;font-size:0.75rem;">↓</div>
            <div class="${cls}">
              <span style="color:#4b5563;font-size:0.62rem;min-width:30px;">seq ${e.seq}</span>
              <span class="acl-badge acl-${e.action}">${e.action.toUpperCase()}</span>
              <span style="color:#9ca3af;">${e.src}</span>
              ${e.proto ? `<span style="color:#6b7280;font-size:0.65rem;">${e.proto}${e.dport?':'+e.dport:''}</span>` : ''}
              <span style="margin-left:auto;font-weight:700;">
                ${isMatch ? (e.action==='permit'?'✓ PERMIT':'✗ DENY') : isPassed ? 'no match →' : isActive ? '▶ checking…' : ''}
              </span>
            </div>`;
        }).join('')}

        <div style="text-align:center;color:#374151;font-size:0.75rem;">↓</div>
        <div class="acl-entry deny-row${showImplicit?' matched-deny':''}" style="font-style:italic;">
          <span class="acl-badge acl-deny">DENY</span>
          <span style="color:#4b5563;">any (implicit — not in running-config)</span>
          ${showImplicit?`<span style="margin-left:auto;font-weight:700;color:#f87171;">✗ DENY</span>`:''}
        </div>
      </div>

      <!-- Result -->
      ${animStep >= 0 ? `
        <div class="${matchIdx>=0&&matchAction==='permit'&&!showImplicit?'acl-result-permit':'acl-result-deny'}">
          ${showImplicit ? '✗ DENIED — implicit deny any (no ACE matched)' :
            animStep <= matchIdx ? '▶ Tracing…' :
            matchAction==='permit' ? `✓ PERMITTED by seq ${entries[matchIdx].seq}` :
            `✗ DENIED by seq ${entries[matchIdx].seq}`}
        </div>` : ''}

      <div style="margin-top:10px;padding:8px 12px;background:rgba(251,191,36,.04);border-left:2px solid #fbbf24;font-size:0.67rem;color:#fcd34d;line-height:1.7;">
        💡 <strong>Remember:</strong> (1) First match wins — order matters critically.
        (2) Implicit deny any is always present. (3) Standard ACLs match source IP only;
        Extended match src+dst+proto+port. (4) Place standard ACLs near the destination, extended near the source.
      </div>`;

    // Events
    body.querySelectorAll('.acl-sel').forEach(btn =>
      btn.addEventListener('click', () => {
        aclIdx = parseInt(btn.dataset.idx); animStep = -1; clearTimeout(animTimer); renderTrace();
      })
    );
    body.querySelector('#acl-run')?.addEventListener('click', () => {
      testIp = (body.querySelector('#acl-ip')?.value || testIp).trim();
      clearTimeout(animTimer); animStep = 0; traceStep();
    });
    body.querySelector('#acl-ip')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') body.querySelector('#acl-run')?.click();
    });
  }

  function traceStep() {
    const entries = PRESET_ACLS[aclIdx].entries;
    renderTrace();
    if (animStep >= entries.length) return; // reached implicit deny
    const matched = matchEntry(entries[animStep], testIp);
    if (!matched) {
      animTimer = setTimeout(() => { animStep++; traceStep(); }, 650);
    }
    // if matched — stop (user sees result)
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BUILD TAB
  // ══════════════════════════════════════════════════════════════════════════

  function renderBuild() {
    const body = wrap.querySelector('#acl-body');

    body.innerHTML = `
      <p style="color:#6b7280;font-size:0.7rem;margin-bottom:10px;">
        Drag rules to reorder them. Watch how the traffic-flow table changes instantly — order defines outcome.
      </p>

      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <!-- Rule list (left) -->
        <div style="flex:1;min-width:220px;">
          <div style="font-size:0.65rem;color:#4b5563;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">ACL Rules (drag to reorder)</div>
          <div id="acl-build-list"></div>
          <!-- Add rule row -->
          <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap;">
            <select id="acl-new-action" style="padding:3px 6px;background:#0f1117;border:1px solid #374151;border-radius:3px;color:#9ca3af;font-family:monospace;font-size:0.68rem;">
              <option value="permit">permit</option>
              <option value="deny">deny</option>
            </select>
            <input id="acl-new-src" type="text" placeholder="src e.g. 10.0.0.0/8" style="
              flex:1;min-width:120px;padding:3px 7px;background:#0f1117;border:1px solid #374151;border-radius:3px;
              color:#22d3ee;font-family:monospace;font-size:0.68rem;outline:none;">
            <button class="acl-btn" id="acl-add-rule" style="color:#4ade80;border-color:#4ade80;">+ Add</button>
          </div>
          <!-- Reset -->
          <div style="margin-top:6px;">
            <button class="acl-btn" id="acl-reset" style="color:#f87171;border-color:#f87171;font-size:0.65rem;">↺ Reset</button>
          </div>
        </div>

        <!-- Traffic flow matrix (right) -->
        <div style="flex:1;min-width:200px;">
          <div style="font-size:0.65rem;color:#4b5563;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Live Traffic Flow</div>
          <div id="acl-flow-table"></div>
        </div>
      </div>`;

    renderBuildList();
    renderFlowTable();

    body.querySelector('#acl-add-rule')?.addEventListener('click', () => {
      const action = body.querySelector('#acl-new-action')?.value || 'permit';
      const src    = (body.querySelector('#acl-new-src')?.value || '').trim();
      if (!src) return;
      const nextSeq = buildEntries.length ? buildEntries[buildEntries.length - 1].seq + 10 : 10;
      buildEntries.push({ seq: nextSeq, action, src, proto: null, dport: null });
      body.querySelector('#acl-new-src').value = '';
      renderBuildList();
      renderFlowTable();
    });

    body.querySelector('#acl-reset')?.addEventListener('click', () => {
      buildEntries = JSON.parse(JSON.stringify(PRESET_ACLS[0].entries));
      renderBuildList();
      renderFlowTable();
    });
  }

  function renderBuildList() {
    const list = wrap.querySelector('#acl-build-list');
    if (!list) return;

    list.innerHTML = buildEntries.map((e, i) => `
      <div class="acl-entry ${e.action==='permit'?'permit-row':'deny-row'}"
           data-idx="${i}" draggable="true"
           style="cursor:default;user-select:none;">
        <span class="acl-drag-handle" title="Drag to reorder">⠿</span>
        <span class="acl-badge acl-${e.action}">${e.action.toUpperCase()}</span>
        <span style="color:#9ca3af;flex:1;">${e.src}</span>
        ${e.proto?`<span style="color:#6b7280;font-size:0.62rem;">${e.proto}${e.dport?':'+e.dport:''}</span>`:''}
        <button class="acl-del" data-idx="${i}" style="
          background:none;border:none;color:#4b5563;cursor:pointer;font-size:0.75rem;padding:0 4px;
          line-height:1;" title="Remove">✕</button>
      </div>`
    ).join('') + `
      <div class="acl-entry deny-row" style="font-style:italic;opacity:.5;cursor:default;">
        <span class="acl-badge acl-deny">DENY</span>
        <span style="color:#4b5563;">any (implicit)</span>
      </div>`;

    // Delete buttons
    list.querySelectorAll('.acl-del').forEach(btn =>
      btn.addEventListener('click', () => {
        buildEntries.splice(parseInt(btn.dataset.idx), 1);
        renderBuildList(); renderFlowTable();
      })
    );

    // Drag-and-drop (pointer events work on mobile + desktop)
    let dragIdx = null;
    list.querySelectorAll('[draggable="true"]').forEach(row => {
      row.addEventListener('dragstart', e => {
        dragIdx = parseInt(row.dataset.idx);
        row.classList.add('acl-dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', () => row.classList.remove('acl-dragging'));
      row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('acl-drag-over'); });
      row.addEventListener('dragleave', () => row.classList.remove('acl-drag-over'));
      row.addEventListener('drop', e => {
        e.preventDefault();
        row.classList.remove('acl-drag-over');
        const dropIdx = parseInt(row.dataset.idx);
        if (dragIdx === null || dragIdx === dropIdx) return;
        const [moved] = buildEntries.splice(dragIdx, 1);
        buildEntries.splice(dropIdx, 0, moved);
        // Renumber sequences
        buildEntries.forEach((entry, i) => { entry.seq = (i + 1) * 10; });
        dragIdx = null;
        renderBuildList(); renderFlowTable();
      });
    });
  }

  function renderFlowTable() {
    const table = wrap.querySelector('#acl-flow-table');
    if (!table) return;

    const testSet = TEST_IPS;
    table.innerHTML = testSet.map(ip => {
      const result = evaluateAcl(buildEntries, ip);
      const permit = result.action === 'permit';
      return `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:3px;margin-bottom:3px;
          background:${permit?'rgba(74,222,128,.06)':'rgba(248,113,113,.06)'};
          border:1px solid ${permit?'rgba(74,222,128,.2)':'rgba(248,113,113,.2)'};">
          <span style="font-family:monospace;font-size:0.68rem;color:#9ca3af;flex:1;">${ip}</span>
          <span style="font-size:0.65rem;color:#6b7280;">
            ${result.idx < buildEntries.length ? `seq ${buildEntries[result.idx].seq}` : 'implicit'}
          </span>
          <span class="acl-badge acl-${result.action}" style="font-size:0.6rem;">
            ${permit?'✓ PERMIT':'✗ DENY'}
          </span>
        </div>`;
    }).join('') + `
      <p style="font-size:0.65rem;color:#374151;margin-top:8px;line-height:1.5;">
        Reorder or add rules on the left — results update instantly.
      </p>`;
  }

  // ── Boot ────────────────────────────────────────────────────────────────

  renderShell();
}
