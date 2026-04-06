/**
 * udp.js — Interactive UDP Diagram & Comparison
 */

const UDP_FIELDS = [
  { name: 'Source Port',      bits: 16, color: '#fbbf24', desc: 'Port of the sending application.' },
  { name: 'Destination Port', bits: 16, color: '#f59e0b', desc: 'Port of the receiving application.' },
  { name: 'Length',           bits: 16, color: '#34d399', desc: 'Length of the UDP header and data in bytes.' },
  { name: 'Checksum',         bits: 16, color: '#f87171', desc: 'Optional error checking for the header and data.' },
];

export function render(container) {
  let mode = 'compare'; // 'compare' | 'header'

  function draw() {
    container.innerHTML = `
      <div class="udp-diagram text-xs space-y-4 font-mono">
        <div class="flex gap-2 mb-4">
          <button class="udp-mode-btn px-3 py-1.5 rounded border ${mode === 'compare' ? 'bg-yellow-900/30 border-yellow-500 text-yellow-400' : 'border-gray-700 text-gray-500'}" data-mode="compare">UDP vs TCP</button>
          <button class="udp-mode-btn px-3 py-1.5 rounded border ${mode === 'header' ? 'bg-yellow-900/30 border-yellow-500 text-yellow-400' : 'border-gray-700 text-gray-500'}" data-mode="header">Header Builder</button>
        </div>

        ${mode === 'compare' ? renderCompare() : renderHeader()}
      </div>`;

    container.querySelectorAll('.udp-mode-btn').forEach(btn => {
      btn.onclick = () => { mode = btn.dataset.mode; draw(); };
    });
    
    if (mode === 'header') initHeaderChallenge();
  }

  function renderCompare() {
    return `
      <div class="grid grid-cols-2 gap-4">
        <div class="bg-cyan-950/20 border border-cyan-500/30 rounded p-3">
          <h3 class="text-cyan-400 font-bold mb-2">TCP (Transmission Control)</h3>
          <ul class="space-y-1 text-[10px] text-cyan-100/70">
            <li>• Connection-oriented</li>
            <li>• Guaranteed delivery (ACKs)</li>
            <li>• Retransmission of lost data</li>
            <li>• Flow control (Windowing)</li>
            <li>• Large header (20+ bytes)</li>
            <li class="text-cyan-400 mt-2 italic">Best for: Web, Email, FTP</li>
          </ul>
        </div>
        <div class="bg-yellow-950/20 border border-yellow-500/30 rounded p-3">
          <h3 class="text-yellow-400 font-bold mb-2">UDP (User Datagram)</h3>
          <ul class="space-y-1 text-[10px] text-yellow-100/70">
            <li>• Connectionless</li>
            <li>• Best-effort delivery</li>
            <li>• No retransmission (Fire & forget)</li>
            <li>• No flow control</li>
            <li>• Small header (8 bytes)</li>
            <li class="text-yellow-400 mt-2 italic">Best for: Voice, Video, DNS, DHCP</li>
          </ul>
        </div>
      </div>
      <div class="p-3 bg-black/40 rounded border border-gray-800 text-[11px] leading-relaxed text-gray-400">
        UDP is preferred for real-time applications because it lacks the overhead of TCP's reliability mechanisms. If a voice packet is lost, retransmitting it would cause a lag or jitter; it's better to just drop it.
      </div>`;
  }

  function renderHeader() {
    return `
      <div id="udp-header-pane">
        <p class="text-gray-500 mb-4">Build the 8-byte (64-bit) UDP header by dragging the correct fields into position.</p>
        
        <div class="grid grid-cols-2 gap-2 mb-6">
          ${[0,1,2,3].map(i => `
            <div class="udp-slot border border-dashed border-gray-700 h-12 rounded flex flex-col items-center justify-center bg-black/20" data-idx="${i}">
              <div class="text-[9px] text-gray-600 mb-1">Bits ${i*16}-${(i+1)*16 - 1}</div>
              <div class="slot-content w-full h-full flex items-center justify-center"></div>
            </div>
          `).join('')}
        </div>

        <div id="udp-pool" class="flex flex-wrap gap-2 p-3 bg-gray-900 rounded border border-gray-800 mb-4"></div>
        
        <button id="udp-check-btn" class="w-full py-2 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded">Validate Header</button>
        <div id="udp-fb" class="hidden text-center mt-4 font-bold"></div>
      </div>`;
  }

  function initHeaderChallenge() {
    const pool = container.querySelector('#udp-pool');
    const slots = container.querySelectorAll('.udp-slot');
    const fb = container.querySelector('#udp-fb');
    const checkBtn = container.querySelector('#udp-check-btn');

    const shuffled = [...UDP_FIELDS].sort(() => Math.random() - 0.5);
    shuffled.forEach((f, i) => {
      const tile = document.createElement('div');
      tile.className = 'udp-tile cursor-grab active:cursor-grabbing px-2 py-1 rounded font-bold text-[10px] select-none touch-none';
      tile.style.backgroundColor = f.color + '22';
      tile.style.border = '1px solid ' + f.color + '44';
      tile.style.color = f.color;
      tile.textContent = f.name;
      tile.dataset.name = f.name;
      pool.appendChild(tile);

      let isDragging = false, sx, sy;
      tile.onpointerdown = e => { isDragging = true; sx = e.clientX; sy = e.clientY; tile.setPointerCapture(e.pointerId); tile.style.zIndex = 1000; };
      tile.onpointermove = e => { if (!isDragging) return; tile.style.transform = `translate(${e.clientX - sx}px, ${e.clientY - sy}px)`; };
      tile.onpointerup = e => {
        if (!isDragging) return; isDragging = false; tile.releasePointerCapture(e.pointerId); tile.style.zIndex = ''; tile.style.transform = '';
        const rect = tile.getBoundingClientRect();
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        let dropped = false;
        slots.forEach(s => {
          const sr = s.getBoundingClientRect();
          const content = s.querySelector('.slot-content');
          if (cx >= sr.left && cx <= sr.right && cy >= sr.top && cy <= sr.bottom && !content.hasChildNodes()) {
            content.appendChild(tile); dropped = true;
          }
        });
        if (!dropped) pool.appendChild(tile);
      };
    });

    checkBtn.onclick = () => {
      let correct = 0;
      slots.forEach((s, i) => {
        const t = s.querySelector('.udp-tile');
        if (t && t.dataset.name === UDP_FIELDS[i].name) { correct++; s.style.borderColor = '#059669'; }
        else s.style.borderColor = '#dc2626';
      });
      fb.classList.remove('hidden');
      if (correct === 4) {
        fb.innerHTML = '✅ 8-Byte Header Perfect! +20 XP'; fb.className = 'text-green-400 mt-4 font-bold';
        document.dispatchEvent(new CustomEvent('ccna-xp', { detail: { amount: 20, reason: 'UDP Header Challenge' } }));
      } else {
        fb.innerHTML = `❌ ${correct}/4 fields correct.`; fb.className = 'text-red-400 mt-4 font-bold';
      }
    };
  }

  draw();
}
