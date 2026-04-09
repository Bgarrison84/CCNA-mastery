/**
 * traceroute.js — Visual Traceroute Packet Animation
 *
 * Renders an interactive topology diagram (PC1 → R1 → R2 → R3 → Server)
 * where a glowing packet travels hop-by-hop. Each router pause shows the
 * routing-table lookup and forwarding decision.
 *
 * Modes:
 *  • Normal  — packet reaches Server, "Connection Established" banner
 *  • Sabotage — R2's route to 172.16.4.0/24 is removed; packet burns up
 *
 * Click any router node to inspect its routing table.
 */

// ── Topology ──────────────────────────────────────────────────────────────────

const W = 780, H = 180, CY = 88; // SVG canvas dimensions, node centre-Y

const NODES = [
  { id: 'pc1',    label: 'PC1',    sub: '192.168.1.10', type: 'host',   x: 60  },
  { id: 'r1',     label: 'R1',     sub: '192.168.1.1',  type: 'router', x: 215 },
  { id: 'r2',     label: 'R2',     sub: '10.0.12.2',    type: 'router', x: 390 },
  { id: 'r3',     label: 'R3',     sub: '10.0.23.2',    type: 'router', x: 565 },
  { id: 'server', label: 'Server', sub: '172.16.4.10',  type: 'host',   x: 720 },
];

const LINKS = [
  { from: 'pc1', to: 'r1',     label: '192.168.1.0/24' },
  { from: 'r1',  to: 'r2',     label: '10.0.12.0/30'   },
  { from: 'r2',  to: 'r3',     label: '10.0.23.0/30'   },
  { from: 'r3',  to: 'server', label: '172.16.4.0/24'  },
];

const ROUTES = {
  r1: [
    { net: '192.168.1.0/24', proto: 'C', iface: 'Gi0/0', nh: 'connected'  },
    { net: '10.0.12.0/30',   proto: 'C', iface: 'Gi0/1', nh: 'connected'  },
    { net: '10.0.23.0/30',   proto: 'S', iface: 'Gi0/1', nh: '10.0.12.2'  },
    { net: '172.16.4.0/24',  proto: 'S', iface: 'Gi0/1', nh: '10.0.12.2'  },
  ],
  r2: [
    { net: '10.0.12.0/30',   proto: 'C', iface: 'Gi0/0', nh: 'connected'  },
    { net: '10.0.23.0/30',   proto: 'C', iface: 'Gi0/1', nh: 'connected'  },
    { net: '192.168.1.0/24', proto: 'S', iface: 'Gi0/0', nh: '10.0.12.1'  },
    { net: '172.16.4.0/24',  proto: 'S', iface: 'Gi0/1', nh: '10.0.23.2', sabotaged: true },
  ],
  r3: [
    { net: '10.0.23.0/30',   proto: 'C', iface: 'Gi0/0', nh: 'connected'  },
    { net: '172.16.4.0/24',  proto: 'C', iface: 'Gi0/1', nh: 'connected'  },
    { net: '192.168.1.0/24', proto: 'S', iface: 'Gi0/0', nh: '10.0.23.1'  },
    { net: '10.0.12.0/30',   proto: 'S', iface: 'Gi0/0', nh: '10.0.23.1'  },
  ],
};

// ── Build hop sequence based on sabotage state ────────────────────────────────

function buildHops(sabotaged) {
  const hops = [
    {
      node: 'pc1',
      info: 'PC1 wants to reach 172.16.4.10. Destination is not on local subnet 192.168.1.0/24.',
      detail: 'Sending to default gateway 192.168.1.1 (R1 Gi0/0).',
    },
    {
      node: 'r1',
      router: 'r1',
      matchNet: '172.16.4.0/24',
      info: 'R1 receives packet. Looks up destination 172.16.4.10 in routing table.',
      detail: '172.16.4.0/24 → static route, next-hop 10.0.12.2, exit Gi0/1. Forwarding.',
    },
    sabotaged
      ? {
          node: 'r2',
          router: 'r2',
          fail: true,
          info: 'R2 receives packet. Looks up destination 172.16.4.10 in routing table.',
          detail: '172.16.4.0/24 — no matching route found! Sending ICMP Destination Unreachable to PC1.',
        }
      : {
          node: 'r2',
          router: 'r2',
          matchNet: '172.16.4.0/24',
          info: 'R2 receives packet. Looks up destination 172.16.4.10 in routing table.',
          detail: '172.16.4.0/24 → static route, next-hop 10.0.23.2, exit Gi0/1. Forwarding.',
        },
    ...(!sabotaged ? [
      {
        node: 'r3',
        router: 'r3',
        matchNet: '172.16.4.0/24',
        info: 'R3 receives packet. Looks up destination 172.16.4.10 in routing table.',
        detail: '172.16.4.0/24 is directly connected out Gi0/1. Forwarding to Server.',
      },
      {
        node: 'server',
        success: true,
        info: '✓ Packet delivered to Server (172.16.4.10).',
        detail: 'Connection established! Round-trip path: PC1 → R1 → R2 → R3 → Server.',
      },
    ] : []),
  ];
  return hops;
}

// ── Routing table HTML helper ─────────────────────────────────────────────────

function routeTableHtml(routerId, sabotaged) {
  const rows = ROUTES[routerId].map(r => {
    const missing = sabotaged && r.sabotaged;
    const strike  = missing ? 'style="text-decoration:line-through;opacity:0.4"' : '';
    const flag    = missing ? ' <span style="color:#f87171;font-size:0.6rem">REMOVED</span>' : '';
    return `<tr ${strike}>
      <td style="padding:1px 8px 1px 0;color:#60a5fa">${r.proto}</td>
      <td style="padding:1px 8px 1px 0;color:#c9d1d9">${r.net}</td>
      <td style="padding:1px 8px 1px 0;color:#8b949e">${r.nh === 'connected' ? 'directly connected' : 'via ' + r.nh}</td>
      <td style="padding:1px 0;color:#6b7280">${r.iface}${flag}</td>
    </tr>`;
  }).join('');
  return `<table style="border-collapse:collapse;font-size:0.68rem;font-family:monospace;width:100%">${rows}</table>`;
}

// ── Main render ───────────────────────────────────────────────────────────────

export function render(containerEl) {
  let sabotaged  = false;
  let animating  = false;
  let stepTimer  = null;
  let activeNode = null;

  // ── DOM skeleton ──────────────────────────────────────────────────────────
  containerEl.innerHTML = `
    <div style="font-family:'JetBrains Mono',monospace;background:#0d1117;border:1px solid #1f2937;border-radius:10px;overflow:hidden;user-select:none">

      <!-- Header -->
      <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;background:#161b22;border-bottom:1px solid #1f2937">
        <span style="color:#30d158;font-weight:700;font-size:0.8rem">◈ VISUAL TRACEROUTE SIMULATOR</span>
        <span style="color:#6b7280;font-size:0.72rem;margin-left:auto">Click a router to inspect its routing table</span>
      </div>

      <!-- SVG topology -->
      <div style="position:relative;padding:4px 0 0">
        <svg id="tr-svg" viewBox="0 0 ${W} ${H}" style="width:100%;display:block"></svg>
      </div>

      <!-- Link segment labels -->
      <div id="tr-seg-labels" style="display:flex;justify-content:space-around;padding:0 6px;margin-top:-4px">
        ${LINKS.map(l => `<span style="color:#374151;font-size:0.58rem;text-align:center;flex:1">${l.label}</span>`).join('')}
      </div>

      <!-- Info panel -->
      <div id="tr-info" style="min-height:64px;padding:10px 16px;border-top:1px solid #1f2937;font-size:0.72rem">
        <div id="tr-info-title" style="color:#6b7280">Trace path: PC1 (192.168.1.10) → Server (172.16.4.10)</div>
        <div id="tr-info-detail" style="color:#4b5563;margin-top:3px">Press Start Trace to begin the animation.</div>
      </div>

      <!-- Route table inspector -->
      <div id="tr-routes" style="display:none;padding:8px 16px;border-top:1px solid #1f2937;background:#0a0f1a">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
          <span id="tr-routes-title" style="color:#60a5fa;font-size:0.7rem;font-weight:700"></span>
          <button id="tr-routes-close" style="background:transparent;border:none;color:#4b5563;cursor:pointer;font-size:0.75rem">✕</button>
        </div>
        <div id="tr-routes-body"></div>
      </div>

      <!-- Controls -->
      <div style="display:flex;gap:8px;padding:10px 16px;border-top:1px solid #1f2937;background:#0d1117;flex-wrap:wrap">
        <button id="tr-start" style="padding:6px 16px;background:#30d158;color:#000;border:none;border-radius:5px;cursor:pointer;font-family:monospace;font-size:0.72rem;font-weight:700">▶ Start Trace</button>
        <button id="tr-sabotage" style="padding:6px 14px;background:#1f2937;color:#f87171;border:1px solid #374151;border-radius:5px;cursor:pointer;font-family:monospace;font-size:0.72rem">⚡ Sabotage R2 Route</button>
        <button id="tr-reset" style="padding:6px 14px;background:#1f2937;color:#6b7280;border:1px solid #374151;border-radius:5px;cursor:pointer;font-family:monospace;font-size:0.72rem">↺ Reset</button>
        <span id="tr-sabotage-badge" style="display:none;align-items:center;color:#f87171;font-size:0.68rem;margin-left:4px">⚡ R2 route removed — expect failure</span>
      </div>
    </div>
  `;

  const svg        = containerEl.querySelector('#tr-svg');
  const infoTitle  = containerEl.querySelector('#tr-info-title');
  const infoDetail = containerEl.querySelector('#tr-info-detail');
  const routesEl   = containerEl.querySelector('#tr-routes');
  const routeTitle = containerEl.querySelector('#tr-routes-title');
  const routeBody  = containerEl.querySelector('#tr-routes-body');
  const btnStart   = containerEl.querySelector('#tr-start');
  const btnSabotage= containerEl.querySelector('#tr-sabotage');
  const btnReset   = containerEl.querySelector('#tr-reset');
  const sabBadge   = containerEl.querySelector('#tr-sabotage-badge');

  // ── Build SVG ──────────────────────────────────────────────────────────────

  function buildSvg() {
    const nodeById = Object.fromEntries(NODES.map(n => [n.id, n]));

    // Defs: glow filter + gradient
    const defs = `
      <defs>
        <filter id="tr-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <radialGradient id="tr-pkt-grad" cx="40%" cy="35%" r="60%">
          <stop offset="0%"   stop-color="#a8ffc4"/>
          <stop offset="100%" stop-color="#30d158"/>
        </radialGradient>
        <filter id="tr-burn" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="6" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>`;

    // Connection lines
    const lines = LINKS.map(l => {
      const fx = nodeById[l.from].x, tx = nodeById[l.to].x;
      return `<line x1="${fx}" y1="${CY}" x2="${tx}" y2="${CY}"
                stroke="#1d3a2a" stroke-width="3" stroke-linecap="round"/>
              <line id="tr-link-${l.from}-${l.to}" x1="${fx}" y1="${CY}" x2="${tx}" y2="${CY}"
                stroke="#30d158" stroke-width="2" stroke-dasharray="6 4" opacity="0.25"
                stroke-linecap="round"/>`;
    }).join('');

    // Nodes
    const nodes = NODES.map(n => {
      const isRouter = n.type === 'router';
      const r = isRouter ? 22 : 20;
      const color = isRouter ? '#1a3a5c' : '#1a2f1a';
      const stroke = isRouter ? '#3b82f6' : '#30d158';
      const shape  = isRouter
        ? `<rect x="${n.x - r}" y="${CY - r}" width="${r*2}" height="${r*2}"
                rx="5" fill="${color}" stroke="${stroke}" stroke-width="1.5"
                style="cursor:pointer"/>`
        : `<circle cx="${n.x}" cy="${CY}" r="${r}"
                fill="${color}" stroke="${stroke}" stroke-width="1.5"/>`;

      const label = `<text x="${n.x}" y="${CY + 6}" text-anchor="middle"
                           fill="${isRouter ? '#93c5fd' : '#86efac'}"
                           font-size="9" font-family="monospace" font-weight="700"
                           style="pointer-events:none">${n.label}</text>`;

      const sub   = `<text x="${n.x}" y="${CY + 36}" text-anchor="middle"
                           fill="#374151" font-size="8" font-family="monospace"
                           style="pointer-events:none">${n.sub}</text>`;

      const clickTarget = isRouter
        ? `<rect x="${n.x - r - 4}" y="${CY - r - 4}" width="${(r+4)*2}" height="${(r+4)*2}"
                 fill="transparent" data-router="${n.id}" style="cursor:pointer"/>`
        : '';

      return `<g id="tr-node-${n.id}">${shape}${label}${sub}${clickTarget}</g>`;
    }).join('');

    // Packet (starts hidden at pc1)
    const packet = `
      <g id="tr-packet" style="transition:transform 0.75s cubic-bezier(0.4,0,0.2,1);transform:translateX(0px)"
         opacity="0" filter="url(#tr-glow)">
        <circle cx="${NODES[0].x}" cy="${CY}" r="9" fill="url(#tr-pkt-grad)"/>
        <circle cx="${NODES[0].x}" cy="${CY}" r="13" fill="none" stroke="#30d158" stroke-width="1.2" opacity="0.5"/>
      </g>`;

    // Explosion group (hidden)
    const explosion = `
      <g id="tr-explosion" opacity="0">
        ${[0,60,120,180,240,300].map((angle, i) => {
          const rad = angle * Math.PI / 180;
          const ex = Math.round(Math.cos(rad) * 18);
          const ey = Math.round(Math.sin(rad) * 18);
          return `<circle id="tr-spark-${i}" cx="${ex}" cy="${ey}" r="4" fill="#f87171" opacity="0"/>`;
        }).join('')}
        <circle cx="0" cy="0" r="10" fill="#ef4444" opacity="0" id="tr-blast"/>
      </g>`;

    svg.innerHTML = defs + lines + nodes + packet + explosion;
  }

  buildSvg();

  // ── Packet animation helpers ───────────────────────────────────────────────

  const pktEl = () => containerEl.querySelector('#tr-packet');
  const expEl = () => containerEl.querySelector('#tr-explosion');

  function moveTo(nodeId) {
    const node = NODES.find(n => n.id === nodeId);
    const pkg  = pktEl();
    if (!pkg || !node) return;
    pkg.style.transform = `translateX(${node.x - NODES[0].x}px)`;
  }

  function showPacket(show) {
    const pkg = pktEl();
    if (pkg) pkg.setAttribute('opacity', show ? '1' : '0');
  }

  function highlightLink(fromId, toId, on) {
    const el = containerEl.querySelector(`#tr-link-${fromId}-${toId}`);
    if (!el) return;
    el.setAttribute('opacity', on ? '1' : '0.25');
    el.setAttribute('stroke', on ? '#30d158' : '#30d158');
    el.setAttribute('stroke-width', on ? '2.5' : '2');
  }

  function highlightNode(nodeId, state) {
    const node = NODES.find(n => n.id === nodeId);
    if (!node) return;
    const isRouter = node.type === 'router';
    const rect = containerEl.querySelector(
      isRouter ? `#tr-node-${nodeId} rect` : `#tr-node-${nodeId} circle`);
    if (!rect) return;
    const colors = {
      active:  isRouter ? '#2563eb' : '#15803d',
      success: '#15803d',
      fail:    '#dc2626',
      idle:    isRouter ? '#1a3a5c' : '#1a2f1a',
    };
    rect.setAttribute('fill', colors[state] || colors.idle);
  }

  function showInfo(title, detail, type = 'normal') {
    const colors = { normal: '#c9d1d9', success: '#30d158', fail: '#f87171', hop: '#60a5fa' };
    infoTitle.style.color  = colors[type] || colors.normal;
    infoTitle.textContent  = title;
    infoDetail.style.color = type === 'normal' ? '#6b7280' : colors[type];
    infoDetail.textContent = detail;
  }

  function explodeAt(nodeId) {
    const node = NODES.find(n => n.id === nodeId);
    const exp  = expEl();
    if (!exp || !node) return;

    // Position explosion group
    exp.setAttribute('transform', `translate(${node.x} ${CY})`);

    // Blast + sparks
    const blast = exp.querySelector('#tr-blast');
    blast.setAttribute('opacity', '1');
    blast.setAttribute('r', '10');

    let t = 0;
    const interval = setInterval(() => {
      t += 80;
      const scale = 1 + t / 160;
      const fade  = Math.max(0, 1 - t / 600);
      blast.setAttribute('opacity', String(fade));
      blast.setAttribute('r', String(10 * scale));

      exp.querySelectorAll('[id^=tr-spark]').forEach((sp, i) => {
        const rad    = (i * 60) * Math.PI / 180;
        const dist   = t / 18;
        const spFade = Math.max(0, 1 - t / 500);
        sp.setAttribute('cx', String(Math.round(Math.cos(rad) * dist)));
        sp.setAttribute('cy', String(Math.round(Math.sin(rad) * dist)));
        sp.setAttribute('opacity', String(spFade));
      });

      if (t > 700) {
        clearInterval(interval);
        exp.setAttribute('opacity', '0');
      } else {
        exp.setAttribute('opacity', '1');
      }
    }, 80);
  }

  function successFlash() {
    let flashes = 0;
    const iv = setInterval(() => {
      flashes++;
      highlightNode('server', flashes % 2 === 0 ? 'success' : 'idle');
      if (flashes >= 6) clearInterval(iv);
    }, 160);
  }

  // ── Animation runner ───────────────────────────────────────────────────────

  function runTrace() {
    if (animating) return;
    animating = true;
    btnStart.disabled  = true;
    btnStart.style.opacity = '0.5';
    routesEl.style.display = 'none';

    resetVisuals(false); // reset highlights but keep packet

    const hops = buildHops(sabotaged);
    let step = 0;

    showPacket(true);
    moveTo(hops[0].node);

    function nextStep() {
      if (step >= hops.length) {
        done();
        return;
      }
      const hop = hops[step];
      const prevHop = step > 0 ? hops[step - 1] : null;

      // Highlight link traversed
      if (prevHop) {
        highlightLink(prevHop.node, hop.node, true);
      }

      // Highlight current node
      highlightNode(hop.node, hop.fail ? 'fail' : hop.success ? 'success' : 'active');

      // Show info
      const type = hop.fail ? 'fail' : hop.success ? 'success' : 'hop';
      showInfo(
        `Hop ${step + 1}/${hops.length} — ${NODES.find(n => n.id === hop.node)?.label}`,
        hop.info,
        'hop'
      );

      // Move packet then show detail after arrival
      moveTo(hop.node);

      stepTimer = setTimeout(() => {
        infoDetail.textContent = hop.detail || '';
        infoDetail.style.color = hop.fail ? '#f87171' : hop.success ? '#30d158' : '#8b949e';

        if (hop.fail) {
          showPacket(false);
          explodeAt(hop.node);
          showInfo('✗ ICMP Destination Unreachable', hop.detail, 'fail');
          done(true);
          return;
        }

        if (hop.success) {
          successFlash();
          showInfo('✓ Connection Established', hop.detail, 'success');
          done(false);
          return;
        }

        step++;
        stepTimer = setTimeout(nextStep, 1200);
      }, 900);
    }

    nextStep();
  }

  function done(failed = false) {
    animating  = false;
    btnStart.disabled = false;
    btnStart.style.opacity = '1';
    btnStart.textContent = '▶ Retrace';
  }

  // ── Reset ──────────────────────────────────────────────────────────────────

  function resetVisuals(resetPacket = true) {
    clearTimeout(stepTimer);
    animating = false;

    if (resetPacket) {
      showPacket(false);
      moveTo('pc1');
      btnStart.textContent = '▶ Start Trace';
      btnStart.disabled = false;
      btnStart.style.opacity = '1';
      showInfo('Trace path: PC1 (192.168.1.10) → Server (172.16.4.10)',
               'Press Start Trace to begin the animation.');
    }

    NODES.forEach(n => highlightNode(n.id, 'idle'));
    LINKS.forEach(l => highlightLink(l.from, l.to, false));
    const exp = expEl();
    if (exp) exp.setAttribute('opacity', '0');
  }

  // ── Router click → show routing table ────────────────────────────────────

  svg.addEventListener('click', e => {
    const routerId = e.target.closest('[data-router]')?.dataset?.router;
    if (!routerId || !ROUTES[routerId]) return;

    const node = NODES.find(n => n.id === routerId);
    routeTitle.textContent = `${node?.label} — IP Routing Table`;
    routeBody.innerHTML    = routeTableHtml(routerId, sabotaged);
    routesEl.style.display = 'block';
    activeNode = routerId;
  });

  containerEl.querySelector('#tr-routes-close').addEventListener('click', () => {
    routesEl.style.display = 'none';
  });

  // ── Controls ──────────────────────────────────────────────────────────────

  btnStart.addEventListener('click', () => {
    resetVisuals(false);
    runTrace();
  });

  btnSabotage.addEventListener('click', () => {
    sabotaged = !sabotaged;
    btnSabotage.style.background = sabotaged ? '#450a0a' : '#1f2937';
    btnSabotage.style.borderColor = sabotaged ? '#dc2626' : '#374151';
    sabBadge.style.display = sabotaged ? 'inline-flex' : 'none';

    // Refresh open route table if it's R2
    if (activeNode === 'r2' && routesEl.style.display !== 'none') {
      routeBody.innerHTML = routeTableHtml('r2', sabotaged);
    }

    resetVisuals(true);
  });

  btnReset.addEventListener('click', () => resetVisuals(true));
}
