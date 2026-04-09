/**
 * glossary.js — Inline Glossary Hover-Over System
 *
 * Usage:
 *   import { glossarize } from '../utils/glossary.js';
 *   element.innerHTML = glossarize(plainText);
 *
 *   import { initGlossary } from '../utils/glossary.js';
 *   initGlossary(); // call once at app startup — injects CSS + tooltip div
 *
 * glossarize(text) — converts plain text to HTML where the first occurrence of
 * each known CCNA term is wrapped in <abbr class="g-term" data-def="...">.
 * The tooltip is shown on hover/focus (desktop) and tap (mobile).
 */

// ── Glossary data ─────────────────────────────────────────────────────────────
// Definitions kept under ~130 chars so they fit cleanly in the tooltip.

export const GLOSSARY = {
  // OSI / General
  'OSI model':        'A 7-layer framework (Physical→Data Link→Network→Transport→Session→Presentation→Application) for standardizing network communication.',
  'TCP/IP model':     'A 4-layer model (Network Access, Internet, Transport, Application) that underpins the modern Internet.',
  'encapsulation':    'Wrapping data with protocol headers (and trailers) as it travels down the OSI stack toward the wire.',
  'decapsulation':    'Removing protocol headers layer by layer as data travels up the OSI stack on the receiving device.',
  'PDU':              'Protocol Data Unit — named form of data at each layer: bit (L1), frame (L2), packet (L3), segment (L4).',
  'bandwidth':        'The maximum data transfer rate of a link, measured in bits per second (bps).',
  'throughput':       'The actual data rate achieved — always ≤ bandwidth, affected by overhead, errors, and congestion.',
  'latency':          'The time delay for data to travel from source to destination.',
  'jitter':           'Variation in packet delay — most damaging for real-time traffic like VoIP and video.',

  // Layer 1
  'UTP':              'Unshielded Twisted Pair — the most common copper cable type for Ethernet (Cat 5e/6/6a).',
  'hub':              'A Layer 1 device that repeats all signals to every port — all ports share one collision domain.',
  'repeater':         'A Layer 1 device that regenerates signals to extend a cable segment beyond its length limit.',

  // Layer 2
  'MAC address':      'A 48-bit hardware address (e.g., AA:BB:CC:DD:EE:FF) that uniquely identifies a network interface.',
  'frame':            'The Layer 2 PDU — contains source/destination MAC, EtherType, payload, and FCS trailer.',
  'switch':           'A Layer 2 device that forwards frames based on MAC addresses, giving each port its own collision domain.',
  'bridge':           'A Layer 2 device that connects two segments and filters traffic by MAC address — the predecessor of switches.',
  'ARP':              'Address Resolution Protocol — maps a known IPv4 address to an unknown MAC via a broadcast request.',
  'VLAN':             'Virtual LAN — a logical broadcast domain created by grouping switch ports, regardless of physical location.',
  '802.1Q':           'The IEEE VLAN trunking standard — inserts a 4-byte tag into Ethernet frames to carry VLAN ID.',
  'trunk':            'A switch port that carries multiple VLANs simultaneously using 802.1Q tagging.',
  'access port':      'A switch port assigned to a single VLAN — does not tag frames; connects end devices.',
  'native VLAN':      'The VLAN whose frames are sent untagged on a trunk link (default: VLAN 1).',
  'STP':              'Spanning Tree Protocol (802.1D) — prevents Layer 2 loops by blocking redundant paths.',
  'RSTP':             'Rapid Spanning Tree Protocol (802.1w) — converges much faster than STP using proposal/agreement.',
  'root bridge':      'The STP switch with the lowest Bridge ID (priority + MAC); all paths are calculated relative to it.',
  'EtherChannel':     'A logical bundle of 2–8 parallel physical links that appears as one interface, boosting bandwidth.',
  'LACP':             'Link Aggregation Control Protocol (802.3ad) — open-standard protocol for negotiating EtherChannel.',
  'PAgP':             'Port Aggregation Protocol — Cisco-proprietary EtherChannel negotiation protocol.',
  'PortFast':         'An STP feature that skips listening/learning and immediately moves a port to forwarding — access ports only.',
  'BPDU Guard':       'An STP protection that err-disables a PortFast port if a BPDU arrives, preventing accidental loops.',
  'CSMA/CD':          'Carrier Sense Multiple Access / Collision Detection — Ethernet\'s half-duplex contention method.',
  'collision domain':  'A segment where frames can collide — each switch port is its own collision domain.',
  'broadcast domain': 'The set of devices that receive a broadcast frame — routers separate broadcast domains.',
  'duplex':           'Half-duplex: one direction at a time (uses CSMA/CD). Full-duplex: simultaneous both ways.',

  // Layer 3
  'IP address':       'A 32-bit (IPv4) or 128-bit (IPv6) logical address assigned to a network interface.',
  'subnet mask':      'A 32-bit value identifying the network vs. host portions of an IP address (e.g., /24 = 255.255.255.0).',
  'CIDR':             'Classless Inter-Domain Routing — uses prefix notation (e.g., /24) instead of classful address classes.',
  'subnetting':       'Dividing a larger IP network into smaller subnetworks by borrowing bits from the host portion.',
  'default gateway':  'The router interface that hosts send traffic to when the destination is on a different network.',
  'routing table':    'A router\'s database of known networks, their next-hop addresses, and outgoing interfaces.',
  'static route':     'A manually configured route — reliable but doesn\'t adapt to topology changes automatically.',
  'OSPF':             'Open Shortest Path First — a link-state protocol using Dijkstra\'s SPF algorithm across defined areas.',
  'EIGRP':            'Enhanced IGRP — Cisco\'s advanced distance-vector protocol using the DUAL algorithm.',
  'RIP':              'Routing Information Protocol — distance-vector protocol using hop count (max 15) as its only metric.',
  'BGP':              'Border Gateway Protocol — the path-vector routing protocol connecting autonomous systems on the Internet.',
  'administrative distance': 'A 0–255 rating of a routing source\'s trustworthiness; lower wins when multiple sources advertise the same prefix.',
  'metric':           'The value a routing protocol uses to compare paths to the same destination (e.g., hop count, cost).',
  'ICMP':             'Internet Control Message Protocol — used by ping, traceroute, and error messages (unreachable, TTL exceeded).',
  'TTL':              'Time To Live — an IP header field decremented at each hop; packet dropped when it reaches 0.',
  'NAT':              'Network Address Translation — maps private IPs to a public IP so private hosts can reach the Internet.',
  'PAT':              'Port Address Translation (NAT overload) — maps many private IPs to one public IP using unique port numbers.',
  'ACL':              'Access Control List — an ordered set of permit/deny rules applied to router interfaces to filter traffic.',
  'wildcard mask':    'The inverse of a subnet mask used in ACLs and OSPF (0 = must match, 1 = ignore).',
  'loopback':         'A virtual interface (e.g., Lo0) that stays up as long as the router runs — used for OSPF router IDs.',
  'router':           'A Layer 3 device that forwards packets between different networks based on destination IP addresses.',

  // Layer 4
  'TCP':              'Transmission Control Protocol — reliable, connection-oriented; uses 3-way handshake, sequencing, and ACKs.',
  'UDP':              'User Datagram Protocol — connectionless, best-effort; lower overhead, used for DNS, DHCP, VoIP.',
  '3-way handshake':  'TCP connection setup: SYN → SYN-ACK → ACK.',
  'port':             'A 16-bit number (0–65535) identifying a specific application or service on a host.',
  'socket':           'The combination of an IP address + port number that uniquely identifies a connection endpoint.',
  'flow control':     'TCP\'s mechanism for preventing a fast sender from overwhelming a slow receiver (receive window).',
  'windowing':        'TCP\'s sliding window — allows multiple segments in-flight before an acknowledgment is required.',

  // Application / Protocols
  'DHCP':             'Dynamic Host Configuration Protocol — auto-assigns IP, mask, gateway, and DNS to hosts (UDP 67/68).',
  'DNS':              'Domain Name System — translates hostnames (e.g., cisco.com) to IP addresses (UDP/TCP 53).',
  'HTTP':             'HyperText Transfer Protocol — stateless web request/response protocol on TCP port 80.',
  'HTTPS':            'HTTP Secure — HTTP encrypted with TLS/SSL on TCP port 443.',
  'FTP':              'File Transfer Protocol — transfers files using TCP 21 (control) and TCP 20 (active data).',
  'TFTP':             'Trivial FTP — simple connectionless file transfer on UDP 69; common for IOS image transfers.',
  'SSH':              'Secure Shell — encrypted remote CLI access on TCP port 22, replacing insecure Telnet.',
  'Telnet':           'Plaintext remote management protocol on TCP 23 — credentials sent unencrypted, avoid in production.',
  'SMTP':             'Simple Mail Transfer Protocol — sends email between servers on TCP port 25.',
  'SNMP':             'Simple Network Management Protocol — monitors devices via UDP 161 (queries) and 162 (traps).',
  'NTP':              'Network Time Protocol — synchronizes device clocks using UDP port 123.',
  'Syslog':           'A logging standard for sending device messages to a central server on UDP port 514.',

  // Security
  'AAA':              'Authentication, Authorization, and Accounting — a framework controlling network access and auditing.',
  'RADIUS':           'Remote Authentication Dial-In User Service — UDP-based AAA; encrypts only the password field.',
  'TACACS+':          'Cisco\'s TCP-based AAA protocol that encrypts the entire payload — preferred for device management.',
  '802.1X':           'IEEE port-based Network Access Control — authenticates devices via EAP before granting access.',
  'port security':    'Switch feature restricting which MAC addresses can use a port — limits unauthorized access.',
  'DHCP snooping':    'Switch security feature blocking rogue DHCP servers by filtering untrusted DHCP messages.',
  'DAI':              'Dynamic ARP Inspection — validates ARP packets against the DHCP snooping binding table to prevent spoofing.',
  'VPN':              'Virtual Private Network — an encrypted tunnel over a public network connecting remote sites or users.',
  'IPsec':            'IP Security — a protocol suite for encrypting and authenticating IP packets, used in site-to-site VPNs.',

  // IPv6
  'IPv6':             '128-bit addressing (8 groups of 4 hex, e.g., 2001:db8::1) replacing IPv4 with a vastly larger space.',
  'EUI-64':           'Derives the 64-bit IPv6 interface ID from a MAC address by inserting FF:FE in the middle.',
  'SLAAC':            'Stateless Address Autoconfiguration — IPv6 hosts self-configure using the prefix from a Router Advertisement.',
  'NDP':              'Neighbor Discovery Protocol — IPv6\'s replacement for ARP, using ICMPv6 NS/NA messages.',
  'link-local':       'An IPv6 address in fe80::/10 — auto-generated, only valid on the local link, never routed.',

  // FHRP
  'HSRP':             'Hot Standby Router Protocol — Cisco FHRP where the active router holds a virtual IP; standby takes over on failure.',
  'VRRP':             'Virtual Router Redundancy Protocol — open-standard FHRP; highest-priority router becomes master.',
  'GLBP':             'Gateway Load Balancing Protocol — Cisco FHRP providing both redundancy and load balancing.',
  'FHRP':             'First Hop Redundancy Protocol — umbrella term for HSRP/VRRP/GLBP; provides a virtual default gateway.',

  // Inter-VLAN / Layer 3 Switching
  'SVI':              'Switched Virtual Interface — a logical Layer 3 interface on a switch bound to a VLAN.',
  'inter-VLAN routing': 'Routing between VLANs using a Layer 3 switch (SVIs) or router-on-a-stick.',
  'ROAS':             'Router-on-a-Stick — inter-VLAN routing via subinterfaces on one physical router port, each 802.1Q tagged.',
  'subinterface':     'A virtual logical interface created on a physical router interface, each carrying a separate VLAN.',

  // Discovery / Management
  'CDP':              'Cisco Discovery Protocol — Layer 2 Cisco-proprietary protocol sharing device info with directly connected neighbors.',
  'LLDP':             'Link Layer Discovery Protocol (802.1AB) — open-standard equivalent of CDP.',
  'PoE':              'Power over Ethernet — delivers DC power over copper cables to APs, IP phones, and cameras (802.3af/at/bt).',

  // Wireless
  'SSID':             'Service Set Identifier — the name of a Wi-Fi network broadcast by an access point.',
  'WLC':              'Wireless LAN Controller — centrally manages lightweight APs, enforces policies, and handles roaming.',
  'CAPWAP':           'Control and Provisioning of Wireless APs — tunnel protocol between WLCs and APs (UDP 5246/5247).',
  'access point':     'A device that bridges wireless clients to the wired network, operating as part of a BSS.',

  // QoS
  'QoS':              'Quality of Service — techniques for prioritizing traffic types to guarantee bandwidth, latency, or jitter.',
  'DSCP':             'Differentiated Services Code Point — a 6-bit IP header field marking packets for QoS treatment.',
  'CoS':              'Class of Service — a 3-bit 802.1Q field marking Ethernet frames for Layer 2 QoS.',

  // SDN / Automation
  'SDN':              'Software-Defined Networking — separates the control plane from the data plane, managed centrally.',
  'REST':             'Representational State Transfer — stateless API style using HTTP methods (GET/POST/PUT/DELETE) and JSON.',
  'RESTCONF':         'REST-based protocol for managing network devices using YANG models over HTTPS (port 443).',
  'NETCONF':          'Network Configuration Protocol — XML/YANG management over SSH (port 830).',
  'YANG':             'Yet Another Next Generation — a data modeling language defining the structure of NETCONF/RESTCONF data.',
  'Ansible':          'Agentless network automation tool using SSH and YAML playbooks.',
  'Puppet':           'Agent-based configuration management tool where nodes pull config from a Puppet master.',
  'Chef':             'Agent-based automation tool using Ruby-based recipes to define desired device state.',
  'Netmiko':          'A Python library simplifying SSH connections to network devices across multiple vendors.',
  'Paramiko':         'A low-level Python SSH library that Netmiko is built on.',
  'Python':           'High-level scripting language widely used in network automation.',

  // OSPF specifics
  'OSPF area':        'A logical group of OSPF routers sharing the same LSDB. Area 0 (backbone) must connect all other areas.',
  'LSA':              'Link State Advertisement — OSPF packet flooded to share topology; different types describe different elements.',
  'LSDB':             'Link State Database — OSPF\'s topology table; identical on all routers in the same area.',
  'DR':               'Designated Router — elected on OSPF multi-access segments to reduce LSA flooding overhead.',
  'BDR':              'Backup Designated Router — OSPF backup for the DR; takes over immediately if the DR fails.',
  'SPF':              'Shortest Path First (Dijkstra) — the algorithm OSPF runs against the LSDB to find loop-free best paths.',
  'adjacency':        'An OSPF relationship formed after two neighbors successfully exchange LSDB information.',
};

// ── Core helpers ──────────────────────────────────────────────────────────────

function _escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _escAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Regex-escape a string for use in RegExp
function _escRx(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── glossarize ────────────────────────────────────────────────────────────────

/**
 * Convert plain text to HTML, wrapping the first occurrence of each known
 * CCNA term in <abbr class="g-term" data-def="...">.
 *
 * @param {string} plainText
 * @returns {string} HTML string — safe to assign to innerHTML
 */
export function glossarize(plainText) {
  if (!plainText) return '';

  // Sort longest terms first so multi-word phrases match before single words
  const terms = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);

  // Build one regex with all terms as alternatives (case-insensitive)
  const pattern = terms.map(_escRx).join('|');
  const rx = new RegExp(`(?<![\\w-])(${pattern})(?![\\w-])`, 'gi');

  // Collect match positions (first occurrence of each term only)
  const used   = new Set();
  const hits   = [];
  let m;
  while ((m = rx.exec(plainText)) !== null) {
    const key = m[1].toLowerCase();
    // Find canonical entry (case-insensitive lookup)
    const termKey = terms.find(t => t.toLowerCase() === key);
    if (termKey && !used.has(key)) {
      used.add(key);
      hits.push({ start: m.index, end: m.index + m[1].length, raw: m[1], term: termKey });
    }
  }

  if (!hits.length) return _escHtml(plainText);

  // Rebuild string, HTML-escaping gaps and inserting abbr tags at hit positions
  let html = '';
  let pos  = 0;
  for (const { start, end, raw, term } of hits) {
    html += _escHtml(plainText.slice(pos, start));
    html += `<abbr class="g-term" data-def="${_escAttr(GLOSSARY[term])}">${_escHtml(raw)}</abbr>`;
    pos = end;
  }
  html += _escHtml(plainText.slice(pos));
  return html;
}

// ── Tooltip init (call once at startup) ───────────────────────────────────────

let _initialized = false;

/**
 * Inject tooltip CSS and set up global event delegation.
 * Safe to call multiple times — only runs once.
 */
export function initGlossary() {
  if (_initialized) return;
  _initialized = true;

  // ── CSS ──
  const style = document.createElement('style');
  style.textContent = `
    .g-term {
      border-bottom: 1px dotted #60a5fa;
      cursor: help;
      text-decoration: none;
      color: inherit;
    }
    #g-tooltip {
      position: fixed;
      z-index: 9999;
      max-width: 260px;
      padding: 7px 11px;
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
      border-radius: 7px;
      font-family: 'JetBrains Mono', 'Courier New', monospace;
      font-size: 0.7rem;
      line-height: 1.45;
      pointer-events: none;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      white-space: normal;
      word-break: break-word;
      opacity: 0;
      transform: translateY(4px);
      transition: opacity 0.12s ease, transform 0.12s ease;
    }
    #g-tooltip.visible {
      opacity: 1;
      transform: translateY(0);
    }
  `;
  document.head.appendChild(style);

  // ── Tooltip element ──
  const tip = document.createElement('div');
  tip.id = 'g-tooltip';
  document.body.appendChild(tip);

  function show(el) {
    tip.textContent = el.dataset.def || '';
    tip.classList.add('visible');
    _position(el);
  }

  function hide() {
    tip.classList.remove('visible');
  }

  function _position(el) {
    const rect = el.getBoundingClientRect();
    const gap  = 8;
    const tw   = tip.offsetWidth  || 260;
    const th   = tip.offsetHeight || 60;

    // Prefer above, fall back to below
    let top  = rect.top - th - gap;
    if (top < 4) top = rect.bottom + gap;

    // Clamp horizontally
    let left = rect.left + rect.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));

    tip.style.top  = `${top}px`;
    tip.style.left = `${left}px`;
  }

  // ── Desktop: mouseenter / mouseleave ──
  document.addEventListener('mouseover', e => {
    const term = e.target.closest?.('.g-term');
    if (term) show(term);
  });
  document.addEventListener('mouseout', e => {
    if (e.target.closest?.('.g-term')) hide();
  });

  // ── Mobile: tap to toggle ──
  let _activeTerm = null;
  document.addEventListener('touchstart', e => {
    const term = e.target.closest?.('.g-term');
    if (term) {
      e.preventDefault();
      if (_activeTerm === term) { hide(); _activeTerm = null; return; }
      _activeTerm = term;
      show(term);
    } else {
      hide();
      _activeTerm = null;
    }
  }, { passive: false });
}
