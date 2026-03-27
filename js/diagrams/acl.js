/**
 * ACL Processing Flowchart — paste a sample ACL + source IP to animate which rule matches.
 */

const SAMPLE_ACLS = [
  {
    name: 'Standard ACL 10',
    entries: [
      { seq: 10, action: 'permit', src: '192.168.1.0/24', dst: null },
      { seq: 20, action: 'permit', src: '10.0.0.1/32',    dst: null },
      { seq: 30, action: 'deny',   src: 'any',            dst: null },
    ],
    type: 'standard',
  },
  {
    name: 'Extended ACL 100',
    entries: [
      { seq: 10, action: 'permit', src: '192.168.1.0/24', dst: '0.0.0.0/0',    proto: 'TCP', dport: '80' },
      { seq: 20, action: 'permit', src: '192.168.1.0/24', dst: '0.0.0.0/0',    proto: 'TCP', dport: '443' },
      { seq: 30, action: 'deny',   src: '10.0.0.0/8',     dst: '172.16.0.0/12', proto: 'any', dport: null },
      { seq: 40, action: 'permit', src: 'any',            dst: 'any',           proto: 'any', dport: null },
    ],
    type: 'extended',
  },
];

function ipInNetwork(ip, network) {
  if (network === 'any') return true;
  if (!network.includes('/')) return ip === network;
  const [netIp, bits] = network.split('/');
  const prefixLen = parseInt(bits);
  const mask = ~((1 << (32 - prefixLen)) - 1) >>> 0;
  const ipInt  = ipToInt(ip);
  const netInt = ipToInt(netIp);
  return (ipInt & mask) === (netInt & mask);
}

function ipToInt(ip) {
  return ip.split('.').reduce((acc, o) => (acc << 8) | parseInt(o), 0) >>> 0;
}

function matchEntry(entry, testIp) {
  return ipInNetwork(testIp, entry.src);
}

export function render(containerEl) {
  let aclIdx = 0;
  let testIp = '192.168.1.50';
  let animStep = -1; // -1 = not running, 0+ = current entry being evaluated

  function runAnimation() {
    animStep = 0;
    step();
  }

  function step() {
    const acl = SAMPLE_ACLS[aclIdx];
    if (animStep >= acl.entries.length) {
      // Implicit deny
      animStep = acl.entries.length;
      draw();
      return;
    }
    draw();
    const entry = acl.entries[animStep];
    const matched = matchEntry(entry, testIp);
    if (matched) {
      // Stop — this entry matches
    } else {
      // Auto-advance to next after delay
      setTimeout(() => { animStep++; step(); }, 700);
    }
  }

  function draw() {
    const acl = SAMPLE_ACLS[aclIdx];
    const entries = acl.entries;

    // Determine match result
    let matchIdx = -1;
    let matchAction = null;
    for (let i = 0; i < entries.length; i++) {
      if (matchEntry(entries[i], testIp)) {
        matchIdx = i;
        matchAction = entries[i].action;
        break;
      }
    }
    // If animStep is at implicit deny, use that
    const showImplicit = animStep === entries.length;

    containerEl.innerHTML = `
      <div style="font-family:'JetBrains Mono',monospace;font-size:0.78rem;color:#c8ffc8;">

        <p style="color:#6a9a6a;font-size:0.72rem;margin-bottom:14px;">
          ACLs process entries top-down. The first match wins. An implicit <span style="color:#f87171;">deny any</span> at the bottom catches everything else.
        </p>

        <!-- ACL selector + test IP -->
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;align-items:center;">
          ${SAMPLE_ACLS.map((a, i) => `
            <button class="acl-sel" data-idx="${i}" style="
              padding:5px 12px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.7rem;
              background:${aclIdx===i?'rgba(0,255,65,0.15)':'transparent'};
              border:1px solid ${aclIdx===i?'rgba(0,255,65,0.4)':'rgba(0,255,65,0.12)'};
              color:${aclIdx===i?'#00ff41':'#6a9a6a'};
            ">${a.name}</button>`).join('')}
          <div style="display:flex;align-items:center;gap:6px;margin-left:auto;">
            <span style="color:#6b7280;font-size:0.7rem;">Test IP:</span>
            <input id="acl-ip" type="text" value="${testIp}" style="
              width:140px;padding:4px 8px;background:#0d0d0d;
              border:1px solid rgba(0,255,65,0.25);border-radius:3px;
              color:#00ff41;font-family:inherit;font-size:0.72rem;outline:none;
            ">
            <button id="acl-run" style="
              padding:5px 12px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.7rem;
              background:rgba(0,255,65,0.15);border:1px solid rgba(0,255,65,0.4);color:#00ff41;
            ">▶ Trace</button>
          </div>
        </div>

        <!-- Flowchart -->
        <div style="background:#0a0a0a;border:1px solid rgba(0,255,65,0.1);border-radius:6px;padding:14px;margin-bottom:12px;">

          <!-- Packet arrives -->
          <div style="text-align:center;margin-bottom:10px;">
            <div style="display:inline-block;padding:6px 20px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);border-radius:20px;color:#a5b4fc;font-size:0.72rem;">
              Packet arrives — Src: ${testIp}
            </div>
          </div>

          <!-- ACE entries -->
          ${entries.map((entry, i) => {
            const isActive = animStep === i;
            const isPassed = animStep > i && animStep !== -1;
            const isMatch  = isActive && matchEntry(entry, testIp);
            const noMatch  = (isActive && !matchEntry(entry, testIp)) || isPassed;
            const notStarted = animStep === -1;

            const rowColor = isMatch ? (entry.action === 'permit' ? '#4ade80' : '#f87171')
                          : isPassed ? '#374151'
                          : isActive ? '#fbbf24'
                          : '#4b5563';

            return `
              <div style="text-align:center;color:#374151;font-size:0.8rem;">↓</div>
              <div style="
                display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:4px;margin-bottom:2px;
                background:${isMatch ? (entry.action==='permit'?'rgba(74,222,128,0.1)':'rgba(248,113,113,0.1)') : isActive?'rgba(251,191,36,0.08)' : isPassed?'rgba(255,255,255,0.01)':'rgba(255,255,255,0.02)'};
                border:1px solid ${isMatch ? (entry.action==='permit'?'#4ade8044':'#f8717144') : isActive?'rgba(251,191,36,0.3)':'rgba(255,255,255,0.05)'};
                transition:all 0.2s;
              ">
                <span style="color:#374151;font-size:0.65rem;min-width:28px;">seq ${entry.seq}</span>
                <span style="
                  padding:2px 8px;border-radius:3px;font-size:0.65rem;font-weight:700;
                  background:${entry.action==='permit'?'rgba(74,222,128,0.15)':'rgba(248,113,113,0.15)'};
                  color:${entry.action==='permit'?'#4ade80':'#f87171'};
                ">${entry.action.toUpperCase()}</span>
                <span style="color:#9ca3af;font-size:0.7rem;">${entry.src}</span>
                ${entry.proto ? `<span style="color:#6b7280;font-size:0.65rem;">${entry.proto}${entry.dport?':'+entry.dport:''}</span>` : ''}
                <span style="margin-left:auto;font-size:0.7rem;font-weight:700;color:${rowColor};">
                  ${isMatch ? (entry.action==='permit' ? '✓ PERMIT' : '✗ DENY') : isPassed ? 'no match →' : isActive ? '▶ checking…' : ''}
                </span>
              </div>`;
          }).join('')}

          <!-- Implicit deny -->
          <div style="text-align:center;color:#374151;font-size:0.8rem;">↓</div>
          <div style="
            display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:4px;
            background:${showImplicit?'rgba(248,113,113,0.1)':'rgba(255,255,255,0.02)'};
            border:1px solid ${showImplicit?'rgba(248,113,113,0.4)':'rgba(255,255,255,0.05)'};
            font-style:italic;
          ">
            <span style="color:#374151;font-size:0.65rem;min-width:28px;"></span>
            <span style="padding:2px 8px;border-radius:3px;font-size:0.65rem;font-weight:700;background:rgba(248,113,113,0.15);color:#f87171;">DENY</span>
            <span style="color:#4b5563;font-size:0.7rem;">any (implicit — not shown in config)</span>
            ${showImplicit ? `<span style="margin-left:auto;font-size:0.7rem;font-weight:700;color:#f87171;">✗ DENY</span>` : ''}
          </div>
        </div>

        <!-- Result banner -->
        ${animStep >= 0 ? `
        <div style="
          padding:10px 16px;border-radius:4px;text-align:center;font-weight:700;
          background:${(matchIdx>=0&&SAMPLE_ACLS[aclIdx].entries[matchIdx].action==='permit')||showImplicit===false&&matchIdx>=0&&matchAction==='permit'?'rgba(74,222,128,0.12)':'rgba(248,113,113,0.12)'};
          border:1px solid ${matchIdx>=0&&matchAction==='permit'&&!showImplicit?'rgba(74,222,128,0.4)':'rgba(248,113,113,0.4)'};
          color:${matchIdx>=0&&matchAction==='permit'&&!showImplicit?'#4ade80':'#f87171'};
        ">
          ${showImplicit ? `✗ DENIED — no ACE matched; implicit deny any` :
            animStep <= matchIdx ? '▶ Tracing…' :
            matchAction==='permit' ? `✓ PERMITTED by seq ${SAMPLE_ACLS[aclIdx].entries[matchIdx].seq}` :
            `✗ DENIED by seq ${SAMPLE_ACLS[aclIdx].entries[matchIdx].seq}`}
        </div>` : ''}

        <!-- Exam tips -->
        <div style="margin-top:12px;padding:10px;background:rgba(251,191,36,0.04);border-left:2px solid #fbbf24;font-size:0.68rem;color:#fcd34d;line-height:1.7;">
          💡 <strong>Key rules:</strong> (1) First match wins — order matters. (2) Implicit deny any at end — always. (3) Standard ACLs match source IP only; Extended match src+dst+proto+port. (4) Place standard ACLs close to destination, extended close to source.
        </div>
      </div>`;

    containerEl.querySelectorAll('.acl-sel').forEach(btn => {
      btn.addEventListener('click', () => { aclIdx = parseInt(btn.dataset.idx); animStep = -1; draw(); });
    });
    containerEl.querySelector('#acl-run')?.addEventListener('click', () => {
      testIp = (containerEl.querySelector('#acl-ip')?.value || testIp).trim();
      animStep = -1;
      runAnimation();
    });
    containerEl.querySelector('#acl-ip')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') containerEl.querySelector('#acl-run')?.click();
    });
  }

  draw();
}
