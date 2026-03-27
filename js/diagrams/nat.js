/**
 * NAT/PAT Diagram — Toggle between before/after translation views.
 */

const SCENARIOS = [
  {
    id: 'static',
    name: 'Static NAT',
    desc: 'One-to-one mapping: one inside local address ↔ one inside global address. Permanent. Used to expose internal servers.',
    before: {
      src: '192.168.1.10:—',
      dst: '203.0.113.5:80',
      srcLabel: 'Inside Local',
      note: 'Packet leaves internal host. Source IP is the private RFC 1918 address.',
    },
    after: {
      src: '198.51.100.10:—',
      dst: '203.0.113.5:80',
      srcLabel: 'Inside Global',
      note: 'Router rewrites source IP to the mapped public address. Destination unchanged.',
    },
    config: [
      'ip nat inside source static 192.168.1.10 198.51.100.10',
      'interface GigabitEthernet0/0',
      ' ip nat inside',
      'interface GigabitEthernet0/1',
      ' ip nat outside',
    ],
  },
  {
    id: 'dynamic',
    name: 'Dynamic NAT',
    desc: 'Pool of public IPs assigned on demand. Many-to-many mapping. Connections fail if the pool is exhausted.',
    before: {
      src: '192.168.1.20:—',
      dst: '203.0.113.5:80',
      srcLabel: 'Inside Local',
      note: 'Private host initiates connection. No port rewrite — just address.',
    },
    after: {
      src: '198.51.100.15:—',
      dst: '203.0.113.5:80',
      srcLabel: 'Inside Global (from pool)',
      note: 'Router picks an available IP from the NAT pool and maps it to this inside local address.',
    },
    config: [
      'ip nat pool MYPOOL 198.51.100.10 198.51.100.20 netmask 255.255.255.0',
      'ip access-list standard NAT_ACL',
      ' permit 192.168.1.0 0.0.0.255',
      'ip nat inside source list NAT_ACL pool MYPOOL',
    ],
  },
  {
    id: 'pat',
    name: 'PAT (Overload)',
    desc: 'Many-to-one: ALL inside hosts share ONE public IP, distinguished by unique source port numbers. Most common form of NAT on home/enterprise routers.',
    before: {
      src: '192.168.1.30:54321',
      dst: '203.0.113.5:80',
      srcLabel: 'Inside Local',
      note: 'Private host initiates. Source port is the ephemeral port chosen by the OS.',
    },
    after: {
      src: '198.51.100.1:1025',
      dst: '203.0.113.5:80',
      srcLabel: 'Inside Global (overloaded)',
      note: 'Router rewrites BOTH the source IP and source port. This multiplexes thousands of sessions onto one public IP.',
    },
    config: [
      'ip access-list standard PAT_ACL',
      ' permit 192.168.1.0 0.0.0.255',
      'ip nat inside source list PAT_ACL interface GigabitEthernet0/1 overload',
    ],
  },
];

export function render(containerEl) {
  let view = 'before';
  let scenarioIdx = 0;

  function draw() {
    const sc = SCENARIOS[scenarioIdx];
    const pkt = view === 'before' ? sc.before : sc.after;
    const highlightSrc = view === 'after';

    containerEl.innerHTML = `
      <div style="font-family:'JetBrains Mono',monospace;font-size:0.78rem;color:#c8ffc8;">

        <!-- Scenario tabs -->
        <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;">
          ${SCENARIOS.map((s, i) => `
            <button class="nat-sc" data-idx="${i}" style="
              padding:5px 12px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.7rem;
              background:${scenarioIdx===i?'rgba(0,255,65,0.15)':'transparent'};
              border:1px solid ${scenarioIdx===i?'rgba(0,255,65,0.4)':'rgba(0,255,65,0.12)'};
              color:${scenarioIdx===i?'#00ff41':'#6a9a6a'};
            ">${s.name}</button>`).join('')}
        </div>

        <p style="color:#9ca3af;font-size:0.7rem;margin-bottom:14px;line-height:1.5;">${sc.desc}</p>

        <!-- Before / After toggle -->
        <div style="display:flex;gap:0;margin-bottom:16px;border:1px solid rgba(0,255,65,0.2);border-radius:4px;overflow:hidden;">
          <button class="nat-view" data-view="before" style="
            flex:1;padding:7px;cursor:pointer;font-family:inherit;font-size:0.72rem;
            background:${view==='before'?'rgba(251,191,36,0.15)':'transparent'};
            border:none;color:${view==='before'?'#fbbf24':'#6a9a6a'};font-weight:${view==='before'?'700':'400'};
          ">Before NAT</button>
          <button class="nat-view" data-view="after" style="
            flex:1;padding:7px;cursor:pointer;font-family:inherit;font-size:0.72rem;
            background:${view==='after'?'rgba(0,255,65,0.15)':'transparent'};
            border:none;border-left:1px solid rgba(0,255,65,0.2);
            color:${view==='after'?'#00ff41':'#6a9a6a'};font-weight:${view==='after'?'700':'400'};
          ">After NAT</button>
        </div>

        <!-- Topology -->
        <div style="background:#0d0d0d;border:1px solid rgba(0,255,65,0.1);border-radius:6px;padding:16px;margin-bottom:12px;">

          <!-- Devices row -->
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
            <div style="text-align:center;">
              <div style="padding:8px 12px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);border-radius:4px;color:#a5b4fc;font-size:0.72rem;font-weight:700;">Inside Host</div>
              <div style="color:#6b7280;font-size:0.62rem;margin-top:4px;">${sc.before.src.split(':')[0]}</div>
            </div>
            <div style="flex:1;text-align:center;position:relative;">
              <div style="height:2px;background:rgba(0,255,65,0.2);margin:0 8px;position:relative;">
                <div style="
                  position:absolute;top:-8px;left:50%;transform:translateX(-50%);
                  font-size:0.62rem;white-space:nowrap;
                ">
                  ${view==='before'
                    ? `<span style="color:#fbbf24;font-weight:700;">→</span>`
                    : `<span style="color:#00ff41;font-weight:700;">→ translated →</span>`
                  }
                </div>
              </div>
            </div>
            <div style="text-align:center;">
              <div style="padding:8px 12px;background:rgba(0,255,65,0.08);border:1px solid rgba(0,255,65,0.25);border-radius:4px;color:#4ade80;font-size:0.72rem;font-weight:700;">NAT Router</div>
            </div>
            <div style="flex:1;text-align:center;">
              <div style="height:2px;background:rgba(0,255,65,0.2);margin:0 8px;"></div>
            </div>
            <div style="text-align:center;">
              <div style="padding:8px 12px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.25);border-radius:4px;color:#6ee7b7;font-size:0.72rem;font-weight:700;">Internet Server</div>
              <div style="color:#6b7280;font-size:0.62rem;margin-top:4px;">${sc.before.dst.split(':')[0]}</div>
            </div>
          </div>

          <!-- Packet fields -->
          <div style="border:1px solid rgba(255,255,255,0.08);border-radius:4px;overflow:hidden;">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;font-size:0.68rem;">
              <div style="padding:6px 10px;background:rgba(255,255,255,0.03);color:#6b7280;font-weight:700;border-right:1px solid rgba(255,255,255,0.05);">Field</div>
              <div style="padding:6px 10px;background:rgba(255,255,255,0.03);color:#6b7280;font-weight:700;border-right:1px solid rgba(255,255,255,0.05);">Value</div>
              <div style="padding:6px 10px;background:rgba(255,255,255,0.03);color:#6b7280;font-weight:700;">Label</div>

              <!-- Source IP -->
              <div style="padding:8px 10px;border-top:1px solid rgba(255,255,255,0.04);border-right:1px solid rgba(255,255,255,0.04);color:#9ca3af;">Source IP</div>
              <div style="padding:8px 10px;border-top:1px solid rgba(255,255,255,0.04);border-right:1px solid rgba(255,255,255,0.04);
                color:${highlightSrc?'#fbbf24':'#d1d5db'};font-weight:${highlightSrc?'700':'400'};
                background:${highlightSrc?'rgba(251,191,36,0.06)':'transparent'};
              ">${pkt.src.split(':')[0]}</div>
              <div style="padding:8px 10px;border-top:1px solid rgba(255,255,255,0.04);color:#6b7280;font-size:0.64rem;
                background:${highlightSrc?'rgba(251,191,36,0.04)':'transparent'};
              ">${pkt.srcLabel}</div>

              <!-- Source Port (if PAT) -->
              ${sc.id === 'pat' ? `
              <div style="padding:8px 10px;border-top:1px solid rgba(255,255,255,0.04);border-right:1px solid rgba(255,255,255,0.04);color:#9ca3af;">Source Port</div>
              <div style="padding:8px 10px;border-top:1px solid rgba(255,255,255,0.04);border-right:1px solid rgba(255,255,255,0.04);
                color:${highlightSrc?'#fbbf24':'#d1d5db'};font-weight:${highlightSrc?'700':'400'};
                background:${highlightSrc?'rgba(251,191,36,0.06)':'transparent'};
              ">${pkt.src.split(':')[1]}</div>
              <div style="padding:8px 10px;border-top:1px solid rgba(255,255,255,0.04);color:#6b7280;font-size:0.64rem;
                background:${highlightSrc?'rgba(251,191,36,0.04)':'transparent'};
              ">${highlightSrc?'Reassigned by PAT':'Ephemeral port'}</div>
              ` : ''}

              <!-- Dest IP -->
              <div style="padding:8px 10px;border-top:1px solid rgba(255,255,255,0.04);border-right:1px solid rgba(255,255,255,0.04);color:#9ca3af;">Dest IP</div>
              <div style="padding:8px 10px;border-top:1px solid rgba(255,255,255,0.04);border-right:1px solid rgba(255,255,255,0.04);color:#d1d5db;">${pkt.dst.split(':')[0]}</div>
              <div style="padding:8px 10px;border-top:1px solid rgba(255,255,255,0.04);color:#6b7280;font-size:0.64rem;">Outside Global (unchanged)</div>

              <!-- Dest Port -->
              <div style="padding:8px 10px;border-top:1px solid rgba(255,255,255,0.04);border-right:1px solid rgba(255,255,255,0.04);color:#9ca3af;">Dest Port</div>
              <div style="padding:8px 10px;border-top:1px solid rgba(255,255,255,0.04);border-right:1px solid rgba(255,255,255,0.04);color:#d1d5db;">${pkt.dst.split(':')[1]}</div>
              <div style="padding:8px 10px;border-top:1px solid rgba(255,255,255,0.04);color:#6b7280;font-size:0.64rem;">HTTP (unchanged)</div>
            </div>
          </div>

          <p style="color:#6b7280;font-size:0.68rem;margin-top:10px;line-height:1.5;">${pkt.note}</p>
        </div>

        <!-- Config snippet -->
        <details style="margin-bottom:0;">
          <summary style="cursor:pointer;color:#6a9a6a;font-size:0.7rem;padding:6px 0;list-style:none;">
            ▶ IOS config for ${sc.name}
          </summary>
          <pre style="
            margin-top:8px;padding:12px;background:#0a0a0a;
            border:1px solid rgba(0,255,65,0.1);border-radius:4px;
            font-size:0.68rem;color:#4ade80;overflow-x:auto;line-height:1.7;
          ">${sc.config.join('\n')}</pre>
        </details>
      </div>`;

    containerEl.querySelectorAll('.nat-sc').forEach(btn => {
      btn.addEventListener('click', () => { scenarioIdx = parseInt(btn.dataset.idx); view = 'before'; draw(); });
    });
    containerEl.querySelectorAll('.nat-view').forEach(btn => {
      btn.addEventListener('click', () => { view = btn.dataset.view; draw(); });
    });
    containerEl.querySelector('details')?.addEventListener('toggle', () => {});
  }

  draw();
}
