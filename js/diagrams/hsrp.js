/**
 * hsrp.js — HSRP / VRRP / GLBP Interactive Failover Diagram
 * Shows active/standby topology; click "Simulate Failover" to animate the transition.
 */

const PROTOCOLS_INFO = [
  {
    id: 'hsrp',
    name: 'HSRP',
    standard: 'Cisco proprietary',
    roles: ['Active', 'Standby'],
    roleColors: ['text-green-400', 'text-yellow-400'],
    loadBalance: false,
    preempt: 'Disabled by default',
    hello: '3s', hold: '10s',
    multicast: '224.0.0.2 (v1) / 224.0.0.102 (v2)',
    macPrefix: '00:00:0C:07:AC:xx',
    notes: 'Active handles all traffic. Standby takes over if Active fails. No load balancing in a single group.',
    color: 'border-cyan-700 bg-cyan-950',
    activeColor: 'bg-green-800 border-green-600',
    standbyColor: 'bg-yellow-900 border-yellow-700',
  },
  {
    id: 'vrrp',
    name: 'VRRP',
    standard: 'RFC 5798 (open)',
    roles: ['Master', 'Backup(s)'],
    roleColors: ['text-green-400', 'text-yellow-400'],
    loadBalance: false,
    preempt: 'Enabled by default',
    hello: '1s', hold: '3s',
    multicast: '224.0.0.18',
    macPrefix: '00:00:5E:00:01:xx',
    notes: 'Master handles all traffic. Virtual IP can be the same as the Master\'s real IP. Preempt is on by default — higher priority router reclaims Master automatically.',
    color: 'border-purple-700 bg-purple-950',
    activeColor: 'bg-green-800 border-green-600',
    standbyColor: 'bg-yellow-900 border-yellow-700',
  },
  {
    id: 'glbp',
    name: 'GLBP',
    standard: 'Cisco proprietary',
    roles: ['AVG', 'AVF×4'],
    roleColors: ['text-green-400', 'text-blue-400'],
    loadBalance: true,
    preempt: 'Disabled by default',
    hello: '3s', hold: '10s',
    multicast: '224.0.0.102',
    macPrefix: '00:07:B4:00:01:xx',
    notes: 'AVG = Active Virtual Gateway (answers ARP requests). AVFs = Active Virtual Forwarders (up to 4 share the load). Round-robin / weighted / host-dependent assignment.',
    color: 'border-blue-700 bg-blue-950',
    activeColor: 'bg-blue-800 border-blue-600',
    standbyColor: 'bg-teal-900 border-teal-700',
  },
];

export function render(container) {
  container.innerHTML = `
    <div class="hsrp-diagram text-xs space-y-4">
      <!-- Protocol tabs -->
      <div class="flex gap-1">
        ${PROTOCOLS_INFO.map((p, i) => `
          <button class="hsrp-tab px-3 py-1.5 rounded border border-gray-700 text-gray-400 hover:border-gray-500 transition-colors${i === 0 ? ' active-tab border-cyan-600 text-cyan-300' : ''}"
                  data-proto="${p.id}">${p.name}</button>`).join('')}
      </div>

      <!-- Topology diagram + failover -->
      <div id="hsrp-topology" class="space-y-4"></div>
    </div>`;

  let currentProto = 'hsrp';
  let failedOver = false;
  let animating = false;

  function renderTopology(protoId, isFailedOver) {
    const p = PROTOCOLS_INFO.find(x => x.id === protoId);
    if (!p) return;

    const activeLabel  = isFailedOver ? p.roles[1] : p.roles[0];
    const standbyLabel = isFailedOver ? `(${p.roles[0]} failed)` : p.roles[1];
    const activeColor  = isFailedOver ? p.standbyColor : p.activeColor;
    const standbyColor = isFailedOver ? 'bg-red-950 border-red-800' : p.standbyColor;

    const topology = container.querySelector('#hsrp-topology');
    topology.innerHTML = `
      <div class="${p.color} border rounded p-4 space-y-4">
        <!-- Clients -->
        <div class="flex justify-center">
          <div class="flex gap-8 items-center">
            <div class="text-center">
              <div class="w-10 h-8 bg-gray-800 border border-gray-600 rounded flex items-center justify-center text-lg">💻</div>
              <div class="text-gray-500 mt-1">Client 1</div>
            </div>
            <div class="text-center">
              <div class="w-10 h-8 bg-gray-800 border border-gray-600 rounded flex items-center justify-center text-lg">💻</div>
              <div class="text-gray-500 mt-1">Client 2</div>
            </div>
          </div>
        </div>

        <!-- Virtual IP -->
        <div class="flex justify-center">
          <div class="flex flex-col items-center gap-1">
            <div class="flex gap-1 text-gray-500">▲ ARP resolves to virtual MAC ▲</div>
            <div class="px-3 py-1.5 bg-gray-900 border-2 border-dashed border-gray-500 rounded text-gray-200 font-mono text-center">
              Virtual IP: 10.0.0.1<br><span class="text-gray-500">MAC: ${p.macPrefix}</span>
            </div>
          </div>
        </div>

        <!-- Routers -->
        <div class="flex justify-center gap-6">
          <div class="text-center">
            <div class="w-14 h-12 ${activeColor} border-2 rounded flex items-center justify-center text-2xl transition-all duration-500">🔀</div>
            <div class="${p.roleColors[0]} font-bold mt-1">${activeLabel}</div>
            <div class="text-gray-500">10.0.0.2</div>
            <div class="text-gray-600">Priority ${isFailedOver ? 90 : 110}</div>
          </div>
          <div class="text-center">
            <div class="w-14 h-12 ${standbyColor} border-2 rounded flex items-center justify-center text-2xl transition-all duration-500">${isFailedOver ? '💀' : '🔀'}</div>
            <div class="${isFailedOver ? 'text-red-400' : p.roleColors[1]} font-bold mt-1">${standbyLabel}</div>
            <div class="text-gray-500">10.0.0.3</div>
            <div class="text-gray-600">Priority ${isFailedOver ? '—' : 90}</div>
          </div>
          ${p.loadBalance ? `
          <div class="text-center">
            <div class="w-14 h-12 bg-teal-900 border-2 border-teal-700 rounded flex items-center justify-center text-2xl">🔀</div>
            <div class="text-blue-400 font-bold mt-1">AVF 3</div>
            <div class="text-gray-500">10.0.0.4</div>
            <div class="text-gray-600">Priority 100</div>
          </div>` : ''}
        </div>

        ${isFailedOver ? `
          <div class="text-center text-yellow-400 font-semibold animate-pulse">
            ⚡ Failover complete — ${p.roles[1] === 'Backup(s)' ? 'Backup' : p.roles[1]} promoted to ${p.roles[0]}
          </div>` : ''}

        <!-- Failover button -->
        <div class="flex justify-center">
          <button id="failover-btn" class="px-4 py-2 ${isFailedOver ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-900 hover:bg-red-800'} border border-gray-600 text-gray-200 rounded font-semibold transition-colors">
            ${isFailedOver ? '↺ Reset' : '⚡ Simulate Failover'}
          </button>
        </div>
      </div>

      <!-- Details panel -->
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div class="bg-gray-900 border border-gray-800 rounded p-3 space-y-1">
          <div class="text-gray-400 font-semibold mb-1">Protocol Details</div>
          <div><span class="text-gray-600">Standard:</span> <span class="text-gray-300">${p.standard}</span></div>
          <div><span class="text-gray-600">Hello/Hold:</span> <span class="text-gray-300">${p.hello} / ${p.hold}</span></div>
          <div><span class="text-gray-600">Preempt:</span> <span class="text-gray-300">${p.preempt}</span></div>
          <div><span class="text-gray-600">Multicast:</span> <span class="text-gray-300 font-mono">${p.multicast}</span></div>
          <div><span class="text-gray-600">Virtual MAC:</span> <span class="text-gray-300 font-mono">${p.macPrefix}</span></div>
          <div><span class="text-gray-600">Load Balance:</span> <span class="${p.loadBalance ? 'text-green-400' : 'text-gray-500'}">${p.loadBalance ? 'Yes (up to 4 forwarders)' : 'No'}</span></div>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded p-3">
          <div class="text-gray-400 font-semibold mb-1">Key Notes</div>
          <div class="text-gray-500">${p.notes}</div>
        </div>
      </div>`;

    container.querySelector('#failover-btn')?.addEventListener('click', () => {
      if (animating) return;
      animating = true;
      failedOver = !failedOver;
      setTimeout(() => {
        renderTopology(currentProto, failedOver);
        animating = false;
      }, 200);
    });
  }

  container.querySelectorAll('.hsrp-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.hsrp-tab').forEach(b => {
        b.classList.remove('active-tab', 'border-cyan-600', 'text-cyan-300', 'border-purple-600', 'text-purple-300', 'border-blue-600', 'text-blue-300');
      });
      const colors = { hsrp: ['border-cyan-600', 'text-cyan-300'], vrrp: ['border-purple-600', 'text-purple-300'], glbp: ['border-blue-600', 'text-blue-300'] };
      btn.classList.add('active-tab', ...(colors[btn.dataset.proto] || ['border-gray-500', 'text-gray-300']));
      currentProto = btn.dataset.proto;
      failedOver = false;
      renderTopology(currentProto, false);
    });
  });

  renderTopology(currentProto, false);
}
