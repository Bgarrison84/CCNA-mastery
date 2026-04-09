/**
 * ReferenceView.js — Quick Reference & Concept Diagrams
 */
export class ReferenceView {
  constructor(content, store, containerEl) {
    this.content     = content;
    this.store       = store;
    this.containerEl = containerEl;
  }

  render() {
    this.containerEl.innerHTML = `
      <div class="max-w-3xl mx-auto p-6 space-y-6">
        <h2 class="text-cyan-400 font-bold text-xl mb-4">CCNA Reference Library</h2>
        <div id="reference-list" class="space-y-4">
           <!-- Sections will be rendered here -->
           <p class="text-gray-500">Loading reference material...</p>
        </div>
      </div>`;
    
    this._renderContent();
  }

  _renderContent() {
    const list = this.containerEl.querySelector('#reference-list');
    if (!list) return;

    // This is a simplified version of the huge list in main.js
    // In a real refactor, we'd move the data to a JSON or constant file
    const SECTIONS = [
      { id: 'osi',           title: 'OSI Model — 7 Layers'                },
      { id: 'encapsulation', title: 'OSI Encapsulation — PDU Visualizer'  },
      { id: 'tcp',           title: 'TCP — 3-Way Handshake & Teardown'    },
      { id: 'udp',           title: 'UDP — Datagram & Comparison'         },
      { id: 'ethernet',      title: 'Ethernet Frame Structure'             },
      { id: 'ports',         title: 'Well-Known Ports'                    },
      { id: 'subnetting',    title: 'Subnetting Cheat Sheet'              },
      { id: 'routing',       title: 'Routing Protocol Comparison'         },
      { id: 'stp',           title: 'STP — States, Roles & Variants'      },
      { id: 'ospf',          title: 'OSPF — Neighbor States & LSA Types'  },
      { id: 'nat',           title: 'NAT / PAT — Address Translation'     },
      { id: 'vlan',          title: 'VLANs & 802.1Q Trunking'            },
      { id: 'ipv6',          title: 'IPv6 Address Types'                  },
      { id: 'acl',           title: 'ACL Processing Flow'                 },
      { id: 'hsrp',          title: 'HSRP / VRRP / GLBP'                 },
      { id: 'snmp',          title: 'SNMP — GET / TRAP / INFORM'          },
      { id: 'aaa',           title: 'AAA — TACACS+ / RADIUS / 802.1X'    },
      { id: 'ftp',           title: 'FTP — Active vs Passive'             },
      { id: 'cloud',         title: 'Cloud — IaaS / PaaS / SaaS'         },
      { id: 'topology',      title: 'Multi-Device CLI Simulator'          },
    ];

    list.innerHTML = SECTIONS.map(s => `
      <div class="bg-gray-900 border border-gray-800 rounded p-4">
        <h3 class="font-bold text-gray-200 mb-2">${s.title}</h3>
        <div id="diag-${s.id}" class="min-h-[120px]"></div>
      </div>`).join('');

    if (window.renderDiagram) {
      SECTIONS.forEach(s => {
        const el = document.getElementById(`diag-${s.id}`);
        if (el) window.renderDiagram(s.id, el);
      });
    }
  }
}
