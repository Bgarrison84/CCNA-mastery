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
        <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
          ${['connect','teardown','challenge'].map(m => `
            <button class="tcp-mode" data-mode="${m}" style="
              padding:6px 16px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.72rem;
              background:${mode===m?'rgba(0,255,65,0.15)':'transparent'};
              border:1px solid ${mode===m?'rgba(0,255,65,0.4)':'rgba(0,255,65,0.15)'};
              color:${mode===m?'#00ff41':'#6a9a6a'};
            ">${m === 'connect' ? '3-Way Handshake' : m === 'teardown' ? '4-Way Teardown' : 'Handshake Challenge'}</button>`).join('')}
        </div>

        ${mode === 'challenge' ? `
          <div id="tcp-pane-challenge">
            <p style="color:#6a9a6a;margin-bottom:12px;font-size:0.72rem;">
              Drag the correct TCP flags into the sequence slots for a standard 3-way handshake.
            </p>
            <div style="background:#0d0d0d;border:1px solid rgba(0,255,65,0.12);border-radius:6px;padding:20px;margin-bottom:16px;">
              <div style="display:flex;justify-content:space-between;margin-bottom:24px;">
                <div style="color:#a5b4fc;font-weight:700;">CLIENT</div>
                <div style="color:#6ee7b7;font-weight:700;">SERVER</div>
              </div>
              
              <!-- Slot 1 -->
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
                <div class="tcp-slot" data-flag="SYN" style="width:100px;height:34px;border:1px dashed rgba(0,255,65,0.3);border-radius:4px;display:flex;align-items:center;justify-content:center;"></div>
                <div style="flex:1;height:2px;background:#374151;position:relative;"><div style="position:absolute;right:-6px;top:-5px;color:#374151;">▶</div></div>
              </div>

              <!-- Slot 2 -->
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
                <div style="flex:1;height:2px;background:#374151;position:relative;"><div style="position:absolute;left:-6px;top:-5px;color:#374151;">◀</div></div>
                <div class="tcp-slot" data-flag="SYN-ACK" style="width:100px;height:34px;border:1px dashed rgba(0,255,65,0.3);border-radius:4px;display:flex;align-items:center;justify-content:center;"></div>
              </div>

              <!-- Slot 3 -->
              <div style="display:flex;align-items:center;gap:12px;">
                <div class="tcp-slot" data-flag="ACK" style="width:100px;height:34px;border:1px dashed rgba(0,255,65,0.3);border-radius:4px;display:flex;align-items:center;justify-content:center;"></div>
                <div style="flex:1;height:2px;background:#374151;position:relative;"><div style="position:absolute;right:-6px;top:-5px;color:#374151;">▶</div></div>
              </div>
            </div>

            <div id="tcp-flag-pool" style="display:flex;gap:12px;justify-content:center;margin-bottom:20px;padding:12px;background:rgba(255,255,255,0.02);border-radius:6px;"></div>
            
            <button id="tcp-check-btn" style="width:100%;padding:10px;background:#00ff41;color:#000;font-weight:700;border-radius:4px;border:none;cursor:pointer;">Validate Handshake</button>
            <div id="tcp-challenge-fb" class="hidden" style="margin-top:12px;text-align:center;font-size:0.75rem;"></div>
          </div>
        ` : `
          <!-- Progress bar -->
          <div style="display:flex;gap:3px;margin-bottom:16px;">
            ${Array.from({length: total}, (_, i) => `<div style="flex:1;height:4px;border-radius:2px;background:${i < step ? '#00ff41' : i === step ? 'rgba(0,255,65,0.6)' : '#1f2937'};"></div>`).join('')}
          </div>

          <!-- Sequence diagram -->
          <div style="background:#0d0d0d;border:1px solid rgba(0,255,65,0.12);border-radius:6px;padding:16px;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:16px;">
              <div style="color:${isClient?'#00ff41':'#a5b4fc'};font-weight:700;font-size:0.8rem;">CLIENT</div>
              <div style="color:${!isClient?'#00ff41':'#6ee7b7'};font-weight:700;font-size:0.8rem;">SERVER</div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
              ${isClient
                ? `<div style="width:60px;text-align:center;font-size:0.65rem;color:#6b7280;">sends</div>
                   <div style="flex:1;position:relative;height:2px;background:linear-gradient(to right,#00ff41,rgba(0,255,65,0.2));">
                     <div style="position:absolute;right:-4px;top:-5px;color:#00ff41;font-size:0.7rem;">▶</div>
                   </div>
                   <div style="width:60px;text-align:center;font-size:0.65rem;color:#6b7280;">receives</div>`
                : `<div style="width:60px;text-align:center;font-size:0.65rem;color:#6b7280;">receives</div>
                   <div style="flex:1;position:relative;height:2px;background:linear-gradient(to left,#00ff41,rgba(0,255,65,0.2));">
                     <div style="position:absolute;left:-4px;top:-5px;color:#00ff41;font-size:0.7rem;">◀</div>
                   </div>
                   <div style="width:60px;text-align:center;font-size:0.65rem;color:#6b7280;">sends</div>`}
            </div>
            <div style="text-align:center;margin-bottom:8px;">
              <span style="background:rgba(0,255,65,0.1);border:1px solid rgba(0,255,65,0.3);border-radius:4px;padding:3px 10px;font-weight:700;color:#00ff41;font-size:0.75rem;">${s.flag}</span>
              <span style="color:#6b7280;font-size:0.65rem;margin-left:8px;">SEQ=${s.seq} ACK=${s.ack}</span>
            </div>
            <div style="font-size:0.72rem;color:#9ca3af;line-height:1.5;border-top:1px solid #1f2937;padding-top:10px;">${s.label}</div>
            <div style="font-size:0.68rem;color:#6b7280;line-height:1.5;margin-top:6px;">${s.detail}</div>
            <div style="display:flex;gap:16px;margin-top:10px;font-size:0.62rem;font-family:monospace;">
              <span>CLIENT: <span style="color:#a5b4fc;">${s.state.client}</span></span>
              <span>SERVER: <span style="color:#6ee7b7;">${s.state.server}</span></span>
            </div>
          </div>

          <!-- Navigation -->
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px;">
            <button id="tcp-prev" style="padding:6px 16px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.72rem;background:transparent;border:1px solid rgba(0,255,65,0.2);color:${step>0?'#00ff41':'#374151'};" ${step===0?'disabled':''}>← Prev</button>
            <span style="font-size:0.65rem;color:#6b7280;font-family:monospace;">${step+1} / ${total}</span>
            <button id="tcp-next" style="padding:6px 16px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.72rem;background:transparent;border:1px solid rgba(0,255,65,0.2);color:${step<total-1?'#00ff41':'#374151'};" ${step===total-1?'disabled':''}>Next →</button>
          </div>
        `}
      </div>`;

    containerEl.querySelectorAll('.tcp-mode').forEach(btn => {
      btn.addEventListener('click', () => { mode = btn.dataset.mode; step = 0; draw(); });
    });
    if (mode === 'challenge') initHandshakeChallenge();
    else {
      containerEl.querySelector('#tcp-prev')?.addEventListener('click', () => { if (step > 0) { step--; draw(); } });
      containerEl.querySelector('#tcp-next')?.addEventListener('click', () => { if (step < getSteps().length - 1) { step++; draw(); } });
    }
  }

  function initHandshakeChallenge() {
    const pool = containerEl.querySelector('#tcp-flag-pool');
    const slots = containerEl.querySelectorAll('.tcp-slot');
    const fb = containerEl.querySelector('#tcp-challenge-fb');
    const checkBtn = containerEl.querySelector('#tcp-check-btn');

    const flags = ['SYN', 'SYN-ACK', 'ACK', 'FIN', 'RST'].sort(() => Math.random() - 0.5);
    flags.forEach(f => {
      const tile = document.createElement('div');
      tile.className = 'tcp-tile';
      tile.textContent = f;
      tile.dataset.flag = f;
      tile.style = `padding:6px 14px;background:#1a1a1a;border:1px solid rgba(0,255,65,0.3);border-radius:4px;color:#00ff41;font-weight:700;cursor:grab;touch-action:none;user-select:none;font-size:0.7rem;`;
      pool.appendChild(tile);

      let isDragging = false, startX, startY;
      tile.addEventListener('pointerdown', e => {
        isDragging = true; startX = e.clientX; startY = e.clientY;
        tile.setPointerCapture(e.pointerId); tile.style.zIndex = 1000; tile.style.cursor = 'grabbing';
      });
      tile.addEventListener('pointermove', e => {
        if (!isDragging) return;
        tile.style.transform = `translate(${e.clientX - startX}px, ${e.clientY - startY}px)`;
      });
      tile.addEventListener('pointerup', e => {
        if (!isDragging) return;
        isDragging = false; tile.releasePointerCapture(e.pointerId); tile.style.zIndex = ''; tile.style.cursor = 'grab'; tile.style.transform = '';
        const rect = tile.getBoundingClientRect();
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        let dropped = false;
        slots.forEach(s => {
          const sr = s.getBoundingClientRect();
          if (cx >= sr.left && cx <= sr.right && cy >= sr.top && cy <= sr.bottom && !s.hasChildNodes()) {
            s.appendChild(tile); dropped = true;
          }
        });
        if (!dropped) pool.appendChild(tile);
      });
    });

    checkBtn.onclick = () => {
      let correct = 0;
      slots.forEach(s => {
        const t = s.querySelector('.tcp-tile');
        if (t && t.dataset.flag === s.dataset.flag) { correct++; s.style.borderColor = '#00ff41'; }
        else s.style.borderColor = '#ff4444';
      });
      fb.classList.remove('hidden');
      if (correct === 3) {
        fb.innerHTML = '<span style="color:#00ff41;font-weight:700;">✅ Handshake complete! +30 XP</span>';
        document.dispatchEvent(new CustomEvent('ccna-xp', { detail: { amount: 30, reason: 'TCP Handshake' } }));
      } else fb.innerHTML = `<span style="color:#ffb000;">${correct}/3 correct. Try again!</span>`;
    };
  }

  draw();
}
