/**
 * cloud.js — Cloud Computing Interactive Diagram
 *
 * Tabs:
 *  1. IaaS/PaaS/SaaS Responsibility Matrix (interactive hover)
 *  2. Cloud Deployment Models (Public/Private/Hybrid/Community cards)
 *  3. Virtual Networking Mapped to On-Prem (VPC ↔ physical analogs)
 *  4. SD-WAN / SASE Overview
 */

const TABS = ['☁️ Service Models', '🏗️ Deployment Models', '🔌 Virtual Networking', '🌐 SD-WAN / SASE'];

// ── Service Model Responsibility Matrix ───────────────────────────────────────

const ROWS = [
  'Applications',
  'Runtime / Middleware',
  'Operating System',
  'Virtualization',
  'Servers / Hardware',
  'Storage',
  'Networking',
  'Physical Facility',
];

// true = Customer manages, false = Provider manages
const MATRIX = {
  'On-Prem':  [true,  true,  true,  true,  true,  true,  true,  true],
  'IaaS':     [true,  true,  true,  false, false, false, false, false],
  'PaaS':     [true,  false, false, false, false, false, false, false],
  'SaaS':     [false, false, false, false, false, false, false, false],
};

const MODEL_COLOR = {
  'On-Prem': { bg: 'bg-gray-700',   border: 'border-gray-500',   text: 'text-gray-100',   label: 'text-gray-300' },
  'IaaS':    { bg: 'bg-blue-900',   border: 'border-blue-500',   text: 'text-blue-100',   label: 'text-blue-300' },
  'PaaS':    { bg: 'bg-purple-900', border: 'border-purple-500', text: 'text-purple-100', label: 'text-purple-300' },
  'SaaS':    { bg: 'bg-green-900',  border: 'border-green-500',  text: 'text-green-100',  label: 'text-green-300' },
};

const MODEL_EXAMPLES = {
  'On-Prem': 'Your own data centre — you buy, rack, power, and manage everything.',
  'IaaS':    'AWS EC2, Azure VMs, GCP Compute Engine — rent compute/storage/network; you manage OS up.',
  'PaaS':    'Heroku, AWS Elastic Beanstalk, Azure App Service — deploy code; provider manages OS/runtime.',
  'SaaS':    'Gmail, Salesforce, Microsoft 365 — consume the app; provider manages everything.',
};

// ── Deployment Models ─────────────────────────────────────────────────────────

const DEPLOY_MODELS = [
  {
    name: 'Public Cloud',
    icon: '🌍',
    color: 'border-blue-600 bg-blue-950',
    label: 'text-blue-300',
    who: 'Owned & operated by a cloud provider (AWS, Azure, GCP)',
    pros: ['No capital expense', 'Infinite scalability', 'Pay-as-you-go', 'Global reach'],
    cons: ['Less control over data residency', 'Shared infrastructure', 'Compliance challenges'],
    examples: 'AWS, Microsoft Azure, Google Cloud, Oracle Cloud',
  },
  {
    name: 'Private Cloud',
    icon: '🏢',
    color: 'border-gray-500 bg-gray-900',
    label: 'text-gray-300',
    who: 'Dedicated infrastructure operated for one organisation (on-prem or hosted)',
    pros: ['Full control', 'Better compliance/data sovereignty', 'Customisable'],
    cons: ['High CapEx', 'Requires in-house expertise', 'Limited scalability'],
    examples: 'VMware vSphere, OpenStack, Cisco UCS, AWS Outposts',
  },
  {
    name: 'Hybrid Cloud',
    icon: '🔗',
    color: 'border-purple-600 bg-purple-950',
    label: 'text-purple-300',
    who: 'Mix of public + private cloud connected via VPN or Direct Connect',
    pros: ['Flexibility', 'Burst to public for peak loads', 'Sensitive data stays private'],
    cons: ['Complex networking', 'Consistent security policy hard to enforce', 'Latency between environments'],
    examples: 'On-prem DC + AWS (via Direct Connect), Azure Arc, Google Anthos',
  },
  {
    name: 'Community Cloud',
    icon: '🤝',
    color: 'border-amber-600 bg-amber-950',
    label: 'text-amber-300',
    who: 'Shared infrastructure for a specific group (e.g., government agencies, healthcare)',
    pros: ['Shared costs among community', 'Meets sector-specific compliance', 'More control than public'],
    cons: ['Less common', 'Still shared among members', 'Smaller economies of scale'],
    examples: 'FedRAMP (US Gov), NHS Cloud (UK Health), financial sector clouds',
  },
];

// ── Virtual Networking Analogs ────────────────────────────────────────────────

const VN_ANALOGS = [
  { onPrem: 'Data Centre / Building',    cloud: 'Cloud Region',           note: 'Geographic location containing multiple AZs' },
  { onPrem: 'Server Room / Floor',       cloud: 'Availability Zone (AZ)', note: 'Isolated data centre within a region; protects against AZ failure' },
  { onPrem: 'Physical Network',          cloud: 'VPC / VNet',             note: 'Virtual Private Cloud — logically isolated network you define' },
  { onPrem: 'VLAN / Subnet',             cloud: 'Subnet (Public/Private)', note: 'Public subnet has route to IGW; private subnet does not' },
  { onPrem: 'Router / Default Gateway',  cloud: 'Internet Gateway (IGW)', note: 'Attaches to VPC; enables internet access for public subnets' },
  { onPrem: 'Stateful Firewall',         cloud: 'Security Group (SG)',    note: 'Instance-level stateful firewall; return traffic automatically permitted' },
  { onPrem: 'Stateless ACL',             cloud: 'Network ACL (NACL)',     note: 'Subnet-level stateless filter; must explicitly allow both directions' },
  { onPrem: 'NAT Router',                cloud: 'NAT Gateway',            note: 'Allows private subnet instances to reach internet; blocks inbound' },
  { onPrem: 'Leased Line / MPLS',        cloud: 'Direct Connect / ExpressRoute', note: 'Dedicated private connection from on-prem to cloud provider' },
  { onPrem: 'Site-to-Site VPN',          cloud: 'VPN Gateway / VGW',     note: 'IPsec VPN from on-prem to cloud VPC over the internet' },
  { onPrem: 'Load Balancer',             cloud: 'ELB / ALB / NLB',        note: 'Distributes traffic across instances; ALB = L7, NLB = L4' },
  { onPrem: 'DNS Server',                cloud: 'Route 53 / Azure DNS',   note: 'Managed DNS with health checks, latency routing, failover' },
];

// ── SD-WAN / SASE ─────────────────────────────────────────────────────────────

const SDWAN_CONCEPTS = [
  {
    term: 'SD-WAN',
    full: 'Software-Defined WAN',
    color: 'border-cyan-700 bg-cyan-950',
    label: 'text-cyan-300',
    desc: 'Centralised control plane managing multiple WAN transports (MPLS, broadband, LTE) with policy-based routing, automatic failover, and application-aware path selection.',
    keyPoints: [
      'Decouples control plane from data plane (like SDN)',
      'Central controller pushes policy to edge devices',
      'Active-active multi-path: route real-time traffic over best link',
      'Application-aware QoS: voice → MPLS, bulk → broadband',
      'Replaces expensive MPLS with cheaper internet + encryption',
    ],
    vendors: 'Cisco Viptela, VMware VeloCloud, Fortinet, Silver Peak',
  },
  {
    term: 'SASE',
    full: 'Secure Access Service Edge',
    color: 'border-violet-700 bg-violet-950',
    label: 'text-violet-300',
    desc: 'Converges networking (SD-WAN) and security (FWaaS, CASB, ZTNA, SWG) into a single cloud-delivered service. Users connect to the nearest PoP regardless of location.',
    keyPoints: [
      'Combines: SD-WAN + FWaaS (Firewall-as-a-Service)',
      'CASB: Cloud Access Security Broker — controls SaaS usage',
      'ZTNA: Zero Trust Network Access — identity-based, not IP-based',
      'SWG: Secure Web Gateway — URL filtering, malware inspection',
      'No backhauling to HQ — branch/remote users hit cloud PoP directly',
    ],
    vendors: 'Cisco+Meraki, Palo Alto Prisma, Zscaler, Cloudflare One',
  },
  {
    term: 'Zero Trust',
    full: 'Zero Trust Architecture',
    color: 'border-red-700 bg-red-950',
    label: 'text-red-300',
    desc: '"Never trust, always verify." No implicit trust based on network location. Every access request is authenticated, authorised, and continuously validated regardless of source.',
    keyPoints: [
      'Assumes breach — treat internal network as untrusted',
      'Identity is the new perimeter (not IP address)',
      'Micro-segmentation: limit lateral movement',
      'Continuous verification: MFA + device posture + behavioural analytics',
      'Least-privilege access: just-in-time, just-enough access',
    ],
    vendors: 'Cisco Zero Trust, Zscaler ZPA, Okta, BeyondCorp (Google)',
  },
];

// ── Render ────────────────────────────────────────────────────────────────────

export function render(container) {
  let activeTab = 0;

  container.innerHTML = `
    <div class="cloud-diagram text-xs space-y-4">
      <p class="text-gray-500">Explore cloud service models, deployment types, virtual networking concepts, and SD-WAN/SASE.</p>
      <div class="flex flex-wrap gap-1.5" id="cloud-tabs">
        ${TABS.map((t, i) => `
          <button class="cloud-tab px-3 py-1.5 rounded border text-xs transition-colors ${i === 0 ? 'border-blue-600 text-blue-300' : 'border-gray-700 text-gray-400 hover:border-gray-500'}" data-tab="${i}">
            ${t}
          </button>`).join('')}
      </div>
      <div id="cloud-content"></div>
    </div>`;

  container.querySelectorAll('.cloud-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = +btn.dataset.tab;
      container.querySelectorAll('.cloud-tab').forEach((b, i) => {
        b.className = `cloud-tab px-3 py-1.5 rounded border text-xs transition-colors ${i === activeTab
          ? 'border-blue-600 text-blue-300'
          : 'border-gray-700 text-gray-400 hover:border-gray-500'}`;
      });
      renderTab(activeTab);
    });
    btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); } });
  });

  function renderTab(idx) {
    const el = container.querySelector('#cloud-content');
    if (idx === 0) renderServiceModels(el);
    else if (idx === 1) renderDeploymentModels(el);
    else if (idx === 2) renderVirtualNetworking(el);
    else renderSDWAN(el);
  }

  renderTab(0);
}

// ── Tab 1: Service Models ─────────────────────────────────────────────────────

function renderServiceModels(el) {
  const models = Object.keys(MATRIX);
  el.innerHTML = `
    <div class="space-y-3">
      <p class="text-gray-600 italic">Click a column header to highlight that model. Hover a row to see details.</p>

      <!-- Legend -->
      <div class="flex gap-3 flex-wrap">
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-green-700 inline-block"></span><span class="text-gray-400">Customer manages</span></span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-gray-800 border border-gray-700 inline-block"></span><span class="text-gray-400">Provider manages</span></span>
      </div>

      <!-- Matrix table -->
      <div class="overflow-x-auto">
        <table class="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th class="text-left text-gray-500 py-1 pr-3 w-36">Layer</th>
              ${models.map(m => `
                <th class="px-2 py-1 text-center cursor-pointer hover:opacity-80 transition-opacity" data-model="${m}">
                  <div class="rounded border ${MODEL_COLOR[m].border} ${MODEL_COLOR[m].bg} px-2 py-1 ${MODEL_COLOR[m].label} font-bold">${m}</div>
                </th>`).join('')}
            </tr>
          </thead>
          <tbody id="sm-body">
            ${ROWS.map((row, ri) => `
              <tr class="sm-row border-t border-gray-800 hover:bg-gray-900 cursor-default transition-colors" data-row="${ri}">
                <td class="py-1.5 pr-3 text-gray-400">${row}</td>
                ${models.map((m, mi) => {
                  const customer = MATRIX[m][ri];
                  return `<td class="px-2 py-1.5 text-center">
                    <span class="rounded px-2 py-0.5 font-mono ${customer ? 'bg-green-900 text-green-300 border border-green-700' : 'bg-gray-800 text-gray-600 border border-gray-700'}">
                      ${customer ? 'You' : 'Provider'}
                    </span>
                  </td>`;
                }).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <!-- Info box -->
      <div id="sm-info" class="rounded border border-gray-800 bg-gray-900 p-3 text-gray-500 italic min-h-10">
        Click a column header or hover a row to see details.
      </div>
    </div>`;

  const info = el.querySelector('#sm-info');

  el.querySelectorAll('[data-model]').forEach(th => {
    th.addEventListener('click', () => {
      const m = th.dataset.model;
      info.innerHTML = `<span class="${MODEL_COLOR[m].label} font-semibold">${m}</span>: ${MODEL_EXAMPLES[m]}`;
    });
  });
}

// ── Tab 2: Deployment Models ──────────────────────────────────────────────────

function renderDeploymentModels(el) {
  el.innerHTML = `
    <div class="grid grid-cols-1 gap-3">
      ${DEPLOY_MODELS.map(m => `
        <div class="rounded border ${m.color} p-3 space-y-2">
          <div class="flex items-center gap-2">
            <span class="text-2xl">${m.icon}</span>
            <span class="${m.label} font-bold text-sm">${m.name}</span>
          </div>
          <p class="text-gray-400">${m.who}</p>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div class="text-green-500 font-semibold mb-1">✓ Advantages</div>
              ${m.pros.map(p => `<div class="text-gray-400">• ${p}</div>`).join('')}
            </div>
            <div>
              <div class="text-red-500 font-semibold mb-1">✗ Drawbacks</div>
              ${m.cons.map(c => `<div class="text-gray-400">• ${c}</div>`).join('')}
            </div>
          </div>
          <div class="text-gray-600 italic border-t border-gray-800 pt-1">Examples: ${m.examples}</div>
        </div>`).join('')}
    </div>`;
}

// ── Tab 3: Virtual Networking ─────────────────────────────────────────────────

function renderVirtualNetworking(el) {
  el.innerHTML = `
    <div class="space-y-3">
      <p class="text-gray-500">Map familiar on-premises concepts to their cloud equivalents. Click a row for details.</p>
      <div class="rounded border border-gray-800 overflow-hidden">
        <div class="grid grid-cols-3 gap-0 bg-gray-900 text-gray-500 font-semibold px-3 py-2 border-b border-gray-700">
          <div>On-Premises</div>
          <div>Cloud Equivalent</div>
          <div>Notes</div>
        </div>
        ${VN_ANALOGS.map((row, i) => `
          <div class="vn-row grid grid-cols-3 gap-0 px-3 py-2 border-b border-gray-800 hover:bg-gray-900 cursor-pointer transition-colors" data-idx="${i}">
            <div class="text-cyan-400">${row.onPrem}</div>
            <div class="text-amber-300 font-semibold">${row.cloud}</div>
            <div class="text-gray-500">${row.note}</div>
          </div>`).join('')}
      </div>
      <div id="vn-detail" class="rounded border border-blue-900 bg-blue-950 p-3 text-blue-300 min-h-8 hidden"></div>
    </div>`;

  const detail = el.querySelector('#vn-detail');
  el.querySelectorAll('.vn-row').forEach(row => {
    row.addEventListener('click', () => {
      const d = VN_ANALOGS[+row.dataset.idx];
      detail.classList.remove('hidden');
      detail.innerHTML = `<strong class="text-amber-300">${d.cloud}</strong> ↔ <span class="text-cyan-400">${d.onPrem}</span><br><span class="text-gray-400">${d.note}</span>`;
    });
  });
}

// ── Tab 4: SD-WAN / SASE ─────────────────────────────────────────────────────

function renderSDWAN(el) {
  el.innerHTML = `
    <div class="space-y-4">
      ${SDWAN_CONCEPTS.map(c => `
        <div class="rounded border ${c.color} p-3 space-y-2">
          <div class="flex items-baseline gap-2">
            <span class="${c.label} font-bold text-sm">${c.term}</span>
            <span class="text-gray-500">— ${c.full}</span>
          </div>
          <p class="text-gray-400">${c.desc}</p>
          <ul class="space-y-0.5">
            ${c.keyPoints.map(p => `<li class="text-gray-400">• ${p}</li>`).join('')}
          </ul>
          <div class="text-gray-600 italic border-t border-gray-800 pt-1">Vendors: ${c.vendors}</div>
        </div>`).join('')}
    </div>`;
}
