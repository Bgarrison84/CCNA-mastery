/**
 * TCP Handshake & Teardown — Step-through sequence diagrams.
 */

const CONNECT = [
  {
    from: 'client', flag: 'SYN', seq: 'ISN=100', ack: '—',
    label: 'Client initiates connection',
    detail: 'Client picks a random Initial Sequence Number (ISN) and sends SYN. No data yet — just a request to synchronise.',
    state: { client: 'SYN_SENT', server: 'LISTEN' },
  },
  {
    from: 'server', flag: 'SYN-ACK', seq: 'ISN=300', ack: 'ACK=101',
    label: 'Server acknowledges and sends its own SYN',
    detail: 'Server picks its own ISN (300). ACK=101 means "I received up to seq 100, expecting 101 next".',
    state: { client: 'SYN_SENT', server: 'SYN_RECEIVED' },
  },
  {
    from: 'client', flag: 'ACK', seq: '101', ack: 'ACK=301',
    label: 'Client acknowledges — connection established',
    detail: 'Client ACKs the server\'s SYN. Both sides are now ESTABLISHED. Data transfer can begin.',
    state: { client: 'ESTABLISHED', server: 'ESTABLISHED' },
  },
];

const TEARDOWN = [
  {
    from: 'client', flag: 'FIN', seq: '400', ack: '—',
    label: 'Client sends FIN — done sending',
    detail: 'Client has no more data. Sends FIN to close its half of the connection. Enters FIN_WAIT_1.',
    state: { client: 'FIN_WAIT_1', server: 'ESTABLISHED' },
  },
  {
    from: 'server', flag: 'ACK', seq: '—', ack: 'ACK=401',
    label: 'Server ACKs the FIN',
    detail: 'Server ACKs the FIN. Client moves to FIN_WAIT_2. Server may still send data (half-close).',
    state: { client: 'FIN_WAIT_2', server: 'CLOSE_WAIT' },
  },
  {
    from: 'server', flag: 'FIN', seq: '700', ack: '—',
    label: 'Server sends its own FIN',
    detail: 'Server is done sending. Sends FIN and enters LAST_ACK state.',
    state: { client: 'TIME_WAIT', server: 'LAST_ACK' },
  },
  {
    from: 'client', flag: 'ACK', seq: '—', ack: 'ACK=701',
    label: 'Client ACKs — waits 2MSL then CLOSED',
    detail: 'Client ACKs. Enters TIME_WAIT (2×MSL ≈ 60–240s) to ensure FIN was received. Then CLOSED.',
    state: { client: 'TIME_WAIT → CLOSED', server: 'CLOSED' },
  },
];

export function render(containerEl) {
  let mode = 'connect';
  let step = 0;

  function getSteps() { return mode === 'connect' ? CONNECT : TEARDOWN; }

  function draw() {
    const steps = getSteps();
    const s = steps[step];
    const total = steps.length;
    const isClient = s.from === 'client';

    containerEl.innerHTML = `
      <div style="font-family:'JetBrains Mono',monospace;font-size:0.78rem;color:#c8ffc8;">

        <!-- Mode toggle -->
        <div style="display:flex;gap:8px;margin-bottom:16px;">
          ${['connect','teardown'].map(m => `
            <button class="tcp-mode" data-mode="${m}" style="
              padding:6px 16px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.72rem;
              background:${mode===m?'rgba(0,255,65,0.15)':'transparent'};
              border:1px solid ${mode===m?'rgba(0,255,65,0.4)':'rgba(0,255,65,0.15)'};
              color:${mode===m?'#00ff41':'#6a9a6a'};
            ">${m === 'connect' ? '3-Way Handshake' : '4-Way Teardown'}</button>`).join('')}
        </div>

        <!-- Progress bar -->
        <div style="display:flex;gap:4px;margin-bottom:16px;">
          ${steps.map((_, i) => `
            <div style="
              height:3px;flex:1;border-radius:2px;
              background:${i <= step ? 'var(--terminal-green,#00ff41)' : 'rgba(0,255,65,0.12)'};
            "></div>`).join('')}
        </div>

        <!-- Sequence diagram -->
        <div style="
          background:#0d0d0d;border:1px solid rgba(0,255,65,0.12);
          border-radius:6px;padding:16px;margin-bottom:12px;
        ">
          <!-- Column headers -->
          <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
            <div style="
              padding:4px 12px;border-radius:4px;font-size:0.72rem;font-weight:700;
              background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;
            ">CLIENT</div>
            <div style="
              padding:4px 12px;border-radius:4px;font-size:0.72rem;font-weight:700;
              background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);color:#6ee7b7;
            ">SERVER</div>
          </div>

          <!-- Arrow row -->
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
            ${isClient
              ? `<div style="width:32px;height:2px;background:#a5b4fc;"></div>
                 <div style="color:#fbbf24;font-weight:700;font-size:0.85rem;white-space:nowrap;">${s.flag}</div>
                 <div style="flex:1;height:2px;background:linear-gradient(90deg,#fbbf24,#fbbf24);position:relative;">
                   <div style="position:absolute;right:-6px;top:-5px;color:#fbbf24;">▶</div>
                 </div>
                 <div style="width:32px;"></div>`
              : `<div style="width:32px;"></div>
                 <div style="flex:1;height:2px;background:linear-gradient(90deg,#34d399,#34d399);position:relative;">
                   <div style="position:absolute;left:-6px;top:-5px;color:#34d399;">◀</div>
                 </div>
                 <div style="color:#fbbf24;font-weight:700;font-size:0.85rem;white-space:nowrap;">${s.flag}</div>
                 <div style="width:32px;height:2px;background:#6ee7b7;"></div>`
            }
          </div>

          <!-- Packet fields -->
          <div style="display:flex;justify-content:center;gap:24px;flex-wrap:wrap;margin-bottom:12px;">
            ${s.seq !== '—' ? `<div style="font-size:0.7rem;"><span style="color:#6b7280;">SEQ:</span> <span style="color:#fcd34d;">${s.seq}</span></div>` : ''}
            ${s.ack !== '—' ? `<div style="font-size:0.7rem;"><span style="color:#6b7280;">ACK:</span> <span style="color:#86efac;">${s.ack}</span></div>` : ''}
          </div>

          <!-- TCP states -->
          <div style="display:flex;justify-content:space-between;font-size:0.65rem;">
            <span style="color:#818cf8;">${s.state.client}</span>
            <span style="color:#34d399;">${s.state.server}</span>
          </div>
        </div>

        <!-- Step detail -->
        <div style="
          background:rgba(0,255,65,0.04);border:1px solid rgba(0,255,65,0.12);
          border-radius:6px;padding:14px;margin-bottom:16px;
        ">
          <div style="font-weight:700;color:#e2e8f0;margin-bottom:6px;font-size:0.8rem;">
            Step ${step + 1}/${total}: ${s.label}
          </div>
          <p style="color:#9ca3af;font-size:0.72rem;line-height:1.6;">${s.detail}</p>
        </div>

        <!-- Navigation -->
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <button id="tcp-prev" style="
            padding:8px 20px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.75rem;
            background:transparent;border:1px solid rgba(0,255,65,0.2);color:#4a7a4a;
            ${step === 0 ? 'visibility:hidden;' : ''}
          ">← Prev</button>
          <span style="color:#374151;font-size:0.7rem;">${step + 1} / ${total}</span>
          <button id="tcp-next" style="
            padding:8px 20px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.75rem;
            background:${step === total-1 ? 'transparent' : 'var(--terminal-green,#00ff41)'};
            border:1px solid ${step === total-1 ? 'rgba(0,255,65,0.2)' : 'transparent'};
            color:${step === total-1 ? '#4a7a4a' : '#000'};font-weight:${step === total-1 ? '400' : '700'};
          ">${step === total - 1 ? 'Done ✓' : 'Next →'}</button>
        </div>
      </div>`;

    containerEl.querySelectorAll('.tcp-mode').forEach(btn => {
      btn.addEventListener('click', () => { mode = btn.dataset.mode; step = 0; draw(); });
    });
    containerEl.querySelector('#tcp-prev')?.addEventListener('click', () => { if (step > 0) { step--; draw(); } });
    containerEl.querySelector('#tcp-next')?.addEventListener('click', () => { if (step < getSteps().length - 1) { step++; draw(); } });
  }

  draw();
}
