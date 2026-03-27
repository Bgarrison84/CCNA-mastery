/**
 * IPv6 Address Types — Visual address space map with click-to-expand detail.
 */

const TYPES = [
  {
    id: 'gua',
    name: 'Global Unicast',
    prefix: '2000::/3',
    range: '2000:: — 3FFF:…',
    color: '#4ade80',
    icon: '🌐',
    desc: 'Globally routable and unique — the IPv6 equivalent of public IPv4 addresses. Assigned by ISPs. Prefix: 2001:DB8::/32 is reserved for documentation.',
    structure: [
      { label: 'Global Routing Prefix', bits: '48', color: '#4ade80', desc: 'Assigned by RIR/ISP. Identifies the organisation.' },
      { label: 'Subnet ID', bits: '16', color: '#34d399', desc: '65,536 subnets per prefix — no more /30s!' },
      { label: 'Interface ID', bits: '64', color: '#6ee7b7', desc: 'Usually EUI-64 (derived from MAC) or SLAAC random.' },
    ],
    example: '2001:0DB8:ACAD:0001::/64',
    tip: 'Starts with 001 in binary → hex 2 or 3. The only type that starts with 2 or 3.',
  },
  {
    id: 'lla',
    name: 'Link-Local',
    prefix: 'FE80::/10',
    range: 'FE80:: — FEBF:…',
    color: '#fb923c',
    icon: '🔗',
    desc: 'Automatically configured on every IPv6-enabled interface. Used for neighbour discovery (NDP), routing protocol hellos, and default gateway communication. NOT routable beyond the local link.',
    structure: [
      { label: 'FE80::/10 prefix', bits: '10', color: '#fb923c', desc: 'Fixed prefix. Bits 10–63 are zeros.' },
      { label: 'Zeros', bits: '54', color: '#f97316', desc: 'Filled with zeros.' },
      { label: 'Interface ID', bits: '64', color: '#fed7aa', desc: 'EUI-64 or random (RFC 7217).' },
    ],
    example: 'FE80::1 (manual) or FE80::2AA:FF:FE1A:2B3C (EUI-64)',
    tip: 'Every router interface has a link-local. Routing protocols use link-local as next-hop in show ipv6 route.',
  },
  {
    id: 'ula',
    name: 'Unique Local',
    prefix: 'FC00::/7',
    range: 'FC00:: — FDFF:…',
    color: '#facc15',
    icon: '🏠',
    desc: 'The IPv6 equivalent of RFC 1918 private addresses (10.x, 172.16.x, 192.168.x). NOT globally routable. Used inside organisations. FC00::/8 is officially unassigned; FD00::/8 is the common ULA range.',
    structure: [
      { label: 'FC00::/7 prefix', bits: '7', color: '#facc15', desc: 'Starts with 1111 110 in binary.' },
      { label: 'L flag (1=local)', bits: '1', color: '#fcd34d', desc: 'Set to 1 for locally assigned (FD prefix).' },
      { label: 'Global ID (random)', bits: '40', color: '#fde68a', desc: 'Pseudo-random to avoid collisions between organisations.' },
      { label: 'Subnet ID', bits: '16', color: '#fef3c7', desc: '65,536 subnets per ULA block.' },
      { label: 'Interface ID', bits: '64', color: '#fffbeb', desc: 'EUI-64 or manual.' },
    ],
    example: 'FD00:ABCD:1234:0001::/64',
    tip: 'FC00::/8 is reserved; use FD00::/8 for ULA. Think of "FD" as "Fake/Domestic".',
  },
  {
    id: 'mcast',
    name: 'Multicast',
    prefix: 'FF00::/8',
    range: 'FF00:: — FFFF:…',
    color: '#c084fc',
    icon: '📡',
    desc: 'Sent to a group of interfaces. IPv6 uses multicast where IPv4 used broadcast — there is NO broadcast in IPv6. The second octet encodes lifetime (permanent/transient) and scope (node/link/site/global).',
    structure: [
      { label: 'FF prefix', bits: '8', color: '#c084fc', desc: 'Always FF. Identifies multicast.' },
      { label: 'Flags', bits: '4', color: '#a78bfa', desc: '0RPT — R=rendezvous, P=prefix, T=0 means permanent.' },
      { label: 'Scope', bits: '4', color: '#818cf8', desc: '1=node, 2=link, 5=site, E=global.' },
      { label: 'Group ID', bits: '112', color: '#e0e7ff', desc: 'Identifies the specific multicast group.' },
    ],
    example: 'FF02::1 (all nodes) · FF02::2 (all routers) · FF02::5 (OSPF) · FF02::A (EIGRP)',
    tip: 'Key groups: FF02::1=all IPv6 nodes, FF02::2=all routers, FF02::5/6=OSPF, FF02::A=EIGRP, FF02::1:FF00:0/104=Solicited-Node.',
  },
  {
    id: 'loopback',
    name: 'Loopback',
    prefix: '::1/128',
    range: '::1 only',
    color: '#67e8f9',
    icon: '↩',
    desc: 'The loopback address — equivalent to 127.0.0.1 in IPv4. Only one address exists: ::1. Used for testing the IPv6 stack on the local device.',
    structure: [
      { label: '127 zeros + 1', bits: '128', color: '#67e8f9', desc: '0000…0001 in full binary. Written as ::1 in compressed form.' },
    ],
    example: '::1',
    tip: '::1 is a /128 — the single loopback address. ping6 ::1 tests local stack.',
  },
  {
    id: 'unspec',
    name: 'Unspecified',
    prefix: '::/128',
    range: ':: only',
    color: '#6b7280',
    icon: '∅',
    desc: 'All zeros — ::/128. Used as a source address before a device has a valid IPv6 address (e.g., during SLAAC or DHCPv6 startup). Never used as a destination.',
    structure: [
      { label: '128 zeros', bits: '128', color: '#6b7280', desc: 'All zero bits. Written :: in compressed notation.' },
    ],
    example: ':: (source during DAD/SLAAC startup)',
    tip: 'If a packet has :: as source, the device is still configuring its address. Normal after reboot; abnormal if persistent.',
  },
];

export function render(containerEl) {
  let selected = 'gua';

  function draw() {
    const sel = TYPES.find(t => t.id === selected);

    containerEl.innerHTML = `
      <div style="font-family:'JetBrains Mono',monospace;font-size:0.78rem;color:#c8ffc8;">

        <p style="color:#6a9a6a;font-size:0.72rem;margin-bottom:14px;">
          Click any address type to see its structure, examples, and exam tips.
        </p>

        <!-- Address type buttons -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">
          ${TYPES.map(t => `
            <button class="ipv6-type" data-id="${t.id}" style="
              padding:6px 12px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.7rem;
              background:${selected===t.id?t.color+'33':'rgba(255,255,255,0.03)'};
              border:2px solid ${selected===t.id?t.color:t.color+'33'};
              color:${t.color};
              transition:all 0.15s;
            ">${t.icon} ${t.name}<br><span style="font-size:0.58rem;color:${t.color}88;font-weight:400;">${t.prefix}</span></button>`).join('')}
        </div>

        <!-- Detail panel -->
        ${sel ? `
        <div style="background:#0d0d0d;border:1px solid ${sel.color}33;border-radius:6px;padding:16px;">

          <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:10px;flex-wrap:wrap;">
            <span style="color:${sel.color};font-weight:700;font-size:0.9rem;">${sel.icon} ${sel.name}</span>
            <span style="color:#fbbf24;font-size:0.7rem;">${sel.prefix}</span>
            <span style="color:#4b5563;font-size:0.65rem;">${sel.range}</span>
          </div>

          <p style="color:#d1d5db;font-size:0.72rem;line-height:1.6;margin-bottom:14px;">${sel.desc}</p>

          <!-- Address structure bar -->
          <div style="margin-bottom:12px;">
            <div style="color:#6b7280;font-size:0.65rem;margin-bottom:6px;">Address structure (128 bits total)</div>
            <div style="display:flex;border-radius:4px;overflow:hidden;height:28px;">
              ${sel.structure.map(f => `
                <div style="
                  flex:${parseInt(f.bits)};min-width:${Math.max(parseInt(f.bits)/2, 20)}px;
                  background:${f.color}33;border-right:1px solid rgba(0,0,0,0.3);
                  display:flex;align-items:center;justify-content:center;
                  font-size:0.55rem;color:${f.color};overflow:hidden;
                " title="${f.label}: ${f.bits}b">${f.bits}b</div>`).join('')}
            </div>
            <div style="display:grid;gap:4px;margin-top:8px;font-size:0.65rem;">
              ${sel.structure.map(f => `
                <div style="display:flex;gap:8px;">
                  <span style="color:${f.color};min-width:16px;">${f.bits}b</span>
                  <span style="color:#6b7280;min-width:140px;">${f.label}</span>
                  <span style="color:#4b5563;">${f.desc}</span>
                </div>`).join('')}
            </div>
          </div>

          <!-- Example -->
          <div style="margin-bottom:12px;padding:8px 12px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:4px;">
            <span style="color:#6b7280;font-size:0.65rem;">Example: </span>
            <span style="color:#93c5fd;font-size:0.7rem;">${sel.example}</span>
          </div>

          <!-- Exam tip -->
          <div style="padding:8px 12px;background:rgba(251,191,36,0.05);border-left:2px solid #fbbf24;font-size:0.7rem;color:#fcd34d;line-height:1.5;">
            💡 ${sel.tip}
          </div>
        </div>` : ''}

        <!-- Quick reference table -->
        <div style="margin-top:14px;overflow-x:auto;">
          <table style="width:100%;font-size:0.65rem;border-collapse:collapse;">
            <thead>
              <tr>${['Type','Prefix','Scope','Routable?'].map(h=>`<th style="text-align:left;color:#6b7280;padding:5px 8px;border-bottom:1px solid #1f2937;">${h}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${[
                ['Global Unicast', '2000::/3', 'Global', '✓'],
                ['Link-Local', 'FE80::/10', 'Link only', '✗'],
                ['Unique Local', 'FC00::/7', 'Internal', '✗'],
                ['Multicast', 'FF00::/8', 'Group', 'Scope-dep.'],
                ['Loopback', '::1/128', 'Host only', '✗'],
                ['Unspecified', '::/128', 'Startup', '✗'],
              ].map(([type, prefix, scope, routable]) => {
                const t = TYPES.find(x => x.prefix === prefix || x.prefix.startsWith(prefix.split('/')[0].slice(0,4)));
                const c = t ? t.color : '#9ca3af';
                return `<tr style="border-bottom:1px solid #111;">
                  <td style="padding:5px 8px;color:${c};">${type}</td>
                  <td style="padding:5px 8px;color:#fbbf24;">${prefix}</td>
                  <td style="padding:5px 8px;color:#9ca3af;">${scope}</td>
                  <td style="padding:5px 8px;color:${routable==='✓'?'#4ade80':routable==='✗'?'#f87171':'#facc15'};">${routable}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    containerEl.querySelectorAll('.ipv6-type').forEach(btn => {
      btn.addEventListener('click', () => { selected = btn.dataset.id; draw(); });
    });
  }

  draw();
}
