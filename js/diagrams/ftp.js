/**
 * ftp.js — Interactive File Transfer Protocols Diagram
 */

const FTP_TYPES = [
  { 
    name: 'FTP', ports: '20, 21', transport: 'TCP', security: 'Plaintext', 
    desc: 'Original File Transfer Protocol. Uses port 21 for control (commands) and 20 for data.',
    color: '#f87171'
  },
  { 
    name: 'SFTP', ports: '22', transport: 'TCP', security: 'SSH Encrypted', 
    desc: 'Secure FTP. Entire session (auth and data) is encrypted via SSH.',
    color: '#4ade80'
  },
  { 
    name: 'TFTP', ports: '69', transport: 'UDP', security: 'None', 
    desc: 'Trivial FTP. Simple, no authentication. Used for booting diskless workstations or transferring IOS images.',
    color: '#fbbf24'
  }
];

export function render(container) {
  let mode = 'compare'; // 'compare' | 'flow'

  function draw() {
    container.innerHTML = `
      <div class="ftp-diagram text-xs space-y-4">
        <div class="flex gap-2 mb-4">
          <button class="ftp-mode-btn px-3 py-1.5 rounded border ${mode === 'compare' ? 'bg-green-900/30 border-green-500 text-green-400' : 'border-gray-700 text-gray-500'}" data-mode="compare">Comparison</button>
          <button class="ftp-mode-btn px-3 py-1.5 rounded border ${mode === 'flow' ? 'bg-green-900/30 border-green-500 text-green-400' : 'border-gray-700 text-gray-500'}" data-mode="flow">FTP Flow Challenge</button>
        </div>

        ${mode === 'compare' ? renderCompare() : renderFlow()}
      </div>`;

    container.querySelectorAll('.ftp-mode-btn').forEach(btn => {
      btn.onclick = () => { mode = btn.dataset.mode; draw(); };
    });
    
    if (mode === 'flow') initFlowChallenge();
  }

  function renderCompare() {
    return `
      <div class="space-y-2">
        ${FTP_TYPES.map(t => `
          <div class="p-3 bg-gray-900 border border-gray-800 rounded-lg">
            <div class="flex items-center justify-between mb-1">
              <span class="font-bold" style="color:${t.color}">${t.name}</span>
              <span class="text-[10px] font-mono text-gray-500">Ports: ${t.ports} (${t.transport})</span>
            </div>
            <div class="text-[10px] text-gray-400 mb-2">Security: <span class="font-bold" style="color:${t.security==='Plaintext'||t.security==='None'?'#f87171':'#4ade80'}">${t.security}</span></div>
            <p class="text-[11px] text-gray-500 leading-relaxed">${t.desc}</p>
          </div>
        `).join('')}
      </div>`;
  }

  function renderFlow() {
    return `
      <div id="ftp-flow-pane">
        <p class="text-gray-500 mb-4">Arrange the steps of an active FTP connection in the correct order.</p>
        
        <div id="ftp-flow-slots" class="space-y-2 mb-6">
          ${[1,2,3,4].map(i => `
            <div class="ftp-slot border border-dashed border-gray-700 rounded p-2 flex items-center gap-3 bg-black/20" data-step="${i}">
              <span class="w-6 text-center font-bold text-gray-600">${i}</span>
              <div class="slot-content flex-1 h-10 rounded border border-gray-800 bg-black/40 flex items-center px-2"></div>
            </div>
          `).join('')}
        </div>

        <div id="ftp-flow-pool" class="flex flex-col gap-2 p-3 bg-gray-900 rounded border border-gray-800 mb-4"></div>
        
        <button id="ftp-flow-check" class="w-full py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded">Check Order</button>
        <div id="ftp-flow-fb" class="hidden text-center mt-4 font-bold"></div>
      </div>`;
  }

  function initFlowChallenge() {
    const pool = container.querySelector('#ftp-flow-pool');
    const slots = container.querySelectorAll('.ftp-slot');
    const fb = container.querySelector('#ftp-flow-fb');
    const checkBtn = container.querySelector('#ftp-flow-check');

    const STEPS = [
      { id: 1, text: 'Client connects to Server port 21 (Control)' },
      { id: 2, text: 'Client sends PORT command with IP and random port' },
      { id: 3, text: 'Server connects from port 20 to Client port (Data)' },
      { id: 4, text: 'File transfer begins over data channel' }
    ];

    const shuffled = [...STEPS].sort(() => Math.random() - 0.5);
    shuffled.forEach(s => {
      const tile = document.createElement('div');
      tile.className = 'ftp-tile cursor-grab active:cursor-grabbing p-2 bg-gray-800 border border-gray-700 rounded text-[10px] text-gray-300 select-none touch-none';
      tile.textContent = s.text;
      tile.dataset.id = s.id;
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
        const t = s.querySelector('.ftp-tile');
        if (t && t.dataset.id == (i + 1)) { correct++; s.style.borderColor = '#059669'; }
        else s.style.borderColor = '#dc2626';
      });
      fb.classList.remove('hidden');
      if (correct === 4) {
        fb.innerHTML = '✅ Flow Correct! +20 XP'; fb.className = 'text-green-400 mt-4 font-bold';
        document.dispatchEvent(new CustomEvent('ccna-xp', { detail: { amount: 20, reason: 'FTP Flow Challenge' } }));
      } else {
        fb.innerHTML = `❌ ${correct}/4 steps correct.`; fb.className = 'text-red-400 mt-4 font-bold';
      }
    };
  }

  draw();
}
