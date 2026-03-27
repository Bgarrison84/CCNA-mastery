/**
 * Subnetting Diagram — Live CIDR input redraws bit-boundary, host count, address range.
 */

function ipToInt(ip) {
  return ip.split('.').reduce((acc, o) => (acc << 8) | parseInt(o), 0) >>> 0;
}

function intToIp(n) {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.');
}

function cidrToMask(prefix) {
  return prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
}

function calcSubnet(ipStr, prefix) {
  const ip    = ipToInt(ipStr);
  const mask  = cidrToMask(prefix);
  const wild  = ~mask >>> 0;
  const net   = (ip & mask) >>> 0;
  const bcast = (net | wild) >>> 0;
  const first = prefix < 31 ? (net + 1) >>> 0 : net;
  const last  = prefix < 31 ? (bcast - 1) >>> 0 : bcast;
  const hosts = prefix <= 30 ? (1 << (32 - prefix)) - 2 : prefix === 31 ? 2 : 1;
  const blockSize = 1 << (32 - prefix);
  const nextNet = (net + blockSize) >>> 0;
  return { net: intToIp(net), bcast: intToIp(bcast), first: intToIp(first), last: intToIp(last), hosts, mask: intToIp(mask), wild: intToIp(wild), nextNet: intToIp(nextNet), blockSize, prefix, ip: intToIp(ip), ipInt: ip, netInt: net, bcastInt: bcast };
}

function toBinary(n) {
  return (n >>> 0).toString(2).padStart(32, '0');
}

function formatBinaryOctets(binStr, prefix) {
  const octets = [];
  for (let i = 0; i < 4; i++) {
    const octet = binStr.slice(i * 8, i * 8 + 8);
    let html = '';
    for (let b = 0; b < 8; b++) {
      const pos = i * 8 + b;
      const bit = octet[b];
      const isNet = pos < prefix;
      html += `<span style="color:${isNet ? '#4ade80' : '#fb923c'};">${bit}</span>`;
    }
    octets.push(`<span>${html}</span>`);
  }
  return octets.join('<span style="color:#374151;"> . </span>');
}

const EXAMPLES = [
  { ip: '192.168.1.0', prefix: 24, label: '/24 (Class C default)' },
  { ip: '192.168.1.64', prefix: 26, label: '/26 (4 subnets of /24)' },
  { ip: '10.0.0.0', prefix: 8, label: '/8 (Class A)' },
  { ip: '172.16.0.0', prefix: 16, label: '/16 (Class B)' },
  { ip: '192.168.1.128', prefix: 30, label: '/30 (point-to-point)' },
];

export function render(containerEl) {
  let inputIp = '192.168.1.0';
  let inputPrefix = 24;
  let error = '';

  function parseInput(val) {
    const m = val.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*\/\s*(\d{1,2})$/);
    if (!m) return null;
    const parts = m[1].split('.').map(Number);
    if (parts.some(p => p > 255)) return null;
    const pref = parseInt(m[2]);
    if (pref < 0 || pref > 32) return null;
    return { ip: m[1], prefix: pref };
  }

  function draw() {
    let sub = null;
    try { sub = calcSubnet(inputIp, inputPrefix); } catch(e) { error = 'Invalid IP'; }

    const ipBin   = sub ? toBinary(sub.ipInt) : '';
    const netBin  = sub ? toBinary(sub.netInt) : '';
    const maskBin = sub ? toBinary(cidrToMask(inputPrefix)) : '';

    containerEl.innerHTML = `
      <div style="font-family:'JetBrains Mono',monospace;font-size:0.78rem;color:#c8ffc8;">

        <!-- Input -->
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap;">
          <input id="sn-input" type="text" value="${inputIp}/${inputPrefix}" placeholder="e.g. 192.168.1.0/24" style="
            flex:1;min-width:180px;padding:7px 12px;background:#0d0d0d;
            border:1px solid ${error?'#f87171':'rgba(0,255,65,0.3)'};border-radius:4px;
            color:#00ff41;font-family:inherit;font-size:0.78rem;outline:none;
          ">
          <button id="sn-calc" style="
            padding:7px 18px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.75rem;font-weight:700;
            background:var(--terminal-green,#00ff41);border:none;color:#000;
          ">Calculate</button>
        </div>

        <!-- Quick examples -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
          ${EXAMPLES.map(e => `
            <button class="sn-ex" data-ip="${e.ip}" data-prefix="${e.prefix}" style="
              padding:3px 9px;border-radius:3px;cursor:pointer;font-family:inherit;font-size:0.62rem;
              background:rgba(0,255,65,0.06);border:1px solid rgba(0,255,65,0.15);color:#6a9a6a;
            ">${e.label}</button>`).join('')}
        </div>

        ${error ? `<div style="color:#f87171;font-size:0.72rem;margin-bottom:10px;">${error}</div>` : ''}

        ${sub ? `
        <!-- Results table -->
        <div style="background:#0d0d0d;border:1px solid rgba(0,255,65,0.1);border-radius:6px;padding:14px;margin-bottom:14px;">
          <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 16px;font-size:0.72rem;">
            ${[
              ['Input IP',       sub.ip,      '#9ca3af'],
              ['Subnet Mask',    sub.mask,    '#9ca3af'],
              ['Wildcard Mask',  sub.wild,    '#9ca3af'],
              ['Network Address',sub.net,     '#4ade80'],
              ['First Usable',   sub.first,   '#86efac'],
              ['Last Usable',    sub.last,    '#86efac'],
              ['Broadcast',      sub.bcast,   '#fb923c'],
              ['Usable Hosts',   sub.hosts.toLocaleString(), '#fbbf24'],
              ['Block Size',     sub.blockSize + ' addresses', '#fbbf24'],
              ['Next Network',   sub.nextNet,  '#6b7280'],
            ].map(([k, v, c]) => `
              <span style="color:#6b7280;">${k}</span>
              <span style="color:${c};font-weight:600;">${v}</span>`).join('')}
          </div>
        </div>

        <!-- Bit boundary diagram -->
        <div style="margin-bottom:14px;">
          <div style="color:#6b7280;font-size:0.65rem;margin-bottom:8px;">
            Bit diagram — <span style="color:#4ade80;">■ network bits (/${inputPrefix})</span>
            <span style="color:#fb923c;"> ■ host bits (${32-inputPrefix})</span>
          </div>

          <!-- Octet labels -->
          <div style="display:grid;grid-template-columns:auto repeat(4, 1fr);gap:4px;font-size:0.62rem;margin-bottom:4px;">
            <span style="color:#4b5563;"></span>
            ${['Octet 1','Octet 2','Octet 3','Octet 4'].map(o=>`<span style="color:#4b5563;text-align:center;">${o}</span>`).join('')}
          </div>

          <!-- IP bits -->
          <div style="display:grid;grid-template-columns:auto 1fr;gap:4px;font-size:0.62rem;margin-bottom:2px;align-items:center;">
            <span style="color:#6b7280;min-width:55px;">IP addr</span>
            <div style="font-size:0.62rem;letter-spacing:0.05em;line-height:1.8;overflow-x:auto;white-space:nowrap;">
              ${formatBinaryOctets(ipBin, inputPrefix)}
            </div>
          </div>

          <!-- Mask bits -->
          <div style="display:grid;grid-template-columns:auto 1fr;gap:4px;font-size:0.62rem;margin-bottom:2px;align-items:center;">
            <span style="color:#6b7280;min-width:55px;">Mask</span>
            <div style="font-size:0.62rem;letter-spacing:0.05em;line-height:1.8;overflow-x:auto;white-space:nowrap;">
              ${formatBinaryOctets(maskBin, inputPrefix)}
            </div>
          </div>

          <!-- Network bits -->
          <div style="display:grid;grid-template-columns:auto 1fr;gap:4px;font-size:0.62rem;align-items:center;">
            <span style="color:#6b7280;min-width:55px;">Network</span>
            <div style="font-size:0.62rem;letter-spacing:0.05em;line-height:1.8;overflow-x:auto;white-space:nowrap;">
              ${formatBinaryOctets(netBin, inputPrefix)}
            </div>
          </div>

          <!-- Boundary indicator -->
          <div style="margin-top:6px;font-size:0.6rem;color:#4b5563;overflow-x:auto;white-space:nowrap;letter-spacing:0.05em;">
            ${'─'.repeat(inputPrefix) + '┤' + (inputPrefix < 32 ? '├' + '─'.repeat(32 - inputPrefix - (inputPrefix < 32 ? 1 : 0)) : '')}
            <span style="margin-left:8px;">↑ bit ${inputPrefix} boundary</span>
          </div>
        </div>

        <!-- Visual address space bar -->
        <div style="margin-bottom:4px;">
          <div style="color:#6b7280;font-size:0.65rem;margin-bottom:6px;">Address space in this subnet</div>
          <div style="display:flex;height:22px;border-radius:3px;overflow:hidden;font-size:0.55rem;">
            <div style="flex:1px;min-width:6px;background:#4ade8033;border-right:1px solid #4ade8066;" title="Network ID"></div>
            <div style="flex:${Math.max(sub.hosts, 1)};background:#4ade8022;" title="Usable hosts"></div>
            <div style="flex:1px;min-width:6px;background:#fb923c33;border-left:1px solid #fb923c66;" title="Broadcast"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.6rem;color:#4b5563;margin-top:3px;">
            <span style="color:#4ade80;">${sub.net} (network)</span>
            <span style="color:#fbbf24;">${sub.hosts.toLocaleString()} usable hosts</span>
            <span style="color:#fb923c;">${sub.bcast} (broadcast)</span>
          </div>
        </div>
        ` : ''}
      </div>`;

    containerEl.querySelector('#sn-calc')?.addEventListener('click', () => {
      const val = containerEl.querySelector('#sn-input')?.value.trim() || '';
      const parsed = parseInput(val);
      if (parsed) { inputIp = parsed.ip; inputPrefix = parsed.prefix; error = ''; }
      else { error = 'Invalid format — use x.x.x.x/nn (e.g. 10.0.0.0/8)'; }
      draw();
    });
    containerEl.querySelector('#sn-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') containerEl.querySelector('#sn-calc')?.click();
    });
    containerEl.querySelectorAll('.sn-ex').forEach(btn => {
      btn.addEventListener('click', () => {
        inputIp = btn.dataset.ip; inputPrefix = parseInt(btn.dataset.prefix); error = '';
        draw();
      });
    });
  }

  draw();
}
