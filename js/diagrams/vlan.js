/**
 * VLAN / Trunk Diagram — Select a VLAN to see which ports receive the frame (tagged vs untagged).
 */

const VLANS = [10, 20, 30];
const VLAN_COLORS = { 10: '#4ade80', 20: '#fb923c', 30: '#c084fc' };
const VLAN_NAMES  = { 10: 'Sales', 20: 'Engineering', 30: 'Management' };

// Switch port definitions
// type: 'access' | 'trunk'  vlan: number (access) | number[] (trunk)
const PORTS = [
  { id: 'SW1-Fa0/1', device: 'SW1', label: 'Fa0/1',  type: 'access', vlan: 10,        connected: 'PC-A (VLAN 10)' },
  { id: 'SW1-Fa0/2', device: 'SW1', label: 'Fa0/2',  type: 'access', vlan: 20,        connected: 'PC-B (VLAN 20)' },
  { id: 'SW1-Fa0/3', device: 'SW1', label: 'Fa0/3',  type: 'access', vlan: 30,        connected: 'PC-C (VLAN 30)' },
  { id: 'SW1-Gi0/1', device: 'SW1', label: 'Gi0/1',  type: 'trunk',  vlan: [10,20,30], connected: 'SW2 (trunk)' },
  { id: 'SW2-Gi0/1', device: 'SW2', label: 'Gi0/1',  type: 'trunk',  vlan: [10,20,30], connected: 'SW1 (trunk)' },
  { id: 'SW2-Fa0/1', device: 'SW2', label: 'Fa0/1',  type: 'access', vlan: 10,        connected: 'PC-D (VLAN 10)' },
  { id: 'SW2-Fa0/2', device: 'SW2', label: 'Fa0/2',  type: 'access', vlan: 20,        connected: 'PC-E (VLAN 20)' },
  { id: 'SW2-Fa0/3', device: 'SW2', label: 'Fa0/3',  type: 'access', vlan: 30,        connected: 'PC-F (VLAN 30)' },
];

function portReceives(port, vlan) {
  if (port.type === 'access') return port.vlan === vlan;
  return port.vlan.includes(vlan);
}

function portTagged(port) {
  return port.type === 'trunk';
}

export function render(containerEl) {
  let selectedVlan = 10;
  let tab = 'diagram';

  function draw() {
    const color = VLAN_COLORS[selectedVlan];
    const vname = VLAN_NAMES[selectedVlan];

    containerEl.innerHTML = `
      <div style="font-family:'JetBrains Mono',monospace;font-size:0.78rem;color:#c8ffc8;">

        <!-- Tabs -->
        <div style="display:flex;gap:8px;margin-bottom:14px;">
          ${['diagram','config','tips'].map(t => `
            <button class="vlan-tab" data-tab="${t}" style="
              padding:5px 12px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.7rem;
              background:${tab===t?'rgba(0,255,65,0.15)':'transparent'};
              border:1px solid ${tab===t?'rgba(0,255,65,0.4)':'rgba(0,255,65,0.12)'};
              color:${tab===t?'#00ff41':'#6a9a6a'};
            ">${t === 'diagram' ? 'VLAN Diagram' : t === 'config' ? 'IOS Config' : 'Exam Tips'}</button>`).join('')}
        </div>

        <div id="vlan-pane-diagram" ${tab!=='diagram'?'style="display:none"':''}>
          <!-- VLAN selector -->
          <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center;">
            <span style="color:#6b7280;font-size:0.7rem;">Select VLAN:</span>
            ${VLANS.map(v => `
              <button class="vlan-sel" data-vlan="${v}" style="
                padding:5px 14px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.72rem;font-weight:600;
                background:${selectedVlan===v?VLAN_COLORS[v]+'33':'rgba(255,255,255,0.03)'};
                border:2px solid ${selectedVlan===v?VLAN_COLORS[v]:VLAN_COLORS[v]+'33'};
                color:${VLAN_COLORS[v]};
              ">VLAN ${v} <span style="font-weight:400;font-size:0.65rem;">(${VLAN_NAMES[v]})</span></button>`).join('')}
          </div>

          <!-- Two-switch topology -->
          <div style="background:#0a0a0a;border:1px solid rgba(0,255,65,0.1);border-radius:6px;padding:14px;margin-bottom:12px;">
            ${['SW1','SW2'].map(sw => {
              const swPorts = PORTS.filter(p => p.device === sw);
              return `
                <div style="margin-bottom:${sw==='SW1'?'12px':'0'};">
                  <div style="color:#6b7280;font-size:0.65rem;margin-bottom:8px;letter-spacing:0.05em;">${sw}</div>
                  <div style="
                    background:rgba(0,255,65,0.05);border:1px solid rgba(0,255,65,0.2);
                    border-radius:4px;padding:10px;display:flex;flex-wrap:wrap;gap:6px;
                  ">
                    ${swPorts.map(port => {
                      const receives = portReceives(port, selectedVlan);
                      const tagged = portTagged(port);
                      const c = receives ? color : '#374151';
                      return `
                        <div style="
                          padding:6px 10px;border-radius:4px;font-size:0.65rem;
                          background:${receives ? color+'22' : 'rgba(255,255,255,0.02)'};
                          border:1px solid ${receives ? color+'66' : 'rgba(255,255,255,0.05)'};
                          color:${c};
                        ">
                          <div style="font-weight:700;">${port.label}</div>
                          <div style="font-size:0.58rem;margin-top:2px;color:${c}99;">
                            ${port.type === 'trunk' ? 'trunk' : `VLAN ${port.vlan}`}
                          </div>
                          ${receives ? `<div style="font-size:0.58rem;color:${tagged?'#fbbf24':color};margin-top:2px;">
                            ${tagged ? '🏷 tagged' : '✓ untagged'}
                          </div>` : `<div style="font-size:0.58rem;color:#374151;margin-top:2px;">blocked</div>`}
                          <div style="font-size:0.55rem;color:#4b5563;margin-top:2px;">${port.connected}</div>
                        </div>`;
                    }).join('')}
                  </div>
                </div>`;
            }).join('<div style="text-align:center;color:#374151;margin:6px 0;font-size:0.8rem;">│ trunk (802.1Q) │</div>')}
          </div>

          <!-- Legend -->
          <div style="display:flex;gap:16px;font-size:0.65rem;flex-wrap:wrap;">
            <div><span style="color:${color};">■</span> <span style="color:#9ca3af;">Frame reaches this port</span></div>
            <div><span style="color:#fbbf24;">🏷</span> <span style="color:#9ca3af;">802.1Q tag present (trunk)</span></div>
            <div><span style="color:#374151;">■</span> <span style="color:#4b5563;">Port blocked (wrong VLAN)</span></div>
          </div>
        </div>

        <div id="vlan-pane-config" ${tab!=='config'?'style="display:none"':''}>
          <pre style="padding:12px;background:#0a0a0a;border:1px solid rgba(0,255,65,0.1);border-radius:4px;font-size:0.68rem;color:#4ade80;overflow-x:auto;line-height:1.8;">
<span style="color:#6b7280;">! Create VLANs</span>
vlan 10
 name Sales
vlan 20
 name Engineering
vlan 30
 name Management

<span style="color:#6b7280;">! Access ports (one VLAN, untagged)</span>
interface FastEthernet0/1
 switchport mode access
 switchport access vlan 10

<span style="color:#6b7280;">! Trunk port (multiple VLANs, 802.1Q tagged)</span>
interface GigabitEthernet0/1
 switchport mode trunk
 switchport trunk encapsulation dot1q
 switchport trunk allowed vlan 10,20,30

<span style="color:#6b7280;">! Verify</span>
show vlan brief
show interfaces trunk</pre>
        </div>

        <div id="vlan-pane-tips" ${tab!=='tips'?'style="display:none"':''}>
          ${[
            ['Access ports', 'Carry ONE VLAN. Frames are untagged in/out. End devices (PCs, printers) connect here. The switch adds/removes the tag internally.'],
            ['Trunk ports', 'Carry MULTIPLE VLANs using 802.1Q tagging. Switch-to-switch and switch-to-router links. The tag includes a 12-bit VLAN ID.'],
            ['Native VLAN', 'Frames on the native VLAN cross a trunk UNTAGGED (default VLAN 1). Both ends must agree on the native VLAN, or frames are misrouted. Best practice: change native VLAN to an unused VLAN.'],
            ['Voice VLAN', 'A port can carry both a data VLAN (access) and a voice VLAN (CDP-negotiated). Phone traffic gets tagged with the voice VLAN ID.'],
            ['Inter-VLAN routing', 'Switches alone cannot route between VLANs. Options: (1) Router-on-a-Stick — single trunk to router with subinterfaces; (2) L3 switch with SVIs and "ip routing".'],
            ['VLAN ID range', 'Normal VLANs: 1–1005. Extended VLANs: 1006–4094. VLAN 1 is the default and cannot be deleted. VLANs 1002–1005 are reserved for legacy protocols.'],
          ].map(([title, desc]) => `
            <div style="margin-bottom:10px;padding:12px;background:#0d0d0d;border:1px solid rgba(0,255,65,0.08);border-radius:4px;">
              <div style="font-weight:700;color:#e2e8f0;margin-bottom:4px;font-size:0.75rem;">${title}</div>
              <div style="color:#9ca3af;font-size:0.7rem;line-height:1.6;">${desc}</div>
            </div>`).join('')}
        </div>
      </div>`;

    containerEl.querySelectorAll('.vlan-tab').forEach(btn => {
      btn.addEventListener('click', () => { tab = btn.dataset.tab; draw(); });
    });
    containerEl.querySelectorAll('.vlan-sel').forEach(btn => {
      btn.addEventListener('click', () => { selectedVlan = parseInt(btn.dataset.vlan); draw(); });
    });
  }

  draw();
}
