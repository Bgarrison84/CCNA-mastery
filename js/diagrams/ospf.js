/**
 * OSPF Neighbor State Machine — Step-through with event labels on each transition.
 */

const STATES = [
  {
    id: 'down', name: 'Down', color: '#f87171',
    desc: 'No Hellos received from this neighbor. Initial state.',
    event: null,
    tip: 'All OSPF neighbors start in Down. A router moves out of Down when it receives a Hello.',
  },
  {
    id: 'init', name: 'Init', color: '#fb923c',
    desc: 'Hello received from neighbor, but our Router ID is NOT in their neighbor list yet.',
    event: 'Hello received (our RID not in neighbor\'s Hello)',
    tip: 'One-way communication established. We see them; they don\'t yet see us.',
  },
  {
    id: 'twoway', name: '2-Way', color: '#facc15',
    desc: 'Bidirectional communication confirmed. DR/BDR election happens here on multi-access networks.',
    event: 'Our RID seen in neighbor\'s Hello → bidirectional',
    tip: 'On Ethernet, non-DR/non-BDR routers STAY in 2-Way — they don\'t exchange LSDBs with each other.',
  },
  {
    id: 'exstart', name: 'ExStart', color: '#a3e635',
    desc: 'Master/Slave negotiation. Higher Router ID becomes Master and sets the initial DBD sequence number.',
    event: 'DD (Database Description) packet exchange begins',
    tip: 'Master controls the DBD sequence. Higher RID = Master. This is NOT the DR/BDR role.',
  },
  {
    id: 'exchange', name: 'Exchange', color: '#4ade80',
    desc: 'Routers exchange DBD packets describing their LSDB. Each router builds a list of missing LSAs.',
    event: 'DBD packets exchanged; LSA headers compared',
    tip: 'Exchange just shares headers — not full LSAs. Full LSAs come in Loading.',
  },
  {
    id: 'loading', name: 'Loading', color: '#34d399',
    desc: 'Routers request missing LSAs via LSR (Link State Request). Neighbor replies with LSU packets.',
    event: 'LSR → LSU → LSAck cycle for missing LSAs',
    tip: 'Loading can be slow if the LSDB is large. The neighbor replies with LSU; you acknowledge with LSAck.',
  },
  {
    id: 'full', name: 'Full', color: '#00ff41',
    desc: 'LSDBs are fully synchronized. Routers are fully adjacent. SPF can now run.',
    event: 'All LSAs received and acknowledged',
    tip: 'Only DR/BDR adjacencies reach Full on Ethernet. show ip ospf neighbor should show FULL for DR/BDR relationships.',
  },
];

export function render(containerEl) {
  let step = 0;

  function draw() {
    const s = STATES[step];
    const prev = step > 0 ? STATES[step - 1] : null;

    containerEl.innerHTML = `
      <div style="font-family:'JetBrains Mono',monospace;font-size:0.78rem;color:#c8ffc8;">

        <!-- Progress dots -->
        <div style="display:flex;gap:6px;margin-bottom:16px;align-items:center;">
          ${STATES.map((st, i) => `
            <div style="
              width:${i === step ? '28px' : '10px'};height:10px;border-radius:5px;
              background:${i < step ? '#4ade80' : i === step ? st.color : 'rgba(255,255,255,0.08)'};
              transition:all 0.2s;flex-shrink:0;
            "></div>`).join('')}
          <span style="margin-left:8px;color:#6b7280;font-size:0.68rem;">${step + 1} / ${STATES.length}</span>
        </div>

        <!-- State machine diagram -->
        <div style="background:#0d0d0d;border:1px solid rgba(0,255,65,0.12);border-radius:6px;padding:16px;margin-bottom:12px;">

          <!-- Transition arrow (if not first) -->
          ${prev ? `
          <div style="
            text-align:center;margin-bottom:12px;padding:8px;
            background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.15);border-radius:4px;
            font-size:0.68rem;color:#fbbf24;
          ">
            <span style="color:#4b5563;">Trigger: </span>${s.event}
          </div>
          <div style="text-align:center;color:#374151;font-size:1.2rem;margin-bottom:12px;">↓</div>
          ` : ''}

          <!-- Current state box -->
          <div style="
            padding:16px;border-radius:6px;text-align:center;
            background:${s.color}18;border:2px solid ${s.color}55;
          ">
            <div style="font-size:1.1rem;font-weight:700;color:${s.color};margin-bottom:6px;">
              ${s.name}
            </div>
            <div style="color:#9ca3af;font-size:0.72rem;line-height:1.6;">${s.desc}</div>
          </div>
        </div>

        <!-- Full state chain mini-map -->
        <div style="display:flex;align-items:center;gap:0;margin-bottom:12px;overflow-x:auto;padding-bottom:4px;">
          ${STATES.map((st, i) => `
            <div style="
              display:flex;align-items:center;gap:0;flex-shrink:0;
            ">
              <div style="
                padding:4px 10px;border-radius:3px;font-size:0.62rem;font-weight:600;
                background:${i === step ? st.color + '33' : i < step ? st.color + '18' : 'rgba(255,255,255,0.03)'};
                border:1px solid ${i === step ? st.color : i < step ? st.color + '44' : 'rgba(255,255,255,0.06)'};
                color:${i <= step ? st.color : '#374151'};
                white-space:nowrap;
              ">${st.name}</div>
              ${i < STATES.length - 1 ? `<div style="color:#374151;font-size:0.7rem;padding:0 2px;">→</div>` : ''}
            </div>`).join('')}
        </div>

        <!-- Exam tip -->
        <div style="
          padding:10px 14px;background:rgba(251,191,36,0.05);
          border-left:2px solid #fbbf24;border-radius:2px;
          font-size:0.7rem;color:#fcd34d;margin-bottom:16px;line-height:1.6;
        ">
          💡 ${s.tip}
        </div>

        <!-- Navigation -->
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <button id="ospf-prev" style="
            padding:8px 20px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.75rem;
            background:transparent;border:1px solid rgba(0,255,65,0.2);color:#4a7a4a;
            ${step === 0 ? 'visibility:hidden;' : ''}
          ">← Prev</button>
          <span style="color:#374151;font-size:0.7rem;">${step + 1} / ${STATES.length}</span>
          <button id="ospf-next" style="
            padding:8px 20px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.75rem;
            background:${step === STATES.length - 1 ? 'transparent' : 'var(--terminal-green,#00ff41)'};
            border:1px solid ${step === STATES.length - 1 ? 'rgba(0,255,65,0.2)' : 'transparent'};
            color:${step === STATES.length - 1 ? '#4a7a4a' : '#000'};
            font-weight:${step === STATES.length - 1 ? '400' : '700'};
          ">${step === STATES.length - 1 ? 'Done ✓' : 'Next →'}</button>
        </div>
      </div>`;

    containerEl.querySelector('#ospf-prev')?.addEventListener('click', () => { if (step > 0) { step--; draw(); } });
    containerEl.querySelector('#ospf-next')?.addEventListener('click', () => { if (step < STATES.length - 1) { step++; draw(); } });
  }

  draw();
}
