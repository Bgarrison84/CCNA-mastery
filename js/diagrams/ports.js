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
  let mode = 'view'; // 'view' | 'game'
  let activeFilter = 'all';
  let searchTerm   = '';

  function draw() {
    container.innerHTML = `
      <div class="ports-diagram text-xs space-y-3">
        <!-- Tab Switcher -->
        <div class="flex gap-2 mb-4">
          <button class="port-mode-btn px-3 py-1.5 rounded border ${mode === 'view' ? 'bg-cyan-900/30 border-cyan-500 text-cyan-400' : 'border-gray-700 text-gray-500'}" data-mode="view">Reference</button>
          <button class="port-mode-btn px-3 py-1.5 rounded border ${mode === 'game' ? 'bg-cyan-900/30 border-cyan-500 text-cyan-400' : 'border-gray-700 text-gray-500'}" data-mode="game">Port Quiz</button>
        </div>

        ${mode === 'view' ? renderReference() : renderQuiz()}
      </div>`;

    bindEvents();
    if (mode === 'view') renderTable();
    else initQuiz();
  }

  function renderReference() {
    return `
      <div class="flex items-center gap-2 flex-wrap">
        <input id="port-search" type="text" placeholder="Search port, protocol, description…"
          class="flex-1 min-w-[160px] bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-gray-200 placeholder-gray-600 outline-none focus:border-cyan-500 text-xs" />
        <div class="flex gap-1">
          <button class="port-filter active px-2.5 py-1 rounded border border-gray-600 text-gray-300 hover:border-cyan-500 transition-colors" data-filter="all">All</button>
          <button class="port-filter px-2.5 py-1 rounded border border-gray-600 text-gray-300 hover:border-cyan-500 transition-colors" data-filter="TCP">TCP</button>
          <button class="port-filter px-2.5 py-1 rounded border border-gray-600 text-gray-300 hover:border-cyan-500 transition-colors" data-filter="UDP">UDP</button>
          <button class="port-filter px-2.5 py-1 rounded border border-gray-600 text-gray-300 hover:border-cyan-500 transition-colors" data-filter="secure">Secure</button>
        </div>
      </div>

      <div class="flex gap-3 text-xs text-gray-500 border-b border-gray-800 pb-2">
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-green-500"></span>Secure</span>
        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-red-500"></span>Insecure</span>
      </div>

      <div id="port-count" class="text-gray-600 text-[10px] uppercase tracking-wider"></div>
      <div id="port-table" class="space-y-0.5 max-h-72 overflow-y-auto pr-1"></div>`;
  }

  function renderQuiz() {
    return `
      <div id="port-quiz-pane">
        <p class="text-gray-500 mb-4 text-center">Match the port number to the correct protocol.</p>
        <div id="port-target-proto" class="text-center p-6 bg-cyan-900/20 border border-cyan-500/30 rounded-lg mb-6">
          <div class="text-[10px] uppercase tracking-widest text-cyan-500/60 mb-1">Target Protocol</div>
          <div id="target-name" class="text-xl font-bold text-cyan-400">...</div>
          <div id="target-desc" class="text-[11px] text-cyan-700 italic mt-1">...</div>
        </div>

        <div id="port-options" class="grid grid-cols-3 gap-3 mb-6"></div>
        
        <div id="port-quiz-fb" class="hidden text-center py-3 rounded-lg font-bold"></div>
        <button id="next-port-btn" class="hidden mt-4 w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded font-bold transition-colors">Next Question</button>
      </div>`;
  }

  function renderTable() {
    const table = container.querySelector('#port-table');
    const count = container.querySelector('#port-count');
    if (!table || !count) return;
    const q = searchTerm.toLowerCase();

    const filtered = PORT_DATA.filter(p => {
      const matchFilter = activeFilter === 'all' ? true : activeFilter === 'secure' ? p.security === 'secure' : activeFilter === 'insecure' ? p.security === 'insecure' : p.transport.includes(activeFilter);
      const matchSearch = !q || String(p.port).includes(q) || p.proto.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q);
      return matchFilter && matchSearch;
    });

    count.textContent = `${filtered.length} ports found`;
    table.innerHTML = filtered.map(p => {
      const tc = TRANSPORT_COLORS[p.transport] || 'text-gray-400';
      const sec = SECURITY_STYLES[p.security];
      return `
        <div class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-900 transition-colors cursor-default border border-transparent hover:border-gray-800 group">
          <span class="w-10 text-right font-mono text-green-400 font-bold">${p.port}</span>
          <span class="w-3 flex justify-center"><span class="w-1.5 h-1.5 rounded-full ${sec.dot}"></span></span>
          <span class="w-20 ${tc} font-semibold text-[10px]">${p.transport}</span>
          <span class="w-32 text-gray-200 font-bold">${p.proto}</span>
          <span class="flex-1 text-gray-500 truncate group-hover:text-gray-400">${p.desc}</span>
        </div>`;
    }).join('');
  }

  function bindEvents() {
    container.querySelectorAll('.port-mode-btn').forEach(btn => {
      btn.onclick = () => { mode = btn.dataset.mode; draw(); };
    });

    const search = container.querySelector('#port-search');
    if (search) {
      search.oninput = e => { searchTerm = e.target.value; renderTable(); };
    }

    container.querySelectorAll('.port-filter').forEach(btn => {
      btn.onclick = () => {
        container.querySelectorAll('.port-filter').forEach(b => b.classList.remove('active', 'border-cyan-500', 'text-cyan-300'));
        btn.classList.add('active', 'border-cyan-500', 'text-cyan-300');
        activeFilter = btn.dataset.filter;
        renderTable();
      };
    });
  }

  function initQuiz() {
    const targetName = container.querySelector('#target-name');
    const targetDesc = container.querySelector('#target-desc');
    const optionsBox = container.querySelector('#port-options');
    const fb = container.querySelector('#port-quiz-fb');
    const nextBtn = container.querySelector('#next-port-btn');

    const target = PORT_DATA[Math.floor(Math.random() * PORT_DATA.length)];
    targetName.textContent = target.proto;
    targetDesc.textContent = target.desc;

    const distractors = [];
    while (distractors.length < 5) {
      const d = PORT_DATA[Math.floor(Math.random() * PORT_DATA.length)];
      if (d.port !== target.port && !distractors.find(x => x.port === d.port)) distractors.push(d);
    }

    const options = [target, ...distractors].sort(() => Math.random() - 0.5);
    optionsBox.innerHTML = options.map(opt => `
      <button data-port="${opt.port}" class="port-opt py-3 px-2 bg-gray-900 border border-gray-700 hover:border-cyan-500 rounded font-mono font-bold text-cyan-100 transition-all">
        ${opt.port}
      </button>`).join('');

    optionsBox.querySelectorAll('.port-opt').forEach(btn => {
      btn.onclick = () => {
        const selected = parseInt(btn.dataset.port);
        fb.classList.remove('hidden');
        if (selected === target.port) {
          fb.innerHTML = '✅ Correct! +10 XP'; fb.className = 'text-green-400 py-3 font-bold bg-green-900/20 rounded-lg';
          optionsBox.querySelectorAll('.port-opt').forEach(b => b.disabled = true);
          nextBtn.classList.remove('hidden');
          document.dispatchEvent(new CustomEvent('ccna-xp', { detail: { amount: 10, reason: 'Port Quiz' } }));
        } else {
          fb.innerHTML = `❌ Incorrect. That's ${PORT_DATA.find(x => x.port === selected)?.proto || 'another port'}.`;
          fb.className = 'text-red-400 py-3 font-bold bg-red-900/20 rounded-lg';
          btn.classList.add('border-red-500', 'text-red-500');
          btn.disabled = true;
        }
      };
    });

    nextBtn.onclick = () => initQuiz();
  }

  draw();
}
