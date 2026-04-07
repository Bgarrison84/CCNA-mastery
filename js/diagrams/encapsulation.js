/**
 * encapsulation.js — Animated OSI Encapsulation Visualizer
 *
 * Step-by-step animation showing data wrapping as it traverses the OSI stack:
 *   Application → Transport (Segment) → Network (Packet) → Data Link (Frame) → Physical (Bits)
 *
 * Exported API: render(containerEl)
 */

export function render(container) {
  const STEPS = [
    {
      layer: 7, name: 'Application', pdu: 'Data',
      color: '#3b82f6', border: '#60a5fa',
      protocols: ['HTTP', 'FTP', 'SMTP', 'DNS', 'DHCP'],
      description: 'The application creates the message. No header is added yet — this is your raw payload (e.g. an HTTP GET request or email body).',
      headerLabel: null,
      visual: [{ label: 'APPLICATION DATA', cls: 'enc-data', w: '100%' }],
    },
    {
      layer: 6, name: 'Presentation', pdu: 'Data',
      color: '#8b5cf6', border: '#a78bfa',
      protocols: ['SSL/TLS', 'JPEG', 'MPEG', 'ASCII'],
      description: 'Presentation handles encoding, encryption, and compression. TLS wraps the data in an encrypted envelope. No new PDU name — still "Data".',
      headerLabel: null,
      visual: [{ label: 'DATA (Encrypted / Encoded)', cls: 'enc-data', w: '100%' }],
    },
    {
      layer: 5, name: 'Session', pdu: 'Data',
      color: '#ec4899', border: '#f472b6',
      protocols: ['NetBIOS', 'PPTP', 'RPC'],
      description: 'Session manages the dialog between applications — establishing, maintaining, and terminating sessions. Adds session management tokens.',
      headerLabel: null,
      visual: [{ label: 'DATA (Session managed)', cls: 'enc-data', w: '100%' }],
    },
    {
      layer: 4, name: 'Transport', pdu: 'Segment (TCP) / Datagram (UDP)',
      color: '#10b981', border: '#34d399',
      protocols: ['TCP', 'UDP'],
      description: 'Transport adds source/dest port numbers, sequence numbers (TCP), and error checking. The PDU is now called a Segment (TCP) or Datagram (UDP).',
      headerLabel: 'TCP/UDP HDR',
      visual: [
        { label: 'TCP/UDP HDR', cls: 'enc-header enc-transport', w: '22%' },
        { label: 'APPLICATION DATA', cls: 'enc-data', w: '78%' },
      ],
    },
    {
      layer: 3, name: 'Network', pdu: 'Packet',
      color: '#f59e0b', border: '#fbbf24',
      protocols: ['IPv4', 'IPv6', 'ICMP', 'OSPF'],
      description: 'The Network layer adds source and destination IP addresses. The PDU is now a Packet. Routers operate here — they read the IP header to forward the packet.',
      headerLabel: 'IP HDR',
      visual: [
        { label: 'IP HDR', cls: 'enc-header enc-network', w: '18%' },
        { label: 'TCP/UDP HDR', cls: 'enc-header enc-transport', w: '18%' },
        { label: 'DATA', cls: 'enc-data', w: '64%' },
      ],
    },
    {
      layer: 2, name: 'Data Link', pdu: 'Frame',
      color: '#ef4444', border: '#f87171',
      protocols: ['Ethernet', '802.11 Wi-Fi', 'PPP'],
      description: 'Data Link adds MAC addresses (source and destination) in the header, plus a Frame Check Sequence (FCS) trailer for error detection. The PDU is now a Frame. Switches operate here.',
      headerLabel: 'ETH HDR',
      visual: [
        { label: 'ETH HDR', cls: 'enc-header enc-datalink', w: '14%' },
        { label: 'IP HDR', cls: 'enc-header enc-network', w: '14%' },
        { label: 'TCP HDR', cls: 'enc-header enc-transport', w: '14%' },
        { label: 'DATA', cls: 'enc-data', w: '44%' },
        { label: 'FCS', cls: 'enc-trailer', w: '14%' },
      ],
    },
    {
      layer: 1, name: 'Physical', pdu: 'Bits',
      color: '#6b7280', border: '#9ca3af',
      protocols: ['Ethernet cable', 'Wi-Fi radio', 'Fibre optic'],
      description: 'Physical converts the frame into raw bits (electrical signals, radio waves, or light pulses) for transmission across the medium. No header added — just ones and zeros.',
      headerLabel: null,
      visual: [
        { label: '1 0 1 1 0 0 1 0 1 0 1 1 0 1 0 0 1 1 0 1 0 1 1 0 0 1 0 0 1 0', cls: 'enc-bits', w: '100%' },
      ],
    },
  ];

  let step = 0;

  container.innerHTML = `
    <style>
      .enc-wrap { font-family: 'JetBrains Mono','Fira Code',Consolas,monospace; }
      .enc-pdu-row { display:flex; align-items:stretch; gap:2px; min-height:40px; transition:all 0.4s ease; }
      .enc-pdu-row > div { display:flex; align-items:center; justify-content:center;
        font-size:0.65rem; font-weight:700; padding:4px 2px; text-align:center;
        letter-spacing:0.04em; border-radius:3px; transition:all 0.3s; white-space:nowrap; overflow:hidden; }
      .enc-header    { background:#1e3a5f; border:1px solid #3b82f6; color:#93c5fd; }
      .enc-transport { background:#064e3b; border:1px solid #10b981; color:#6ee7b7; }
      .enc-network   { background:#451a03; border:1px solid #f59e0b; color:#fcd34d; }
      .enc-datalink  { background:#450a0a; border:1px solid #ef4444; color:#fca5a5; }
      .enc-trailer   { background:#1a1a2e; border:1px solid #6b7280; color:#9ca3af; }
      .enc-data      { background:#0f2027; border:1px solid #3b82f6; color:#93c5fd; }
      .enc-bits      { background:#111; border:1px solid #374151; color:#6b7280; font-size:0.55rem; letter-spacing:0.15em; }
      .enc-layer-btn { cursor:pointer; border:1px solid #374151; border-radius:4px; padding:4px 8px;
        font-size:0.65rem; font-family:monospace; transition:all 0.15s; }
      .enc-layer-btn:hover { border-color:#4b5563; background:#1f2937; }
      .enc-layer-btn.active { border-color:var(--enc-color,#3b82f6); background:#0f172a;
        color:var(--enc-color,#60a5fa); }
      .enc-nav-btn { padding:6px 16px; border:1px solid #374151; border-radius:4px;
        font-size:0.75rem; font-family:monospace; cursor:pointer; transition:all 0.15s; }
      .enc-nav-btn:hover:not(:disabled) { background:#1f2937; border-color:#4b5563; }
      .enc-nav-btn:disabled { opacity:0.35; cursor:not-allowed; }
      @keyframes enc-pop { 0%{transform:scaleY(0.7);opacity:0} 100%{transform:scaleY(1);opacity:1} }
      .enc-pop { animation:enc-pop 0.3s ease forwards; }
    </style>

    <div class="enc-wrap" style="background:#0a0a0f;border:1px solid #1f2937;border-radius:8px;padding:20px;color:#c9d1d9;">

      <!-- Layer selector strip -->
      <div id="enc-layer-strip" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:16px;"></div>

      <!-- Current step info -->
      <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:10px;">
        <span id="enc-layer-badge" style="font-size:0.7rem;font-weight:700;padding:2px 8px;border-radius:3px;"></span>
        <span id="enc-pdu-name" style="font-size:0.7rem;color:#6b7280;font-style:italic;"></span>
      </div>

      <!-- PDU visualizer -->
      <div id="enc-pdu-visual" class="enc-pdu-row enc-pop" style="margin-bottom:12px;"></div>

      <!-- Description -->
      <div id="enc-desc" style="font-size:0.75rem;color:#8b949e;line-height:1.6;margin-bottom:14px;
        background:#0f1117;border-left:3px solid #1f2937;padding:10px 12px;border-radius:0 4px 4px 0;"></div>

      <!-- Protocols -->
      <div style="margin-bottom:14px;">
        <span style="font-size:0.65rem;color:#4b5563;text-transform:uppercase;letter-spacing:0.08em;">Protocols: </span>
        <span id="enc-protocols" style="font-size:0.7rem;"></span>
      </div>

      <!-- Navigation -->
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <button class="enc-nav-btn" id="enc-prev" style="color:#c9d1d9;">← Prev</button>
        <span id="enc-counter" style="font-size:0.7rem;color:#6b7280;font-family:monospace;"></span>
        <button class="enc-nav-btn" id="enc-next" style="color:#c9d1d9;">Next →</button>
      </div>
    </div>`;

  // Build layer selector strip
  const strip = container.querySelector('#enc-layer-strip');
  STEPS.forEach((s, i) => {
    const btn = document.createElement('button');
    btn.className = 'enc-layer-btn';
    btn.textContent = `L${s.layer} ${s.name}`;
    btn.style.setProperty('--enc-color', s.border);
    btn.addEventListener('click', () => { step = i; render_step(); });
    strip.appendChild(btn);
  });

  function render_step() {
    const s = STEPS[step];

    // Update layer badge
    const badge = container.querySelector('#enc-layer-badge');
    badge.textContent = `Layer ${s.layer} — ${s.name}`;
    badge.style.background = s.color + '22';
    badge.style.border = `1px solid ${s.border}`;
    badge.style.color = s.border;

    container.querySelector('#enc-pdu-name').textContent = `PDU: ${s.pdu}`;
    container.querySelector('#enc-desc').textContent = s.description;

    // Protocols
    const protoEl = container.querySelector('#enc-protocols');
    protoEl.innerHTML = s.protocols.map(p =>
      `<span style="background:#1f2937;border:1px solid #374151;border-radius:3px;
        padding:1px 6px;font-size:0.65rem;font-family:monospace;color:#9ca3af;margin-right:4px;">${p}</span>`
    ).join('');

    // PDU visual
    const visual = container.querySelector('#enc-pdu-visual');
    visual.classList.remove('enc-pop');
    void visual.offsetWidth;
    visual.classList.add('enc-pop');
    visual.innerHTML = s.visual.map(v =>
      `<div class="${v.cls}" style="width:${v.w}">${v.label}</div>`
    ).join('');

    // Layer strip active state
    strip.querySelectorAll('.enc-layer-btn').forEach((btn, i) => {
      btn.classList.toggle('active', i === step);
    });

    // Counter + nav buttons
    container.querySelector('#enc-counter').textContent = `${step + 1} / ${STEPS.length}`;
    container.querySelector('#enc-prev').disabled = step === 0;
    container.querySelector('#enc-next').disabled = step === STEPS.length - 1;
  }

  container.querySelector('#enc-prev').addEventListener('click', () => { if (step > 0) { step--; render_step(); } });
  container.querySelector('#enc-next').addEventListener('click', () => { if (step < STEPS.length - 1) { step++; render_step(); } });

  // Keyboard nav when container is focused
  container.setAttribute('tabindex', '0');
  container.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); if (step < STEPS.length - 1) { step++; render_step(); } }
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); if (step > 0)              { step--; render_step(); } }
  });

  render_step();
}
