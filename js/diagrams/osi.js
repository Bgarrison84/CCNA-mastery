/**
 * OSI Model — Interactive 7-layer diagram.
 * Click any layer to expand inline detail (PDU, protocols, exam tip).
 */

const LAYERS = [
  {
    num: 7, name: 'Application', color: '#4ade80',
    pdu: 'Data', abbr: 'Data',
    protocols: 'HTTP, HTTPS, FTP, SSH, DNS, SMTP, SNMP, Telnet',
    what: 'Provides network services directly to end-user applications.',
    tip: 'If the question mentions a specific application protocol (HTTP, DNS, FTP), it\'s always Layer 7.',
  },
  {
    num: 6, name: 'Presentation', color: '#a3e635',
    pdu: 'Data', abbr: 'Data',
    protocols: 'SSL/TLS, JPEG, MPEG, GIF, ASCII, EBCDIC',
    what: 'Translates data formats, handles encryption/decryption and compression.',
    tip: 'SSL/TLS encryption lives here. Think: "translator" between application data formats.',
  },
  {
    num: 5, name: 'Session', color: '#facc15',
    pdu: 'Data', abbr: 'Data',
    protocols: 'NetBIOS, RPC, SQL session, NFS',
    what: 'Establishes, manages, and terminates communication sessions.',
    tip: 'The least-tested layer on CCNA. Think: "dialog control" — keeps conversations organised.',
  },
  {
    num: 4, name: 'Transport', color: '#fb923c',
    pdu: 'Segment (TCP) / Datagram (UDP)', abbr: 'Segment',
    protocols: 'TCP, UDP',
    what: 'End-to-end delivery, port numbers, flow control, reliability (TCP) or speed (UDP).',
    tip: 'Port numbers live here. TCP = reliable (3-way handshake). UDP = fast, no guarantees. Know both.',
  },
  {
    num: 3, name: 'Network', color: '#f87171',
    pdu: 'Packet', abbr: 'Packet',
    protocols: 'IP (IPv4/IPv6), ICMP, OSPF, EIGRP, BGP',
    what: 'Logical addressing (IP addresses) and routing between networks.',
    tip: 'Routers operate here. IP addresses = Layer 3 addresses. "ping" uses ICMP at Layer 3.',
  },
  {
    num: 2, name: 'Data Link', color: '#c084fc',
    pdu: 'Frame', abbr: 'Frame',
    protocols: 'Ethernet (802.3), 802.11 Wi-Fi, PPP, ARP, HDLC',
    what: 'Physical (MAC) addressing, framing, error detection (FCS), media access.',
    tip: 'Switches operate here. MAC addresses = Layer 2. ARP resolves IP→MAC at this layer.',
  },
  {
    num: 1, name: 'Physical', color: '#67e8f9',
    pdu: 'Bit', abbr: 'Bit',
    protocols: 'Copper (UTP/STP), Fiber (MMF/SMF), Wireless signals, Hubs',
    what: 'Transmits raw bits over the physical medium.',
    tip: 'Hubs operate here (all ports in one collision domain). Cables, connectors, voltages.',
  },
];

const TCP_IP = [
  { name: 'Application', osi: '5, 6, 7', color: '#4ade80' },
  { name: 'Transport',   osi: '4',       color: '#fb923c' },
  { name: 'Internet',    osi: '3',       color: '#f87171' },
  { name: 'Network Access', osi: '1, 2', color: '#c084fc' },
];

export function render(containerEl) {
  const G = 'var(--terminal-green, #00ff41)';

  containerEl.innerHTML = `
    <div style="font-family:'JetBrains Mono',monospace;font-size:0.78rem;color:#c8ffc8;">

      <!-- Header tabs -->
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
        <button class="osi-tab active-tab" data-tab="osi" style="
          padding:6px 16px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.72rem;
          background:rgba(0,255,65,0.15);border:1px solid rgba(0,255,65,0.4);color:#00ff41;">
          OSI Model
        </button>
        <button class="osi-tab" data-tab="tcpip" style="
          padding:6px 16px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.72rem;
          background:transparent;border:1px solid rgba(0,255,65,0.15);color:#6a9a6a;">
          TCP/IP Model
        </button>
        <button class="osi-tab" data-tab="trouble" style="
          padding:6px 16px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.72rem;
          background:transparent;border:1px solid rgba(0,255,65,0.15);color:#6a9a6a;">
          Troubleshooting
        </button>
        <button class="osi-tab" data-tab="challenge" style="
          padding:6px 16px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.72rem;
          background:transparent;border:1px solid rgba(0,255,65,0.15);color:#6a9a6a;">
          Challenge Mode
        </button>
      </div>

      <div id="osi-pane-osi">
        <p style="color:#6a9a6a;margin-bottom:12px;font-size:0.72rem;">
          Click any layer to expand details. Encapsulation adds headers going down; decapsulation removes them going up.
        </p>
        ${LAYERS.map(l => `
          <div class="osi-row" data-layer="${l.num}" style="
            margin-bottom:3px;border-radius:4px;overflow:hidden;
            border:1px solid rgba(255,255,255,0.06);cursor:pointer;
          ">
            <div class="osi-header" style="
              display:flex;align-items:center;gap:10px;padding:12px;
              background:rgba(255,255,255,0.03);
              transition:background 0.15s;
            ">
              <span style="
                background:${l.color}22;border:1px solid ${l.color}55;
                color:${l.color};font-weight:700;font-size:0.7rem;
                padding:2px 8px;border-radius:3px;min-width:28px;text-align:center;
              ">L${l.num}</span>
              <span style="color:#e2e8f0;font-weight:600;min-width:110px;">${l.name}</span>
              <span style="color:#4b5563;margin:0 8px;">│</span>
              <span style="color:#6b7280;font-size:0.7rem;">PDU: </span>
              <span style="color:#9ca3af;font-size:0.7rem;font-style:italic;">${l.abbr}</span>
              <span style="margin-left:auto;color:#374151;font-size:0.65rem;">▶</span>
            </div>
            <div class="osi-detail hidden" style="
              padding:12px 16px;background:#0d0d0d;
              border-top:1px solid rgba(255,255,255,0.05);
            ">
              <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 16px;font-size:0.72rem;">
                <span style="color:#6b7280;">PDU</span>
                <span style="color:#d1d5db;">${l.pdu}</span>
                <span style="color:#6b7280;">Protocols</span>
                <span style="color:#93c5fd;">${l.protocols}</span>
                <span style="color:#6b7280;">Function</span>
                <span style="color:#d1d5db;">${l.what}</span>
                <span style="color:#6b7280;">Exam tip</span>
                <span style="color:#fbbf24;">${l.tip}</span>
              </div>
            </div>
          </div>`).join('')}
        <div style="margin-top:12px;font-size:0.68rem;color:#374151;text-align:center;">
          Data flow: Application → Physical (encapsulation) · Physical → Application (decapsulation)
        </div>
      </div>

      <div id="osi-pane-tcpip" class="hidden">
        <p style="color:#6a9a6a;margin-bottom:12px;font-size:0.72rem;">
          TCP/IP maps to the OSI model. The exam uses both — know which OSI layers correspond to each TCP/IP layer.
        </p>
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;">
          <div style="flex:1;min-width:180px;">
            <div style="color:#6b7280;font-size:0.65rem;margin-bottom:6px;letter-spacing:0.08em;">TCP/IP (4 layers)</div>
            ${TCP_IP.map(l => `
              <div style="
                padding:12px;margin-bottom:4px;border-radius:4px;
                background:${l.color}18;border:1px solid ${l.color}33;
                color:${l.color};font-weight:600;font-size:0.8rem;
              ">${l.name}</div>`).join('')}
          </div>
          <div style="display:flex;flex-direction:column;justify-content:space-around;padding:6px 0;color:#374151;font-size:1.2rem;">
            ${TCP_IP.map(() => '↔').join('<br style="margin:6px 0;">')}
          </div>
          <div style="flex:1;min-width:180px;">
            <div style="color:#6b7280;font-size:0.65rem;margin-bottom:6px;letter-spacing:0.08em;">OSI (7 layers)</div>
            ${LAYERS.map(l => `
              <div style="
                padding:8px 12px;margin-bottom:3px;border-radius:4px;
                background:${l.color}12;border:1px solid ${l.color}25;
                color:${l.color};font-size:0.72rem;
              ">L${l.num} ${l.name}</div>`).join('')}
          </div>
        </div>
      </div>

      <div id="osi-pane-trouble" class="hidden">
        <p style="color:#6a9a6a;margin-bottom:16px;font-size:0.72rem;">
          Three approaches used in real troubleshooting. CCNA expects you to recognise each.
        </p>
        ${[
          { name: 'Top-Down', icon: '⬇', layers: 'L7→L1', desc: 'Start at the application. Does the app have an issue? Then move down through the stack.', use: 'Useful when the issue seems app-level (e.g. website loads but some features broken).' },
          { name: 'Bottom-Up', icon: '⬆', layers: 'L1→L7', desc: 'Start at the physical layer. Is the cable plugged in? Link up? Then move up.', use: 'Useful when you suspect a hardware or connectivity issue (e.g. no link light).' },
          { name: 'Divide and Conquer', icon: '↕', layers: 'Any layer', desc: 'Start at a middle layer (usually L3 with ping). Work outward from there.', use: 'Most efficient for experienced engineers — reduces troubleshooting time by half.' },
        ].map(a => `
          <div style="margin-bottom:12px;padding:14px;background:#0d0d0d;border:1px solid rgba(0,255,65,0.1);border-radius:6px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <span style="font-size:1.2rem;">${a.icon}</span>
              <span style="font-weight:700;color:#e2e8f0;">${a.name}</span>
              <span style="font-size:0.65rem;color:#4b5563;margin-left:auto;">${a.layers}</span>
            </div>
            <p style="color:#9ca3af;font-size:0.72rem;margin-bottom:6px;">${a.desc}</p>
            <p style="color:#6b7280;font-size:0.68rem;font-style:italic;">${a.use}</p>
          </div>`).join('')}
      </div>

      <div id="osi-pane-challenge" class="hidden">
        <p style="color:#6a9a6a;margin-bottom:12px;font-size:0.72rem;">
          Drag the layers from the pool into the correct order (Layer 7 at the top, Layer 1 at the bottom).
        </p>
        
        <div style="display:flex;gap:20px;flex-wrap:wrap;">
          <!-- Drop Slots -->
          <div id="osi-slots" style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px;">
            ${[7,6,5,4,3,2,1].map(n => `
              <div class="osi-slot" data-num="${n}" style="
                height:38px;border:1px dashed rgba(0,255,65,0.2);border-radius:4px;
                display:flex;align-items:center;padding:0 12px;position:relative;
                background:rgba(0,0,0,0.2);
              ">
                <span style="color:#2a4a2a;font-size:0.65rem;font-weight:700;width:24px;">L${n}</span>
                <div class="slot-content" style="flex:1;height:100%;"></div>
              </div>
            `).join('')}
          </div>

          <!-- Drag Pool -->
          <div style="flex:1;min-width:200px;">
            <div id="osi-pool" style="display:flex;flex-direction:column;gap:4px;padding:8px;background:rgba(255,255,255,0.02);border-radius:6px;border:1px solid rgba(255,255,255,0.05);">
              <!-- Tiles injected by JS -->
            </div>
            <button id="osi-check-btn" style="
              margin-top:16px;width:100%;padding:10px;border-radius:4px;
              background:#00ff41;color:#000;font-weight:700;font-size:0.75rem;
              cursor:pointer;border:none;transition:transform 0.1s;
            ">Validate Order</button>
            <div id="osi-challenge-feedback" class="hidden" style="margin-top:12px;font-size:0.72rem;text-align:center;"></div>
          </div>
        </div>
      </div>
    </div>`;

  // Tab switching
  containerEl.querySelectorAll('.osi-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      containerEl.querySelectorAll('.osi-tab').forEach(b => {
        b.style.background = 'transparent';
        b.style.borderColor = 'rgba(0,255,65,0.15)';
        b.style.color = '#6a9a6a';
      });
      btn.style.background = 'rgba(0,255,65,0.15)';
      btn.style.borderColor = 'rgba(0,255,65,0.4)';
      btn.style.color = '#00ff41';
      ['osi','tcpip','trouble','challenge'].forEach(t => {
        containerEl.querySelector(`#osi-pane-${t}`)?.classList.toggle('hidden', t !== btn.dataset.tab);
      });
      if (btn.dataset.tab === 'challenge') initChallenge();
    });
  });

  function initChallenge() {
    const pool  = containerEl.querySelector('#osi-pool');
    const slots = containerEl.querySelectorAll('.osi-slot');
    const checkBtn = containerEl.querySelector('#osi-check-btn');
    const feedback = containerEl.querySelector('#osi-challenge-feedback');

    // Reset
    pool.innerHTML = '';
    slots.forEach(s => s.querySelector('.slot-content').innerHTML = '');
    feedback.classList.add('hidden');

    const shuffled = [...LAYERS].sort(() => Math.random() - 0.5);
    shuffled.forEach(l => {
      const tile = document.createElement('div');
      tile.className = 'osi-tile';
      tile.dataset.num = l.num;
      tile.style = `
        padding:8px 12px;border-radius:4px;background:#1a1a1a;
        border:1px solid ${l.color}44;color:${l.color};font-size:0.75rem;
        cursor:grab;user-select:none;touch-action:none;font-weight:600;
      `;
      tile.textContent = l.name;
      pool.appendChild(tile);

      // Drag logic
      let isDragging = false;
      let startX, startY;
      let originalParent = pool;

      tile.addEventListener('pointerdown', e => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        tile.setPointerCapture(e.pointerId);
        tile.style.zIndex = 1000;
        tile.style.cursor = 'grabbing';
      });

      tile.addEventListener('pointermove', e => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        tile.style.transform = `translate(${dx}px, ${dy}px)`;
      });

      tile.addEventListener('pointerup', e => {
        if (!isDragging) return;
        isDragging = false;
        tile.releasePointerCapture(e.pointerId);
        tile.style.zIndex = '';
        tile.style.cursor = 'grab';
        tile.style.transform = '';

        // Check drop
        const rect = tile.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let dropped = false;
        slots.forEach(slot => {
          const sRect = slot.getBoundingClientRect();
          if (centerX >= sRect.left && centerX <= sRect.right &&
              centerY >= sRect.top && centerY <= sRect.bottom) {
            const content = slot.querySelector('.slot-content');
            if (!content.hasChildNodes()) {
              content.appendChild(tile);
              dropped = true;
            }
          }
        });

        if (!dropped) pool.appendChild(tile);
      });
    });

    checkBtn.onclick = () => {
      let correct = 0;
      slots.forEach(slot => {
        const tile = slot.querySelector('.osi-tile');
        if (tile && tile.dataset.num == slot.dataset.num) {
          correct++;
          slot.style.borderColor = 'rgba(0,255,65,0.6)';
        } else {
          slot.style.borderColor = 'rgba(255,65,65,0.6)';
        }
      });

      feedback.classList.remove('hidden');
      if (correct === 7) {
        feedback.innerHTML = '<span style="color:#00ff41;font-weight:700;">✅ Perfect! All layers in order. +50 XP</span>';
        // Dispatch XP event for main store
        document.dispatchEvent(new CustomEvent('ccna-xp', { detail: { amount: 50, reason: 'OSI Challenge' } }));
      } else {
        feedback.innerHTML = `<span style="color:#ffb000;">${correct}/7 correct. Keep trying!</span>`;
      }
    };
  }

  // Layer expand/collapse
  containerEl.querySelectorAll('.osi-row').forEach(row => {
    row.addEventListener('click', () => {
      const detail = row.querySelector('.osi-detail');
      const caret  = row.querySelector('.osi-header span:last-child');
      const open   = !detail.classList.contains('hidden');
      detail.classList.toggle('hidden', open);
      if (caret) caret.textContent = open ? '▶' : '▼';
      row.querySelector('.osi-header').style.background = open
        ? 'rgba(255,255,255,0.03)' : 'rgba(0,255,65,0.04)';
    });
  });
}
