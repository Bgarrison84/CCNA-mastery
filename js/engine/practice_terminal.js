/**
 * practice_terminal.js — Beginner Ghost-Text CLI Introduction
 *
 * A lightweight, self-contained terminal for the first 1–2 labs in the Labs view.
 * Designed for learners who have never used a CLI before.
 *
 * Ghost-text behaviour:
 *   - The expected command appears as dimmed gray text in the input field.
 *   - The user types over it character by character.
 *   - Correct keystrokes advance a pointer and the typed portion turns white.
 *   - Wrong keystrokes flash the input red without advancing.
 *   - Backspace is allowed and rewinds the pointer.
 *   - Pressing Enter on a complete command executes it and advances the step.
 *
 * Usage:
 *   import { PracticeTerminal } from './engine/practice_terminal.js';
 *   const pt = new PracticeTerminal(containerEl, labId);
 *   pt.start();
 *
 * Lab data is defined below in PRACTICE_LABS.
 * To flag a lab as beginner-ghost in the main content, set `beginner_ghost: true`
 * and `practice_lab_id: 'intro_modes'` (or 'intro_interface') on the lab object.
 */

// ── Lab definitions ───────────────────────────────────────────────────────────

export const PRACTICE_LABS = {

  intro_modes: {
    title: 'Your First Command',
    description: 'Learn to navigate Cisco IOS privilege modes using the keyboard.',
    steps: [
      {
        prompt: 'Switch>',
        command: 'enable',
        hint: 'Type "enable" to enter privileged EXEC mode.',
        output: 'Switch#',
        explanation: '"enable" elevates you from user EXEC mode (>) to privileged EXEC mode (#). ' +
                     'Privileged mode lets you run show commands and enter global configuration.',
      },
      {
        prompt: 'Switch#',
        command: 'show version',
        hint: 'Type "show version" to display device information.',
        output:
          'Cisco IOS Software, Version 15.2(4)M\n' +
          'ROM: Bootstrap program is IOSv\n' +
          'Uptime: 0 days, 0 hours, 1 minute\n' +
          'cisco IOSv (revision 1.0)',
        explanation: '"show version" is one of the most useful verification commands. ' +
                     'It confirms the IOS version, uptime, and hardware model.',
      },
      {
        prompt: 'Switch#',
        command: 'configure terminal',
        hint: 'Type "configure terminal" to enter global configuration mode.',
        output: 'Switch(config)#',
        explanation: '"configure terminal" (or "conf t") drops you into global configuration mode. ' +
                     'Notice the prompt changes to (config)# — any commands here affect the whole device.',
      },
      {
        prompt: 'Switch(config)#',
        command: 'exit',
        hint: 'Type "exit" to return to privileged EXEC mode.',
        output: 'Switch#',
        explanation: '"exit" steps back one mode level. From (config)# it returns you to #. ' +
                     'You can also press Ctrl+Z to jump straight back to privileged EXEC from anywhere.',
      },
    ],
    completionMessage: 'Lab complete! You have navigated all four IOS mode levels.',
    xp: 30,
  },

  intro_interface: {
    title: 'Basic Interface Configuration',
    description: 'Assign an IP address to an interface — the most common router task.',
    steps: [
      {
        prompt: 'Router>',
        command: 'enable',
        hint: 'Enter privileged mode first.',
        output: 'Router#',
        explanation: 'Always start here. The ">" prompt means you have limited read-only access.',
      },
      {
        prompt: 'Router#',
        command: 'configure terminal',
        hint: 'Enter global configuration mode.',
        output: 'Router(config)#',
        explanation: 'You need to be in (config)# before you can change any interface settings.',
      },
      {
        prompt: 'Router(config)#',
        command: 'interface GigabitEthernet0/0',
        hint: 'Select interface GigabitEthernet0/0.',
        output: 'Router(config-if)#',
        explanation: '"interface GigabitEthernet0/0" (or "int g0/0") navigates into that interface\'s ' +
                     'configuration context. The prompt changes to (config-if)#.',
      },
      {
        prompt: 'Router(config-if)#',
        command: 'ip address 192.168.1.1 255.255.255.0',
        hint: 'Assign IP 192.168.1.1 /24 to this interface.',
        output: '',
        explanation: 'This assigns the IPv4 address and subnet mask. The /24 mask (255.255.255.0) means ' +
                     '254 usable host addresses in the 192.168.1.0 network.',
      },
      {
        prompt: 'Router(config-if)#',
        command: 'no shutdown',
        hint: 'Bring the interface up with "no shutdown".',
        output: '%LINK-5-CHANGED: Interface GigabitEthernet0/0, changed state to up',
        explanation: 'Cisco interfaces are administratively shut down by default on routers. ' +
                     '"no shutdown" enables them. The log message confirms the link came up.',
      },
      {
        prompt: 'Router(config-if)#',
        command: 'end',
        hint: 'Type "end" to return to privileged EXEC mode.',
        output: 'Router#',
        explanation: '"end" (or Ctrl+Z) exits all configuration modes at once and returns you ' +
                     'directly to privileged EXEC mode — faster than typing "exit" repeatedly.',
      },
    ],
    completionMessage: 'Lab complete! You configured your first router interface.',
    xp: 40,
  },

};

// ── PracticeTerminal class ────────────────────────────────────────────────────

export class PracticeTerminal {
  /**
   * @param {HTMLElement} container  — where to render the terminal UI
   * @param {string}      labId      — key in PRACTICE_LABS
   * @param {object}      [opts]
   * @param {function}    [opts.onComplete]  — called with { xp } on lab finish
   */
  constructor(container, labId, opts = {}) {
    this._container  = container;
    this._lab        = PRACTICE_LABS[labId];
    this._onComplete = opts.onComplete || (() => {});
    this._stepIdx    = 0;
    this._pointer    = 0;   // how many chars the user has typed correctly so far
    this._history    = [];  // lines displayed in the output area
    this._inputEl    = null;
    this._ghostEl    = null;
    this._outputEl   = null;
    this._hintEl     = null;
    this._explanEl   = null;

    if (!this._lab) {
      console.error(`PracticeTerminal: unknown labId "${labId}"`);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  start() {
    if (!this._lab) return;
    this._render();
    this._loadStep(0);
    this._inputEl.focus();
  }

  destroy() {
    this._container.innerHTML = '';
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  _render() {
    this._container.innerHTML = `
      <div class="practice-terminal font-mono text-sm select-none"
           style="background:#0d1117;border:1px solid #30d158;border-radius:8px;overflow:hidden;max-width:700px">

        <!-- Header bar -->
        <div style="background:#161b22;border-bottom:1px solid #30d158;padding:8px 14px;display:flex;align-items:center;gap:10px">
          <span style="color:#30d158;font-weight:700">◈ BEGINNER CLI LAB</span>
          <span id="pt-title" style="color:#8b949e;font-size:0.8em"></span>
          <span id="pt-progress" style="margin-left:auto;color:#8b949e;font-size:0.8em"></span>
        </div>

        <!-- Description -->
        <div id="pt-desc" style="padding:10px 14px;color:#8b949e;border-bottom:1px solid #21262d;font-size:0.82em"></div>

        <!-- Output area -->
        <div id="pt-output"
             style="padding:12px 14px;min-height:120px;max-height:260px;overflow-y:auto;
                    color:#c9d1d9;line-height:1.6;white-space:pre-wrap;word-break:break-all"></div>

        <!-- Input row -->
        <div style="display:flex;align-items:center;padding:8px 14px;border-top:1px solid #21262d;position:relative">
          <span id="pt-prompt" style="color:#30d158;margin-right:6px;white-space:nowrap"></span>
          <!-- Ghost + typed overlay -->
          <div style="position:relative;flex:1;height:1.5em;overflow:hidden">
            <!-- Ghost text (full command, dimmed) -->
            <span id="pt-ghost"
                  style="position:absolute;inset:0;color:#3d444d;pointer-events:none;
                         white-space:pre;line-height:1.5em"></span>
            <!-- Typed portion (white, overlaid on ghost) -->
            <span id="pt-typed"
                  style="position:absolute;inset:0;color:#c9d1d9;pointer-events:none;
                         white-space:pre;line-height:1.5em"></span>
            <!-- Hidden real input that captures keystrokes -->
            <input id="pt-input" type="text" autocomplete="off" spellcheck="false"
                   style="position:absolute;inset:0;opacity:0;cursor:default;
                          width:100%;border:none;outline:none;background:transparent" />
          </div>
          <!-- Blinking cursor -->
          <span style="color:#30d158;animation:pt-blink 1s step-end infinite">▋</span>
        </div>

        <!-- Hint bar -->
        <div id="pt-hint"
             style="padding:6px 14px;background:#161b22;border-top:1px solid #21262d;
                    color:#f0a500;font-size:0.8em;min-height:28px"></div>

        <!-- Explanation panel (shown after correct command) -->
        <div id="pt-explan"
             style="display:none;padding:10px 14px;background:#0f2027;border-top:1px solid #21262d;
                    color:#8b949e;font-size:0.82em;line-height:1.5"></div>

        <!-- Next step / complete button row -->
        <div id="pt-actions" style="display:none;padding:8px 14px;border-top:1px solid #21262d;text-align:right"></div>
      </div>

      <style>
        @keyframes pt-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes pt-shake  { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
        @keyframes pt-flash-red   { 0%{background:#3d0a0a} 100%{background:transparent} }
        @keyframes pt-flash-green { 0%{background:#0a2d12} 100%{background:transparent} }
        .pt-shake { animation: pt-shake 0.2s ease }
        .pt-flash-red   { animation: pt-flash-red   0.4s ease }
        .pt-flash-green { animation: pt-flash-green 0.6s ease }
      </style>
    `;

    this._outputEl = this._container.querySelector('#pt-output');
    this._inputEl  = this._container.querySelector('#pt-input');
    this._ghostEl  = this._container.querySelector('#pt-ghost');
    this._typedEl  = this._container.querySelector('#pt-typed');
    this._promptEl = this._container.querySelector('#pt-prompt');
    this._hintEl   = this._container.querySelector('#pt-hint');
    this._explanEl = this._container.querySelector('#pt-explan');
    this._actionsEl = this._container.querySelector('#pt-actions');

    this._container.querySelector('#pt-title').textContent = this._lab.title;
    this._container.querySelector('#pt-desc').textContent  = this._lab.description;

    this._inputEl.addEventListener('keydown', e => this._handleKey(e));

    // Clicking anywhere in the terminal refocuses the hidden input
    this._container.querySelector('.practice-terminal')
        .addEventListener('click', () => this._inputEl.focus());
  }

  _loadStep(idx) {
    const step = this._lab.steps[idx];
    if (!step) return;

    this._stepIdx = idx;
    this._pointer = 0;

    // Update progress counter
    const total = this._lab.steps.length;
    this._container.querySelector('#pt-progress').textContent =
      `Step ${idx + 1} / ${total}`;

    // Set prompt
    this._promptEl.textContent = step.prompt;

    // Set ghost / typed display
    this._ghostEl.textContent = step.command;
    this._typedEl.textContent = '';

    // Clear explanation and actions
    this._explanEl.style.display = 'none';
    this._actionsEl.style.display = 'none';
    this._actionsEl.innerHTML = '';

    // Show hint
    this._hintEl.textContent = '💡 ' + step.hint;

    // Clear the hidden input value
    this._inputEl.value = '';

    this._inputEl.focus();
  }

  // ── Key handling ────────────────────────────────────────────────────────────

  _handleKey(e) {
    const step = this._lab.steps[this._stepIdx];
    if (!step) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      if (this._pointer === step.command.length) {
        this._executeStep(step);
      } else {
        this._flashError();
      }
      return;
    }

    if (e.key === 'Backspace') {
      e.preventDefault();
      if (this._pointer > 0) {
        this._pointer--;
        this._updateTyped(step.command);
      }
      return;
    }

    // Ignore modifier-only keys and non-printable
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();

    const expected = step.command[this._pointer];
    if (e.key === expected) {
      this._pointer++;
      this._updateTyped(step.command);
    } else {
      this._flashError();
    }
  }

  _updateTyped(command) {
    this._typedEl.textContent = command.slice(0, this._pointer);
    // Dim the already-typed portion of the ghost
    this._ghostEl.textContent = command.slice(this._pointer);
    this._ghostEl.style.left  = `${this._pointer}ch`;
  }

  _flashError() {
    const inputRow = this._inputEl.closest('div[style*="position:relative"]');
    inputRow.classList.remove('pt-shake');
    // Trigger reflow to restart animation
    void inputRow.offsetWidth;
    inputRow.classList.add('pt-shake');

    const terminal = this._container.querySelector('.practice-terminal');
    terminal.classList.remove('pt-flash-red');
    void terminal.offsetWidth;
    terminal.classList.add('pt-flash-red');
  }

  // ── Step execution ──────────────────────────────────────────────────────────

  _executeStep(step) {
    // Append the entered command line to output
    this._appendOutput(`${step.prompt} ${step.command}`, '#c9d1d9');
    if (step.output) {
      this._appendOutput(step.output, '#8b949e');
    }

    // Flash success
    const terminal = this._container.querySelector('.practice-terminal');
    terminal.classList.remove('pt-flash-green');
    void terminal.offsetWidth;
    terminal.classList.add('pt-flash-green');

    // Show explanation
    this._explanEl.textContent = step.explanation;
    this._explanEl.style.display = 'block';

    // Hide hint
    this._hintEl.textContent = '';

    // Show next / finish button
    this._actionsEl.style.display = 'block';
    const isLast = this._stepIdx === this._lab.steps.length - 1;
    this._actionsEl.innerHTML = isLast
      ? `<button id="pt-finish"
                 style="background:#30d158;color:#000;border:none;padding:6px 18px;
                        border-radius:4px;cursor:pointer;font-weight:700;font-family:monospace">
           ✓ Finish Lab (+${this._lab.xp} XP)
         </button>`
      : `<button id="pt-next"
                 style="background:#1f6feb;color:#fff;border:none;padding:6px 18px;
                        border-radius:4px;cursor:pointer;font-weight:700;font-family:monospace">
           Next Step →
         </button>`;

    if (isLast) {
      this._actionsEl.querySelector('#pt-finish').addEventListener('click', () => {
        this._complete();
      });
    } else {
      this._actionsEl.querySelector('#pt-next').addEventListener('click', () => {
        this._loadStep(this._stepIdx + 1);
      });
    }

    // Disable input until Next is clicked
    this._inputEl.disabled = true;
  }

  _appendOutput(text, color = '#c9d1d9') {
    const line = document.createElement('div');
    line.style.color = color;
    line.textContent = text;
    this._outputEl.appendChild(line);
    this._outputEl.scrollTop = this._outputEl.scrollHeight;
  }

  _complete() {
    this._appendOutput('', '#30d158');
    this._appendOutput(`✓ ${this._lab.completionMessage}`, '#30d158');

    this._actionsEl.innerHTML =
      `<span style="color:#30d158;font-weight:700">+${this._lab.xp} XP awarded</span>`;

    this._onComplete({ xp: this._lab.xp });
  }
}
