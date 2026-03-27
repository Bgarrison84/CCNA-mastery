/**
 * STP State Machine — Click any state to see timers, transitions, and exam tips.
 */

const STATES = [
  {
    id: 'blocking', name: 'Blocking', color: '#f87171',
    timer: '20s (Max Age)',
    does: 'Receives BPDUs. Does NOT forward user frames, learn MACs, or send BPDUs.',
    enter: 'All ports start here. Non-designated / non-root ports stay here.',
    exit: 'Root port or designated port election → moves to Listening.',
    tip: 'Blocking prevents loops. The port is alive but silent on user traffic.',
  },
  {
    id: 'listening', name: 'Listening', color: '#fb923c',
    timer: '15s (Forward Delay)',
    does: 'Sends/receives BPDUs. Does NOT forward user frames or learn MACs.',
    enter: 'Port wins election as root or designated port.',
    exit: 'Forward delay expires → moves to Learning.',
    tip: 'Still no user traffic. The switch is deciding if this port should forward.',
  },
  {
    id: 'learning', name: 'Learning', color: '#facc15',
    timer: '15s (Forward Delay)',
    does: 'Sends/receives BPDUs. Learns source MACs. Does NOT forward user frames.',
    enter: 'After Listening forward delay.',
    exit: 'Forward delay expires → moves to Forwarding.',
    tip: 'MAC table is being built silently. Still no user traffic flow.',
  },
  {
    id: 'forwarding', name: 'Forwarding', color: '#4ade80',
    timer: 'Indefinite (until topology change)',
    does: 'Fully operational: forwards frames, learns MACs, sends/receives BPDUs.',
    enter: 'After Learning forward delay.',
    exit: 'BPDU received indicating a better path, or link failure → back to Blocking.',
    tip: 'This is the goal. Root ports and designated ports reach Forwarding. Total convergence time from Blocking = 30–50s (without PortFast).',
  },
  {
    id: 'disabled', name: 'Disabled', color: '#6b7280',
    timer: 'N/A',
    does: 'Port is administratively shut down. No STP participation.',
    enter: 'Administrator issues "shutdown" on the interface.',
    exit: 'Administrator issues "no shutdown".',
    tip: 'Not part of the STP state machine — just shown for completeness.',
  },
];

const VARIANTS = [
  { name: 'STP (802.1D)', conv: '30–50s', notes: 'Original. 1 tree for all VLANs.' },
  { name: 'RSTP (802.1w)', conv: '<1s', notes: 'Rapid convergence. Replaces Listening/Learning with Discarding.' },
  { name: 'PVST+ (Cisco)', conv: '30–50s', notes: 'Per-VLAN STP. One tree per VLAN.' },
  { name: 'Rapid PVST+', conv: '<1s', notes: 'Per-VLAN RSTP. Default on modern Cisco switches.' },
  { name: 'MST (802.1s)', conv: '<1s', notes: 'Maps multiple VLANs to fewer tree instances.' },
];

export function render(containerEl) {
  let selected = 'forwarding';
  let tab = 'states';

  function draw() {
    const s = STATES.find(x => x.id === selected);

    containerEl.innerHTML = `
      <div style="font-family:'JetBrains Mono',monospace;font-size:0.78rem;color:#c8ffc8;">

        <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
          ${['states','variants','election'].map(t => `
            <button class="stp-tab" data-tab="${t}" style="
              padding:6px 14px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.72rem;
              background:${tab===t?'rgba(0,255,65,0.15)':'transparent'};
              border:1px solid ${tab===t?'rgba(0,255,65,0.4)':'rgba(0,255,65,0.15)'};
              color:${tab===t?'#00ff41':'#6a9a6a'};
            ">${t === 'states' ? 'Port States' : t === 'variants' ? 'STP Variants' : 'Root Election'}</button>`).join('')}
        </div>

        <div id="stp-pane-states" ${tab!=='states'?'style="display:none"':''}>
          <p style="color:#6a9a6a;font-size:0.72rem;margin-bottom:12px;">
            Click a port state to see its rules and timers.
          </p>
          <!-- State buttons -->
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">
            ${STATES.map(st => `
              <button class="stp-state" data-state="${st.id}" style="
                padding:7px 14px;border-radius:4px;cursor:pointer;
                font-family:inherit;font-size:0.75rem;font-weight:600;
                background:${st.color}${selected===st.id?'33':'15'};
                border:2px solid ${selected===st.id?st.color:st.color+'44'};
                color:${st.color};
                transition:all 0.15s;
              ">${st.name}</button>`).join('')}
          </div>

          <!-- State detail -->
          ${s ? `
          <div style="background:#0d0d0d;border:1px solid ${s.color}33;border-radius:6px;padding:16px;">
            <div style="color:${s.color};font-weight:700;font-size:0.9rem;margin-bottom:12px;">
              ${s.name} State
            </div>
            <div style="display:grid;gap:8px;font-size:0.72rem;">
              <div style="display:flex;gap:12px;">
                <span style="color:#6b7280;min-width:80px;">Timer</span>
                <span style="color:#fbbf24;">${s.timer}</span>
              </div>
              <div style="display:flex;gap:12px;">
                <span style="color:#6b7280;min-width:80px;">Does</span>
                <span style="color:#d1d5db;">${s.does}</span>
              </div>
              <div style="display:flex;gap:12px;">
                <span style="color:#6b7280;min-width:80px;">Enter when</span>
                <span style="color:#93c5fd;">${s.enter}</span>
              </div>
              <div style="display:flex;gap:12px;">
                <span style="color:#6b7280;min-width:80px;">Exit when</span>
                <span style="color:#86efac;">${s.exit}</span>
              </div>
              <div style="
                display:flex;gap:12px;padding:8px;
                background:rgba(251,191,36,0.06);border-left:2px solid #fbbf24;border-radius:2px;
              ">
                <span style="color:#fbbf24;min-width:80px;">💡 Exam tip</span>
                <span style="color:#fcd34d;">${s.tip}</span>
              </div>
            </div>
          </div>` : ''}

          <!-- Timeline -->
          <div style="margin-top:14px;padding:12px;background:#0a0a0a;border-radius:4px;font-size:0.68rem;">
            <div style="color:#6b7280;margin-bottom:6px;">STP Convergence Timeline (802.1D / PVST+)</div>
            <div style="display:flex;align-items:center;gap:0;overflow-x:auto;">
              ${[
                { label: 'Blocking', w: 20, color: '#f87171' },
                { label: 'Listening\n15s', w: 15, color: '#fb923c' },
                { label: 'Learning\n15s', w: 15, color: '#facc15' },
                { label: 'Forwarding', w: 50, color: '#4ade80' },
              ].map(p => `
                <div style="
                  flex:${p.w};min-width:60px;text-align:center;padding:6px 4px;
                  background:${p.color}18;border:1px solid ${p.color}33;
                  color:${p.color};font-size:0.65rem;white-space:pre-line;
                ">${p.label}</div>`).join('')}
            </div>
            <div style="color:#374151;margin-top:4px;">Total: 30–50 seconds to converge</div>
          </div>
        </div>

        <div id="stp-pane-variants" ${tab!=='variants'?'style="display:none"':''}>
          <div style="overflow-x:auto;">
            <table style="width:100%;font-size:0.72rem;border-collapse:collapse;">
              <thead>
                <tr>${['Variant','Convergence','Notes'].map(h=>`<th style="text-align:left;color:#6b7280;padding:6px 8px;border-bottom:1px solid #374151;">${h}</th>`).join('')}</tr>
              </thead>
              <tbody>
                ${VARIANTS.map((v,i) => `<tr style="border-bottom:1px solid #1f2937;">
                  <td style="padding:8px;color:#93c5fd;font-weight:600;">${v.name}</td>
                  <td style="padding:8px;color:${v.conv.includes('<1')?'#4ade80':'#fb923c'};">${v.conv}</td>
                  <td style="padding:8px;color:#9ca3af;">${v.notes}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <div style="margin-top:12px;padding:10px;background:rgba(251,191,36,0.05);border-left:2px solid #fbbf24;font-size:0.7rem;color:#fcd34d;">
            💡 Rapid PVST+ is the default on modern Cisco IOS switches. RSTP uses Discarding instead of Blocking/Listening.
          </div>
        </div>

        <div id="stp-pane-election" ${tab!=='election'?'style="display:none"':''}>
          ${[
            { step: '1', title: 'Elect Root Bridge', desc: 'Lowest Bridge ID wins. Bridge ID = Priority (4 bits) + System ID Extension (12 bits, = VLAN ID) + MAC address. Default priority = 32768. Lower is better.' },
            { step: '2', title: 'Elect Root Ports', desc: 'Each non-root switch selects the port with the lowest Root Path Cost (the cost to reach the root bridge). One root port per switch.' },
            { step: '3', title: 'Elect Designated Ports', desc: 'On each network segment, the port with the lowest path cost to the root becomes the designated port. One designated port per segment.' },
            { step: '4', title: 'Block Remaining Ports', desc: 'Any port that is neither a root port nor a designated port goes to Blocking. This eliminates loops.' },
          ].map(s => `
            <div style="display:flex;gap:14px;margin-bottom:14px;align-items:flex-start;">
              <div style="
                min-width:28px;height:28px;border-radius:50%;
                background:rgba(0,255,65,0.15);border:1px solid rgba(0,255,65,0.3);
                display:flex;align-items:center;justify-content:center;
                color:var(--terminal-green,#00ff41);font-weight:700;font-size:0.8rem;flex-shrink:0;
              ">${s.step}</div>
              <div>
                <div style="font-weight:700;color:#e2e8f0;margin-bottom:4px;">${s.title}</div>
                <div style="color:#9ca3af;font-size:0.72rem;line-height:1.6;">${s.desc}</div>
              </div>
            </div>`).join('')}
          <div style="padding:10px;background:rgba(251,191,36,0.05);border-left:2px solid #fbbf24;font-size:0.7rem;color:#fcd34d;">
            💡 Tiebreaker order: Lowest Bridge ID → Lowest Root Path Cost → Lowest Sender Bridge ID → Lowest Sender Port ID
          </div>
        </div>
      </div>`;

    containerEl.querySelectorAll('.stp-tab').forEach(btn => {
      btn.addEventListener('click', () => { tab = btn.dataset.tab; draw(); });
    });
    containerEl.querySelectorAll('.stp-state').forEach(btn => {
      btn.addEventListener('click', () => { selected = btn.dataset.state; draw(); });
    });
  }

  draw();
}
