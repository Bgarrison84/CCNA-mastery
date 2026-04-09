/**
 * topology.js — Multi-Device CLI Connectivity Simulator
 *
 * Simulates a 3-segment lab topology:
 *
 *   PC1 (192.168.1.10/24) ──── SW1 ──── R1 ──── R2 ──── Server (172.16.0.10/24)
 *                                    Gi0/0         Gi0/1
 *                               192.168.1.1/24  10.0.0.1/30
 *                                               10.0.0.2/30  172.16.0.1/24
 *
 * Supported commands (context-sensitive):
 *   ping <ip>                  — ICMP simulation with !!!!! / .....
 *   traceroute <ip>            — Hop-by-hop path display
 *   telnet <ip>                — Switch device context
 *   ssh -l admin <ip>          — Switch context (same as telnet for sim)
 *   exit / quit / logout       — Return to previous device
 *   show arp                   — ARP table for current device
 *   show ip interface brief    — Interface table
 *   show ip route              — Routing table (routers only)
 *   show version               — IOS version string
 *   show running-config        — Abbreviated running config
 *   enable / conf t            — Enter privileged / config mode (flavour)
 *
 * Exported API: render(containerEl)
 */

// ── Topology Data ─────────────────────────────────────────────────────────────

const DEVICES = {
  PC1: {
    type: 'host',
    hostname: 'PC1',
    ip: '192.168.1.10',
    mask: '255.255.255.0',
    cidr: 24,
    gateway: '192.168.1.1',
    interfaces: [{ name: 'eth0', ip: '192.168.1.10', mask: '255.255.255.0', status: 'up/up' }],
    arp: [
      { ip: '192.168.1.1',  mac: '00:1A:2B:3C:4D:01', iface: 'eth0' },
      { ip: '192.168.1.20', mac: '00:1A:2B:3C:4D:20', iface: 'eth0' },
    ],
    routes: [
      { prefix: '0.0.0.0/0',         nextHop: '192.168.1.1', iface: 'eth0', proto: 'S*' },
      { prefix: '192.168.1.0/24',    nextHop: 'Connected',   iface: 'eth0', proto: 'C' },
    ],
  },
  R1: {
    type: 'router',
    hostname: 'R1',
    iosVersion: '15.7(3)M2',
    interfaces: [
      { name: 'GigabitEthernet0/0', ip: '192.168.1.1', mask: '255.255.255.0', cidr: 24, status: 'up/up' },
      { name: 'GigabitEthernet0/1', ip: '10.0.0.1',    mask: '255.255.255.252', cidr: 30, status: 'up/up' },
    ],
    arp: [
      { ip: '192.168.1.10', mac: '00:AA:BB:CC:DD:10', iface: 'Gi0/0' },
      { ip: '192.168.1.20', mac: '00:AA:BB:CC:DD:20', iface: 'Gi0/0' },
      { ip: '10.0.0.2',     mac: '00:AA:BB:CC:DD:02', iface: 'Gi0/1' },
    ],
    routes: [
      { prefix: '192.168.1.0/24', nextHop: 'Connected', iface: 'GigabitEthernet0/0', proto: 'C' },
      { prefix: '10.0.0.0/30',    nextHop: 'Connected', iface: 'GigabitEthernet0/1', proto: 'C' },
      { prefix: '172.16.0.0/24',  nextHop: '10.0.0.2',  iface: 'GigabitEthernet0/1', proto: 'O' },
    ],
    gateway: '10.0.0.2',
  },
  R2: {
    type: 'router',
    hostname: 'R2',
    iosVersion: '15.7(3)M2',
    interfaces: [
      { name: 'GigabitEthernet0/0', ip: '10.0.0.2',    mask: '255.255.255.252', cidr: 30, status: 'up/up' },
      { name: 'GigabitEthernet0/1', ip: '172.16.0.1',  mask: '255.255.0.0',     cidr: 16, status: 'up/up' },
    ],
    arp: [
      { ip: '10.0.0.1',    mac: '00:AA:BB:CC:DD:01', iface: 'Gi0/0' },
      { ip: '172.16.0.10', mac: '00:AA:BB:CC:DD:10', iface: 'Gi0/1' },
    ],
    routes: [
      { prefix: '10.0.0.0/30',     nextHop: 'Connected', iface: 'GigabitEthernet0/0', proto: 'C' },
      { prefix: '172.16.0.0/16',   nextHop: 'Connected', iface: 'GigabitEthernet0/1', proto: 'C' },
      { prefix: '192.168.1.0/24',  nextHop: '10.0.0.1',  iface: 'GigabitEthernet0/0', proto: 'O' },
    ],
    gateway: '10.0.0.1',
  },
  Server: {
    type: 'host',
    hostname: 'Server',
    ip: '172.16.0.10',
    mask: '255.255.0.0',
    cidr: 16,
    gateway: '172.16.0.1',
    interfaces: [{ name: 'eth0', ip: '172.16.0.10', mask: '255.255.0.0', status: 'up/up' }],
    arp: [
      { ip: '172.16.0.1', mac: '00:BB:CC:DD:EE:01', iface: 'eth0' },
    ],
    routes: [
      { prefix: '0.0.0.0/0',       nextHop: '172.16.0.1', iface: 'eth0', proto: 'S*' },
      { prefix: '172.16.0.0/16',   nextHop: 'Connected',  iface: 'eth0', proto: 'C' },
    ],
  },
};

// Which IPs map to which device name
const IP_TO_DEVICE = {};
Object.entries(DEVICES).forEach(([name, dev]) => {
  (dev.interfaces || []).forEach(iface => { IP_TO_DEVICE[iface.ip] = name; });
  if (dev.ip) IP_TO_DEVICE[dev.ip] = name;
});

// Reachability map: can device A reach IP X?
function canReach(fromDeviceName, targetIp) {
  // Try to find a route from fromDevice to targetIp
  const src = DEVICES[fromDeviceName];
  if (!src) return false;

  // Direct check: is targetIp on any local interface subnet?
  for (const iface of src.interfaces || []) {
    if (ipInSubnet(targetIp, iface.ip, iface.cidr || iface.mask)) return true;
  }

  // Route check
  for (const route of src.routes || []) {
    if (route.prefix !== '0.0.0.0/0' && route.proto !== 'S*') continue; // skip connected
    if (route.prefix === '0.0.0.0/0' || route.proto === 'S*') {
      // Has default route — check if next-hop device can reach it
      const via = IP_TO_DEVICE[route.nextHop];
      if (via && via !== fromDeviceName) return canReach(via, targetIp);
    }
  }

  // Check if any route covers the target
  for (const route of src.routes || []) {
    if (!route.prefix.includes('/')) continue;
    const [netIp, bits] = route.prefix.split('/');
    if (ipInSubnet(targetIp, netIp, parseInt(bits))) return true;
  }

  return false;
}

function ipInSubnet(ip, netIp, cidrOrMask) {
  const cidr = typeof cidrOrMask === 'number'
    ? cidrOrMask
    : cidrOrMask.split('.').reduce((a, b) => a * 256 + parseInt(b), 0).toString(2).replace(/0/g,'').length;
  const mask = cidr === 0 ? 0 : (0xffffffff << (32 - cidr)) >>> 0;
  const ipInt  = ip.split('.').reduce((a, b) => (a << 8) | parseInt(b), 0) >>> 0;
  const netInt = netIp.split('.').reduce((a, b) => (a << 8) | parseInt(b), 0) >>> 0;
  return (ipInt & mask) === (netInt & mask);
}

// Path from src to target: returns array of hop device names
function tracePath(fromName, targetIp) {
  const path = [fromName];
  let cur = fromName;
  const visited = new Set([cur]);

  for (let hop = 0; hop < 6; hop++) {
    const dev = DEVICES[cur];
    if (!dev) break;

    // Already there?
    for (const iface of dev.interfaces || []) {
      if (iface.ip === targetIp || (dev.ip === targetIp)) return [...path, targetIp];
    }

    // Find which interface or next-hop to use
    let nextHopIp = null;
    let matched = false;

    // Check connected subnets
    for (const iface of dev.interfaces || []) {
      if (ipInSubnet(targetIp, iface.ip, iface.cidr)) {
        // Target is on this subnet
        return [...path, targetIp];
      }
    }

    // Check routes
    let bestBits = -1;
    for (const route of dev.routes || []) {
      if (!route.prefix.includes('/')) continue;
      const [netIp, bitsStr] = route.prefix.split('/');
      const bits = parseInt(bitsStr);
      if (ipInSubnet(targetIp, netIp, bits) && bits > bestBits) {
        bestBits = bits;
        nextHopIp = route.nextHop === 'Connected' ? null : route.nextHop;
        matched = true;
      }
    }

    if (!matched && dev.gateway) nextHopIp = dev.gateway;
    if (!nextHopIp) break;

    const nextDev = IP_TO_DEVICE[nextHopIp];
    if (!nextDev || visited.has(nextDev)) break;
    visited.add(nextDev);
    path.push(nextDev);
    cur = nextDev;
  }
  return path;
}

// ── Command Processor ─────────────────────────────────────────────────────────

function processCommand(raw, session) {
  const cmd = raw.trim();
  if (!cmd) return null;

  const dev  = DEVICES[session.device];
  const name = dev?.hostname || session.device;
  const lower = cmd.toLowerCase();

  // Context mode tracking (purely cosmetic for Cisco feel)
  if (lower === 'enable' || lower === 'en') {
    session.mode = 'privileged';
    return `\n${name}#`;
  }
  if (lower === 'conf t' || lower === 'configure terminal') {
    session.mode = 'config';
    return `Enter configuration commands, one per line. End with CNTL/Z.\n${name}(config)#`;
  }
  if (lower === 'end' || lower === 'cntl+z') {
    session.mode = 'privileged';
    return `${name}#`;
  }
  if (lower === 'exit' || lower === 'quit' || lower === 'logout') {
    if (session.stack.length > 0) {
      const prev = session.stack.pop();
      session.device = prev.device;
      session.mode   = prev.mode;
      const p = DEVICES[session.device];
      return `\n[Connection to ${name} closed]\n\n${p.hostname}${session.mode === 'privileged' ? '#' : '>'}`;
    }
    return `% Not connected to a remote device.`;
  }

  // ── ping ────────────────────────────────────────────────────────────────────
  if (lower.startsWith('ping ')) {
    const targetIp = cmd.slice(5).trim();
    if (!targetIp.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      return `% Unrecognized host or address: "${targetIp}"`;
    }
    const reach = canReach(session.device, targetIp);
    const targetName = IP_TO_DEVICE[targetIp] || targetIp;
    const lines = [
      ``,
      `Type escape sequence to abort.`,
      `Sending 5, 100-byte ICMP Echos to ${targetIp}, timeout is 2 seconds:`,
      reach
        ? `!!!!!`
        : `.....`,
      `Success rate is ${reach ? '100' : '0'} percent (${reach ? '5/5' : '0/5'}), round-trip min/avg/max = ${reach ? '1/2/4' : '-/-/-'} ms`,
    ];
    if (reach) {
      lines.push(`\n[Ping to ${targetName} (${targetIp}) SUCCEEDED ✓]`);
      document.dispatchEvent(new CustomEvent('ccna-xp', { detail: { amount: 5, reason: 'CLI ping' } }));
    } else {
      lines.push(`\n[Ping to ${targetIp} FAILED — check routing/reachability]`);
    }
    return lines.join('\n');
  }

  // ── traceroute ──────────────────────────────────────────────────────────────
  if (lower.startsWith('traceroute ') || lower.startsWith('tracert ')) {
    const targetIp = cmd.replace(/^(traceroute|tracert)\s+/i,'').trim();
    if (!targetIp.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      return `% Unrecognized host or address: "${targetIp}"`;
    }
    const path  = tracePath(session.device, targetIp);
    const reach = canReach(session.device, targetIp);
    const lines = [
      ``,
      `Type escape sequence to abort.`,
      `Tracing the route to ${targetIp}`,
      `VRF info: (vrf in name/id, vrf out name/id)`,
      ``,
    ];
    path.slice(1).forEach((hop, i) => {
      const dev = DEVICES[hop];
      const ip  = dev?.interfaces?.[0]?.ip || hop;
      const ms  = (i + 1) * 3;
      lines.push(`  ${i + 1}  ${ip.padEnd(16)} ${ms} ms  ${ms+1} ms  ${ms} ms`);
    });
    if (!reach) lines.push(`  *  *  * (destination unreachable)`);
    document.dispatchEvent(new CustomEvent('ccna-xp', { detail: { amount: 5, reason: 'CLI traceroute' } }));
    return lines.join('\n');
  }

  // ── telnet / ssh ────────────────────────────────────────────────────────────
  if (lower.startsWith('telnet ') || lower.match(/^ssh\s+-l\s+\w+\s+/)) {
    const targetIp = cmd.replace(/^(telnet|ssh\s+-l\s+\w+)\s+/i,'').trim();
    if (!targetIp.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      return `% Unrecognized host or address: "${targetIp}"`;
    }
    const reach = canReach(session.device, targetIp);
    if (!reach) return `% Connection refused by remote host (unreachable)`;
    const targetDevName = IP_TO_DEVICE[targetIp];
    if (!targetDevName) return `% Destination ${targetIp} has no management interface in this simulation`;
    const targetDev = DEVICES[targetDevName];
    // Push current context
    session.stack.push({ device: session.device, mode: session.mode });
    session.device = targetDevName;
    session.mode   = 'user';
    document.dispatchEvent(new CustomEvent('ccna-xp', { detail: { amount: 10, reason: 'CLI telnet/ssh' } }));
    return `Trying ${targetIp} ...\nOpen\n\n${targetDev.hostname}>`;
  }

  // ── show commands ───────────────────────────────────────────────────────────
  if (lower === 'show arp' || lower === 'show arp table') {
    const rows = (dev?.arp || []).map(a =>
      `  Internet  ${a.ip.padEnd(18)} -  ${a.mac}  ARPA  ${a.iface}`
    );
    return [
      ``,
      `Protocol  Address          Age (min)  Hardware Addr    Type  Interface`,
      ...rows,
    ].join('\n');
  }

  if (lower === 'show ip interface brief' || lower === 'sh ip int br') {
    const rows = (dev?.interfaces || []).map(i =>
      `${i.name.padEnd(26)} ${(i.ip || 'unassigned').padEnd(16)} YES   manual  ${i.status}`
    );
    return [
      ``,
      `Interface                  IP-Address       OK?  Method  Status                Protocol`,
      ...rows,
    ].join('\n');
  }

  if (lower === 'show ip route' || lower === 'sh ip ro') {
    if (!dev?.routes?.length) return `% No routes configured on ${name}`;
    const rows = (dev.routes || []).map(r => {
      const [net, bits] = r.prefix.split('/');
      const tag = r.proto.padEnd(3);
      const via = r.nextHop === 'Connected' ? `directly connected, ${r.iface}` : `[110/2] via ${r.nextHop}`;
      return `${tag}    ${r.prefix.padEnd(20)} ${via}`;
    });
    return [
      ``,
      `Codes: L - local, C - connected, S - static, O - OSPF`,
      ``,
      ...rows,
    ].join('\n');
  }

  if (lower === 'show version' || lower === 'sh ver') {
    const ver = dev?.iosVersion || '15.7(3)M2';
    return [
      ``,
      `Cisco IOS Software, Version ${ver}, RELEASE SOFTWARE (fc5)`,
      `Hostname: ${name}`,
      `Uptime: 2 days, 14 hours, 22 minutes`,
      `Processor: PowerPC 405 (revision 0x0141), 256 MB DRAM`,
      `Flash: 64 MB`,
    ].join('\n');
  }

  if (lower === 'show running-config' || lower === 'sh run') {
    const ifLines = (dev?.interfaces || []).flatMap(i => [
      `!`,
      `interface ${i.name}`,
      ` ip address ${i.ip} ${i.mask}`,
      ` no shutdown`,
    ]);
    const routeLines = (dev?.routes || [])
      .filter(r => r.proto === 'S' || r.proto === 'S*')
      .map(r => `ip route ${r.prefix.replace('/', ' ')} ${r.nextHop}`);
    return [
      `!`,
      `hostname ${name}`,
      ...ifLines,
      `!`,
      ...routeLines,
      `!`,
      `end`,
    ].join('\n');
  }

  if (lower === 'show interfaces' || lower === 'sh int') {
    return (dev?.interfaces || []).map(i => [
      `${i.name} is ${i.status.split('/')[0]}, line protocol is ${i.status.split('/')[1] || 'up'}`,
      `  Internet address is ${i.ip}/${i.cidr ?? '?'}`,
      `  MTU 1500 bytes, BW 1000000 Kbit/sec`,
      `  Input errors: 0, Output errors: 0`,
    ].join('\n')).join('\n') || `% No interfaces`;
  }

  // ── help / ? ────────────────────────────────────────────────────────────────
  if (cmd === '?' || lower === 'help') {
    return [
      ``,
      `Available commands:`,
      `  ping <ip>               — Test ICMP reachability`,
      `  traceroute <ip>         — Trace path to destination`,
      `  telnet <ip>             — Connect to remote device`,
      `  ssh -l admin <ip>       — SSH to remote device`,
      `  exit                    — Disconnect from remote / previous prompt`,
      `  show arp                — Display ARP table`,
      `  show ip interface brief — Interface summary`,
      `  show ip route           — Routing table`,
      `  show running-config     — Running configuration`,
      `  show version            — IOS version info`,
      `  show interfaces         — Interface detail`,
      `  enable / conf t         — Enter privileged/config mode`,
    ].join('\n');
  }

  return `% Unrecognized command: "${cmd}". Type '?' for help.`;
}

// ── Render ────────────────────────────────────────────────────────────────────

export function render(containerEl) {
  const session = {
    device: 'PC1',
    mode:   'user',
    stack:  [],    // telnet/ssh device stack
  };

  const STYLE = `
    .topo-wrap { font-family:'JetBrains Mono','Fira Code',Consolas,monospace; background:#0a0a0f; border:1px solid #1f2937; border-radius:8px; color:#c8ffc8; font-size:0.72rem; }
    .topo-diag { display:flex; align-items:center; gap:0; flex-wrap:wrap; padding:14px 16px 8px; border-bottom:1px solid #1a2733; background:#060a0f; border-radius:8px 8px 0 0; }
    .topo-node { display:flex; flex-direction:column; align-items:center; gap:2px; }
    .topo-icon { width:48px; height:36px; border-radius:4px; border:1px solid; display:flex; align-items:center; justify-content:center; font-size:1.1rem; cursor:pointer; transition:all .15s; }
    .topo-icon:hover { filter:brightness(1.3); }
    .topo-label { font-size:0.58rem; color:#6b7280; text-align:center; }
    .topo-ip { font-size:0.56rem; color:#374151; text-align:center; }
    .topo-link { flex:1; min-width:20px; height:2px; background:#1f2937; align-self:center; margin-bottom:16px; }
    .topo-term { padding:12px; height:260px; overflow-y:auto; scroll-behavior:smooth; }
    .topo-output { white-space:pre; line-height:1.5; }
    .topo-prompt-row { display:flex; align-items:center; gap:4px; margin-top:4px; }
    .topo-prompt-label { color:#00ff41; white-space:nowrap; }
    .topo-input { flex:1; background:transparent; border:none; outline:none; color:#00ff41; font-family:inherit; font-size:inherit; caret-color:#00ff41; }
    .line-output { color:#9ca3af; }
    .line-cmd    { color:#00ff41; }
    .line-error  { color:#f87171; }
    .line-ok     { color:#4ade80; }
    .topo-active { border-color:#00ff41; background:rgba(0,255,65,.08); }
  `;

  containerEl.innerHTML = `<style>${STYLE}</style>
    <div class="topo-wrap">
      <div class="topo-diag" id="topo-diagram"></div>
      <div class="topo-term" id="topo-term"></div>
      <div style="padding:0 12px 10px;">
        <div class="topo-prompt-row">
          <span class="topo-prompt-label" id="topo-prompt"></span>
          <input class="topo-input" id="topo-input" autocomplete="off" spellcheck="false" placeholder="Type a command…" />
        </div>
      </div>
    </div>`;

  // ── Draw topology diagram ──────────────────────────────────────────────────

  function buildDiagram() {
    const diag = containerEl.querySelector('#topo-diagram');
    const nodes = [
      { id:'PC1',    icon:'💻', label:'PC1',    ip:'192.168.1.10/24', color:'#1e40af', border:'#3b82f6' },
      { id:'R1',     icon:'🔀', label:'R1',     ip:'192.168.1.1 | 10.0.0.1', color:'#166534', border:'#22c55e' },
      { id:'R2',     icon:'🔀', label:'R2',     ip:'10.0.0.2 | 172.16.0.1', color:'#166534', border:'#22c55e' },
      { id:'Server', icon:'🖥️', label:'Server', ip:'172.16.0.10/16', color:'#78350f', border:'#f59e0b' },
    ];

    diag.innerHTML = nodes.map((n, i) => `
      <div class="topo-node">
        <div class="topo-icon ${n.id === session.device ? 'topo-active' : ''}"
             id="topo-node-${n.id}"
             style="background:${n.color}22;border-color:${n.id === session.device ? '#00ff41' : n.border};"
             title="Click to jump to ${n.label}">${n.icon}</div>
        <div class="topo-label">${n.label}</div>
        <div class="topo-ip">${n.ip}</div>
      </div>
      ${i < nodes.length - 1 ? '<div class="topo-link"></div>' : ''}
    `).join('');

    nodes.forEach(n => {
      diag.querySelector(`#topo-node-${n.id}`)?.addEventListener('click', () => {
        jumpTo(n.id);
      });
    });
  }

  function jumpTo(deviceName) {
    session.stack = [];
    session.device = deviceName;
    session.mode   = 'user';
    buildDiagram();
    appendOutput(`\n[Jumped to ${deviceName} CLI]\n`, 'line-ok');
    updatePrompt();
  }

  // ── Terminal output ────────────────────────────────────────────────────────

  function appendOutput(text, cls = 'line-output') {
    const term = containerEl.querySelector('#topo-term');
    const line = document.createElement('div');
    line.className = `topo-output ${cls}`;
    line.textContent = text;
    term.appendChild(line);
    term.scrollTop = term.scrollHeight;
  }

  function updatePrompt() {
    const dev    = DEVICES[session.device];
    const name   = dev?.hostname || session.device;
    const suffix = session.mode === 'config' ? '(config)#' : session.mode === 'privileged' ? '#' : '>';
    const promptEl = containerEl.querySelector('#topo-prompt');
    if (promptEl) promptEl.textContent = `${name}${suffix} `;
    buildDiagram();
  }

  // ── Command handling ───────────────────────────────────────────────────────

  function handleEnter(raw) {
    if (!raw.trim()) return;
    const dev    = DEVICES[session.device];
    const name   = dev?.hostname || session.device;
    const suffix = session.mode === 'config' ? '(config)#' : session.mode === 'privileged' ? '#' : '>';
    appendOutput(`${name}${suffix} ${raw}`, 'line-cmd');

    const result = processCommand(raw, session);

    // Check if result contains a new prompt line at the end
    if (result !== null) {
      const lines = result.split('\n');
      const isError = result.startsWith('%');
      lines.forEach(l => appendOutput(l, isError ? 'line-error' : 'line-output'));
    }

    buildDiagram();
    updatePrompt();
  }

  // ── Input wiring ───────────────────────────────────────────────────────────

  const input = containerEl.querySelector('#topo-input');
  const history = [];
  let histIdx = -1;

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const raw = input.value;
      history.unshift(raw);
      histIdx = -1;
      input.value = '';
      handleEnter(raw);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (histIdx < history.length - 1) { histIdx++; input.value = history[histIdx] || ''; }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx > 0) { histIdx--; input.value = history[histIdx] || ''; }
      else { histIdx = -1; input.value = ''; }
    } else if (e.key === 'Tab') {
      e.preventDefault(); // prevent focus loss
    }
  });

  // Focus on click anywhere in the terminal
  containerEl.querySelector('#topo-term').addEventListener('click', () => input.focus());
  containerEl.querySelector('#topo-wrap')?.addEventListener('click', () => input.focus());

  // ── Initial state ──────────────────────────────────────────────────────────

  buildDiagram();
  updatePrompt();

  appendOutput(`Multi-Device CLI Simulator — Lab Topology`, 'line-ok');
  appendOutput(`────────────────────────────────────────`, 'line-output');
  appendOutput(`Devices: PC1, R1, R2, Server`, 'line-output');
  appendOutput(`Click a device in the diagram or use 'telnet <ip>' to connect.`, 'line-output');
  appendOutput(`Type '?' or 'help' for available commands. ↑/↓ for history.`, 'line-output');
  appendOutput(``, 'line-output');

  input.focus();
}
