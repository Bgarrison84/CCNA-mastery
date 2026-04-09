/**
 * dhcp.js — DHCP DORA Flow Visualizer
 *
 * Modes:
 *   Normal — client & server on same subnet (4 broadcast/unicast steps)
 *   Relay  — client, helper-address router, remote server (ip helper-address)
 *
 * Exported API: render(containerEl)
 */

export function render(containerEl) {
  let mode = 'normal'; // 'normal' | 'relay'
  let step = 0;

  const NORMAL_STEPS = [
    {
      msg: 'DHCPDISCOVER', srcLabel: 'Client', dstLabel: 'Server',
      srcIp: '0.0.0.0', dstIp: '255.255.255.255', type: 'broadcast',
      flag: 'broadcast',
      title: 'Step 1 — DISCOVER',
      detail: 'Client has no IP. It broadcasts DHCPDISCOVER from 0.0.0.0 to 255.255.255.255. ' +
              'The frame targets MAC ff:ff:ff:ff:ff:ff — every device on the segment sees it. ' +
              'The DHCP server identifies itself as available.',
    },
    {
      msg: 'DHCPOFFER', srcLabel: 'Server', dstLabel: 'Client',
      srcIp: '192.168.1.1', dstIp: '255.255.255.255', type: 'broadcast',
      flag: 'offer',
      title: 'Step 2 — OFFER',
      detail: 'Server broadcasts DHCPOFFER with a proposed IP (e.g. 192.168.1.100), subnet mask, ' +
              'default gateway, DNS server, and lease duration. The offer is still a broadcast because ' +
              'the client has no IP to receive a unicast yet.',
    },
    {
      msg: 'DHCPREQUEST', srcLabel: 'Client', dstLabel: 'Server',
      srcIp: '0.0.0.0', dstIp: '255.255.255.255', type: 'broadcast',
      flag: 'request',
      title: 'Step 3 — REQUEST',
      detail: 'Client broadcasts DHCPREQUEST to formally accept the offer. Still using 0.0.0.0 — ' +
              'the IP isn\'t confirmed yet. Broadcasting also informs other DHCP servers on the segment ' +
              'that their offers were declined.',
    },
    {
      msg: 'DHCPACK', srcLabel: 'Server', dstLabel: 'Client',
      srcIp: '192.168.1.1', dstIp: '192.168.1.100', type: 'unicast',
      flag: 'ack',
      title: 'Step 4 — ACKNOWLEDGEMENT',
      detail: 'Server sends DHCPACK confirming the lease. The client now configures its interface with ' +
              '192.168.1.100, the subnet mask, gateway, and DNS. The lease timer begins. The client will ' +
              'renew at 50% of the lease duration (T1) and rebind at 87.5% (T2).',
    },
  ];

  const RELAY_STEPS = [
    {
      msg: 'DHCPDISCOVER (broadcast)', srcLabel: 'Client', dstLabel: 'Router (helper)',
      srcIp: '0.0.0.0', dstIp: '255.255.255.255', type: 'broadcast',
      title: 'Step 1 — Client broadcasts DISCOVER',
      detail: 'Client on 10.0.0.0/24 broadcasts DHCPDISCOVER. Router running "ip helper-address 192.168.1.1" ' +
              'intercepts it on its Gi0/0 interface (10.0.0.1).',
    },
    {
      msg: 'DHCPDISCOVER (unicast relay)', srcLabel: 'Router (helper)', dstLabel: 'DHCP Server',
      srcIp: '10.0.0.1', dstIp: '192.168.1.1', type: 'unicast',
      title: 'Step 2 — Router relays as unicast',
      detail: 'Router converts the broadcast to a unicast and forwards it to the DHCP server (192.168.1.1). ' +
              'It inserts the giaddr (gateway interface address) field = 10.0.0.1 so the server knows which ' +
              'subnet pool to draw from.',
    },
    {
      msg: 'DHCPOFFER (unicast)', srcLabel: 'DHCP Server', dstLabel: 'Router (helper)',
      srcIp: '192.168.1.1', dstIp: '10.0.0.1', type: 'unicast',
      title: 'Step 3 — Server offers via relay',
      detail: 'Server selects an address from the pool matching giaddr (10.0.0.0/24). ' +
              'It unicasts DHCPOFFER back to the router\'s giaddr.',
    },
    {
      msg: 'DHCPOFFER (broadcast)', srcLabel: 'Router (helper)', dstLabel: 'Client',
      srcIp: '10.0.0.1', dstIp: '255.255.255.255', type: 'broadcast',
      title: 'Step 4 — Router rebroadcasts OFFER to client',
      detail: 'Router broadcasts the offer onto the client\'s subnet. Client receives the offered address.',
    },
    {
      msg: 'DHCPREQUEST → DHCPACK', srcLabel: 'Client ↔ Router ↔ Server', dstLabel: '',
      srcIp: '', dstIp: '', type: 'relay',
      title: 'Steps 5–6 — REQUEST + ACK via relay',
      detail: 'REQUEST and ACK complete the exchange through the same relay path. Client ends up with ' +
              'a lease from the remote DHCP server, managed transparently by ip helper-address.',
    },
  ];

  const COLORS = {
    broadcast: { line: '#f59e0b', text: '#fcd34d', badge: 'rgba(245,158,11,0.15)', badgeBorder: '#f59e0b' },
    unicast:   { line: '#22c55e', text: '#86efac', badge: 'rgba(34,197,94,0.15)',  badgeBorder: '#22c55e' },
    relay:     { line: '#818cf8', text: '#a5b4fc', badge: 'rgba(129,140,248,0.15)', badgeBorder: '#818cf8' },
  };

  function steps() { return mode === 'normal' ? NORMAL_STEPS : RELAY_STEPS; }

  function draw() {
    const ss   = steps();
    const s    = ss[step];
    const col  = COLORS[s.type] || COLORS.unicast;
    const total = ss.length;
    const isLeft = s.srcLabel.toLowerCase().includes('client') || s.srcLabel.toLowerCase().includes('router (h');

    containerEl.innerHTML = `
      <div style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:#c8ffc8;background:#0a0a0f;border:1px solid #1f2937;border-radius:8px;padding:18px;">

        <!-- Mode toggle -->
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
          ${['normal','relay'].map(m => `
            <button class="dhcp-mode" data-mode="${m}" style="
              padding:5px 14px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.7rem;
              background:${mode===m?'rgba(34,197,94,0.12)':'transparent'};
              border:1px solid ${mode===m?'rgba(34,197,94,0.4)':'rgba(34,197,94,0.12)'};
              color:${mode===m?'#22c55e':'#4b5563'};
            ">${m === 'normal' ? '🏠 Normal (Same Subnet)' : '🌐 Relay (ip helper-address)'}</button>`).join('')}
        </div>

        <!-- Progress -->
        <div style="display:flex;gap:3px;margin-bottom:14px;">
          ${ss.map((_, i) => `<div style="flex:1;height:4px;border-radius:2px;background:${
            i < step ? '#22c55e' : i === step ? 'rgba(34,197,94,0.5)' : '#1f2937'};"></div>`).join('')}
        </div>

        <!-- Step title -->
        <div style="font-size:0.72rem;font-weight:700;color:#22c55e;margin-bottom:10px;">
          ${s.title}
        </div>

        <!-- Diagram -->
        <div style="background:#060a0f;border:1px solid #1a2733;border-radius:6px;padding:16px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:14px;font-size:0.72rem;font-weight:700;">
            <span style="color:#60a5fa;">${s.srcLabel}</span>
            ${s.dstLabel ? `<span style="color:#6ee7b7;">${s.dstLabel}</span>` : ''}
          </div>

          ${s.type === 'relay' ? `
            <div style="text-align:center;padding:10px;color:#a5b4fc;font-size:0.7rem;">
              ← REQUEST and ACK follow the same relay path in both directions →
            </div>
          ` : `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
              ${isLeft
                ? `<div style="width:50px;font-size:0.6rem;color:#6b7280;text-align:center;">${s.srcIp}</div>
                   <div style="flex:1;position:relative;height:2px;background:linear-gradient(to right,${col.line},rgba(0,0,0,0));">
                     <div style="position:absolute;right:-5px;top:-5px;color:${col.line};font-size:0.7rem;">▶</div>
                   </div>
                   <div style="width:50px;font-size:0.6rem;color:#6b7280;text-align:center;">${s.dstIp}</div>`
                : `<div style="width:50px;font-size:0.6rem;color:#6b7280;text-align:center;">${s.dstIp}</div>
                   <div style="flex:1;position:relative;height:2px;background:linear-gradient(to left,${col.line},rgba(0,0,0,0));">
                     <div style="position:absolute;left:-5px;top:-5px;color:${col.line};font-size:0.7rem;">◀</div>
                   </div>
                   <div style="width:50px;font-size:0.6rem;color:#6b7280;text-align:center;">${s.srcIp}</div>`}
            </div>
            <div style="text-align:center;margin-bottom:8px;">
              <span style="background:${col.badge};border:1px solid ${col.badgeBorder};
                border-radius:4px;padding:3px 12px;font-weight:700;color:${col.text};font-size:0.7rem;">
                ${s.msg}
              </span>
              <span style="margin-left:10px;font-size:0.6rem;padding:2px 8px;border-radius:3px;
                background:${s.type==='broadcast'?'rgba(245,158,11,0.1)':'rgba(34,197,94,0.1)'};
                color:${s.type==='broadcast'?'#fcd34d':'#86efac'};border:1px solid ${s.type==='broadcast'?'rgba(245,158,11,0.3)':'rgba(34,197,94,0.3)'};">
                ${s.type}
              </span>
            </div>
          `}
        </div>

        <!-- Detail -->
        <div style="font-size:0.7rem;color:#8b949e;line-height:1.6;margin-bottom:14px;
          background:#0f1117;border-left:3px solid ${col.line};padding:10px 12px;border-radius:0 4px 4px 0;">
          ${s.detail}
        </div>

        ${mode === 'normal' ? `
        <!-- DORA mnemonic -->
        <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;">
          ${['D·Discover','O·Offer','R·Request','A·Acknowledge'].map((label, i) => `
            <div style="flex:1;min-width:80px;text-align:center;padding:6px;border-radius:4px;
              background:${i === step ? 'rgba(34,197,94,0.1)' : 'transparent'};
              border:1px solid ${i === step ? 'rgba(34,197,94,0.4)' : '#1f2937'};
              color:${i === step ? '#22c55e' : '#374151'};font-size:0.62rem;font-weight:700;">
              ${label}
            </div>`).join('')}
        </div>` : ''}

        <!-- Nav -->
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <button id="dhcp-prev" style="padding:6px 16px;border-radius:4px;cursor:pointer;
            font-family:inherit;font-size:0.7rem;background:transparent;
            border:1px solid rgba(34,197,94,0.2);color:${step>0?'#22c55e':'#374151'};"
            ${step===0?'disabled':''}>← Prev</button>
          <span style="font-size:0.65rem;color:#6b7280;">${step+1} / ${total}</span>
          <button id="dhcp-next" style="padding:6px 16px;border-radius:4px;cursor:pointer;
            font-family:inherit;font-size:0.7rem;background:transparent;
            border:1px solid rgba(34,197,94,0.2);color:${step<total-1?'#22c55e':'#374151'};"
            ${step===total-1?'disabled':''}>Next →</button>
        </div>
      </div>`;

    containerEl.querySelectorAll('.dhcp-mode').forEach(btn =>
      btn.addEventListener('click', () => { mode = btn.dataset.mode; step = 0; draw(); }));
    containerEl.querySelector('#dhcp-prev')?.addEventListener('click', () => { if (step > 0) { step--; draw(); } });
    containerEl.querySelector('#dhcp-next')?.addEventListener('click', () => { if (step < steps().length - 1) { step++; draw(); } });
  }

  draw();
}
