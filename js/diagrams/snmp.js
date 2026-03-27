/**
 * snmp.js — SNMP Operation Flow Diagram
 * Step-through GET / GETNEXT / GETBULK / SET / TRAP / INFORM operations.
 */

const OPERATIONS = [
  {
    id: 'get',
    label: 'GET',
    color: 'text-cyan-400',
    border: 'border-cyan-700',
    bg: 'bg-cyan-950',
    direction: 'manager→agent',
    arrowLabel: 'GET-REQUEST\n(OID: sysDescr.0)',
    replyLabel: 'GET-RESPONSE\n(value: "Cisco IOS…")',
    desc: 'Manager requests a single MIB object value by OID.',
    ports: 'UDP 161 (agent)',
    versions: 'v1, v2c, v3',
    steps: [
      'Manager sends GET-REQUEST with OID (e.g., 1.3.6.1.2.1.1.1.0 = sysDescr)',
      'Agent looks up OID in its MIB tree',
      'Agent returns GET-RESPONSE with current value',
      'On error: agent returns error-status (noSuchObject, tooBig, etc.)',
    ],
  },
  {
    id: 'getnext',
    label: 'GETNEXT',
    color: 'text-blue-400',
    border: 'border-blue-700',
    bg: 'bg-blue-950',
    direction: 'manager→agent',
    arrowLabel: 'GETNEXT-REQUEST\n(OID: sysDescr.0)',
    replyLabel: 'GET-RESPONSE\n(next OID + value)',
    desc: 'Manager walks the MIB tree — each request returns the next OID after the one given.',
    ports: 'UDP 161 (agent)',
    versions: 'v1, v2c, v3',
    steps: [
      'Manager sends GETNEXT-REQUEST with a starting OID',
      'Agent returns the *next* OID in lexicographic order plus its value',
      'Manager repeats with returned OID to walk the entire table',
      'Stops when agent returns endOfMibView (v2c/v3) or noSuchName (v1)',
    ],
  },
  {
    id: 'getbulk',
    label: 'GETBULK',
    color: 'text-purple-400',
    border: 'border-purple-700',
    bg: 'bg-purple-950',
    direction: 'manager→agent',
    arrowLabel: 'GETBULK-REQUEST\n(maxRepetitions=10)',
    replyLabel: 'GET-RESPONSE\n(up to 10 rows)',
    desc: 'Efficient table retrieval — manager requests multiple rows in a single PDU (v2c/v3 only).',
    ports: 'UDP 161 (agent)',
    versions: 'v2c, v3 (not v1)',
    steps: [
      'Manager sends GETBULK-REQUEST with nonRepeaters and maxRepetitions',
      'Agent returns up to maxRepetitions rows for each repeating OID',
      'Reduces round-trips for large tables (e.g., ifTable, routeTable)',
      'Much faster than repeated GETNEXTs for large MIB tables',
    ],
  },
  {
    id: 'set',
    label: 'SET',
    color: 'text-yellow-400',
    border: 'border-yellow-700',
    bg: 'bg-yellow-950',
    direction: 'manager→agent',
    arrowLabel: 'SET-REQUEST\n(OID + new value)',
    replyLabel: 'GET-RESPONSE\n(confirm or error)',
    desc: 'Manager writes a value to a writable MIB object on the agent.',
    ports: 'UDP 161 (agent)',
    versions: 'v1, v2c, v3',
    steps: [
      'Manager sends SET-REQUEST with OID and new value',
      'Agent checks write access (community string or USM credentials)',
      'If permitted, agent updates the MIB object',
      'Agent returns GET-RESPONSE confirming the value (or error-status)',
      'Common use: change interface admin state, sysContact, sysName',
    ],
  },
  {
    id: 'trap',
    label: 'TRAP',
    color: 'text-orange-400',
    border: 'border-orange-700',
    bg: 'bg-orange-950',
    direction: 'agent→manager',
    arrowLabel: 'TRAP-PDU\n(linkDown, authFailure…)',
    replyLabel: '(no acknowledgement)',
    desc: 'Agent sends unsolicited alert to manager — fire-and-forget, no confirmation.',
    ports: 'UDP 162 (manager)',
    versions: 'v1 (TRAP), v2c/v3 (SNMPv2-TRAP)',
    steps: [
      'Agent detects an event (link down, threshold crossed, auth failure)',
      'Agent sends TRAP-PDU to configured trap destination (manager IP)',
      'Manager receives trap on UDP port 162',
      'No acknowledgement — if packet lost, manager never knows',
      'v1 traps use enterprise-specific OIDs; v2c/v3 use trapOID variable',
    ],
  },
  {
    id: 'inform',
    label: 'INFORM',
    color: 'text-green-400',
    border: 'border-green-700',
    bg: 'bg-green-950',
    direction: 'agent→manager',
    arrowLabel: 'INFORM-REQUEST\n(event details)',
    replyLabel: 'GET-RESPONSE\n(acknowledgement)',
    desc: 'Like TRAP but acknowledged — manager sends a response so agent knows it was received.',
    ports: 'UDP 162 (manager)',
    versions: 'v2c, v3 (not v1)',
    steps: [
      'Agent sends INFORM-REQUEST to manager on UDP 162',
      'Manager processes the notification',
      'Manager sends GET-RESPONSE as acknowledgement',
      'If no ACK received, agent retransmits (configurable retries/timeout)',
      'More reliable than TRAP but uses more resources',
    ],
  },
];

export function render(container) {
  container.innerHTML = `
    <div class="snmp-diagram text-xs space-y-4">
      <p class="text-gray-500">Click an operation to see the message flow and step-by-step explanation.</p>

      <!-- Operation selector -->
      <div class="flex flex-wrap gap-1.5">
        ${OPERATIONS.map(op => `
          <button class="snmp-op-btn px-2.5 py-1 rounded border border-gray-700 text-gray-400 hover:border-gray-500 font-mono transition-colors" data-op="${op.id}">
            ${op.label}
          </button>`).join('')}
      </div>

      <!-- Flow diagram -->
      <div id="snmp-flow" class="border border-gray-800 rounded p-4 bg-gray-950">
        <p class="text-gray-600 text-center">Select an operation above to see the flow.</p>
      </div>
    </div>`;

  function renderFlow(opId) {
    const op = OPERATIONS.find(x => x.id === opId);
    if (!op) return;
    const flow = container.querySelector('#snmp-flow');
    const isManagerInit = op.direction === 'manager→agent';

    flow.innerHTML = `
      <div class="${op.border} ${op.bg} border rounded p-4 space-y-4">
        <div class="flex items-center justify-between gap-2 mb-2">
          <h3 class="font-bold ${op.color} font-mono">${op.label}</h3>
          <div class="flex gap-2 text-gray-500">
            <span>Port: <span class="font-mono text-gray-400">${op.ports}</span></span>
            <span>·</span>
            <span>Versions: <span class="text-gray-400">${op.versions}</span></span>
          </div>
        </div>
        <p class="text-gray-400">${op.desc}</p>

        <!-- Message flow animation -->
        <div class="flex items-center gap-2 py-3">
          <div class="text-center w-20 shrink-0">
            <div class="w-14 h-10 mx-auto ${isManagerInit ? 'bg-cyan-900 border-cyan-700' : 'bg-orange-900 border-orange-700'} border rounded flex items-center justify-center text-lg">🖥️</div>
            <div class="text-gray-400 mt-1 text-xs">${isManagerInit ? 'NMS/Manager' : 'Agent'}</div>
          </div>

          <div class="flex-1 relative flex flex-col gap-1">
            <!-- Request arrow -->
            <div class="flex items-center gap-1">
              ${isManagerInit ? '<span class="text-gray-600">──────────────</span><span class="text-gray-400">→</span>' : '<span class="text-gray-400">←</span><span class="text-gray-600">──────────────</span>'}
            </div>
            <div class="text-center ${op.color} font-mono whitespace-pre-line leading-tight">${op.arrowLabel}</div>
            <div class="text-center text-gray-500 whitespace-pre-line leading-tight">${op.replyLabel}</div>
            <!-- Reply arrow -->
            <div class="flex items-center gap-1">
              ${isManagerInit ? '<span class="text-gray-400">←</span><span class="text-gray-600">──────────────</span>' : '<span class="text-gray-600">──────────────</span><span class="text-gray-400">→</span>'}
            </div>
          </div>

          <div class="text-center w-20 shrink-0">
            <div class="w-14 h-10 mx-auto ${isManagerInit ? 'bg-orange-900 border-orange-700' : 'bg-cyan-900 border-cyan-700'} border rounded flex items-center justify-center text-lg">📟</div>
            <div class="text-gray-400 mt-1 text-xs">${isManagerInit ? 'Agent' : 'NMS/Manager'}</div>
          </div>
        </div>

        <!-- Steps -->
        <ol class="space-y-1 list-decimal list-inside text-gray-400 border-t border-gray-800 pt-3">
          ${op.steps.map(s => `<li>${s}</li>`).join('')}
        </ol>
      </div>`;
  }

  container.querySelectorAll('.snmp-op-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.snmp-op-btn').forEach(b => {
        b.classList.remove('border-cyan-500', 'text-cyan-300', 'border-green-500', 'text-green-300',
          'border-yellow-500', 'text-yellow-300', 'border-orange-500', 'text-orange-300',
          'border-purple-500', 'text-purple-300', 'border-blue-500', 'text-blue-300');
        b.classList.add('border-gray-700', 'text-gray-400');
      });
      const op = OPERATIONS.find(x => x.id === btn.dataset.op);
      if (op) {
        btn.classList.remove('border-gray-700', 'text-gray-400');
        btn.classList.add(op.border.replace('border-', 'border-'), op.color);
      }
      renderFlow(btn.dataset.op);
    });
    btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); } });
  });
}
