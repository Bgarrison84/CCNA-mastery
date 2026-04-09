/**
 * arp.js — ARP Resolution Visualizer
 *
 * Three modes:
 *   Resolution — Who-has / Is-at exchange
 *   Gratuitous — GARP announcement (IP conflict detection / failover)
 *   Cache      — Live ARP cache table with aging
 *
 * Exported API: render(containerEl)
 */

export function render(containerEl) {
  let mode = 'resolution';

  const RESOLUTION_STEPS = [
    {
      dir: 'right', srcLabel: 'PC1 (sender)', dstLabel: 'All devices',
      srcMac: 'AA:BB:CC:00:00:01', srcIp: '192.168.1.10',
      dstMac: 'FF:FF:FF:FF:FF:FF', dstIp: '192.168.1.20',
      type: 'broadcast', msgLabel: 'ARP REQUEST',
      msg: 'Who has 192.168.1.20? Tell 192.168.1.10',
      title: 'Step 1 — ARP Request (broadcast)',
      detail: 'PC1 needs to send a frame to 192.168.1.20 but has no MAC for it. It broadcasts an ' +
              'ARP Request on the local segment. Every device receives it — switches flood it out all ports. ' +
              'The target IP (192.168.1.20) is in the payload; all other hosts ignore the request.',
      cacheEntry: null,
    },
    {
      dir: 'left', srcLabel: 'PC2 (target)', dstLabel: 'PC1 only',
      srcMac: 'DD:EE:FF:00:00:02', srcIp: '192.168.1.20',
      dstMac: 'AA:BB:CC:00:00:01', dstIp: '192.168.1.10',
      type: 'unicast', msgLabel: 'ARP REPLY',
      msg: '192.168.1.20 is at DD:EE:FF:00:00:02',
      title: 'Step 2 — ARP Reply (unicast)',
      detail: 'PC2 recognises its own IP in the ARP Request. It replies directly to PC1\'s MAC with ' +
              '"is-at" — its own MAC address. This reply is unicast, not broadcast. PC1 receives it and ' +
              'populates its ARP cache. Communication can now proceed at Layer 2.',
      cacheEntry: { ip: '192.168.1.20', mac: 'DD:EE:FF:00:00:02', age: '0s', iface: 'eth0' },
    },
    {
      dir: 'both', srcLabel: 'All devices', dstLabel: '—',
      srcMac: 'AA:BB:CC:00:00:01', srcIp: '192.168.1.10',
      dstMac: 'FF:FF:FF:FF:FF:FF', dstIp: '192.168.1.10',
      type: 'broadcast', msgLabel: 'SIDE EFFECT: Sender also cached',
      msg: 'Devices that received the ARP Request learn PC1\'s MAC too',
      title: 'Step 3 — Passive Cache Update',
      detail: 'Every device that received the ARP Request also learned PC1\'s IP-to-MAC mapping from the ' +
              'sender fields in the request. The switch learned the source MAC → port mapping as well. ' +
              'ARP cache entries typically expire after 4 hours (Cisco default: 4h on IOS, 2h on most hosts).',
      cacheEntry: { ip: '192.168.1.10', mac: 'AA:BB:CC:00:00:01', age: '0s', iface: 'eth0' },
    },
  ];

  const GARP_STEPS = [
    {
      title: 'What is Gratuitous ARP?',
      detail: 'Gratuitous ARP (GARP) is an ARP Request where sender IP = target IP. The device announces ' +
              'its own mapping without being asked. Common uses: IP conflict detection on startup, IP change ' +
              'announcements, and virtual IP failover (HSRP/VRRP).',
      msg: 'Who has 192.168.1.1? Tell 192.168.1.1',
      type: 'broadcast', msgLabel: 'GARP REQUEST',
      srcLabel: 'Router/HSRP Active', srcIp: '192.168.1.1',
    },
    {
      title: 'GARP — IP Conflict Detection',
      detail: 'On startup, a device sends GARP for its configured IP. If another device already owns that IP, ' +
              'it will respond with its own MAC. The original device detects the conflict and may log an error ' +
              'or decline to use the address.',
      msg: 'Conflict: 192.168.1.1 is at CC:DD:EE:FF:00:99',
      type: 'unicast', msgLabel: 'CONFLICT REPLY (unexpected)',
      srcLabel: 'Conflicting device', srcIp: '192.168.1.1',
    },
    {
      title: 'GARP — HSRP / VRRP Failover',
      detail: 'When an HSRP standby router takes over as active, it sends GARP for the virtual IP ' +
              '(192.168.1.1) using its own MAC. All hosts on the segment update their ARP caches immediately, ' +
              'redirecting traffic to the new active router. No host reconfiguration needed.',
      msg: 'New active: 192.168.1.1 is at BB:CC:DD:EE:00:02',
      type: 'broadcast', msgLabel: 'FAILOVER GARP',
      srcLabel: 'New HSRP Active', srcIp: '192.168.1.1',
    },
  ];

  const CACHE_DATA = [
    { ip: '192.168.1.1',  mac: '00:1A:2B:3C:4D:01', age: '3m', iface: 'eth0', state: 'REACHABLE' },
    { ip: '192.168.1.20', mac: 'DD:EE:FF:00:00:02', age: '45s', iface: 'eth0', state: 'REACHABLE' },
    { ip: '192.168.1.30', mac: 'AA:BB:11:22:33:44', age: '4h', iface: 'eth0', state: 'STALE' },
    { ip: '192.168.1.50', mac: '?', age: '—', iface: 'eth0', state: 'INCOMPLETE' },
  ];

  let resStep = 0, garpStep = 0;

  function draw() {
    containerEl.innerHTML = `
      <div style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:#c8ffc8;background:#0a0a0f;border:1px solid #1f2937;border-radius:8px;padding:18px;">

        <!-- Mode tabs -->
        <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;">
          ${[['resolution','🔄 ARP Resolution'],['garp','📢 Gratuitous ARP'],['cache','📋 ARP Cache']].map(([m,label]) => `
            <button class="arp-mode" data-mode="${m}" style="
              padding:5px 14px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.7rem;
              background:${mode===m?'rgba(34,197,94,0.12)':'transparent'};
              border:1px solid ${mode===m?'rgba(34,197,94,0.4)':'#374151'};
              color:${mode===m?'#22c55e':'#6b7280'};">${label}</button>`).join('')}
        </div>

        <div id="arp-body"></div>
      </div>`;

    containerEl.querySelectorAll('.arp-mode').forEach(btn =>
      btn.addEventListener('click', () => { mode = btn.dataset.mode; draw(); }));

    const body = containerEl.querySelector('#arp-body');

    if (mode === 'resolution')  drawResolution(body);
    else if (mode === 'garp')   drawGarp(body);
    else                         drawCache(body);
  }

  function drawResolution(body) {
    const s = RESOLUTION_STEPS[resStep];
    const isRight = s.dir === 'right' || s.dir === 'both';
    const col = s.type === 'broadcast'
      ? { line: '#f59e0b', text: '#fcd34d', bg: 'rgba(245,158,11,0.1)', border: '#f59e0b' }
      : { line: '#22c55e', text: '#86efac', bg: 'rgba(34,197,94,0.1)', border: '#22c55e' };

    body.innerHTML = `
      <!-- Progress -->
      <div style="display:flex;gap:3px;margin-bottom:12px;">
        ${RESOLUTION_STEPS.map((_, i) => `<div style="flex:1;height:4px;border-radius:2px;background:${
          i < resStep ? '#22c55e' : i === resStep ? 'rgba(34,197,94,0.5)' : '#1f2937'};"></div>`).join('')}
      </div>

      <div style="font-weight:700;color:#22c55e;font-size:0.72rem;margin-bottom:10px;">${s.title}</div>

      <!-- Packet flow -->
      <div style="background:#060a0f;border:1px solid #1a2733;border-radius:6px;padding:14px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;font-size:0.7rem;font-weight:700;">
          <span style="color:#60a5fa;">${s.srcLabel}</span>
          <span style="color:#6ee7b7;">${s.dstLabel}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <div style="width:55px;font-size:0.58rem;color:#6b7280;text-align:center;">${s.srcMac}<br/>${s.srcIp}</div>
          <div style="flex:1;position:relative;height:2px;background:linear-gradient(${isRight?'to right':'to left'},${col.line},rgba(0,0,0,0));">
            <div style="position:absolute;${isRight?'right:-5px':'left:-5px'};top:-5px;color:${col.line};font-size:0.7rem;">${isRight?'▶':'◀'}</div>
          </div>
          <div style="width:55px;font-size:0.58rem;color:#6b7280;text-align:center;">${s.dstMac}<br/>${s.dstIp}</div>
        </div>
        <div style="text-align:center;">
          <span style="background:${col.bg};border:1px solid ${col.border};border-radius:4px;padding:3px 12px;color:${col.text};font-weight:700;font-size:0.68rem;">${s.msgLabel}</span>
          <div style="margin-top:6px;font-size:0.65rem;color:#9ca3af;font-style:italic;">"${s.msg}"</div>
        </div>
      </div>

      <div style="font-size:0.7rem;color:#8b949e;line-height:1.6;margin-bottom:12px;background:#0f1117;border-left:3px solid ${col.line};padding:10px 12px;border-radius:0 4px 4px 0;">${s.detail}</div>

      ${s.cacheEntry ? `
      <div style="background:#0d1117;border:1px solid #1e3a2f;border-radius:4px;padding:10px;margin-bottom:12px;font-size:0.65rem;">
        <div style="color:#22c55e;font-weight:700;margin-bottom:6px;">ARP Cache updated:</div>
        <div style="display:flex;gap:16px;color:#9ca3af;">
          <span>IP: <span style="color:#86efac;">${s.cacheEntry.ip}</span></span>
          <span>MAC: <span style="color:#86efac;">${s.cacheEntry.mac}</span></span>
          <span>via ${s.cacheEntry.iface}</span>
        </div>
      </div>` : ''}

      <div style="display:flex;justify-content:space-between;align-items:center;">
        <button id="arp-prev" style="padding:5px 14px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.7rem;background:transparent;border:1px solid rgba(34,197,94,0.2);color:${resStep>0?'#22c55e':'#374151'};" ${resStep===0?'disabled':''}>← Prev</button>
        <span style="font-size:0.65rem;color:#6b7280;">${resStep+1} / ${RESOLUTION_STEPS.length}</span>
        <button id="arp-next" style="padding:5px 14px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.7rem;background:transparent;border:1px solid rgba(34,197,94,0.2);color:${resStep<RESOLUTION_STEPS.length-1?'#22c55e':'#374151'};" ${resStep===RESOLUTION_STEPS.length-1?'disabled':''}>Next →</button>
      </div>`;

    body.querySelector('#arp-prev')?.addEventListener('click', () => { if (resStep > 0) { resStep--; drawResolution(body); } });
    body.querySelector('#arp-next')?.addEventListener('click', () => { if (resStep < RESOLUTION_STEPS.length - 1) { resStep++; drawResolution(body); } });
  }

  function drawGarp(body) {
    const s = GARP_STEPS[garpStep];
    const col = s.type === 'broadcast'
      ? { line: '#f59e0b', text: '#fcd34d', bg: 'rgba(245,158,11,0.1)', border: '#f59e0b' }
      : { line: '#ef4444', text: '#fca5a5', bg: 'rgba(239,68,68,0.1)', border: '#ef4444' };

    body.innerHTML = `
      <div style="display:flex;gap:3px;margin-bottom:12px;">
        ${GARP_STEPS.map((_, i) => `<div style="flex:1;height:4px;border-radius:2px;background:${
          i < garpStep ? '#22c55e' : i === garpStep ? 'rgba(34,197,94,0.5)' : '#1f2937'};"></div>`).join('')}
      </div>

      <div style="font-weight:700;color:#fcd34d;font-size:0.72rem;margin-bottom:10px;">${s.title}</div>

      <div style="background:#060a0f;border:1px solid #1a2733;border-radius:6px;padding:14px;margin-bottom:12px;text-align:center;">
        <div style="font-size:0.65rem;color:#6b7280;margin-bottom:8px;">${s.srcLabel} (${s.srcIp}) → 255.255.255.255</div>
        <span style="background:${col.bg};border:1px solid ${col.border};border-radius:4px;padding:4px 14px;color:${col.text};font-weight:700;font-size:0.68rem;">${s.msgLabel}</span>
        <div style="margin-top:8px;font-size:0.65rem;color:#9ca3af;font-style:italic;">"${s.msg}"</div>
      </div>

      <div style="font-size:0.7rem;color:#8b949e;line-height:1.6;margin-bottom:12px;background:#0f1117;border-left:3px solid ${col.line};padding:10px 12px;border-radius:0 4px 4px 0;">${s.detail}</div>

      <div style="display:flex;justify-content:space-between;align-items:center;">
        <button id="garp-prev" style="padding:5px 14px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.7rem;background:transparent;border:1px solid rgba(34,197,94,0.2);color:${garpStep>0?'#22c55e':'#374151'};" ${garpStep===0?'disabled':''}>← Prev</button>
        <span style="font-size:0.65rem;color:#6b7280;">${garpStep+1} / ${GARP_STEPS.length}</span>
        <button id="garp-next" style="padding:5px 14px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.7rem;background:transparent;border:1px solid rgba(34,197,94,0.2);color:${garpStep<GARP_STEPS.length-1?'#22c55e':'#374151'};" ${garpStep===GARP_STEPS.length-1?'disabled':''}>Next →</button>
      </div>`;

    body.querySelector('#garp-prev')?.addEventListener('click', () => { if (garpStep > 0) { garpStep--; drawGarp(body); } });
    body.querySelector('#garp-next')?.addEventListener('click', () => { if (garpStep < GARP_STEPS.length - 1) { garpStep++; drawGarp(body); } });
  }

  function drawCache(body) {
    body.innerHTML = `
      <div style="font-weight:700;color:#22c55e;font-size:0.72rem;margin-bottom:10px;">ARP Cache — 192.168.1.10</div>
      <div style="background:#060a0f;border:1px solid #1a2733;border-radius:6px;overflow:hidden;margin-bottom:12px;">
        <div style="display:grid;grid-template-columns:1fr 1.6fr 0.6fr 0.6fr 0.8fr;font-size:0.62rem;font-weight:700;color:#6b7280;padding:8px 12px;border-bottom:1px solid #1f2937;text-transform:uppercase;letter-spacing:0.05em;">
          <span>IP Address</span><span>MAC Address</span><span>Age</span><span>Iface</span><span>State</span>
        </div>
        ${CACHE_DATA.map(row => `
          <div style="display:grid;grid-template-columns:1fr 1.6fr 0.6fr 0.6fr 0.8fr;font-size:0.65rem;padding:7px 12px;border-bottom:1px solid #111;color:${
            row.state === 'REACHABLE' ? '#9ca3af' : row.state === 'STALE' ? '#6b7280' : '#f87171'};">
            <span style="color:#60a5fa;">${row.ip}</span>
            <span style="color:${row.mac === '?' ? '#6b7280' : '#22c55e'};">${row.mac}</span>
            <span>${row.age}</span>
            <span>${row.iface}</span>
            <span style="color:${row.state==='REACHABLE'?'#22c55e':row.state==='STALE'?'#f59e0b':'#ef4444'};">${row.state}</span>
          </div>`).join('')}
      </div>
      <div style="font-size:0.68rem;color:#6b7280;line-height:1.7;background:#0f1117;border-left:3px solid #374151;padding:10px 12px;border-radius:0 4px 4px 0;">
        <strong style="color:#9ca3af;">States:</strong><br/>
        <span style="color:#22c55e;">REACHABLE</span> — confirmed reachable within the last reachability timeout (~30s)<br/>
        <span style="color:#f59e0b;">STALE</span> — entry is old; next packet will trigger a new ARP resolution<br/>
        <span style="color:#ef4444;">INCOMPLETE</span> — ARP request sent, reply not yet received<br/><br/>
        <span style="color:#9ca3af;">IOS command:</span> <code style="color:#86efac;">show arp</code> or <code style="color:#86efac;">show ip arp</code>
      </div>`;
  }

  draw();
}
