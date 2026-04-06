/**
 * Ethernet Frame — Field-by-field visual with byte widths and click-to-expand detail.
 */

const FIELDS = [
  {
    name: 'Preamble', bytes: '7B', color: '#6b7280',
    desc: 'Seven bytes of alternating 1s and 0s (10101010…). Allows the receiver\'s clock to synchronise with the sender\'s clock before data arrives.',
    tip: 'Not usually shown in Wireshark — the NIC strips it before handing the frame to the OS.',
  },
  {
    name: 'SFD', bytes: '1B', color: '#9ca3af',
    desc: 'Start Frame Delimiter (10101011). The last byte of the preamble pattern with the final two bits flipped to signal "frame starts now".',
    tip: 'SFD marks the boundary between synchronisation and actual frame content.',
  },
  {
    name: 'Dst MAC', bytes: '6B', color: '#c084fc',
    desc: 'Destination MAC address (48 bits). Can be unicast (specific device), multicast (group), or broadcast (FF:FF:FF:FF:FF:FF).',
    tip: 'Layer 2 addressing. Switches use this field to forward frames. If the MSB of the first octet is 1, it\'s a multicast/broadcast.',
  },
  {
    name: 'Src MAC', bytes: '6B', color: '#a78bfa',
    desc: 'Source MAC address (48 bits). Always a unicast address — a frame cannot be sent "from" a multicast/broadcast address.',
    tip: 'Switches learn source MACs to build their MAC address table (CAM table).',
  },
  {
    name: '802.1Q Tag', bytes: '4B', color: '#fbbf24',
    desc: 'Optional VLAN tag (inserted by a switch on trunk ports). Contains: TPID (0x8100), PCP (3-bit priority), DEI (1-bit drop eligible), VID (12-bit VLAN ID 1–4094).',
    tip: 'Only present on trunk ports. Access ports strip the tag before forwarding to end devices. 12-bit VID = 4096 possible VLANs (0 and 4095 reserved).',
    optional: true,
  },
  {
    name: 'EtherType / Length', bytes: '2B', color: '#34d399',
    desc: 'If ≥ 0x0600 (1536): EtherType identifying the Layer 3 protocol (0x0800=IPv4, 0x86DD=IPv6, 0x0806=ARP). If < 0x0600: indicates the payload length (IEEE 802.3 format).',
    tip: 'Cisco exam questions: 0x0800 = IPv4, 0x86DD = IPv6, 0x0806 = ARP. Memorise these three.',
  },
  {
    name: 'Payload (Data)', bytes: '46–1500B', color: '#4ade80',
    desc: 'The encapsulated Layer 3 packet (IP packet) or other upper-layer data. Minimum 46 bytes — if the data is smaller, it is padded to meet the minimum frame size of 64 bytes.',
    tip: 'MTU = 1500 bytes (payload). Maximum frame size = 1518 bytes (without 802.1Q) or 1522 bytes (with tag). Jumbo frames extend this.',
  },
  {
    name: 'FCS', bytes: '4B', color: '#f87171',
    desc: 'Frame Check Sequence — a 32-bit CRC calculated over the destination MAC through payload. The receiver recalculates and compares; mismatch = frame discarded.',
    tip: 'FCS detects errors but does NOT correct them. If corrupt, the frame is silently dropped — no retransmission at Layer 2 (that\'s TCP\'s job).',
  },
];

export function render(containerEl) {
  let selected = null;
  let mode = 'view'; // 'view' | 'challenge'

  function draw() {
    const sel = selected !== null ? FIELDS[selected] : null;

    containerEl.innerHTML = `
      <div style="font-family:'JetBrains Mono',monospace;font-size:0.78rem;color:#c8ffc8;">

        <!-- Mode toggle -->
        <div style="display:flex;gap:8px;margin-bottom:16px;">
          ${['view','challenge'].map(m => `
            <button class="eth-mode-btn" data-mode="${m}" style="
              padding:6px 16px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.72rem;
              background:${mode===m?'rgba(0,255,65,0.15)':'transparent'};
              border:1px solid ${mode===m?'rgba(0,255,65,0.4)':'rgba(0,255,65,0.15)'};
              color:${mode===m?'#00ff41':'#6a9a6a'};
            ">${m === 'view' ? 'Frame Explorer' : 'EtherType Challenge'}</button>`).join('')}
        </div>

        ${mode === 'view' ? `
          <p style="color:#6a9a6a;font-size:0.72rem;margin-bottom:14px;">
            Click any field to see its purpose and exam tips. The 802.1Q tag is optional (trunk ports only).
          </p>

          <!-- Frame visual -->
          <div style="overflow-x:auto;margin-bottom:16px;">
            <div style="display:flex;min-width:600px;border:1px solid rgba(0,255,65,0.15);border-radius:4px;overflow:hidden;">
              ${FIELDS.map((f, i) => `
                <button class="eth-field" data-idx="${i}" style="
                  flex:${f.bytes.includes('1500') ? 4 : f.bytes.includes('6B') ? 2 : 1};
                  min-width:${f.bytes.includes('1500') ? '90px' : '50px'};
                  padding:8px 4px;text-align:center;cursor:pointer;
                  font-family:inherit;font-size:0.62rem;
                  background:${selected === i ? f.color + '33' : f.optional ? f.color + '10' : f.color + '18'};
                  border:none;border-right:1px solid rgba(0,0,0,0.3);
                  color:${f.color};
                  outline:${selected === i ? '2px solid ' + f.color : 'none'};
                  outline-offset:-2px;
                  transition:all 0.15s;
                ">
                  <div style="font-weight:600;font-size:0.58rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${f.name}</div>
                  <div style="color:${f.color}99;font-size:0.55rem;margin-top:2px;">${f.bytes}</div>
                  ${f.optional ? '<div style="font-size:0.5rem;color:#fbbf24;margin-top:1px;">(opt)</div>' : ''}
                </button>`).join('')}
            </div>
          </div>

          <!-- Byte ruler -->
          <div style="display:flex;align-items:center;gap:8px;font-size:0.62rem;color:#374151;margin-bottom:16px;">
            <span>Total frame: 64–1518 bytes (standard) · 64–1522 bytes (with 802.1Q)</span>
          </div>

          <!-- Detail panel -->
          ${sel ? `
          <div style="background:#0d0d0d;border:1px solid ${sel.color}33;border-radius:6px;padding:14px;">
            <div style="color:${sel.color};font-weight:700;font-size:0.88rem;margin-bottom:10px;">
              ${sel.name} <span style="font-size:0.7rem;color:#6b7280;font-weight:400;">(${sel.bytes})</span>
              ${sel.optional ? '<span style="font-size:0.62rem;color:#fbbf24;margin-left:6px;">optional · 802.1Q only</span>' : ''}
            </div>
            <p style="color:#d1d5db;font-size:0.72rem;line-height:1.6;margin-bottom:10px;">${sel.desc}</p>
            <div style="padding:8px 12px;background:rgba(251,191,36,0.05);border-left:2px solid #fbbf24;font-size:0.7rem;color:#fcd34d;line-height:1.5;">
              💡 ${sel.tip}
            </div>
          </div>` : `
          <div style="padding:14px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:6px;text-align:center;color:#374151;font-size:0.72rem;">
            ← Click a field above to see details
          </div>`}

          <!-- EtherType quick ref -->
          <div style="margin-top:14px;padding:10px;background:#0a0a0a;border-radius:4px;font-size:0.68rem;">
            <div style="color:#6b7280;margin-bottom:6px;">Common EtherType values</div>
            <div style="display:grid;grid-template-columns:auto auto 1fr;gap:4px 16px;">
              ${[['0x0800','IPv4','IP packets'],['0x86DD','IPv6','IPv6 packets'],['0x0806','ARP','Address Resolution'],['0x8100','802.1Q','VLAN-tagged frame'],['0x8847','MPLS','MPLS unicast']].map(([hex, proto, desc]) => `
                <span style="color:#fbbf24;">${hex}</span>
                <span style="color:#93c5fd;">${proto}</span>
                <span style="color:#4b5563;">${desc}</span>`).join('')}
            </div>
          </div>
        ` : `
          <div id="eth-pane-challenge">
            <p style="color:#6a9a6a;margin-bottom:12px;font-size:0.72rem;">
              Drag each hex EtherType value onto its corresponding Layer 3 protocol.
            </p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">
              <!-- Slots -->
              <div id="eth-slots" style="display:flex;flex-direction:column;gap:4px;">
                ${[
                  { id: 'ipv4', label: 'IPv4', hex: '0x0800' },
                  { id: 'ipv6', label: 'IPv6', hex: '0x86DD' },
                  { id: 'arp',  label: 'ARP',  hex: '0x0806' },
                  { id: '8021q',label: '802.1Q', hex: '0x8100' },
                  { id: 'mpls', label: 'MPLS', hex: '0x8847' }
                ].map(s => `
                  <div class="eth-slot" data-hex="${s.hex}" style="
                    display:flex;align-items:center;height:38px;padding:0 12px;
                    border:1px dashed rgba(0,255,65,0.25);border-radius:4px;background:rgba(0,0,0,0.2);
                  ">
                    <span style="color:#6b7280;font-size:0.65rem;font-weight:700;width:54px;">${s.label}</span>
                    <div class="slot-content" style="flex:1;height:100%;"></div>
                  </div>
                `).join('')}
              </div>
              <!-- Pool -->
              <div style="display:flex;flex-direction:column;gap:8px;">
                <div id="eth-pool" style="flex:1;min-height:100px;display:flex;flex-direction:column;gap:4px;padding:8px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:6px;"></div>
                <button id="eth-check-btn" style="width:100%;padding:10px;background:#00ff41;color:#000;font-weight:700;border-radius:4px;border:none;cursor:pointer;">Check Answers</button>
              </div>
            </div>
            <div id="eth-fb" class="hidden text-center font-bold text-sm"></div>
          </div>
        `}
      </div>`;

    if (mode === 'view') {
      containerEl.querySelectorAll('.eth-field').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx);
          selected = selected === idx ? null : idx;
          draw();
        });
      });
    } else {
      initEtherTypeChallenge();
    }

    containerEl.querySelectorAll('.eth-mode-btn').forEach(btn => {
      btn.onclick = () => { mode = btn.dataset.mode; selected = null; draw(); };
    });
  }

  function initEtherTypeChallenge() {
    const pool = containerEl.querySelector('#eth-pool');
    const slots = containerEl.querySelectorAll('.eth-slot');
    const fb = containerEl.querySelector('#eth-fb');
    const checkBtn = containerEl.querySelector('#eth-check-btn');

    const types = ['0x0800', '0x86DD', '0x0806', '0x8100', '0x8847'].sort(() => Math.random() - 0.5);
    types.forEach(hex => {
      const tile = document.createElement('div');
      tile.className = 'eth-tile';
      tile.textContent = hex;
      tile.dataset.hex = hex;
      tile.style = `padding:6px 12px;background:#1a1a1a;border:1px solid rgba(251,191,36,0.3);border-radius:4px;color:#fbbf24;font-weight:700;cursor:grab;touch-action:none;user-select:none;font-size:0.7rem;text-align:center;`;
      pool.appendChild(tile);

      let isDragging = false, sx, sy;
      tile.onpointerdown = e => { isDragging = true; sx = e.clientX; sy = e.clientY; tile.setPointerCapture(e.pointerId); tile.style.zIndex = 1000; tile.style.cursor = 'grabbing'; };
      tile.onpointermove = e => { if (!isDragging) return; tile.style.transform = `translate(${e.clientX - sx}px, ${e.clientY - sy}px)`; };
      tile.onpointerup = e => {
        if (!isDragging) return; isDragging = false; tile.releasePointerCapture(e.pointerId); tile.style.zIndex = ''; tile.style.cursor = 'grab'; tile.style.transform = '';
        const rect = tile.getBoundingClientRect();
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        let dropped = false;
        slots.forEach(s => {
          const sr = s.getBoundingClientRect();
          if (cx >= sr.left && cx <= sr.right && cy >= sr.top && cy <= sr.bottom && !s.querySelector('.slot-content').hasChildNodes()) {
            s.querySelector('.slot-content').appendChild(tile); dropped = true;
          }
        });
        if (!dropped) pool.appendChild(tile);
      };
    });

    checkBtn.onclick = () => {
      let correct = 0;
      slots.forEach(s => {
        const t = s.querySelector('.eth-tile');
        if (t && t.dataset.hex === s.dataset.hex) { correct++; s.style.borderColor = '#00ff41'; }
        else s.style.borderColor = '#ff4444';
      });
      fb.classList.remove('hidden');
      if (correct === 5) {
        fb.innerHTML = '<span style="color:#00ff41;">✅ Master of EtherTypes! +40 XP</span>';
        document.dispatchEvent(new CustomEvent('ccna-xp', { detail: { amount: 40, reason: 'EtherType Challenge' } }));
      } else fb.innerHTML = `<span style="color:#ffb000;">${correct}/5 correct. Keep studying!</span>`;
    };
  }

  draw();
}
