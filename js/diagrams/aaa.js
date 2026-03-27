/**
 * aaa.js — AAA / TACACS+ / RADIUS / 802.1X Packet Flow Diagram
 * Step-through mode for each authentication scenario.
 */

const SCENARIOS = [
  {
    id: '8021x',
    label: '802.1X',
    color: 'text-cyan-400',
    border: 'border-cyan-700',
    bg: 'bg-cyan-950',
    actors: ['Supplicant\n(Client)', 'Authenticator\n(Switch)', 'Auth Server\n(RADIUS)'],
    actorIcons: ['💻', '🔌', '🔑'],
    steps: [
      { from: 0, to: 1, label: 'EAPoL Start', dir: '→', note: 'Client announces it wants to authenticate (Layer 2 only)' },
      { from: 1, to: 0, label: 'EAP-Request/Identity', dir: '←', note: 'Switch asks for client identity — port stays in unauthorized state' },
      { from: 0, to: 1, label: 'EAP-Response/Identity\n(username)', dir: '→', note: 'Client sends identity to switch' },
      { from: 1, to: 2, label: 'RADIUS Access-Request\n(EAP encapsulated)', dir: '→', note: 'Switch forwards EAP inside RADIUS to auth server (UDP 1812)' },
      { from: 2, to: 1, label: 'RADIUS Access-Challenge\n(EAP challenge)', dir: '←', note: 'Server challenges the client (e.g., PEAP inner auth)' },
      { from: 1, to: 0, label: 'EAP-Request\n(challenge)', dir: '←', note: 'Switch passes challenge to client' },
      { from: 0, to: 1, label: 'EAP-Response\n(credential/cert)', dir: '→', note: 'Client responds with credential' },
      { from: 1, to: 2, label: 'RADIUS Access-Request\n(credential)', dir: '→', note: 'Switch forwards credential to RADIUS' },
      { from: 2, to: 1, label: 'RADIUS Access-Accept\n(+ VLAN, policy attributes)', dir: '←', note: 'Auth server grants access; may push VLAN assignment, ACL, etc.' },
      { from: 1, to: 0, label: 'EAP-Success', dir: '←', note: 'Switch notifies client: authenticated' },
      { from: 1, to: 1, label: '🔓 Port moved to authorized state', dir: '', note: 'Switch opens the port; client gets network access' },
    ],
  },
  {
    id: 'tacacs',
    label: 'TACACS+',
    color: 'text-yellow-400',
    border: 'border-yellow-700',
    bg: 'bg-yellow-950',
    actors: ['Admin\n(CLI user)', 'Network Device\n(Router/Switch)', 'TACACS+ Server'],
    actorIcons: ['👤', '🔀', '🔑'],
    steps: [
      { from: 0, to: 1, label: 'SSH/Telnet connection', dir: '→', note: 'Admin opens management session to device' },
      { from: 1, to: 2, label: 'AUTHEN-START\n(TCP 49, encrypted)', dir: '→', note: 'Device asks TACACS+ server to start authentication' },
      { from: 2, to: 1, label: 'AUTHEN-REPLY\n(GET_USER)', dir: '←', note: 'Server: ask the user for their username' },
      { from: 1, to: 0, label: 'Username prompt', dir: '←', note: 'Device prompts admin for username' },
      { from: 0, to: 1, label: 'Username', dir: '→', note: '' },
      { from: 1, to: 2, label: 'AUTHEN-CONTINUE\n(username)', dir: '→', note: '' },
      { from: 2, to: 1, label: 'AUTHEN-REPLY\n(GET_PASSWORD)', dir: '←', note: 'Server: ask for password' },
      { from: 1, to: 0, label: 'Password prompt', dir: '←', note: '' },
      { from: 0, to: 1, label: 'Password', dir: '→', note: '' },
      { from: 1, to: 2, label: 'AUTHEN-CONTINUE\n(password)', dir: '→', note: '' },
      { from: 2, to: 1, label: 'AUTHEN-REPLY: PASS', dir: '←', note: 'Authentication successful' },
      { from: 1, to: 2, label: 'AUTHOR-REQUEST\n(command: show run)', dir: '→', note: 'Device checks authorization for each command (TACACS+ separates AuthN + AuthZ)' },
      { from: 2, to: 1, label: 'AUTHOR-REPLY: PASS', dir: '←', note: 'Command authorized' },
      { from: 1, to: 2, label: 'ACCT-REQUEST\n(start, cmd: show run)', dir: '→', note: 'Device logs command to accounting server' },
      { from: 2, to: 1, label: 'ACCT-REPLY', dir: '←', note: 'Accounting record stored' },
    ],
  },
  {
    id: 'radius',
    label: 'RADIUS',
    color: 'text-green-400',
    border: 'border-green-700',
    bg: 'bg-green-950',
    actors: ['User\n(VPN / Wi-Fi)', 'NAS\n(VPN/AP/Switch)', 'RADIUS Server'],
    actorIcons: ['👤', '🔌', '🔑'],
    steps: [
      { from: 0, to: 1, label: 'Connection Request\n(credential)', dir: '→', note: 'User connects; NAS collects credentials' },
      { from: 1, to: 2, label: 'Access-Request\n(User-Name, User-Password\nNAS-IP, UDP 1812)', dir: '→', note: 'NAS sends credentials to RADIUS; password field is MD5-hashed (NOT full packet encryption)' },
      { from: 2, to: 1, label: 'Access-Accept\n(Session-Timeout, Idle-Timeout,\nVlan-ID, Filter-Id…)', dir: '←', note: 'Auth + Authorization combined. RADIUS sends policy attributes in Access-Accept' },
      { from: 1, to: 0, label: 'Access Granted\n+ policy applied', dir: '←', note: 'NAS applies VLAN, ACL, timeout from attributes' },
      { from: 1, to: 2, label: 'Accounting-Request START\n(UDP 1813)', dir: '→', note: 'NAS records session start' },
      { from: 2, to: 1, label: 'Accounting-Response', dir: '←', note: '' },
      { from: 1, to: 2, label: 'Accounting-Request STOP\n(session stats)', dir: '→', note: 'NAS records session end with bytes, duration' },
    ],
  },
];

export function render(container) {
  container.innerHTML = `
    <div class="aaa-diagram text-xs space-y-4">
      <p class="text-gray-500">Select a scenario then step through the packet flow to understand exactly what is exchanged.</p>

      <!-- Scenario tabs -->
      <div class="flex gap-1.5">
        ${SCENARIOS.map(s => `
          <button class="aaa-tab px-3 py-1.5 rounded border border-gray-700 text-gray-400 hover:border-gray-500 transition-colors" data-scenario="${s.id}">
            ${s.label}
          </button>`).join('')}
      </div>

      <!-- Flow diagram -->
      <div id="aaa-flow" class="space-y-3"></div>
    </div>`;

  let currentScenario = null;
  let currentStep = -1;

  function renderScenario(scenarioId, step) {
    const s = SCENARIOS.find(x => x.id === scenarioId);
    if (!s) return;
    const flow = container.querySelector('#aaa-flow');
    const totalSteps = s.steps.length;
    const visibleSteps = step >= 0 ? s.steps.slice(0, step + 1) : [];

    flow.innerHTML = `
      <div class="${s.border} ${s.bg} border rounded p-4 space-y-3">
        <!-- Actor headers -->
        <div class="flex">
          ${s.actors.map((a, i) => `
            <div class="flex-1 text-center">
              <div class="text-2xl">${s.actorIcons[i]}</div>
              <div class="text-gray-400 whitespace-pre-line leading-tight">${a}</div>
              <div class="w-0 h-0 mx-auto mt-1 border-l-4 border-r-4 border-t-0 border-b-4 border-transparent border-b-gray-600"></div>
            </div>`).join('')}
        </div>

        <!-- Step messages -->
        <div id="aaa-steps" class="space-y-2 min-h-16">
          ${visibleSteps.length === 0
            ? '<p class="text-gray-600 text-center py-4">Press "Next Step" to begin.</p>'
            : visibleSteps.map((st, i) => {
                const isLast = i === visibleSteps.length - 1;
                const isDevice = st.from === st.to;
                return `
                  <div class="flex items-start gap-2 ${isLast ? 'opacity-100' : 'opacity-50'} transition-opacity">
                    <span class="w-4 text-gray-600 shrink-0">${i + 1}.</span>
                    <div class="flex-1">
                      <div class="flex items-center gap-1">
                        ${isDevice ? `<span class="${s.color} font-semibold">${st.label}</span>` : `
                        <span class="w-1/3 text-right text-gray-500">${s.actors[st.from].split('\n')[0]}</span>
                        <span class="flex-1 text-center ${s.color} font-mono whitespace-pre-line leading-tight">${st.label}</span>
                        <span class="w-1/3 text-gray-500">${s.actors[st.to].split('\n')[0]}</span>`}
                      </div>
                      ${isLast && st.note ? `<div class="text-gray-600 mt-0.5 pl-4 italic">${st.note}</div>` : ''}
                    </div>
                  </div>`;
              }).join('')}
        </div>

        <!-- Controls -->
        <div class="flex items-center justify-between pt-2 border-t border-gray-800">
          <span class="text-gray-600">${step + 1} / ${totalSteps} steps</span>
          <div class="flex gap-2">
            <button id="aaa-prev" class="px-3 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded transition-colors ${step <= 0 ? 'opacity-40 cursor-not-allowed' : ''}">◀ Back</button>
            <button id="aaa-next" class="px-3 py-1 ${s.bg} hover:opacity-80 ${s.border} border ${s.color} rounded transition-colors ${step >= totalSteps - 1 ? 'opacity-40 cursor-not-allowed' : ''}">
              ${step >= totalSteps - 1 ? '✓ Done' : 'Next ▶'}
            </button>
            <button id="aaa-reset" class="px-3 py-1 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-500 rounded transition-colors">↺ Reset</button>
          </div>
        </div>
      </div>`;

    container.querySelector('#aaa-next')?.addEventListener('click', () => {
      if (currentStep < totalSteps - 1) {
        currentStep++;
        renderScenario(currentScenario, currentStep);
      }
    });
    container.querySelector('#aaa-prev')?.addEventListener('click', () => {
      if (currentStep > 0) {
        currentStep--;
        renderScenario(currentScenario, currentStep);
      }
    });
    container.querySelector('#aaa-reset')?.addEventListener('click', () => {
      currentStep = -1;
      renderScenario(currentScenario, currentStep);
    });
  }

  container.querySelectorAll('.aaa-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.aaa-tab').forEach(b => {
        b.classList.remove('border-cyan-600', 'text-cyan-300', 'border-yellow-600', 'text-yellow-300',
          'border-green-600', 'text-green-300');
        b.classList.add('border-gray-700', 'text-gray-400');
      });
      const s = SCENARIOS.find(x => x.id === btn.dataset.scenario);
      if (s) {
        btn.classList.remove('border-gray-700', 'text-gray-400');
        btn.classList.add(s.border, s.color);
      }
      currentScenario = btn.dataset.scenario;
      currentStep = -1;
      renderScenario(currentScenario, currentStep);
    });
    btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); } });
  });
}
