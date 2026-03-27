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

  container.innerHTML = `
    <div class="routing-diagram text-xs space-y-4">
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
    </div>`;

  const detail = container.querySelector('#routing-detail');

  function showDetail(id) {
    const p = PROTOCOLS.find(x => x.id === id);
    if (!p) return;

    // Toggle off if same card clicked twice
    if (detail.dataset.open === id) {
      detail.classList.add('hidden');
      detail.dataset.open = '';
      return;
    }
    detail.dataset.open = id;
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
  }

  container.querySelectorAll('.routing-card').forEach(card => {
    card.addEventListener('click', () => showDetail(card.dataset.id));
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showDetail(card.dataset.id); } });
  });
}
