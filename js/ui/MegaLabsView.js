/**
 * MegaLabsView.js — Expert Enterprise Scenarios
 */
import { Terminal } from '../engine/Terminal.js';
import { bus } from '../core/EventBus.js';

const MEGA_LABS = [
  {
    id: 'mega_campus',
    title: 'Enterprise Campus Build',
    badge: { id: 'campus_architect', name: 'Campus Architect', icon: '🏛️', description: 'Completed the full Enterprise Campus Build Mega Lab' },
    difficulty: 'hard',
    xp: 800,
    minLevel: 5,
    estimatedMin: 90,
    description: 'Design and build a multi-layer campus network from scratch: VLANs, STP, inter-VLAN routing, OSPF, DHCP, PAT, and port security.',
    briefing: 'You are the lead network engineer for a 500-seat corporate campus. Greenfield build — every cable is run, every switch is racked. Get the network operational before Monday.',
    topology: `
      <div class="font-mono text-xs text-gray-500 space-y-1 leading-tight text-center">
        <div>        [ISP]</div>
        <div>          |</div>
        <div>       [Router] → OSPF</div>
        <div>          |</div>
        <div>     [Core-SW] → SVIs + ip routing</div>
        <div>     /        \\</div>
        <div>[Dist-SW1]  [Dist-SW2]</div>
        <div>   |    \\    /    |</div>
        <div>[Acc1] [Acc2] [Acc3] [Acc4]</div>
        <div class="text-gray-600 mt-1">VLANs: 10(Staff) 20(Mgmt) 30(Guest)</div>
      </div>`,
    phases: [
      {
        id: 'p0', type: 'cli', title: 'VLANs + Trunking', xp: 120,
        hints: ['vlan 10 → name Staff; vlan 20 → name Mgmt; vlan 30 → name Guest', 'interface Gi0/1 → switchport mode trunk', 'Trunks carry all VLANs by default'],
        targetConfig: {
          hostname: 'Core-SW',
          vlans: { '10': { name: 'Staff' }, '20': { name: 'Mgmt' }, '30': { name: 'Guest' } },
          interfaces: {
            'GigabitEthernet0/1': { switchportMode: 'trunk' },
            'GigabitEthernet0/2': { switchportMode: 'trunk' },
          }
        }
      },
      {
        id: 'p1', type: 'cli', title: 'STP Root Bridge + PortFast', xp: 120,
        hints: ['spanning-tree vlan 10,20,30 priority 4096 — lower priority wins root', 'interface Gi0/3 → spanning-tree portfast (access ports only)', 'show spanning-tree to verify root bridge election'],
        targetConfig: {
          hostname: 'Core-SW',
          stp: { vlanPriority: { '10': 4096, '20': 4096, '30': 4096 } },
          interfaces: { 'GigabitEthernet0/3': { stpPortfast: true } }
        }
      },
      {
        id: 'p2', type: 'cli', title: 'Inter-VLAN Routing (SVIs)', xp: 160,
        hints: ['ip routing (global config)', 'interface Vlan10 → ip address 10.10.10.1 255.255.255.0 → no shutdown', 'Repeat for Vlan20 (10.20.20.1/24) and Vlan30 (10.30.30.1/24)'],
        targetConfig: {
          hostname: 'Core-SW',
          ipRouting: true,
          interfaces: {
            'Vlan10': { ip: '10.10.10.1', mask: '255.255.255.0', shutdown: false },
            'Vlan20': { ip: '10.20.20.1', mask: '255.255.255.0', shutdown: false },
            'Vlan30': { ip: '10.30.30.1', mask: '255.255.255.0', shutdown: false },
          }
        }
      }
    ]
  }
];

export class MegaLabsView {
  constructor(content, store, containerEl) {
    this.content     = content;
    this.store       = store;
    this.containerEl = containerEl;
  }

  render() {
    const state = this.store.state;
    this.containerEl.innerHTML = `
      <div class="p-4 space-y-4 max-w-5xl mx-auto">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-red-400 font-bold text-sm uppercase tracking-widest">Mega Labs</h2>
            <p class="text-gray-500 text-xs mt-0.5">Expert-level enterprise scenarios.</p>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-4">
          ${MEGA_LABS.map(lab => {
            const prog     = this.store.getMegaLabProgress(lab.id);
            const done     = prog?.completedPhases?.length ?? 0;
            const total    = lab.phases.length;
            const complete = done >= total;
            const locked   = state.level < (lab.minLevel || 1);
            const diffColor = lab.difficulty === 'expert' ? 'text-purple-400' : 'text-red-400';
            const glowCls   = complete ? 'border-amber-600 shadow-lg shadow-amber-900/30' : locked ? 'border-gray-800 opacity-50' : 'border-red-900 hover:border-red-700';

            return `
              <div class="megalab-card rounded border ${glowCls} bg-gray-950 transition-all duration-200" data-lab="${lab.id}">
                <div class="p-4 flex items-start gap-4">
                  <div class="shrink-0 text-center w-16">
                    <div class="text-4xl mb-1">${lab.badge.icon}</div>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="text-white font-bold text-sm">${lab.title}</span>
                      <span class="${diffColor} text-xs font-semibold uppercase">${lab.difficulty}</span>
                      <span class="text-gray-500 text-xs">${lab.xp} XP · ~${lab.estimatedMin} min</span>
                    </div>
                    <p class="text-gray-500 text-xs mt-1">${lab.description}</p>
                  </div>
                  ${!locked ? `<button class="megalab-start-btn shrink-0 px-3 py-1.5 text-xs rounded border border-red-800 text-red-300 hover:bg-red-900/20 transition-colors" data-lab="${lab.id}">
                    Launch
                  </button>` : ''}
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;

    this.containerEl.querySelectorAll('.megalab-start-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const lab = MEGA_LABS.find(l => l.id === btn.dataset.lab);
        if (lab) this._renderMegaLabDetail(lab);
      });
    });
  }

  _renderMegaLabDetail(lab) {
    this.containerEl.innerHTML = `
      <div class="p-4 space-y-4 max-w-3xl mx-auto">
        <div class="flex items-center gap-3">
          <button id="ml-back" class="text-gray-500 hover:text-gray-300 text-xs px-2 py-1 border border-gray-700 rounded">← Back</button>
          <span class="text-white font-bold text-sm">${lab.title}</span>
        </div>
        <div class="rounded border border-gray-800 bg-gray-950 p-3">
          <div class="text-gray-500 text-xs font-semibold mb-2 uppercase tracking-widest">Network Topology</div>
          ${lab.topology}
        </div>
        <div id="ml-workspace" class="space-y-3"></div>
      </div>`;

    this.containerEl.querySelector('#ml-back').addEventListener('click', () => this.render());
    this._startMegaPhase(lab, 0);
  }

  _startMegaPhase(lab, phaseIdx) {
    const phase = lab.phases[phaseIdx];
    const workspace = this.containerEl.querySelector('#ml-workspace');
    if (!phase || !workspace) return;

    workspace.innerHTML = `
      <div class="rounded border border-red-900 overflow-hidden">
        <div class="flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-red-900">
          <span class="text-red-400 text-xs font-mono flex-1">💻 ${phase.title}</span>
          <button id="ml-validate-btn" class="px-2 py-0.5 text-xs bg-green-950 hover:bg-green-900 border border-green-800 text-green-400 rounded">Validate</button>
        </div>
        <div id="ml-term-out" class="h-56 overflow-y-auto p-3 font-mono text-sm leading-relaxed bg-black"></div>
        <div class="flex items-center px-3 py-2 border-t border-red-900 bg-black">
          <span id="ml-term-prompt" class="text-yellow-400 font-mono text-sm select-none mr-2">Router> </span>
          <input id="ml-term-input" type="text" autocomplete="off" spellcheck="false"
            class="flex-1 bg-transparent text-white font-mono text-sm outline-none caret-red-400">
        </div>
        <div id="ml-val-results" class="hidden px-3 py-2 bg-gray-950 border-t border-gray-800 text-xs font-mono space-y-0.5"></div>
      </div>`;

    const terminal = new Terminal({
      outputEl: workspace.querySelector('#ml-term-out'),
      inputEl:  workspace.querySelector('#ml-term-input'),
      promptEl: workspace.querySelector('#ml-term-prompt'),
      store:    this.store,
    });

    workspace.querySelector('#ml-validate-btn').addEventListener('click', () => {
      terminal._targetConfig = phase.targetConfig;
      const result = terminal.validate();
      const valDiv = workspace.querySelector('#ml-val-results');
      valDiv.classList.remove('hidden');
      valDiv.innerHTML = result.checks.map(c =>
        `<div class="${c.pass ? 'text-green-400' : 'text-red-400'}">${c.pass ? '✓' : '✖'} ${c.label}</div>`
      ).join('') + `<div class="mt-1 pt-1 border-t border-gray-800 ${result.pass ? 'text-green-300' : 'text-amber-300'}">${result.pass ? `✅ Phase cleared!` : `${result.score}% — keep going`}</div>`;
      
      if (result.pass) {
        this.store.recordMegaLabPhase(lab.id, phaseIdx, phase.xp);
        if (phaseIdx + 1 < lab.phases.length) {
          setTimeout(() => this._startMegaPhase(lab, phaseIdx + 1), 2000);
        } else {
          this.store.completeMegaLab(lab.id, lab.badge);
          bus.emit('toast', { msg: `🏆 Badge earned: ${lab.badge.name}!`, type: 'success' });
        }
      }
    });
  }
}
