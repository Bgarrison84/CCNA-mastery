/**
 * stp_timeline.js — STP Port State Timeline Visualizer
 *
 * Shows port state transitions with IEEE 802.1D timers vs RSTP (802.1w) vs PortFast.
 * Clickable segment highlights show what happens in each state.
 *
 * Exported API: render(containerEl)
 */

export function render(containerEl) {
  let variant = 'stp'; // 'stp' | 'rstp' | 'portfast'
  let selected = null; // selected state segment index

  const STP_STATES = [
    {
      name: 'BLOCKING', timer: '20s (Max Age)', color: '#ef4444', dim: '#7f1d1d',
      learns: false, forwards: false,
      detail: 'Port is blocked to prevent loops. Receives BPDUs but discards all data frames. ' +
              'The switch listens for the Root Bridge\'s BPDUs. If no BPDU received for Max Age (20s), ' +
              'the port transitions to Listening.',
      role: 'Non-designated / Root port (alternate)',
    },
    {
      name: 'LISTENING', timer: '15s (Forward Delay)', color: '#f59e0b', dim: '#78350f',
      learns: false, forwards: false,
      detail: 'Port participates in BPDU exchange to elect root bridge, root ports, and designated ports. ' +
              'No MAC learning, no data forwarding. Duration: Forward Delay (default 15s).',
      role: 'Transitioning',
    },
    {
      name: 'LEARNING', timer: '15s (Forward Delay)', color: '#eab308', dim: '#713f12',
      learns: true, forwards: false,
      detail: 'Port builds its MAC address table by learning source MACs from received frames. ' +
              'Still no data forwarding — this prevents flooding when the port first opens. ' +
              'Duration: Forward Delay (default 15s). Total convergence so far: 50s.',
      role: 'Transitioning',
    },
    {
      name: 'FORWARDING', timer: '∞ (active)', color: '#22c55e', dim: '#14532d',
      learns: true, forwards: true,
      detail: 'Port is fully operational — receives and sends data frames, continues MAC learning, ' +
              'and processes BPDUs. Total time from link-up to forwarding: ~30–50s for 802.1D. ' +
              'This is the only state where user traffic flows.',
      role: 'Designated / Root port',
    },
  ];

  const RSTP_STATES = [
    {
      name: 'DISCARDING', timer: '~1s (negotiation)', color: '#ef4444', dim: '#7f1d1d',
      learns: false, forwards: false,
      detail: 'RSTP combines Blocking + Listening into Discarding. Port negotiates with neighbor using ' +
              'Proposal/Agreement handshake. If the neighbor is a point-to-point link, the port can skip ' +
              'timers entirely and move straight to Forwarding after successful negotiation.',
      role: 'Alternate / Backup / Designated',
    },
    {
      name: 'LEARNING', timer: '~1s (negotiation)', color: '#eab308', dim: '#713f12',
      learns: true, forwards: false,
      detail: 'Very brief RSTP learning state after the Proposal/Agreement handshake succeeds. ' +
              'MAC table is populated. On point-to-point links this can complete in milliseconds.',
      role: 'Transitioning',
    },
    {
      name: 'FORWARDING', timer: '∞ (active)', color: '#22c55e', dim: '#14532d',
      learns: true, forwards: true,
      detail: 'Port is fully operational. RSTP convergence time is typically < 1 second on ' +
              'point-to-point links versus 30–50 seconds for classic 802.1D. RSTP is backward-compatible — ' +
              'it falls back to 802.1D behaviour if it detects a non-RSTP neighbour.',
      role: 'Designated / Root port',
    },
  ];

  const PORTFAST_STATES = [
    {
      name: 'FORWARDING', timer: 'Instant (0s)', color: '#22c55e', dim: '#14532d',
      learns: true, forwards: true,
      detail: 'PortFast skips Blocking, Listening, and Learning entirely. The port goes directly to ' +
              'Forwarding. This is safe ONLY on access ports connected to end devices (PCs, servers, printers). ' +
              'Never enable on switch-to-switch links — it would bypass loop prevention.',
      role: 'Access port (edge device only)',
    },
  ];

  function stateSet() {
    return variant === 'stp' ? STP_STATES : variant === 'rstp' ? RSTP_STATES : PORTFAST_STATES;
  }

  function totalTime() {
    if (variant === 'portfast') return 'Instant';
    if (variant === 'rstp') return '< 1 second';
    return '~50 seconds (20 + 15 + 15)';
  }

  function draw() {
    const ss = stateSet();

    containerEl.innerHTML = `
      <div style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:#c8ffc8;background:#0a0a0f;border:1px solid #1f2937;border-radius:8px;padding:18px;">

        <!-- Variant selector -->
        <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;">
          ${[['stp','802.1D Classic STP'],['rstp','802.1w RSTP'],['portfast','PortFast (edge)']].map(([v,label]) => `
            <button class="stp-var" data-var="${v}" style="
              padding:5px 14px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.7rem;
              background:${variant===v?'rgba(34,197,94,0.12)':'transparent'};
              border:1px solid ${variant===v?'rgba(34,197,94,0.4)':'#374151'};
              color:${variant===v?'#22c55e':'#6b7280'};">${label}</button>`).join('')}
        </div>

        <!-- Timeline bar -->
        <div style="margin-bottom:8px;font-size:0.62rem;color:#6b7280;">PORT STATE TIMELINE — click a segment for details</div>
        <div style="display:flex;gap:2px;height:44px;border-radius:6px;overflow:hidden;margin-bottom:6px;cursor:pointer;">
          ${ss.map((s, i) => `
            <div class="stp-seg" data-idx="${i}" style="
              flex:${s.timer.includes('∞') ? 2 : 1};
              background:${selected === i ? s.color + '33' : s.dim};
              border:2px solid ${selected === i ? s.color : 'transparent'};
              display:flex;flex-direction:column;align-items:center;justify-content:center;
              transition:all .2s;font-size:0.6rem;font-weight:700;color:${s.color};
              border-radius:${i===0?'6px 0 0 6px':i===ss.length-1?'0 6px 6px 0':'0'};">
              <div>${s.name}</div>
              <div style="font-size:0.55rem;opacity:0.8;font-weight:400;color:#9ca3af;">${s.timer}</div>
            </div>`).join('')}
        </div>

        <!-- Timer markers -->
        <div style="display:flex;gap:2px;margin-bottom:16px;">
          ${ss.map(s => `<div style="flex:${s.timer.includes('∞') ? 2 : 1};font-size:0.58rem;text-align:center;color:#4b5563;">${s.learns ? '📚 learns' : '—'} ${s.forwards ? '📤 fwds' : ''}</div>`).join('')}
        </div>

        <!-- State detail panel -->
        <div id="stp-detail" style="background:#0d1117;border:1px solid #1e2733;border-radius:6px;padding:14px;margin-bottom:14px;min-height:80px;">
          ${selected !== null ? `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <span style="font-weight:700;font-size:0.75rem;color:${ss[selected].color};">${ss[selected].name}</span>
              <span style="font-size:0.62rem;color:#6b7280;background:#1f2937;border-radius:3px;padding:1px 8px;">${ss[selected].timer}</span>
              <span style="font-size:0.62rem;color:#9ca3af;margin-left:4px;">Role: ${ss[selected].role}</span>
            </div>
            <div style="font-size:0.7rem;color:#8b949e;line-height:1.6;">${ss[selected].detail}</div>
            <div style="display:flex;gap:10px;margin-top:8px;font-size:0.62rem;">
              <span style="color:${ss[selected].learns ? '#22c55e' : '#6b7280'};">${ss[selected].learns ? '✓ Learns MACs' : '✗ No MAC learning'}</span>
              <span style="color:${ss[selected].forwards ? '#22c55e' : '#6b7280'};">${ss[selected].forwards ? '✓ Forwards data' : '✗ No data forwarding'}</span>
            </div>
          ` : `<div style="color:#4b5563;text-align:center;padding:12px;">Click a state segment above to see details.</div>`}
        </div>

        <!-- Convergence summary -->
        <div style="background:#0a1a0a;border:1px solid #1a3a1a;border-radius:6px;padding:10px;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:0.68rem;color:#6b7280;">Total convergence time:</span>
          <span style="font-size:0.75rem;font-weight:700;color:${variant === 'portfast' ? '#22c55e' : variant === 'rstp' ? '#4ade80' : '#f59e0b'};">${totalTime()}</span>
        </div>

        ${variant === 'stp' ? `
        <div style="margin-top:10px;font-size:0.65rem;color:#6b7280;line-height:1.5;">
          <span style="color:#9ca3af;">Key timers:</span> Hello=2s · Max Age=20s · Forward Delay=15s<br/>
          Worst-case: 20 (Blocking) + 15 (Listening) + 15 (Learning) = 50s
        </div>` : ''}
        ${variant === 'rstp' ? `
        <div style="margin-top:10px;font-size:0.65rem;color:#6b7280;line-height:1.5;">
          RSTP uses Proposal/Agreement handshake on point-to-point links — no timer delays.<br/>
          <span style="color:#9ca3af;">Backward compatible</span>: falls back to 802.1D on legacy ports.
        </div>` : ''}
        ${variant === 'portfast' ? `
        <div style="margin-top:10px;font-size:0.65rem;color:#ef4444;line-height:1.5;">
          ⚠ PortFast must only be used on edge ports (connected to end devices). Enabling it on ' +
          'a switch-to-switch link bypasses loop prevention and causes a spanning tree failure.</div>` : ''}
      </div>`;

    containerEl.querySelectorAll('.stp-var').forEach(btn =>
      btn.addEventListener('click', () => { variant = btn.dataset.var; selected = null; draw(); }));
    containerEl.querySelectorAll('.stp-seg').forEach(seg =>
      seg.addEventListener('click', () => {
        const idx = parseInt(seg.dataset.idx);
        selected = selected === idx ? null : idx;
        draw();
      }));
  }

  draw();
}
