/**
 * ProjectsView.js — Guided Practical Projects
 */
import { Terminal } from '../engine/Terminal.js';
import { bus } from '../core/EventBus.js';

const PROJECTS = [
  {
    id: 'proj_small_office',
    title: 'Build a Small Office Network',
    icon: '🏠',
    difficulty: 'medium',
    xp: 400,
    minLevel: 1,
    description: 'Set up core LAN infrastructure for a 50-person office: router interfaces, DHCP, VLANs, and internet access.',
    briefing: 'You have just been hired as the network engineer at a growing startup. The office has raw hardware. Your job: get 50 employees connected with proper VLAN segmentation and internet access.',
    phases: [
      {
        id: 'p0', type: 'quiz', title: 'Pre-Flight Knowledge Check', xp: 50,
        questions: [
          { q: 'Which command assigns an IP address to a router interface?', opts: ['ip address <ip> <mask>', 'set ip address <ip>/<cidr>', 'interface ip <ip>', 'ip assign <ip>'], ans: 0, exp: 'ip address <ip> <mask> is the IOS command to assign an IPv4 address under interface config mode.' },
          { q: 'A /24 subnet provides how many usable host addresses?', opts: ['254', '256', '255', '252'], ans: 0, exp: '2^8 - 2 = 254. The network address and broadcast address are not usable.' },
          { q: 'Which command enables a shutdown interface?', opts: ['enable', 'no shutdown', 'interface up', 'activate'], ans: 1, exp: 'no shutdown removes the administrative shutdown and brings the interface up.' }
        ]
      },
      {
        id: 'p1', type: 'cli', title: 'Configure the Edge Router', xp: 150,
        objectives: ['Set hostname to OfficeRouter', 'Assign 10.0.0.1/24 to Gi0/0 (LAN)', 'Assign 203.0.113.2/30 to Gi0/1 (WAN)', 'Add default route 0.0.0.0/0 via 203.0.113.1', 'No shutdown on both interfaces'],
        hints: ['hostname OfficeRouter', 'interface Gi0/0 → ip address 10.0.0.1 255.255.255.0 → no shutdown', 'interface Gi0/1 → ip address 203.0.113.2 255.255.255.252 → no shutdown', 'ip route 0.0.0.0 0.0.0.0 203.0.113.1'],
        targetConfig: {
          hostname: 'OfficeRouter',
          interfaces: {
            'GigabitEthernet0/0': { ip: '10.0.0.1', mask: '255.255.255.0', shutdown: false },
            'GigabitEthernet0/1': { ip: '203.0.113.2', mask: '255.255.255.252', shutdown: false }
          },
          routes: [{ dest: '0.0.0.0', mask: '0.0.0.0', next: '203.0.113.1' }]
        }
      },
      {
        id: 'p2', type: 'cli', title: 'Configure VLANs on the Access Switch', xp: 200,
        objectives: ['Set hostname to OfficeSwitch', 'Create VLAN 10 (name Staff)', 'Create VLAN 20 (name Guest)', 'Set Gi0/1 as trunk (dot1q)', 'Assign Gi0/2 to VLAN 10 access', 'Assign Gi0/3 to VLAN 20 access'],
        hints: ['hostname OfficeSwitch', 'vlan 10 → name Staff; vlan 20 → name Guest', 'interface Gi0/1 → switchport mode trunk', 'interface Gi0/2 → switchport mode access → switchport access vlan 10'],
        targetConfig: {
          hostname: 'OfficeSwitch',
          vlans: { '10': { name: 'Staff' }, '20': { name: 'Guest' } },
          interfaces: {
            'GigabitEthernet0/1': { switchportMode: 'trunk' },
            'GigabitEthernet0/2': { switchportMode: 'access', accessVlan: 10 },
            'GigabitEthernet0/3': { switchportMode: 'access', accessVlan: 20 }
          }
        }
      }
    ]
  },
  {
    id: 'proj_secure_branch',
    title: 'Secure a Branch Router',
    icon: '🔒',
    difficulty: 'easy',
    xp: 250,
    minLevel: 1,
    description: 'Harden a branch router: replace Telnet with SSH, enforce local AAA, add login banners, and restrict VTY access.',
    briefing: 'Security audit reveals the branch router uses Telnet with a weak enable password. Lock it down before the penetration test next week.',
    phases: [
      {
        id: 'p0', type: 'cli', title: 'Harden Authentication', xp: 100,
        objectives: ['Set hostname to BranchRouter', 'Set enable secret Cisco123', 'Configure ip domain-name branch.local', 'Generate RSA key modulus 2048', 'Enable SSH version 2', 'Create user admin privilege 15 secret Admin@123'],
        hints: ['enable secret Cisco123', 'ip domain-name branch.local', 'crypto key generate rsa modulus 2048', 'ip ssh version 2', 'username admin privilege 15 secret Admin@123'],
        targetConfig: {
          hostname: 'BranchRouter',
          enableSecret: 'Cisco123',
          ssh: { domain: 'branch.local', modulus: 2048, version: 2 },
          users: { admin: { privilege: 15, secret: 'Admin@123' } }
        }
      },
      {
        id: 'p1', type: 'quiz', title: 'Device Hardening Concepts', xp: 50,
        questions: [
          { q: 'Which password storage type in IOS provides the strongest protection?', opts: ['Type 0 (cleartext)', 'Type 7 (Vigenère)', 'Type 5 (MD5 — enable secret)', 'Type 1 (DES)'], ans: 2, exp: 'Type 5 (MD5 hash) used by enable secret is the most secure of the common IOS types. Type 7 is easily reversed.' },
          { q: 'What is the purpose of "exec-timeout 5 0" on VTY lines?', opts: ['Allow 5 concurrent sessions', 'Disconnect idle sessions after 5 minutes', 'Retry login 5 times before lockout', 'Set SSH keepalive to 5 seconds'], ans: 1, exp: 'exec-timeout <min> <sec> — 5 0 means disconnect after 5 minutes of idle time, reducing risk from unattended sessions.' },
          { q: 'Which banner is displayed BEFORE the login prompt?', opts: ['banner exec', 'banner motd', 'banner login', 'banner incoming'], ans: 2, exp: 'banner login appears before the login prompt. banner motd appears before banner login. banner exec appears after successful login.' }
        ]
      },
      {
        id: 'p2', type: 'cli', title: 'Enable AAA + Restrict VTY', xp: 100,
        objectives: ['Enable aaa new-model', 'Configure aaa authentication login default local', 'Set VTY lines transport input ssh only', 'Set exec-timeout 5 0 on VTY', 'Add login banner: AUTHORIZED ACCESS ONLY'],
        hints: ['aaa new-model', 'aaa authentication login default local', 'line vty 0 4 → transport input ssh → exec-timeout 5 0', 'banner login ^ AUTHORIZED ACCESS ONLY ^'],
        targetConfig: {
          aaa: { newModel: true, authentication: { login: { default: 'local' } }, authorization: {} },
          vty: { transport: 'ssh' }
        }
      }
    ]
  },
  {
    id: 'proj_ospf_design',
    title: 'OSPF Multi-Area Design',
    icon: '🔁',
    difficulty: 'hard',
    xp: 450,
    minLevel: 3,
    description: 'Design and configure a two-area OSPF network: backbone area 0 with ABR connecting area 1.',
    briefing: 'The network has grown past a single OSPF area. You must configure a two-area design with an ABR, summarisation, and passive interfaces to reduce LSA flooding.',
    phases: [
      {
        id: 'p0', type: 'quiz', title: 'OSPF Fundamentals', xp: 75,
        questions: [
          { q: 'What is the role of an ABR in OSPF?', opts: ['Connects OSPF to BGP', 'Connects two OSPF areas — has interfaces in both areas and generates Type 3 LSAs', 'Elects the DR on broadcast segments', 'Maintains the LSDB for all areas globally'], ans: 1, exp: 'ABR (Area Border Router) sits on the boundary between two OSPF areas. It generates Type 3 Summary LSAs to advertise routes between areas.' },
          { q: 'Which OSPF LSA type is generated by an ABR to summarise routes between areas?', opts: ['Type 1 (Router LSA)', 'Type 2 (Network LSA)', 'Type 3 (Summary LSA)', 'Type 5 (AS External LSA)'], ans: 2, exp: 'Type 3 Summary LSAs are generated by ABRs to advertise routes from one area into another. Area 0 (backbone) must be at the centre of all inter-area routing.' },
          { q: 'What does "passive-interface" do in OSPF?', opts: ['Stops OSPF hellos on the interface but still advertises the network', 'Removes the interface from OSPF entirely', 'Changes the interface cost to infinite', 'Forces the interface to be a DR'], ans: 0, exp: 'passive-interface prevents Hello packets being sent on that interface (no neighbours form), but the connected network is still advertised into OSPF.' }
        ]
      },
      {
        id: 'p1', type: 'cli', title: 'Configure the ABR', xp: 225,
        objectives: ['Set hostname to ABRouter', 'Assign 10.0.0.1/24 to Gi0/0 (area 0)', 'Assign 10.1.0.1/24 to Gi0/1 (area 1)', 'Enable OSPF process 1, router-id 1.1.1.1', 'Advertise Gi0/0 network into area 0', 'Advertise Gi0/1 network into area 1', 'Set Gi0/0 passive-interface'],
        hints: ['hostname ABRouter', 'router ospf 1 → router-id 1.1.1.1', 'network 10.0.0.0 0.0.0.255 area 0', 'network 10.1.0.0 0.0.0.255 area 1', 'passive-interface GigabitEthernet0/0'],
        targetConfig: {
          hostname: 'ABRouter',
          interfaces: {
            'GigabitEthernet0/0': { ip: '10.0.0.1', mask: '255.255.255.0', shutdown: false },
            'GigabitEthernet0/1': { ip: '10.1.0.1', mask: '255.255.255.0', shutdown: false }
          },
          ospf: { processId: 1, routerId: '1.1.1.1', networks: [{ network: '10.0.0.0', wildcard: '0.0.0.255', area: 0 }, { network: '10.1.0.0', wildcard: '0.0.0.255', area: 1 }], passive: ['GigabitEthernet0/0'] }
        }
      },
      {
        id: 'p2', type: 'quiz', title: 'OSPF Verification', xp: 150,
        questions: [
          { q: 'Which show command displays OSPF neighbour adjacency states?', opts: ['show ip route ospf', 'show ip ospf neighbor', 'show ip ospf database', 'show ip ospf interface'], ans: 1, exp: 'show ip ospf neighbor displays all OSPF neighbours, their state (Full/2-Way/etc.), Dead timer, and interface.' },
          { q: 'In OSPF, what state indicates a fully formed adjacency with a DR/BDR?', opts: ['2-Way', 'ExStart', 'Full', 'Loading'], ans: 2, exp: 'Full state means the routers have exchanged LSDBs and are fully adjacent. On P2P links, all neighbours reach Full. On broadcast links, DROther routers reach 2-Way with each other but Full with DR/BDR.' }
        ]
      }
    ]
  },
  {
    id: 'proj_nat_dhcp',
    title: 'NAT + DHCP + ACL Lab',
    icon: '🌐',
    difficulty: 'medium',
    xp: 380,
    minLevel: 2,
    description: 'Configure a router as DHCP server, implement PAT for internet access, and apply ACLs to restrict traffic.',
    briefing: 'The branch office needs DHCP addresses for 50 clients, PAT for internet access through a single public IP, and an ACL to block direct access to the management network.',
    phases: [
      {
        id: 'p0', type: 'cli', title: 'Configure DHCP Server', xp: 100,
        objectives: ['Set hostname to NATRouter', 'Configure Gi0/0 ip 192.168.1.1/24 (LAN)', 'Configure Gi0/1 ip 203.0.113.1/30 (WAN)', 'Create DHCP pool LAN-POOL for 192.168.1.0/24', 'Set default-router 192.168.1.1', 'Set dns-server 8.8.8.8', 'Exclude 192.168.1.1–192.168.1.10 from pool'],
        hints: ['ip dhcp excluded-address 192.168.1.1 192.168.1.10', 'ip dhcp pool LAN-POOL → network 192.168.1.0 255.255.255.0 → default-router 192.168.1.1 → dns-server 8.8.8.8'],
        targetConfig: {
          hostname: 'NATRouter',
          interfaces: {
            'GigabitEthernet0/0': { ip: '192.168.1.1', mask: '255.255.255.0', shutdown: false },
            'GigabitEthernet0/1': { ip: '203.0.113.1', mask: '255.255.255.252', shutdown: false }
          },
          dhcp: { excluded: [{ start: '192.168.1.1', end: '192.168.1.10' }], pools: { 'LAN-POOL': { network: '192.168.1.0', mask: '255.255.255.0', defaultRouter: '192.168.1.1', dns: '8.8.8.8' } } }
        }
      },
      {
        id: 'p1', type: 'cli', title: 'Implement PAT (NAT Overload)', xp: 150,
        objectives: ['Create ACL 1 permitting 192.168.1.0/24', 'Configure ip nat inside on Gi0/0', 'Configure ip nat outside on Gi0/1', 'Apply NAT overload: ip nat inside source list 1 interface Gi0/1 overload'],
        hints: ['access-list 1 permit 192.168.1.0 0.0.0.255', 'interface Gi0/0 → ip nat inside', 'interface Gi0/1 → ip nat outside', 'ip nat inside source list 1 interface GigabitEthernet0/1 overload'],
        targetConfig: {
          acls: { '1': [{ action: 'permit', source: '192.168.1.0', wildcard: '0.0.0.255' }] },
          interfaces: { 'GigabitEthernet0/0': { natInside: true }, 'GigabitEthernet0/1': { natOutside: true } },
          nat: { insideSource: [{ type: 'list', acl: '1', interface: 'GigabitEthernet0/1', overload: true }] }
        }
      },
      {
        id: 'p2', type: 'quiz', title: 'NAT & DHCP Concepts', xp: 130,
        questions: [
          { q: 'What is the difference between NAT and PAT?', opts: ['NAT supports UDP only; PAT supports TCP only', 'NAT maps one private IP to one public IP; PAT maps many private IPs to one public IP using port numbers', 'PAT requires a pool of public IPs; NAT uses only one', 'They are identical — PAT is just Cisco terminology for NAT'], ans: 1, exp: 'NAT (static/dynamic) maps private IPs 1:1 to public IPs. PAT (Port Address Translation / NAT overload) maps multiple private IPs to one public IP, differentiating sessions by port number.' },
          { q: 'Which DHCP message does the client send first to discover available servers?', opts: ['DHCP Offer', 'DHCP Request', 'DHCP Discover', 'DHCP ACK'], ans: 2, exp: 'DORA: Discover → Offer → Request → ACK. The client broadcasts a DHCP Discover to find available servers. Servers reply with Offer. Client selects one and sends Request. Server confirms with ACK.' },
          { q: 'ip dhcp excluded-address must be configured BEFORE the pool to take effect. True or False?', opts: ['True — excluded addresses must be defined first', 'False — order does not matter; excluded-address applies regardless of pool order'], ans: 1, exp: 'False — ip dhcp excluded-address can be configured in any order relative to the pool and still works correctly. IOS processes exclusions independently of pool creation order.' }
        ]
      }
    ]
  },
  {
    id: 'proj_ipv6_dual',
    title: 'IPv6 Dual-Stack Migration',
    icon: '6️⃣',
    difficulty: 'hard',
    xp: 500,
    minLevel: 3,
    description: 'Add IPv6 to an existing IPv4 network without disrupting services — dual-stack configuration with static IPv6 routing.',
    briefing: 'The CTO wants IPv6 readiness before the ISP migrates the WAN link. Enable dual-stack on the edge router: keep IPv4 working, add IPv6 addressing, and configure a default IPv6 route.',
    phases: [
      {
        id: 'p0', type: 'quiz', title: 'IPv6 Fundamentals', xp: 75,
        questions: [
          { q: 'Which IPv6 address type is equivalent to a private RFC 1918 address and is only valid within a site?', opts: ['Global Unicast (2000::/3)', 'Link-Local (FE80::/10)', 'Unique Local (FC00::/7)', 'Multicast (FF00::/8)'], ans: 2, exp: 'Unique Local Addresses (ULAs, FC00::/7) are routable within an organisation but not on the internet — analogous to IPv4 RFC 1918 private space.' },
          { q: 'What command enables IPv6 routing on an IOS router?', opts: ['ip routing ipv6', 'ipv6 unicast-routing', 'ipv6 routing enable', 'enable ipv6'], ans: 1, exp: 'ipv6 unicast-routing (global config) enables the router to forward IPv6 packets. Without it, the router only processes IPv6 locally.' },
          { q: 'Which IPv6 address is automatically assigned to every interface and is used for local link communication?', opts: ['Global Unicast', 'Loopback ::1', 'Link-Local FE80::/10', 'Anycast'], ans: 2, exp: 'Link-local addresses (FE80::/10) are automatically configured on every IPv6-enabled interface. They are used for neighbour discovery, routing protocol hellos, and other link-scoped communication.' }
        ]
      },
      {
        id: 'p1', type: 'cli', title: 'Enable Dual-Stack on the Router', xp: 275,
        objectives: ['Set hostname to DualRouter', 'Enable ipv6 unicast-routing', 'Assign 10.0.0.1/24 to Gi0/0 (existing IPv4 — keep it)', 'Assign 2001:db8:1::1/64 to Gi0/0 (IPv6)', 'Assign 2001:db8:2::1/64 to Gi0/1 (WAN IPv6)', 'Add default IPv6 route via 2001:db8:2::254'],
        hints: ['ipv6 unicast-routing', 'interface Gi0/0 → ipv6 address 2001:db8:1::1/64', 'interface Gi0/1 → ipv6 address 2001:db8:2::1/64', 'ipv6 route ::/0 2001:db8:2::254'],
        targetConfig: {
          hostname: 'DualRouter',
          ipv6Routing: true,
          interfaces: {
            'GigabitEthernet0/0': { ip: '10.0.0.1', mask: '255.255.255.0', shutdown: false, ipv6: ['2001:db8:1::1/64'] },
            'GigabitEthernet0/1': { shutdown: false, ipv6: ['2001:db8:2::1/64'] }
          },
          ipv6Routes: [{ dest: '::/0', next: '2001:db8:2::254' }]
        }
      },
      {
        id: 'p2', type: 'quiz', title: 'IPv6 Verification', xp: 150,
        questions: [
          { q: 'Which command shows IPv6 routes on an IOS router?', opts: ['show ip route ipv6', 'show ipv6 route', 'show route ipv6', 'show ipv6 table'], ans: 1, exp: 'show ipv6 route displays the IPv6 routing table. The IPv4 equivalent is show ip route. Note the different command structure.' },
          { q: 'What is SLAAC in IPv6?', opts: ['A DHCPv6 variant requiring a server', 'Stateless Address Autoconfiguration — hosts self-generate a global address from the RA prefix + EUI-64', 'Static Link-local Address Auto-Config', 'A protocol for IPv6 over IPv4 tunnelling'], ans: 1, exp: 'SLAAC (Stateless Address Autoconfiguration) allows hosts to generate their own IPv6 global unicast address using the prefix from a Router Advertisement (RA) combined with their EUI-64 interface ID.' }
        ]
      }
    ]
  },
  {
    id: 'proj_zero_trust',
    title: 'Zero-Trust Branch Hardening',
    icon: '🛡️',
    difficulty: 'hard',
    xp: 550,
    minLevel: 4,
    description: 'Start from a deliberately misconfigured router and fix 6 security violations: weak passwords, Telnet, missing AAA, permissive ACLs, exposed management, and no banners.',
    briefing: 'You inherited a router from the previous engineer. The security audit found 6 critical findings. Fix them all before the compliance review on Friday.',
    phases: [
      {
        id: 'p0', type: 'quiz', title: 'Identify the Vulnerabilities', xp: 100,
        questions: [
          { q: 'Which of the following is a critical security misconfiguration on an IOS device?', opts: ['SSH version 2 enabled', 'Telnet enabled on VTY lines with no ACL', 'exec-timeout set to 5 minutes', 'enable secret configured'], ans: 1, exp: 'Telnet sends all data including passwords in cleartext. Combined with no ACL restriction, anyone on the network can attempt to log in. Replace with SSH + VTY ACL.' },
          { q: 'What security risk does CDP pose on external-facing interfaces?', opts: ['No risk — CDP is encrypted', 'Reveals device model, IOS version, and IP addresses to anyone on the connected segment', 'Causes routing loops on trunk ports', 'Allows attackers to inject VLAN traffic'], ans: 1, exp: 'CDP advertises device details (platform, IOS version, IP addresses) in cleartext on all enabled interfaces. Disable CDP on external/untrusted interfaces with "no cdp enable" or globally with "no cdp run".' },
          { q: 'An ACL that ends with only "deny" statements (no explicit permit) is dangerous because:', opts: ['It permits all traffic not matching a deny rule', 'The implicit deny any at the end blocks all unmatched traffic including legitimate traffic if no permits are present', 'It causes the router to reboot', 'Deny-only ACLs are not supported on IOS'], ans: 1, exp: 'Every ACL has an implicit "deny any" at the end. If your ACL has only deny statements and no permit, ALL traffic is blocked — including legitimate traffic. Always include permit rules for what you want to allow.' }
        ]
      },
      {
        id: 'p1', type: 'cli', title: 'Fix Authentication + SSH', xp: 200,
        objectives: ['Set hostname to HardenedRouter', 'Set enable secret SecurePass99', 'Configure ip domain-name secure.local', 'Generate RSA key modulus 2048', 'Enable SSH version 2', 'Create user netadmin privilege 15 secret N3tAdm1n!', 'Enable aaa new-model', 'Configure aaa authentication login default local'],
        hints: ['enable secret SecurePass99', 'ip domain-name secure.local', 'crypto key generate rsa modulus 2048', 'ip ssh version 2', 'username netadmin privilege 15 secret N3tAdm1n!', 'aaa new-model → aaa authentication login default local'],
        targetConfig: {
          hostname: 'HardenedRouter',
          enableSecret: 'SecurePass99',
          ssh: { domain: 'secure.local', modulus: 2048, version: 2 },
          users: { netadmin: { privilege: 15, secret: 'N3tAdm1n!' } },
          aaa: { newModel: true, authentication: { login: { default: 'local' } }, authorization: {} }
        }
      },
      {
        id: 'p2', type: 'cli', title: 'Lock Down VTY + Apply ACLs', xp: 250,
        objectives: ['Set VTY transport input ssh only', 'Set exec-timeout 5 0 on VTY', 'Create ACL 10 permitting only 10.0.0.0/24 (management subnet)', 'Apply ACL 10 to VTY lines with access-class 10 in', 'Create extended ACL 110: deny tcp any any eq 23 (block Telnet), permit ip any any', 'Apply ACL 110 inbound on Gi0/1 (WAN)'],
        hints: ['line vty 0 4 → transport input ssh → exec-timeout 5 0 → access-class 10 in', 'access-list 10 permit 10.0.0.0 0.0.0.255', 'access-list 110 deny tcp any any eq 23 → access-list 110 permit ip any any', 'interface Gi0/1 → ip access-group 110 in'],
        targetConfig: {
          acls: {
            '10': [{ action: 'permit', source: '10.0.0.0', wildcard: '0.0.0.255' }],
            '110': [{ action: 'deny', protocol: 'tcp', source: 'any', dest: 'any', destPort: 23 }, { action: 'permit', protocol: 'ip', source: 'any', dest: 'any' }]
          },
          vty: { transport: 'ssh', accessClass: '10' },
          interfaces: { 'GigabitEthernet0/1': { shutdown: false } }
        }
      }
    ]
  },
  {
    id: 'proj_vlan_portsec',
    title: 'VLAN Segmentation + Port Security',
    icon: '🔌',
    difficulty: 'medium',
    xp: 350,
    minLevel: 2,
    description: 'Segment a flat network into VLANs for security, configure inter-VLAN routing via SVIs, and harden access ports with port security.',
    briefing: 'A flat /16 network is a security disaster — any device can reach any other. Segment the network into Staff, Servers, and Guest VLANs, route between them with ACL restrictions, and lock down access ports.',
    phases: [
      {
        id: 'p0', type: 'quiz', title: 'VLAN and Security Concepts', xp: 75,
        questions: [
          { q: 'Which port security violation mode drops violating frames AND logs a syslog message without disabling the port?', opts: ['protect', 'restrict', 'shutdown', 'err-disable'], ans: 1, exp: 'restrict drops frames from unknown MACs and increments a violation counter + sends syslog/SNMP trap. protect drops silently. shutdown (default) places the port in err-disable state.' },
          { q: 'What is a VLAN hopping attack?', opts: ['An attacker gaining access to a different VLAN by exploiting trunk port misconfiguration', 'Overflowing the MAC address table of a switch', 'Sending excessive DHCP Discovers to exhaust the IP pool', 'Flooding the network with ARP replies'], ans: 0, exp: 'VLAN hopping exploits trunk port misconfiguration. Double-tagging: attacker sends frames with two 802.1Q tags — the switch strips the outer (native VLAN) tag and forwards on the inner VLAN. Mitigated by changing native VLAN away from user-accessible VLANs.' },
          { q: 'What is required on a Layer 3 switch to route between VLANs using SVIs?', opts: ['A separate router with router-on-a-stick', 'The ip routing command and a Switched Virtual Interface (SVI) per VLAN', 'Sub-interfaces on a trunk port', 'OSPF running between VLANs'], ans: 1, exp: 'Layer 3 switches support inter-VLAN routing via SVIs (interface vlan N) — one SVI per VLAN acting as the gateway. The ip routing command must be enabled to activate Layer 3 forwarding.' }
        ]
      },
      {
        id: 'p1', type: 'cli', title: 'Configure VLANs and SVIs', xp: 150,
        objectives: ['Set hostname to L3Switch', 'Enable ip routing', 'Create VLAN 10 (Staff), VLAN 20 (Servers), VLAN 30 (Guest)', 'Create SVI for VLAN 10: 10.10.10.1/24', 'Create SVI for VLAN 20: 10.20.20.1/24', 'Create SVI for VLAN 30: 10.30.30.1/24', 'Set Gi0/1 access VLAN 10, Gi0/2 access VLAN 20, Gi0/3 access VLAN 30'],
        hints: ['ip routing', 'vlan 10 → name Staff; vlan 20 → name Servers; vlan 30 → name Guest', 'interface Vlan10 → ip address 10.10.10.1 255.255.255.0 → no shutdown', 'interface Gi0/1 → switchport mode access → switchport access vlan 10'],
        targetConfig: {
          hostname: 'L3Switch',
          ipRouting: true,
          vlans: { '10': { name: 'Staff' }, '20': { name: 'Servers' }, '30': { name: 'Guest' } },
          interfaces: {
            'Vlan10': { ip: '10.10.10.1', mask: '255.255.255.0', shutdown: false },
            'Vlan20': { ip: '10.20.20.1', mask: '255.255.255.0', shutdown: false },
            'Vlan30': { ip: '10.30.30.1', mask: '255.255.255.0', shutdown: false },
            'GigabitEthernet0/1': { switchportMode: 'access', accessVlan: 10 },
            'GigabitEthernet0/2': { switchportMode: 'access', accessVlan: 20 },
            'GigabitEthernet0/3': { switchportMode: 'access', accessVlan: 30 }
          }
        }
      },
      {
        id: 'p2', type: 'quiz', title: 'Port Security Verification', xp: 125,
        questions: [
          { q: 'Which command shows port security status including violation counts on an interface?', opts: ['show interfaces security', 'show port-security interface <if>', 'show switchport security', 'show security status'], ans: 1, exp: 'show port-security interface <interface> shows: port security enabled/disabled, violation mode, maximum/current MAC count, violation count, and last violation MAC.' },
          { q: 'After a port enters err-disabled state due to a port security violation, what must an admin do?', opts: ['Port recovers automatically after 30 seconds', 'Run shutdown then no shutdown to re-enable the port', 'Run clear port-security on the interface', 'Reload the switch'], ans: 1, exp: 'An err-disabled port must be manually recovered: "shutdown" then "no shutdown" in interface config. Alternatively, configure errdisable recovery cause psecure-violation for automatic recovery.' }
        ]
      }
    ]
  }
];

export class ProjectsView {
  constructor(content, store, containerEl) {
    this.content     = content;
    this.store       = store;
    this.containerEl = containerEl;
  }

  render() {
    const state = this.store.state;
    this.containerEl.innerHTML = `
      <div class="p-4 space-y-4 max-w-5xl mx-auto">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-green-400 font-bold text-sm uppercase tracking-widest">Guided Projects</h2>
            <p class="text-gray-500 text-xs mt-0.5">Multi-phase projects combining CLI configuration and conceptual checkpoints.</p>
          </div>
          <div class="text-right text-xs text-gray-600">
            ${PROJECTS.filter(p => this.store.isProjectComplete(p.id, p.phases.length)).length} / ${PROJECTS.length} complete
          </div>
        </div>

        <div class="grid grid-cols-1 gap-3">
          ${PROJECTS.map(p => {
            const prog     = this.store.getProjectProgress(p.id);
            const done     = prog?.completedPhases?.length ?? 0;
            const total    = p.phases.length;
            const complete = done >= total;
            const locked   = state.level < (p.minLevel || 1);
            const diffColor = { easy: 'text-green-400', medium: 'text-amber-400', hard: 'text-red-400' }[p.difficulty] || 'text-gray-400';
            const borderCls = complete ? 'border-green-700 bg-green-950/30' : locked ? 'border-gray-800 opacity-60' : 'border-gray-700 hover:border-green-600 cursor-pointer';

            return `
              <div class="proj-card rounded border ${borderCls} p-4 transition-colors" data-proj="${p.id}">
                <div class="flex items-start gap-3">
                  <div class="text-3xl shrink-0 mt-0.5">${p.icon}</div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="text-white font-semibold text-sm">${p.title}</span>
                      <span class="${diffColor} text-xs">${p.difficulty}</span>
                      <span class="text-gray-500 text-xs">${p.xp} XP</span>
                      ${complete ? '<span class="text-green-400 text-xs font-semibold">✓ Complete</span>' : ''}
                      ${locked ? `<span class="text-gray-600 text-xs">🔒 Requires Level ${p.minLevel}</span>` : ''}
                    </div>
                    <p class="text-gray-400 text-xs mt-1">${p.description}</p>

                    <!-- Phase progress bar -->
                    <div class="mt-2 flex items-center gap-2">
                      <div class="flex gap-1 flex-1">
                        ${p.phases.map((ph, i) => {
                          const phDone = prog?.completedPhases?.includes(i);
                          return `<div class="flex-1 rounded h-1.5 ${phDone ? 'bg-green-500' : 'bg-gray-700'}" title="Phase ${i+1}: ${ph.title} (${ph.type})"></div>`;
                        }).join('')}
                      </div>
                      <span class="text-gray-600 text-xs shrink-0">${done}/${total}</span>
                    </div>
                  </div>

                  ${!locked ? `<button class="proj-start-btn shrink-0 px-3 py-1.5 text-xs rounded border ${complete ? 'border-green-700 text-green-400' : 'border-green-600 text-green-300 hover:bg-green-900/30'} transition-colors" data-proj="${p.id}">
                    ${complete ? 'Replay' : done > 0 ? 'Continue' : 'Start'}
                  </button>` : ''}
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;

    this.containerEl.querySelectorAll('.proj-start-btn, .proj-card:not(.opacity-60)').forEach(el => {
      el.addEventListener('click', e => {
        const btn = e.target.closest('[data-proj]');
        if (!btn) return;
        const proj = PROJECTS.find(p => p.id === btn.dataset.proj);
        if (!proj || state.level < (proj.minLevel || 1)) return;
        this._renderProjectDetail(proj);
      });
    });
  }

  _renderProjectDetail(project) {
    const prog = this.store.getProjectProgress(project.id);
    const completedPhases = prog?.completedPhases || [];
    let startPhase = 0;
    for (let i = 0; i < project.phases.length; i++) {
      if (!completedPhases.includes(i)) { startPhase = i; break; }
      if (i === project.phases.length - 1) startPhase = 0;
    }

    const diffColor = { easy: 'text-green-400', medium: 'text-amber-400', hard: 'text-red-400' }[project.difficulty] || 'text-gray-400';

    this.containerEl.innerHTML = `
      <div class="p-4 space-y-4 max-w-3xl mx-auto">
        <div class="flex items-center gap-3">
          <button id="proj-back" class="text-gray-500 hover:text-gray-300 text-xs px-2 py-1 border border-gray-700 rounded">← Back</button>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-2xl">${project.icon}</span>
              <span class="text-white font-bold text-sm">${project.title}</span>
              <span class="${diffColor} text-xs">${project.difficulty}</span>
              <span class="text-gray-500 text-xs">${project.xp} XP total</span>
            </div>
          </div>
        </div>

        <div class="rounded border border-blue-900 bg-blue-950/40 p-3">
          <div class="text-blue-400 text-xs font-semibold mb-1">📋 MISSION BRIEFING</div>
          <p class="text-gray-300 text-xs">${project.briefing}</p>
        </div>

        <div class="space-y-2">
          <div class="text-gray-500 text-xs uppercase tracking-widest">Phases</div>
          ${project.phases.map((ph, i) => {
            const done = completedPhases.includes(i);
            const isNext = i === startPhase && !completedPhases.includes(i);
            const locked = !done && !isNext;
            return `
              <div class="rounded border ${done ? 'border-green-700 bg-green-950/20' : isNext ? 'border-amber-700 bg-amber-950/20' : 'border-gray-800'} p-3">
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${done ? 'bg-green-700 text-green-100' : isNext ? 'bg-amber-700 text-amber-100' : 'bg-gray-800 text-gray-600'}">${done ? '✓' : i+1}</span>
                    <div>
                      <div class="text-xs font-semibold ${done ? 'text-green-300' : isNext ? 'text-amber-300' : 'text-gray-600'}">${ph.title}</div>
                      <div class="text-gray-600 text-xs">${ph.type === 'cli' ? '💻 CLI Configuration' : '✓ Knowledge Check'} · ${ph.xp} XP</div>
                    </div>
                  </div>
                  ${!locked && !done ? `<button class="phase-launch-btn text-xs px-3 py-1 rounded border ${isNext ? 'border-amber-600 text-amber-300 hover:bg-amber-900/30' : 'border-gray-700 text-gray-400'} transition-colors" data-phase="${i}">
                    ${isNext ? 'Start Phase' : 'Redo'}
                  </button>` : done ? '<span class="text-green-500 text-xs">✓ Complete</span>' : '<span class="text-gray-700 text-xs">🔒 Locked</span>'}
                </div>
                ${isNext && ph.type === 'cli' ? `<ul class="mt-2 space-y-0.5 text-xs text-gray-500 pl-8">${ph.objectives.map(o => `<li>• ${o}</li>`).join('')}</ul>` : ''}
              </div>`;
          }).join('')}
        </div>

        <div id="phase-workspace" class="space-y-3"></div>
      </div>`;

    this.containerEl.querySelector('#proj-back')?.addEventListener('click', () => this.render());

    this.containerEl.querySelectorAll('.phase-launch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const phaseIdx = +btn.dataset.phase;
        this._startProjectPhase(project, phaseIdx);
      });
    });
  }

  _startProjectPhase(project, phaseIdx) {
    const phase = project.phases[phaseIdx];
    const workspace = this.containerEl.querySelector('#phase-workspace');
    if (!phase || !workspace) return;
    workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (phase.type === 'quiz') {
      this._runQuizProjectPhase(project, phaseIdx, phase, workspace);
    } else {
      this._runCliProjectPhase(project, phaseIdx, phase, workspace);
    }
  }

  _runQuizProjectPhase(project, phaseIdx, phase, container) {
    let currentQ = 0;
    let correct = 0;

    const showQuestion = () => {
      if (currentQ >= phase.questions.length) {
        const pass = correct >= Math.ceil(phase.questions.length * 0.67);
        container.innerHTML = `
          <div class="rounded border ${pass ? 'border-green-700 bg-green-950/30' : 'border-red-800 bg-red-950/30'} p-4 text-center space-y-3">
            <div class="text-2xl">${pass ? '✅' : '❌'}</div>
            <div class="text-sm font-semibold ${pass ? 'text-green-300' : 'text-red-300'}">${pass ? 'Phase Complete!' : 'Try Again'}</div>
            <div class="text-xs text-gray-400">${correct} / ${phase.questions.length} correct ${pass ? `· +${phase.xp} XP` : ''}</div>
            ${pass ? '' : `<button id="pq-retry" class="px-4 py-1.5 text-xs border border-amber-700 text-amber-300 rounded hover:bg-amber-900/30">Retry</button>`}
          </div>`;
        if (pass) {
          this.store.recordProjectPhase(project.id, phaseIdx, phase.xp);
          setTimeout(() => this._renderProjectDetail(project), 1800);
        }
        container.querySelector('#pq-retry')?.addEventListener('click', () => {
          currentQ = 0; correct = 0; showQuestion();
        });
        return;
      }

      const q = phase.questions[currentQ];
      container.innerHTML = `
        <div class="rounded border border-gray-700 bg-gray-900 p-4 space-y-3">
          <div class="flex justify-between items-center">
            <span class="text-amber-400 text-xs font-semibold">✓ Knowledge Check — Phase ${phaseIdx + 1}</span>
            <span class="text-gray-600 text-xs">Q${currentQ + 1}/${phase.questions.length}</span>
          </div>
          <p class="text-white text-sm">${q.q}</p>
          <div class="space-y-2" id="pq-opts">
            ${q.opts.map((o, i) => `
              <button class="pq-opt w-full text-left px-3 py-2 text-xs rounded border border-gray-700 hover:border-green-600 text-gray-300 transition-colors" data-idx="${i}">
                <span class="text-gray-500 mr-2">${String.fromCharCode(65+i)}.</span>${o}
              </button>`).join('')}
          </div>
          <div id="pq-feedback" class="hidden text-xs p-2 rounded border"></div>
        </div>`;

      container.querySelectorAll('.pq-opt').forEach(btn => {
        btn.addEventListener('click', () => {
          const chosen = +btn.dataset.idx;
          const isRight = chosen === q.ans;
          if (isRight) correct++;
          const feedback = container.querySelector('#pq-feedback');
          feedback.classList.remove('hidden');
          feedback.className = `text-xs p-2 rounded border ${isRight ? 'border-green-700 bg-green-950 text-green-300' : 'border-red-800 bg-red-950 text-red-300'}`;
          feedback.textContent = (isRight ? '✓ Correct — ' : '❌ Incorrect — ') + q.exp;
          container.querySelectorAll('.pq-opt').forEach((b, i) => {
            b.disabled = true;
            if (i === q.ans) b.classList.add('border-green-600', 'text-green-300');
            else if (i === chosen && !isRight) b.classList.add('border-red-700', 'text-red-400');
          });
          setTimeout(() => { currentQ++; showQuestion(); }, 2000);
        });
      });
    };
    showQuestion();
  }

  _runCliProjectPhase(project, phaseIdx, phase, container) {
    let projTerminal = null;
    let hintIdx = 0;

    container.innerHTML = `
      <div class="rounded border border-gray-700 space-y-0 overflow-hidden">
        <div class="flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-green-900">
          <div class="flex gap-1.5">
            <div class="w-2.5 h-2.5 rounded-full bg-red-500"></div>
            <div class="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>
            <div class="w-2.5 h-2.5 rounded-full bg-green-500"></div>
          </div>
          <span class="text-green-400 text-xs font-mono ml-1">💻 ${phase.title}</span>
          <div class="ml-auto flex gap-1.5">
            <button id="proj-hint-btn" class="px-2 py-0.5 text-xs bg-yellow-900/50 hover:bg-yellow-900 border border-yellow-700 text-yellow-300 rounded">Hint</button>
            <button id="proj-validate-btn" class="px-2 py-0.5 text-xs bg-green-900/50 hover:bg-green-900 border border-green-700 text-green-300 rounded">Validate</button>
            <button id="proj-reset-btn" class="px-2 py-0.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 rounded">Reset</button>
          </div>
        </div>
        <div class="px-3 py-2 bg-gray-950 border-b border-gray-800">
          <div class="text-gray-500 text-xs font-semibold mb-1 uppercase tracking-widest">Objectives</div>
          <ul id="proj-obj-list" class="space-y-0.5">
            ${phase.objectives.map((o, i) => `<li class="text-xs text-gray-500 flex gap-2" id="proj-obj-${i}"><span class="text-gray-700">□</span><span>${o}</span></li>`).join('')}
          </ul>
        </div>
        <div id="proj-term-out" class="h-52 overflow-y-auto p-3 font-mono text-sm leading-relaxed bg-black"></div>
        <div class="flex items-center px-3 py-2 border-t border-green-900 bg-black">
          <span id="proj-term-prompt" class="text-yellow-400 font-mono text-sm select-none mr-2">Router> </span>
          <input id="proj-term-input" type="text" autocomplete="off" spellcheck="false"
            class="flex-1 bg-transparent text-white font-mono text-sm outline-none caret-green-400"
            placeholder="type a command...">
        </div>
        <div id="proj-val-results" class="hidden px-3 py-2 bg-gray-950 border-t border-gray-800 text-xs font-mono space-y-0.5"></div>
      </div>`;

    projTerminal = new Terminal({
      outputEl: container.querySelector('#proj-term-out'),
      inputEl:  container.querySelector('#proj-term-input'),
      promptEl: container.querySelector('#proj-term-prompt'),
      store:    this.store,
    });

    container.querySelector('#proj-hint-btn')?.addEventListener('click', () => {
      if (!phase.hints?.length) return;
      const hint = phase.hints[Math.min(hintIdx, phase.hints.length - 1)];
      hintIdx = Math.min(hintIdx + 1, phase.hints.length - 1);
      projTerminal.write(`\n\x1b[33m💡 Hint: ${hint}\x1b[0m\n`);
      this.store.spendXP(25);
    });

    container.querySelector('#proj-reset-btn')?.addEventListener('click', () => projTerminal.reset());

    container.querySelector('#proj-validate-btn')?.addEventListener('click', () => {
      projTerminal._targetConfig = phase.targetConfig;
      projTerminal._labId = `proj_${project.id}_${phaseIdx}`;
      const result = projTerminal.validate();

      const valDiv = container.querySelector('#proj-val-results');
      valDiv.classList.remove('hidden');
      valDiv.innerHTML = result.checks.map(c =>
        `<div class="${c.pass ? 'text-green-400' : 'text-red-400'}">${c.pass ? '✓' : '✖'} ${c.label}</div>`
      ).join('') + `<div class="mt-1 border-t border-gray-800 pt-1 ${result.pass ? 'text-green-300' : 'text-amber-300'}">${result.pass ? `✅ Phase complete! +${phase.xp} XP` : `${result.score}% — fix the remaining items above`}</div>`;

      if (result.pass) {
        this.store.recordProjectPhase(project.id, phaseIdx, phase.xp);
        result.checks.forEach((c, i) => {
          const objEl = container.querySelector(`#proj-obj-${i}`);
          if (objEl && c.pass) objEl.querySelector('span').textContent = '✓';
        });
        setTimeout(() => this._renderProjectDetail(project), 2200);
      }
    });
  }
}
