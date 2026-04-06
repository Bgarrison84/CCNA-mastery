/**
 * LabView.js — Lab Terminal Simulator View
 */
import { Terminal } from '../engine/Terminal.js';

export class LabView {
  constructor(content, store, containerEl) {
    this.content     = content;
    this.store       = store;
    this.containerEl = containerEl;
    this.terminal    = null;
  }

  render() {
    const state = this.store.state;
    const week  = state.currentWeek;
    const labs  = this.content.labs.filter(l => l.week <= week);

    this.containerEl.innerHTML = `
      <div class="flex h-full gap-4 p-4">
        <!-- Lab selector -->
        <div class="w-64 shrink-0 flex flex-col gap-2">
          <h2 class="text-green-400 font-bold text-sm uppercase tracking-widest mb-2">Labs</h2>
          ${labs.map(lab => {
            const done = state.completedLabs.find(l => l.id === lab.id);
            return \`<button data-lab="\${lab.id}" class="lab-btn text-left px-3 py-2 rounded border \${done ? 'border-green-700 bg-green-900/30 text-green-300' : 'border-gray-700 hover:border-green-600 text-gray-300'} text-xs transition-colors">
              <div class="font-semibold">\${lab.title}</div>
              <div class="text-gray-500 mt-0.5">Week \${lab.week} · \${lab.difficulty} · \${lab.xpReward}XP\${done ? ' ✓' : ''}</div>
            </button>\`;
          }).join('')}
          \${!labs.length ? '<p class="text-gray-500 text-xs">Complete Story Mode to unlock labs.</p>' : ''}
        </div>

        <!-- Terminal -->
        <div class="flex-1 flex flex-col bg-black border border-green-900 rounded overflow-hidden">
          <div class="flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-green-900">
            <div class="flex gap-1.5">
              <div class="w-3 h-3 rounded-full bg-red-500"></div>
              <div class="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div class="w-3 h-3 rounded-full bg-green-500"></div>
            </div>
            <span id="lab-title" class="text-green-400 text-xs font-mono ml-2">No Lab Selected — Click a lab to begin</span>
            <div class="ml-auto flex gap-2">
              <button id="btn-validate" class="px-3 py-1 text-xs bg-green-800 hover:bg-green-700 text-green-200 rounded hidden">validate</button>
              <button id="btn-reset"    class="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded hidden">reset</button>
              <button id="btn-hint"     class="px-3 py-1 text-xs bg-yellow-800 hover:bg-yellow-700 text-yellow-200 rounded hidden">hint (<span id="hint-count">\${state.hints}</span>)</button>
            </div>
          </div>
          <!-- Device switcher — only shown for multi-device labs -->
          <div id="device-switcher" class="hidden flex gap-2 px-3 py-1 bg-gray-900 border-b border-green-900/50 items-center">
            <span class="text-gray-500 text-xs">Device:</span>
          </div>
          <div id="terminal-output" class="flex-1 overflow-y-auto p-3 font-mono text-sm leading-relaxed"></div>
          <div class="flex items-center px-3 py-2 border-t border-green-900 bg-black">
            <span id="terminal-prompt" class="text-yellow-400 font-mono text-sm select-none mr-2">Router> </span>
            <input id="terminal-input" type="text" autocomplete="off" spellcheck="false"
              class="flex-1 bg-transparent text-white font-mono text-sm outline-none caret-green-400"
              placeholder="type a command...">
          </div>
        </div>

        <!-- Validation results -->
        <div id="validation-panel" class="w-64 shrink-0 hidden">
          <h3 class="text-green-400 font-bold text-sm mb-2 uppercase tracking-widest">Validation</h3>
          <div id="validation-results" class="space-y-1 text-xs font-mono"></div>
        </div>
      </div>\`;

    // Init terminal
    this.terminal = new Terminal({
      outputEl:  document.getElementById('terminal-output'),
      inputEl:   document.getElementById('terminal-input'),
      promptEl:  document.getElementById('terminal-prompt'),
      store:     this.store,
    });
    
    const termInput = document.getElementById('terminal-input');
    termInput.focus();
    termInput.addEventListener('focus', () => {
      setTimeout(() => termInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 300);
    });

    // Lab selection
    this.containerEl.querySelectorAll('.lab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const lab = this.content.labs.find(l => l.id === btn.dataset.lab);
        if (!lab) return;
        this.loadLab(lab);
        this.containerEl.querySelectorAll('.lab-btn').forEach(b => b.classList.remove('border-green-400'));
        btn.classList.add('border-green-400');
      });
    });

    // Control buttons
    document.getElementById('btn-validate')?.addEventListener('click', () => {
      if (!this.terminal) return;
      const result = this.terminal.validate();
      this.showValidationResults(result);
      if (result.pass) {
        this.store.completeLab(this.terminal._labId, result.score);
        const labBaseXP = this.content.labs.find(l => l.id === this.terminal._labId)?.xpReward || 50;
        const labXP = this.store.hasItem('packet_sniffer') ? Math.round(labBaseXP * 1.1) : labBaseXP;
        this.store.addXP(labXP, 'lab_complete');
      }
    });

    document.getElementById('btn-reset')?.addEventListener('click', () => this.terminal?.reset());

    document.getElementById('btn-hint')?.addEventListener('click', () => {
      const lab = this.content.labs.find(l => l.id === this.terminal?._labId);
      if (!lab?.hints?.length) return;
      const idx  = Math.min(this.store.state.hints, lab.hints.length - 1);
      this.store.useHint();
      alert(\`Hint: \${lab.hints[idx] || 'No more hints.'}\`);
      document.getElementById('hint-count').textContent = this.store.state.hints;
    });
  }

  loadLab(lab) {
    if (!this.terminal) return;
    this.terminal.loadLab(lab);
    document.getElementById('lab-title').textContent = lab.title;
    ['btn-validate', 'btn-reset', 'btn-hint'].forEach(id => {
      document.getElementById(id)?.classList.remove('hidden');
    });
    document.getElementById('validation-panel')?.classList.add('hidden');

    // Multi-device switcher
    const switcher = document.getElementById('device-switcher');
    if (switcher) {
      const devices = this.terminal.deviceNames;
      if (devices && devices.length > 1) {
        switcher.innerHTML = '<span class="text-gray-500 text-xs">Device:</span>';
        devices.forEach(name => {
          const btn = document.createElement('button');
          btn.textContent = name;
          btn.dataset.device = name;
          btn.className = \`device-tab px-2 py-0.5 text-xs rounded font-mono border \${
            name === this.terminal.activeDevice
              ? 'border-green-500 text-green-300 bg-green-900/30'
              : 'border-gray-600 text-gray-400 hover:border-green-600'}\`;
          btn.addEventListener('click', () => {
            this.terminal.switchDevice(name);
            switcher.querySelectorAll('.device-tab').forEach(b => {
              const active = b.dataset.device === this.terminal.activeDevice;
              b.className = \`device-tab px-2 py-0.5 text-xs rounded font-mono border \${
                active ? 'border-green-500 text-green-300 bg-green-900/30'
                       : 'border-gray-600 text-gray-400 hover:border-green-600'}\`;
            });
          });
          switcher.appendChild(btn);
        });
        switcher.classList.remove('hidden');
      } else {
        switcher.classList.add('hidden');
      }
    }
  }

  showValidationResults(result) {
    const panel   = document.getElementById('validation-panel');
    const results = document.getElementById('validation-results');
    if (!panel || !results) return;

    panel.classList.remove('hidden');
    results.innerHTML = '';

    const header = document.createElement('div');
    header.className = \`font-bold mb-2 \${result.pass ? 'text-green-400' : 'text-red-400'}\`;
    header.textContent = result.pass
      ? \`PASS — Score: \${result.score}%\`
      : \`FAIL — Score: \${result.score}%\`;
    results.appendChild(header);

    if (result.pass) {
      const ok = document.createElement('div');
      ok.className = 'text-green-300';
      ok.textContent = 'All objectives met!';
      results.appendChild(ok);
    } else {
      result.missing.forEach(msg => {
        const el = document.createElement('div');
        el.className = 'text-red-300 border-l-2 border-red-700 pl-2 py-0.5';
        el.textContent = \`✗ \${msg}\`;
        results.appendChild(el);
      });
    }
  }
}
