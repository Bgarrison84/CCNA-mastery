/**
 * ports.js — Interactive Well-Known Ports Diagram
 * Searchable, filterable port reference with transport-type tabs.
 */

const PORT_DATA = [
  { port: 20,   proto: 'FTP Data',     transport: 'TCP',     desc: 'File transfer data channel', security: 'insecure' },
  { port: 21,   proto: 'FTP Control',  transport: 'TCP',     desc: 'File transfer commands', security: 'insecure' },
  { port: 22,   proto: 'SSH / SFTP',   transport: 'TCP',     desc: 'Encrypted remote shell, secure file transfer', security: 'secure' },
  { port: 23,   proto: 'Telnet',       transport: 'TCP',     desc: 'Unencrypted remote CLI — replace with SSH', security: 'insecure' },
  { port: 25,   proto: 'SMTP',         transport: 'TCP',     desc: 'Email sending (outbound)', security: 'insecure' },
  { port: 49,   proto: 'TACACS+',      transport: 'TCP',     desc: 'Cisco device AAA (entire packet encrypted)', security: 'secure' },
  { port: 53,   proto: 'DNS',          transport: 'TCP/UDP', desc: 'Name resolution; UDP queries, TCP for zone transfers (>512 bytes)', security: 'neutral' },
  { port: 67,   proto: 'DHCP Server',  transport: 'UDP',     desc: 'Server listens for client broadcasts', security: 'neutral' },
  { port: 68,   proto: 'DHCP Client',  transport: 'UDP',     desc: 'Client listens for server replies', security: 'neutral' },
  { port: 69,   proto: 'TFTP',         transport: 'UDP',     desc: 'Trivial FTP — no auth, simple transfers (IOS images)', security: 'insecure' },
  { port: 80,   proto: 'HTTP',         transport: 'TCP',     desc: 'Web traffic — unencrypted', security: 'insecure' },
  { port: 110,  proto: 'POP3',         transport: 'TCP',     desc: 'Email retrieval — downloads and deletes from server', security: 'insecure' },
  { port: 123,  proto: 'NTP',          transport: 'UDP',     desc: 'Network Time Protocol — sync to stratum servers', security: 'neutral' },
  { port: 143,  proto: 'IMAP',         transport: 'TCP',     desc: 'Email retrieval — keeps messages on server', security: 'insecure' },
  { port: 161,  proto: 'SNMP',         transport: 'UDP',     desc: 'Manager polls agent for MIB data', security: 'neutral' },
  { port: 162,  proto: 'SNMP Trap',    transport: 'UDP',     desc: 'Agent sends unsolicited alerts to manager', security: 'neutral' },
  { port: 179,  proto: 'BGP',          transport: 'TCP',     desc: 'Border Gateway Protocol — inter-AS routing', security: 'neutral' },
  { port: 389,  proto: 'LDAP',         transport: 'TCP/UDP', desc: 'Lightweight Directory Access Protocol', security: 'neutral' },
  { port: 443,  proto: 'HTTPS',        transport: 'TCP',     desc: 'Encrypted web traffic (TLS)', security: 'secure' },
  { port: 445,  proto: 'SMB',          transport: 'TCP',     desc: 'Windows file and printer sharing', security: 'neutral' },
  { port: 500,  proto: 'ISAKMP/IKE',   transport: 'UDP',     desc: 'VPN key exchange — used in IPsec Phase 1', security: 'secure' },
  { port: 514,  proto: 'Syslog',       transport: 'UDP',     desc: 'System log messages to central server', security: 'neutral' },
  { port: 520,  proto: 'RIP',          transport: 'UDP',     desc: 'Routing Information Protocol updates', security: 'neutral' },
  { port: 587,  proto: 'SMTP (TLS)',   transport: 'TCP',     desc: 'SMTP submission with STARTTLS', security: 'secure' },
  { port: 993,  proto: 'IMAPS',        transport: 'TCP',     desc: 'IMAP over SSL/TLS', security: 'secure' },
  { port: 995,  proto: 'POP3S',        transport: 'TCP',     desc: 'POP3 over SSL/TLS', security: 'secure' },
  { port: 1812, proto: 'RADIUS Auth',  transport: 'UDP',     desc: 'Authentication/Authorization (RFC 2865)', security: 'secure' },
  { port: 1813, proto: 'RADIUS Acct',  transport: 'UDP',     desc: 'Accounting (RFC 2866)', security: 'secure' },
  { port: 3389, proto: 'RDP',          transport: 'TCP',     desc: 'Remote Desktop Protocol', security: 'neutral' },
  { port: 4500, proto: 'NAT-T',        transport: 'UDP',     desc: 'IPsec NAT traversal', security: 'secure' },
  { port: 5060, proto: 'SIP',          transport: 'TCP/UDP', desc: 'VoIP signaling', security: 'neutral' },
  { port: 5061, proto: 'SIPS',         transport: 'TCP',     desc: 'SIP over TLS', security: 'secure' },
  { port: 8080, proto: 'HTTP Alt',     transport: 'TCP',     desc: 'Alternate HTTP / web proxy', security: 'insecure' },
  { port: 8443, proto: 'HTTPS Alt',    transport: 'TCP',     desc: 'Alternate HTTPS port', security: 'secure' },
];

const TRANSPORT_COLORS = { TCP: 'text-cyan-400', UDP: 'text-yellow-400', 'TCP/UDP': 'text-purple-400' };
const SECURITY_STYLES  = {
  secure:   { dot: 'bg-green-500',  label: 'bg-green-900 text-green-300 border border-green-700', text: 'Secure' },
  insecure: { dot: 'bg-red-500',    label: 'bg-red-900 text-red-300 border border-red-700',       text: 'Insecure' },
  neutral:  { dot: 'bg-gray-500',   label: 'bg-gray-800 text-gray-400 border border-gray-700',    text: 'Context-dep.' },
};

export function render(container) {
  container.innerHTML = `
    <div class="ports-diagram text-xs space-y-3">
      <div class="flex items-center gap-2 flex-wrap">
        <input id="port-search" type="text" placeholder="Search port, protocol, description…"
          class="flex-1 min-w-[160px] bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-gray-200 placeholder-gray-600 outline-none focus:border-cyan-500 text-xs" />
        <div class="flex gap-1">
          <button class="port-filter active px-2.5 py-1 rounded border border-gray-600 text-gray-300 hover:border-cyan-500 transition-colors" data-filter="all">All</button>
          <button class="port-filter px-2.5 py-1 rounded border border-gray-600 text-gray-300 hover:border-cyan-500 transition-colors" data-filter="TCP">TCP</button>
          <button class="port-filter px-2.5 py-1 rounded border border-gray-600 text-gray-300 hover:border-cyan-500 transition-colors" data-filter="UDP">UDP</button>
          <button class="port-filter px-2.5 py-1 rounded border border-gray-600 text-gray-300 hover:border-cyan-500 transition-colors" data-filter="secure">Secure</button>
          <button class="port-filter px-2.5 py-1 rounded border border-gray-600 text-gray-300 hover:border-cyan-500 transition-colors" data-filter="insecure">Insecure</button>
        </div>
      </div>

      <div class="flex gap-3 text-xs text-gray-500 border-b border-gray-800 pb-2">
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-green-500"></span>Secure (encrypted)</span>
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-red-500"></span>Insecure (plaintext)</span>
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-gray-500"></span>Context-dependent</span>
      </div>

      <div id="port-count" class="text-gray-600 text-xs"></div>
      <div id="port-table" class="space-y-0.5 max-h-72 overflow-y-auto pr-1"></div>
    </div>`;

  let activeFilter = 'all';
  let searchTerm   = '';

  function renderTable() {
    const table = container.querySelector('#port-table');
    const count = container.querySelector('#port-count');
    const q = searchTerm.toLowerCase();

    const filtered = PORT_DATA.filter(p => {
      const matchFilter = activeFilter === 'all'
        ? true
        : activeFilter === 'secure'   ? p.security === 'secure'
        : activeFilter === 'insecure' ? p.security === 'insecure'
        : p.transport.includes(activeFilter);

      const matchSearch = !q || String(p.port).includes(q)
        || p.proto.toLowerCase().includes(q)
        || p.desc.toLowerCase().includes(q)
        || p.transport.toLowerCase().includes(q);

      return matchFilter && matchSearch;
    });

    count.textContent = `${filtered.length} of ${PORT_DATA.length} ports`;

    table.innerHTML = filtered.map(p => {
      const sec = SECURITY_STYLES[p.security];
      const tc  = TRANSPORT_COLORS[p.transport] || 'text-gray-400';
      return `
        <div class="port-row flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-900 transition-colors cursor-default group border border-transparent hover:border-gray-800">
          <span class="w-10 text-right font-mono text-green-400 font-bold">${p.port}</span>
          <span class="w-5 flex justify-center"><span class="w-2 h-2 rounded-full ${sec.dot}"></span></span>
          <span class="w-24 ${tc} font-semibold">${p.transport}</span>
          <span class="w-28 text-gray-200">${p.proto}</span>
          <span class="flex-1 text-gray-500 group-hover:text-gray-400 transition-colors">${p.desc}</span>
        </div>`;
    }).join('');

    if (!filtered.length) {
      table.innerHTML = `<p class="text-gray-600 text-center py-4">No ports match "${searchTerm}"</p>`;
    }
  }

  container.querySelector('#port-search').addEventListener('input', e => {
    searchTerm = e.target.value;
    renderTable();
  });

  container.querySelectorAll('.port-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.port-filter').forEach(b => b.classList.remove('active', 'border-cyan-500', 'text-cyan-300'));
      btn.classList.add('active', 'border-cyan-500', 'text-cyan-300');
      activeFilter = btn.dataset.filter;
      renderTable();
    });
  });

  // Keyboard support
  container.querySelector('#port-search').addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.target.value = ''; searchTerm = ''; renderTable(); }
  });

  renderTable();
}
