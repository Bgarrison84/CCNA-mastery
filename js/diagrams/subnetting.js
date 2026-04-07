/**
 * Subnetting Diagram — Live CIDR input redraws bit-boundary, host count, address range.
 */

function ipToInt(ip) {
  return ip.split('.').reduce((acc, o) => (acc << 8) | parseInt(o), 0) >>> 0;
}

function intToIp(n) {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.');
}

function cidrToMask(prefix) {
  return prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
}

function calcSubnet(ipStr, prefix) {
  const ip    = ipToInt(ipStr);
  const mask  = cidrToMask(prefix);
  const wild  = ~mask >>> 0;
  const net   = (ip & mask) >>> 0;
  const bcast = (net | wild) >>> 0;
  const first = prefix < 31 ? (net + 1) >>> 0 : net;
  const last  = prefix < 31 ? (bcast - 1) >>> 0 : bcast;
  const hosts = prefix <= 30 ? (1 << (32 - prefix)) - 2 : prefix === 31 ? 2 : 1;
  const blockSize = 1 << (32 - prefix);
  const nextNet = (net + blockSize) >>> 0;
  return { net: intToIp(net), bcast: intToIp(bcast), first: intToIp(first), last: intToIp(last), hosts, mask: intToIp(mask), wild: intToIp(wild), nextNet: intToIp(nextNet), blockSize, prefix, ip: intToIp(ip), ipInt: ip, netInt: net, bcastInt: bcast };
}

function toBinary(n) {
  return (n >>> 0).toString(2).padStart(32, '0');
}

function formatBinaryOctets(binStr, prefix) {
  const octets = [];
  for (let i = 0; i < 4; i++) {
    const octet = binStr.slice(i * 8, i * 8 + 8);
    let html = '';
    for (let b = 0; b < 8; b++) {
      const pos = i * 8 + b;
      const bit = octet[b];
      const isNet = pos < prefix;
      html += `<span style="color:${isNet ? '#4ade80' : '#fb923c'};">${bit}</span>`;
    }
    octets.push(`<span>${html}</span>`);
  }
  return octets.join('<span style="color:#374151;"> . </span>');
}

const EXAMPLES = [
  { ip: '192.168.1.0', prefix: 24, label: '/24 (Class C default)' },
  { ip: '192.168.1.64', prefix: 26, label: '/26 (4 subnets of /24)' },
  { ip: '10.0.0.0', prefix: 8, label: '/8 (Class A)' },
  { ip: '172.16.0.0', prefix: 16, label: '/16 (Class B)' },
  { ip: '192.168.1.128', prefix: 30, label: '/30 (point-to-point)' },
];

// ── Speed Drill state ───────────────────────────────────────────────────────

const DRILL_DURATION = 90; // seconds per speed run

function genDrillQ() {
  const prefixRange = [[24,30],[16,24],[8,16]];
  const tier = prefixRange[Math.floor(Math.random() * prefixRange.length)];
  const pref = tier[0] + Math.floor(Math.random() * (tier[1] - tier[0] + 1));
  const first = [10,172,192][Math.floor(Math.random()*3)];
  const ip = `${first}.${Math.floor(Math.random()*254)+1}.${Math.floor(Math.random()*254)+1}.${Math.floor(Math.random()*254)+1}`;
  const sub = calcSubnet(ip, pref);
  // Pick a random question type
  const types = ['net','bcast','first','last','hosts','mask'];
  const qType = types[Math.floor(Math.random() * types.length)];
  const answers = {
    net:   { label: 'Network ID',       answer: sub.net,              hint: 'AND the IP with the mask' },
    bcast: { label: 'Broadcast',        answer: sub.bcast,            hint: 'OR the network with the wildcard' },
    first: { label: 'First Usable IP',  answer: sub.first,            hint: 'Network ID + 1' },
    last:  { label: 'Last Usable IP',   answer: sub.last,             hint: 'Broadcast - 1' },
    hosts: { label: 'Usable Hosts',     answer: sub.hosts.toString(), hint: '2^(32-prefix) - 2' },
    mask:  { label: 'Subnet Mask',      answer: sub.mask,             hint: `/${pref} → mask bits` },
  };
  return { ipStr: ip, prefix: pref, sub, qType, ...answers[qType] };
}

// ── Main render ──────────────────────────────────────────────────────────────

export function render(containerEl) {
  let inputIp = '192.168.1.0';
  let inputPrefix = 24;
  let error = '';
  let mode = 'view'; // 'view' | 'game' | 'drill'

  // Drill state
  let drillActive   = false;
  let drillTimer    = null;
  let drillRemain   = DRILL_DURATION;
  let drillScore    = 0;
  let drillStreak   = 0;
  let drillBest     = parseInt(localStorage.getItem('ccna-drill-best') || '0');
  let drillQ        = null;
  let drillShownHint = false;
  let drillLastResult = null; // 'correct'|'wrong'|null

  function parseInput(val) {
    const m = val.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*\/\s*(\d{1,2})$/);
    if (!m) return null;
    const parts = m[1].split('.').map(Number);
    if (parts.some(p => p > 255)) return null;
    const pref = parseInt(m[2]);
    if (pref < 0 || pref > 32) return null;
    return { ip: m[1], prefix: pref };
  }

  function draw() {
    containerEl.innerHTML = `
      <div style="font-family:'JetBrains Mono',monospace;font-size:0.78rem;color:#c8ffc8;">
        <!-- Tab Switcher -->
        <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
          ${[['view','Explorer'],['game','ID the Subnet'],['drill','⚡ Speed Drill']].map(([m,label])=>`
            <button class="sn-mode-btn" data-mode="${m}" style="padding:6px 12px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.72rem;
              background:${mode===m?'rgba(0,255,65,0.15)':'transparent'};
              border:1px solid ${mode===m?'rgba(0,255,65,0.4)':'rgba(0,255,65,0.15)'};
              color:${mode===m?'#00ff41':'#6a9a6a'};">${label}</button>`).join('')}
        </div>

        ${mode === 'view' ? renderExplorer() : mode === 'game' ? renderGame() : renderDrill()}
      </div>`;

    bindEvents();
  }

  function renderExplorer() {
    let sub = null;
    try { sub = calcSubnet(inputIp, inputPrefix); } catch(e) { error = 'Invalid IP'; }
    const ipBin   = sub ? toBinary(sub.ipInt) : '';
    const netBin  = sub ? toBinary(sub.netInt) : '';
    const maskBin = sub ? toBinary(cidrToMask(inputPrefix)) : '';

    return `
        <!-- Input -->
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap;">
          <input id="sn-input" type="text" value="${inputIp}/${inputPrefix}" placeholder="e.g. 192.168.1.0/24" style="
            flex:1;min-width:180px;padding:7px 12px;background:#0d0d0d;
            border:1px solid ${error?'#f87171':'rgba(0,255,65,0.3)'};border-radius:4px;
            color:#00ff41;font-family:inherit;font-size:0.78rem;outline:none;
          ">
          <button id="sn-calc" style="
            padding:7px 18px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.75rem;font-weight:700;
            background:var(--terminal-green,#00ff41);border:none;color:#000;
          ">Calculate</button>
        </div>

        <!-- Quick examples -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
          ${EXAMPLES.map(e => `
            <button class="sn-ex" data-ip="${e.ip}" data-prefix="${e.prefix}" style="
              padding:3px 9px;border-radius:3px;cursor:pointer;font-family:inherit;font-size:0.62rem;
              background:rgba(0,255,65,0.06);border:1px solid rgba(0,255,65,0.15);color:#6a9a6a;
            ">${e.label}</button>`).join('')}
        </div>

        ${error ? `<div style="color:#f87171;font-size:0.72rem;margin-bottom:10px;">${error}</div>` : ''}

        ${sub ? `
        <!-- Results table -->
        <div style="background:#0d0d0d;border:1px solid rgba(0,255,65,0.1);border-radius:6px;padding:14px;margin-bottom:14px;">
          <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 16px;font-size:0.72rem;">
            ${[
              ['Input IP',       sub.ip,      '#9ca3af'],
              ['Subnet Mask',    sub.mask,    '#9ca3af'],
              ['Wildcard Mask',  sub.wild,    '#9ca3af'],
              ['Network Address',sub.net,     '#4ade80'],
              ['First Usable',   sub.first,   '#86efac'],
              ['Last Usable',    sub.last,    '#86efac'],
              ['Broadcast',      sub.bcast,   '#fb923c'],
              ['Usable Hosts',   sub.hosts.toLocaleString(), '#fbbf24'],
              ['Block Size',     sub.blockSize + ' addresses', '#fbbf24'],
              ['Next Network',   sub.nextNet,  '#6b7280'],
            ].map(([k, v, c]) => `
              <span style="color:#6b7280;">${k}</span>
              <span style="color:${c};font-weight:600;">${v}</span>`).join('')}
          </div>
        </div>

        <!-- Bit boundary diagram -->
        <div style="margin-bottom:14px;">
          <div style="color:#6b7280;font-size:0.65rem;margin-bottom:8px;">
            Bit diagram — <span style="color:#4ade80;">■ network bits (/${inputPrefix})</span>
            <span style="color:#fb923c;"> ■ host bits (${32-inputPrefix})</span>
          </div>

          <!-- Octet labels -->
          <div style="display:grid;grid-template-columns:auto repeat(4, 1fr);gap:4px;font-size:0.62rem;margin-bottom:4px;">
            <span style="color:#4b5563;"></span>
            ${['Octet 1','Octet 2','Octet 3','Octet 4'].map(o=>`<span style="color:#4b5563;text-align:center;">${o}</span>`).join('')}
          </div>

          <!-- IP bits -->
          <div style="display:grid;grid-template-columns:auto 1fr;gap:4px;font-size:0.62rem;margin-bottom:2px;align-items:center;">
            <span style="color:#6b7280;min-width:55px;">IP addr</span>
            <div style="font-size:0.62rem;letter-spacing:0.05em;line-height:1.8;overflow-x:auto;white-space:nowrap;">
              ${formatBinaryOctets(ipBin, inputPrefix)}
            </div>
          </div>

          <!-- Mask bits -->
          <div style="display:grid;grid-template-columns:auto 1fr;gap:4px;font-size:0.62rem;margin-bottom:2px;align-items:center;">
            <span style="color:#6b7280;min-width:55px;">Mask</span>
            <div style="font-size:0.62rem;letter-spacing:0.05em;line-height:1.8;overflow-x:auto;white-space:nowrap;">
              ${formatBinaryOctets(maskBin, inputPrefix)}
            </div>
          </div>

          <!-- Network bits -->
          <div style="display:grid;grid-template-columns:auto 1fr;gap:4px;font-size:0.62rem;align-items:center;">
            <span style="color:#6b7280;min-width:55px;">Network</span>
            <div style="font-size:0.62rem;letter-spacing:0.05em;line-height:1.8;overflow-x:auto;white-space:nowrap;">
              ${formatBinaryOctets(netBin, inputPrefix)}
            </div>
          </div>

          <!-- Boundary indicator -->
          <div style="margin-top:6px;font-size:0.6rem;color:#4b5563;overflow-x:auto;white-space:nowrap;letter-spacing:0.05em;">
            ${'─'.repeat(inputPrefix) + '┤' + (inputPrefix < 32 ? '├' + '─'.repeat(32 - inputPrefix - (inputPrefix < 32 ? 1 : 0)) : '')}
            <span style="margin-left:8px;">↑ bit ${inputPrefix} boundary</span>
          </div>
        </div>

        <!-- Visual address space bar -->
        <div style="margin-bottom:4px;">
          <div style="color:#6b7280;font-size:0.65rem;margin-bottom:6px;">Address space in this subnet</div>
          <div style="display:flex;height:22px;border-radius:3px;overflow:hidden;font-size:0.55rem;">
            <div style="flex:1px;min-width:6px;background:#4ade8033;border-right:1px solid #4ade8066;" title="Network ID"></div>
            <div style="flex:${Math.max(sub.hosts, 1)};background:#4ade8022;" title="Usable hosts"></div>
            <div style="flex:1px;min-width:6px;background:#fb923c33;border-left:1px solid #fb923c66;" title="Broadcast"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.6rem;color:#4b5563;margin-top:3px;">
            <span style="color:#4ade80;">${sub.net} (network)</span>
            <span style="color:#fbbf24;">${sub.hosts.toLocaleString()} usable hosts</span>
            <span style="color:#fb923c;">${sub.bcast} (broadcast)</span>
          </div>
        </div>
        ` : ''}`;
  }

  function renderGame() {
    return `
      <div id="sn-game-pane">
        <p style="color:#6a9a6a;font-size:0.72rem;margin-bottom:14px;">Calculate the correct parameters for the given IP/Prefix.</p>
        <div id="sn-game-target" style="text-align:center;padding:20px;background:#0d0d0d;border:1px solid #00ff41;border-radius:8px;margin-bottom:20px;">
          <div style="color:#6b7280;font-size:0.65rem;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.1em;">Target IP/Prefix</div>
          <div id="sn-q-val" style="font-size:1.5rem;font-weight:800;color:#00ff41;text-shadow:0 0 10px rgba(0,255,65,0.4);">...</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
          <div id="sn-game-slots" style="display:flex;flex-direction:column;gap:8px;">
            <div class="sn-slot" data-type="net" style="border:1px dashed #374151;border-radius:6px;padding:10px;background:rgba(0,0,0,0.2);">
              <div style="color:#6b7280;font-size:0.6rem;margin-bottom:4px;">Network ID</div>
              <div class="slot-content" style="height:24px;"></div>
            </div>
            <div class="sn-slot" data-type="bcast" style="border:1px dashed #374151;border-radius:6px;padding:10px;background:rgba(0,0,0,0.2);">
              <div style="color:#6b7280;font-size:0.6rem;margin-bottom:4px;">Broadcast</div>
              <div class="slot-content" style="height:24px;"></div>
            </div>
            <div class="sn-slot" data-type="hosts" style="border:1px dashed #374151;border-radius:6px;padding:10px;background:rgba(0,0,0,0.2);">
              <div style="color:#6b7280;font-size:0.6rem;margin-bottom:4px;">Usable Hosts</div>
              <div class="slot-content" style="height:24px;"></div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <div id="sn-game-pool" style="flex:1;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:6px;"></div>
            <button id="sn-game-check" style="width:100%;padding:12px;background:#00ff41;color:#000;font-weight:800;border:none;border-radius:4px;cursor:pointer;">Validate Answers</button>
          </div>
        </div>
        <div id="sn-game-fb" class="hidden text-center mt-4 font-bold text-sm"></div>
      </div>`;
  }

  // ── Speed Drill renderer ──────────────────────────────────────────────────

  function renderDrill() {
    const timerColor = drillRemain <= 15 ? '#f87171' : drillRemain <= 30 ? '#fbbf24' : '#4ade80';
    const mm = String(Math.floor(drillRemain / 60)).padStart(2,'0');
    const ss = String(drillRemain % 60).padStart(2,'0');

    if (!drillActive && !drillScore) {
      // Pre-start screen
      return `
        <div style="text-align:center;padding:20px;">
          <div style="font-size:2rem;margin-bottom:8px;">⚡</div>
          <div style="font-size:1rem;font-weight:700;color:#00ff41;margin-bottom:6px;">Speed Drill</div>
          <p style="color:#6b7280;font-size:0.72rem;margin-bottom:16px;line-height:1.6;">
            ${DRILL_DURATION}-second timer. Answer as many subnetting questions as you can.<br>
            Type the answer and press <strong style="color:#9ca3af;">Enter</strong>.<br>
            Questions range from /8 to /30 — network, broadcast, hosts, mask, and more.
          </p>
          <div style="font-size:0.7rem;color:#4b5563;margin-bottom:20px;">
            Personal best: <span style="color:#fbbf24;font-weight:700;">${drillBest} correct</span>
          </div>
          <button id="sn-drill-start" style="padding:10px 32px;background:#00ff41;border:none;border-radius:4px;
            font-weight:700;font-size:0.85rem;cursor:pointer;color:#000;font-family:monospace;">
            Start Drill
          </button>
        </div>`;
    }

    if (!drillActive && drillScore > 0) {
      // Results screen
      const newBest = drillScore > drillBest;
      const xp = drillScore * 8;
      return `
        <div style="text-align:center;padding:20px;">
          <div style="font-size:1.5rem;margin-bottom:6px;">${newBest ? '🏆' : '✓'}</div>
          <div style="font-size:1rem;font-weight:700;color:${newBest?'#fbbf24':'#4ade80'};margin-bottom:4px;">
            ${newBest ? 'New Personal Best!' : 'Drill Complete'}
          </div>
          <div style="font-size:2rem;font-weight:800;color:#00ff41;margin:12px 0;">${drillScore}</div>
          <div style="font-size:0.75rem;color:#6b7280;margin-bottom:4px;">correct answers in ${DRILL_DURATION}s</div>
          ${newBest ? `<div style="font-size:0.7rem;color:#fbbf24;margin-bottom:16px;">Previous best: ${drillBest > drillScore ? drillBest : drillScore - 1}</div>` : `<div style="font-size:0.7rem;color:#4b5563;margin-bottom:16px;">Personal best: ${drillBest}</div>`}
          <div style="font-size:0.72rem;color:#4ade80;margin-bottom:16px;">+${xp} XP earned</div>
          <div style="display:flex;gap:8px;justify-content:center;">
            <button id="sn-drill-again" style="padding:8px 24px;background:#00ff41;border:none;border-radius:4px;font-weight:700;font-size:0.78rem;cursor:pointer;color:#000;font-family:monospace;">
              Play Again
            </button>
            <button id="sn-drill-back" class="sn-mode-btn" data-mode="view" style="padding:8px 16px;background:transparent;border:1px solid #374151;border-radius:4px;font-size:0.72rem;cursor:pointer;color:#6b7280;font-family:monospace;">
              Explorer
            </button>
          </div>
        </div>`;
    }

    // Active drill
    const q = drillQ;
    const resultBanner = drillLastResult === 'correct'
      ? `<div style="color:#4ade80;font-weight:700;font-size:0.72rem;text-align:center;margin-bottom:6px;">✓ Correct! +1</div>`
      : drillLastResult === 'wrong'
      ? `<div style="color:#f87171;font-weight:700;font-size:0.72rem;text-align:center;margin-bottom:6px;">✗ Wrong — answer was <span style="color:#fbbf24;">${q?.prevAnswer || ''}</span></div>`
      : '';

    return `
      <div>
        <!-- HUD -->
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <div style="font-size:1.4rem;font-weight:800;color:${timerColor};font-variant-numeric:tabular-nums;min-width:50px;">${mm}:${ss}</div>
          <div style="flex:1;height:6px;background:#1f2937;border-radius:3px;overflow:hidden;">
            <div style="height:100%;background:${timerColor};border-radius:3px;transition:width .9s linear;width:${(drillRemain/DRILL_DURATION)*100}%;"></div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:1.1rem;font-weight:800;color:#00ff41;">${drillScore}</div>
            <div style="font-size:0.6rem;color:#4b5563;">correct</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:0.9rem;font-weight:700;color:#fbbf24;">${drillStreak}</div>
            <div style="font-size:0.6rem;color:#4b5563;">streak</div>
          </div>
        </div>

        ${resultBanner}

        <!-- Question -->
        <div style="background:#0f1117;border:1px solid #1f2937;border-radius:6px;padding:16px;margin-bottom:12px;text-align:center;">
          <div style="font-size:0.65rem;color:#4b5563;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">${q?.label || ''}</div>
          <div style="font-size:1.5rem;font-weight:800;color:#00ff41;margin-bottom:4px;">${q?.ipStr || ''}/${q?.prefix || ''}</div>
          <div style="font-size:0.68rem;color:#374151;">${drillShownHint ? `Hint: ${q?.hint}` : ''}</div>
        </div>

        <!-- Answer input -->
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <input id="sn-drill-input" type="text" placeholder="Type answer, press Enter…" autocomplete="off" style="
            flex:1;padding:8px 12px;background:#0d0d0d;border:1px solid rgba(0,255,65,0.3);border-radius:4px;
            color:#00ff41;font-family:monospace;font-size:0.82rem;outline:none;">
          <button id="sn-drill-submit" style="padding:8px 16px;background:rgba(0,255,65,0.15);border:1px solid rgba(0,255,65,0.4);border-radius:4px;color:#00ff41;font-family:monospace;font-size:0.72rem;cursor:pointer;">Enter</button>
          <button id="sn-drill-hint" style="padding:8px 10px;background:transparent;border:1px solid #374151;border-radius:4px;color:#6b7280;font-family:monospace;font-size:0.68rem;cursor:pointer;" title="Show hint (no penalty)">?</button>
          <button id="sn-drill-skip" style="padding:8px 10px;background:transparent;border:1px solid #374151;border-radius:4px;color:#6b7280;font-family:monospace;font-size:0.68rem;cursor:pointer;" title="Skip (counts as wrong)">↷</button>
        </div>

        <div style="font-size:0.62rem;color:#374151;text-align:center;">
          Press <kbd style="background:#1f2937;border:1px solid #374151;border-radius:2px;padding:1px 4px;color:#6b7280;">Enter</kbd> to submit ·
          <kbd style="background:#1f2937;border:1px solid #374151;border-radius:2px;padding:1px 4px;color:#6b7280;">?</kbd> hint ·
          <kbd style="background:#1f2937;border:1px solid #374151;border-radius:2px;padding:1px 4px;color:#6b7280;">↷</kbd> skip
        </div>
      </div>`;
  }

  function startDrill() {
    drillActive  = true;
    drillScore   = 0;
    drillStreak  = 0;
    drillRemain  = DRILL_DURATION;
    drillLastResult = null;
    drillQ       = genDrillQ();
    clearInterval(drillTimer);
    drillTimer   = setInterval(() => {
      drillRemain--;
      if (drillRemain <= 0) {
        clearInterval(drillTimer);
        drillActive = false;
        if (drillScore > drillBest) {
          drillBest = drillScore;
          localStorage.setItem('ccna-drill-best', drillBest);
        }
        const xp = drillScore * 8;
        if (xp > 0) document.dispatchEvent(new CustomEvent('ccna-xp', { detail: { amount: xp, reason: 'Speed Drill' } }));
      }
      draw();
      if (drillActive) bindDrillEvents();
    }, 1000);
    draw();
    bindDrillEvents();
  }

  function submitDrillAnswer(userVal) {
    if (!drillActive || !drillQ) return;
    const q = drillQ;
    const norm = v => v.trim().toLowerCase().replace(/\s+/g,'');
    const correct = norm(userVal) === norm(q.answer);
    if (correct) {
      drillScore++;
      drillStreak++;
      drillLastResult = 'correct';
    } else {
      drillStreak = 0;
      drillLastResult = 'wrong';
      q.prevAnswer = q.answer;
    }
    drillShownHint = false;
    drillQ = genDrillQ();
    draw();
    bindDrillEvents();
  }

  function bindDrillEvents() {
    const input  = containerEl.querySelector('#sn-drill-input');
    const submit = containerEl.querySelector('#sn-drill-submit');
    const hint   = containerEl.querySelector('#sn-drill-hint');
    const skip   = containerEl.querySelector('#sn-drill-skip');
    if (!input) return;
    input.focus();
    submit?.addEventListener('click', () => { submitDrillAnswer(input.value); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submitDrillAnswer(input.value); } });
    hint?.addEventListener('click', () => { drillShownHint = true; draw(); bindDrillEvents(); });
    skip?.addEventListener('click', () => {
      drillStreak = 0;
      drillLastResult = 'wrong';
      drillQ.prevAnswer = drillQ.answer;
      drillShownHint = false;
      drillQ = genDrillQ();
      draw(); bindDrillEvents();
    });
  }

  function bindEvents() {
    containerEl.querySelectorAll('.sn-mode-btn').forEach(btn => {
      btn.onclick = () => {
        clearInterval(drillTimer); drillActive = false;
        mode = btn.dataset.mode; draw(); if(mode==='game') initGame();
      };
    });

    if (mode === 'drill') {
      containerEl.querySelector('#sn-drill-start')?.addEventListener('click', startDrill);
      containerEl.querySelector('#sn-drill-again')?.addEventListener('click', () => {
        drillScore = 0; drillStreak = 0; drillLastResult = null; startDrill();
      });
      if (drillActive) bindDrillEvents();
      return;
    }

    if (mode === 'view') {
      containerEl.querySelector('#sn-calc')?.addEventListener('click', () => {
        const val = containerEl.querySelector('#sn-input')?.value.trim() || '';
        const parsed = parseInput(val);
        if (parsed) { inputIp = parsed.ip; inputPrefix = parsed.prefix; error = ''; }
        else { error = 'Invalid format — use x.x.x.x/nn (e.g. 10.0.0.0/8)'; }
        draw();
      });
      containerEl.querySelector('#sn-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') containerEl.querySelector('#sn-calc')?.click();
      });
      containerEl.querySelectorAll('.sn-ex').forEach(btn => {
        btn.addEventListener('click', () => {
          inputIp = btn.dataset.ip; inputPrefix = parseInt(btn.dataset.prefix); error = '';
          draw();
        });
      });
    }
  }

  let currentGame = null;

  function initGame() {
    const qEl = containerEl.querySelector('#sn-q-val');
    const pool = containerEl.querySelector('#sn-game-pool');
    const slots = containerEl.querySelectorAll('.sn-slot');
    const fb = containerEl.querySelector('#sn-game-fb');
    const checkBtn = containerEl.querySelector('#sn-game-check');

    // Generate random question
    const oct1 = [10, 172, 192][Math.floor(Math.random()*3)];
    const oct2 = Math.floor(Math.random()*255);
    const oct3 = Math.floor(Math.random()*255);
    const pref = Math.floor(Math.random()*7) + 24; // /24 to /30
    const ipStr = `${oct1}.${oct2}.${oct3}.${Math.floor(Math.random()*255)}`;
    const sub = calcSubnet(ipStr, pref);
    currentGame = sub;

    qEl.textContent = `${sub.ip}/${pref}`;
    pool.innerHTML = '';
    fb.classList.add('hidden');
    slots.forEach(s => { s.querySelector('.slot-content').innerHTML = ''; s.style.borderColor = '#374151'; });

    // Correct + Distractors
    const options = [
      { val: sub.net, type: 'net' },
      { val: sub.bcast, type: 'bcast' },
      { val: sub.hosts.toString(), type: 'hosts' },
      // Distractors
      { val: intToIp(ipToInt(sub.net)-1), type: 'fake' },
      { val: intToIp(ipToInt(sub.bcast)+1), type: 'fake' },
      { val: (sub.hosts+2).toString(), type: 'fake' }
    ].sort(() => Math.random() - 0.5);

    options.forEach(opt => {
      const tile = document.createElement('div');
      tile.className = 'sn-tile';
      tile.textContent = opt.val;
      tile.dataset.val = opt.val;
      tile.style = `padding:6px 10px;background:#1a1a1a;border:1px solid #4ade8044;border-radius:4px;color:#4ade80;font-size:0.7rem;font-weight:700;cursor:grab;touch-action:none;user-select:none;text-align:center;`;
      pool.appendChild(tile);

      let isDragging = false, sx, sy;
      tile.onpointerdown = e => { isDragging = true; sx = e.clientX; sy = e.clientY; tile.setPointerCapture(e.pointerId); tile.style.zIndex = 1000; tile.style.cursor = 'grabbing'; };
      tile.onpointermove = e => { if (!isDragging) return; tile.style.transform = `translate(${e.clientX - sx}px, ${e.clientY - sy}px)`; };
      tile.onpointerup = e => {
        if (!isDragging) return; isDragging = false; tile.releasePointerCapture(e.pointerId); tile.style.zIndex = ''; tile.style.cursor = 'grab'; tile.style.transform = '';
        const rect = tile.getBoundingClientRect();
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        let dropped = false;
        slots.forEach(s => {
          const sr = s.getBoundingClientRect();
          const content = s.querySelector('.slot-content');
          if (cx >= sr.left && cx <= sr.right && cy >= sr.top && cy <= sr.bottom && !content.hasChildNodes()) {
            content.appendChild(tile); dropped = true;
          }
        });
        if (!dropped) pool.appendChild(tile);
      };
    });

    checkBtn.onclick = () => {
      let correct = 0;
      slots.forEach(s => {
        const t = s.querySelector('.sn-tile');
        const type = s.dataset.type;
        const expected = type === 'net' ? sub.net : type === 'bcast' ? sub.bcast : sub.hosts.toString();
        if (t && t.dataset.val === expected) { correct++; s.style.borderColor = '#00ff41'; }
        else s.style.borderColor = '#ff4444';
      });
      fb.classList.remove('hidden');
      if (correct === 3) {
        fb.innerHTML = '<span style="color:#00ff41;">✅ Excellent! Subnet correctly identified. +60 XP</span>';
        document.dispatchEvent(new CustomEvent('ccna-xp', { detail: { amount: 60, reason: 'Subnet Challenge' } }));
      } else fb.innerHTML = `<span style="color:#ffb000;">${correct}/3 correct. Check your math!</span>`;
    };
  }

  draw();
}
