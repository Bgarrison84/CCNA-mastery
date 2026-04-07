/**
 * ScriptingView.js — Network Automation Scripting
 */
import { ScriptingEngine } from '../engine/ScriptingEngine.js';
import { bus } from '../core/EventBus.js';

const SCRIPTING_LABS = [
  {
    id: 'scr_netmiko_basic', title: 'Hello, Netmiko!', lang: 'python',
    difficulty: 'easy', xp: 80, week: 6,
    description: 'Write a Python script that connects to a Cisco router via Netmiko and runs <code>show ip interface brief</code>.',
    template: `from netmiko import ConnectHandler\n\ndevice = {\n    'device_type': 'cisco_ios',\n    'host': '10.0.0.1',\n    'username': 'admin',\n    'password': 'cisco',\n}\n\n# Connect and run command\n`,
    checks: [
      { label: 'Imports ConnectHandler', test: /from netmiko import ConnectHandler/ },
      { label: 'Sends show command', test: /send_command/ }
    ]
  }
];

export class ScriptingView {
  constructor(content, store, containerEl) {
    this.content     = content;
    this.store       = store;
    this.containerEl = containerEl;
  }

  render() {
    this.containerEl.innerHTML = `
      <div class="p-4 space-y-4 max-w-5xl mx-auto">
        <h2 class="text-green-300 font-bold text-xl">Network Scripting</h2>
        <div id="scr-list" class="space-y-2">
          ${SCRIPTING_LABS.map(lab => `
            <div class="p-3 border border-gray-700 bg-gray-900 rounded cursor-pointer hover:border-green-500" data-id="${lab.id}">
              <div class="font-bold text-green-400">${lab.title}</div>
              <div class="text-xs text-gray-500">${lab.description}</div>
            </div>
          `).join('')}
        </div>
        <div id="scr-workspace" class="hidden"></div>
      </div>`;

    this.containerEl.querySelectorAll('#scr-list > div').forEach(el => {
      el.addEventListener('click', () => {
        const lab = SCRIPTING_LABS.find(l => l.id === el.dataset.id);
        if (lab) this._renderLab(lab);
      });
    });
  }

  _renderLab(lab) {
    const workspace = this.containerEl.querySelector('#scr-workspace');
    workspace.classList.remove('hidden');
    workspace.innerHTML = `
      <div class="space-y-3 mt-4 p-4 border border-green-900 bg-black rounded">
        <div class="text-sm text-green-300 font-mono"># Editor: ${lab.title}</div>
        <textarea id="scr-editor" class="w-full h-64 bg-black text-green-400 font-mono text-xs p-3 border border-gray-800 outline-none" spellcheck="false">${lab.template}</textarea>
        <button id="scr-run" class="px-4 py-2 bg-green-900 text-green-100 rounded text-xs border border-green-700">Run & Validate</button>
        <div id="scr-results" class="hidden p-3 bg-gray-900 border border-gray-800 text-xs font-mono"></div>
      </div>`;

    workspace.querySelector('#scr-run').addEventListener('click', () => {
      const code = workspace.querySelector('#scr-editor').value;
      const results = ScriptingEngine.validate(code, lab.checks);
      const resDiv = workspace.querySelector('#scr-results');
      resDiv.classList.remove('hidden');
      resDiv.innerHTML = results.checks.map(c => `<div class="${c.pass ? 'text-green-400' : 'text-red-400'}">${c.pass ? '✓' : '✖'} ${c.label}</div>`).join('') + `<div class="mt-2 pt-2 border-t border-gray-800 ${results.pass ? 'text-green-300' : 'text-amber-300'}">${results.pass ? '✅ Success!' : 'Keep trying...'}</div>`;
    });
  }
}
