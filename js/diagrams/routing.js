/**
 * routing.js — Interactive Routing Protocol Comparison Diagram
 * Shows protocols as clickable cards; selected card reveals full detail.
 * AD bar chart gives visual sense of preference ordering.
 */

const PROTOCOLS = [
  {
    id: 'connected',
    name: 'Directly Connected',
    ad: 0,
    type: 'N/A',
    algorithm: 'N/A',
    metric: 'N/A',
    timers: 'N/A',
    color: 'text-green-400',
    bar: 'bg-green-500',
    notes: [
      'AD 0 — always preferred over any learned route',
      'Interface must be up/up to install connected route',
      'Automatically added when interface gets an IP address',
    ],
  },
  {
    id: 'static',
    name: 'Static Route',
    ad: 1,
    type: 'Manual',
    algorithm: 'None',
    metric: 'None (preference via AD)',
    timers: 'None',
    color: 'text-cyan-400',
    bar: 'bg-cyan-600',
    notes: [
      'AD 1 — preferred over any dynamic routing protocol',
      'Floating static: set high AD (e.g. 200) for backup route',
      'ip route 0.0.0.0 0.0.0.0 <next-hop> — default route',
    ],
  },
  {
    id: 'ebgp',
    name: 'eBGP',
    ad: 20,
    type: 'Path Vector',
    algorithm: 'Best-path selection',
    metric: 'AS-PATH, Weight, LOCAL_PREF, MED…',
    timers: 'Keepalive 60s · Hold 180s',
    color: 'text-blue-400',
    bar: 'bg-blue-500',
    notes: [
      'External BGP (between different AS) — AD 20',
      'Internal BGP (same AS) — AD 200',
      'Only protocol designed for the public internet routing table',
      'TCP port 179 · requires explicit neighbor config',
    ],
  },
  {
    id: 'eigrp',
    name: 'EIGRP',
    ad: 90,
    type: 'Advanced Distance Vector (Hybrid)',
    algorithm: 'DUAL (Diffusing Update Algorithm)',
    metric: 'BW + Delay (K1=1, K3=1 default)',
    timers: 'Hello 5s · Hold 15s (LAN)',
    color: 'text-yellow-400',
    bar: 'bg-yellow-500',
    notes: [
      'Internal AD 90 · External AD 170',
      'Cisco-proprietary; open RFC version exists but rarely used',
      'DUAL prevents routing loops; Feasibility Condition = RD < FD',
      'Uses IP protocol 88 (not a TCP/UDP port)',
      'Supports equal and unequal-cost load balancing (variance)',
    ],
  },
  {
    id: 'ospf',
    name: 'OSPF',
    ad: 110,
    type: 'Link State',
    algorithm: 'Dijkstra / SPF',
    metric: 'Cost = 10⁸ ÷ BW(bps)  [ref: 100 Mbps]',
    timers: 'Hello 10s · Dead 40s (broadcast)',
    color: 'text-orange-400',
    bar: 'bg-orange-500',
    notes: [
      'AD 110 · RFC 2328 (v2 for IPv4) / RFC 5340 (v3 for IPv6)',
      'Uses IP protocol 89',
      'FastEthernet = cost 1; 1 Gbps = cost 1 (reference BW too low)',
      'Fix: auto-cost reference-bandwidth 1000 for Gbps networks',
      'DR/BDR election on broadcast segments (224.0.0.5 / 224.0.0.6)',
    ],
  },
  {
    id: 'isis',
    name: 'IS-IS',
    ad: 115,
    type: 'Link State',
    algorithm: 'Dijkstra / SPF',
    metric: 'Cost (default 10/interface; wide metric optional)',
    timers: 'Hello & hold vary by level',
    color: 'text-pink-400',
    bar: 'bg-pink-500',
    notes: [
      'AD 115 · ISO standard; preferred by many ISP cores',
      'Runs directly over Layer 2 (not IP) — more resilient',
      'Level 1 = within area · Level 2 = between areas',
      'NET address (not IP-based router ID)',
    ],
  },
  {
    id: 'rip',
    name: 'RIPv2',
    ad: 120,
    type: 'Distance Vector',
    algorithm: 'Bellman-Ford',
    metric: 'Hop count (max 15; 16 = unreachable)',
    timers: 'Update 30s · Invalid 180s · Flush 240s',
    color: 'text-red-400',
    bar: 'bg-red-500',
    notes: [
      'AD 120 · Ancient but still on CCNA exam',
      'Max 15 hops — limits to small networks',
      'Slow convergence; susceptible to routing loops',
      'Version 2 adds VLSM support and multicast (224.0.0.9)',
      'UDP port 520',
    ],
  },
];

export function render(container) {
  const maxAD = 200;
  let mode = 'view'; // 'view' | 'challenge'

  function draw() {
    container.innerHTML = `
      <div class="routing-diagram text-xs space-y-4">
        <!-- Tab Switcher -->
        <div class="flex gap-2 mb-4">
          <button class="routing-mode-btn px-3 py-1.5 rounded border ${mode === 'view' ? 'bg-green-900/30 border-green-500 text-green-400' : 'border-gray-700 text-gray-500'}" data-mode="view">Explorer</button>
          <button class="routing-mode-btn px-3 py-1.5 rounded border ${mode === 'challenge' ? 'bg-green-900/30 border-green-500 text-green-400' : 'border-gray-700 text-gray-500'}" data-mode="challenge">AD Challenge</button>
        </div>

        ${mode === 'view' ? `
          <p class="text-gray-500">Click any protocol to see full details. AD bar shows routing preference (lower = preferred).</p>

          <!-- AD bar chart -->
          <div class="space-y-1.5">
            <div class="text-gray-600 text-xs mb-2 flex justify-between"><span>← More preferred (lower AD)</span><span>Less preferred →</span></div>
            ${PROTOCOLS.map(p => `
              <div class="routing-card flex items-center gap-2 cursor-pointer hover:bg-gray-900 rounded px-2 py-1.5 transition-colors border border-transparent hover:border-gray-700"
                   data-id="${p.id}" tabindex="0" role="button" aria-label="${p.name}">
                <span class="w-28 font-semibold ${p.color} shrink-0">${p.name}</span>
                <div class="flex-1 bg-gray-800 rounded h-3 overflow-hidden">
                  <div class="${p.bar} h-full rounded transition-all duration-500" style="width:${Math.round((p.ad / maxAD) * 100)}%"></div>
                </div>
                <span class="w-8 text-right font-mono text-gray-300">${p.ad}</span>
              </div>`).join('')}
          </div>

          <!-- Detail panel -->
          <div id="routing-detail" class="hidden border border-gray-700 rounded p-4 bg-gray-950 space-y-3"></div>
        ` : `
          <div id="routing-pane-challenge">
            <p class="text-gray-500 mb-4">Match the correct Administrative Distance (AD) to each routing protocol.</p>
            
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div id="rt-slots" class="space-y-2">
                ${PROTOCOLS.filter(p => p.ad <= 120).map(p => `
                  <div class="rt-slot border border-dashed border-gray-700 rounded p-2 flex items-center gap-3 bg-black/20" data-ad="${p.ad}">
                    <span class="w-24 font-bold ${p.color}">${p.name}</span>
                    <div class="slot-content flex-1 h-8 rounded border border-gray-800 bg-black/40"></div>
                  </div>
                `).join('')}
              </div>
              
              <div class="space-y-4">
                <div id="rt-pool" class="flex flex-wrap gap-2 p-3 bg-gray-900/50 rounded-lg border border-gray-800 min-h-24"></div>
                <button id="rt-check-btn" class="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white font-bold rounded transition-colors shadow-lg">Validate ADs</button>
                <div id="rt-feedback" class="hidden text-center py-2 rounded font-bold text-sm"></div>
              </div>
            </div>
          </div>
        `}
      </div>`;

    if (mode === 'view') {
      const detail = container.querySelector('#routing-detail');
      container.querySelectorAll('.routing-card').forEach(card => {
        card.addEventListener('click', () => {
          const p = PROTOCOLS.find(x => x.id === card.dataset.id);
          if (!p) return;
          if (detail.dataset.open === p.id) {
            detail.classList.add('hidden');
            detail.dataset.open = '';
            return;
          }
          detail.dataset.open = p.id;
          detail.classList.remove('hidden');
          detail.innerHTML = `
            <div class="flex items-center gap-2 mb-2">
              <h3 class="font-bold ${p.color} text-sm">${p.name}</h3>
              <span class="font-mono bg-gray-800 px-2 py-0.5 rounded text-gray-300">AD ${p.ad}</span>
            </div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
              <div><span class="text-gray-500">Type:</span> <span class="text-gray-200">${p.type}</span></div>
              <div><span class="text-gray-500">Algorithm:</span> <span class="text-gray-200">${p.algorithm}</span></div>
              <div class="col-span-2"><span class="text-gray-500">Metric:</span> <span class="text-gray-200">${p.metric}</span></div>
              <div class="col-span-2"><span class="text-gray-500">Timers:</span> <span class="text-gray-200">${p.timers}</span></div>
            </div>
            <div class="space-y-1">
              ${p.notes.map(n => `<div class="flex gap-1.5"><span class="${p.color}">▸</span><span class="text-gray-400">${n}</span></div>`).join('')}
            </div>`;
        });
      });
    } else {
      initADChallenge();
    }

    container.querySelectorAll('.routing-mode-btn').forEach(btn => {
      btn.onclick = () => { mode = btn.dataset.mode; draw(); };
    });
  }

  function initADChallenge() {
    const pool = container.querySelector('#rt-pool');
    const slots = container.querySelectorAll('.rt-slot');
    const fb = container.querySelector('#rt-feedback');
    const checkBtn = container.querySelector('#rt-check-btn');

    const ads = PROTOCOLS.filter(p => p.ad <= 120).map(p => p.ad).sort(() => Math.random() - 0.5);
    ads.forEach(ad => {
      const tile = document.createElement('div');
      tile.className = 'rt-tile cursor-grab active:cursor-grabbing px-4 py-1 bg-gray-800 border border-gray-600 rounded text-green-400 font-mono font-bold select-none touch-none';
      tile.textContent = ad;
      tile.dataset.ad = ad;
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
      slots.forEach(s => {
        const t = s.querySelector('.rt-tile');
        if (t && t.dataset.ad == s.dataset.ad) { correct++; s.style.borderColor = '#059669'; }
        else s.style.borderColor = '#dc2626';
      });
      fb.classList.remove('hidden');
      if (correct === slots.length) {
        fb.innerHTML = '✅ AD Expert! +40 XP'; fb.className = 'text-green-400 mt-4 font-bold';
        document.dispatchEvent(new CustomEvent('ccna-xp', { detail: { amount: 40, reason: 'AD Challenge' } }));
      } else {
        fb.innerHTML = `❌ ${correct}/${slots.length} correct. Check your distances!`; fb.className = 'text-red-400 mt-4 font-bold';
      }
    };
  }

  draw();
}
