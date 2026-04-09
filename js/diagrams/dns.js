/**
 * dns.js — DNS Resolution Visualizer
 *
 * Two modes:
 *   Recursive   — Resolver does all the legwork; client gets one answer
 *   Iterative   — Each server refers the client to the next; client follows
 *
 * Both show: cache check → root NS → TLD NS → authoritative NS → answer
 *
 * Exported API: render(containerEl)
 */

export function render(containerEl) {
  let mode = 'recursive';

  // Step data shared across modes
  const RECURSIVE_STEPS = [
    {
      hop: 'Client → Resolver',
      from: 'Client\n(192.168.1.10)', to: 'DNS Resolver\n(8.8.8.8)',
      query: 'Recursive query: www.cisco.com A?',
      answer: '(waiting…)',
      cached: false,
      title: 'Step 1 — Client asks its recursive resolver',
      detail: 'Client sends a recursive DNS query to its configured resolver (e.g. 8.8.8.8 or an ISP DNS). ' +
              '"Recursive" means "please resolve this completely and give me the final answer." ' +
              'The resolver is now responsible for all further lookups.',
      ttl: null,
    },
    {
      hop: 'Resolver → Root NS',
      from: 'DNS Resolver\n(8.8.8.8)', to: 'Root Nameserver\n(a.root-servers.net)',
      query: 'Iterative query: www.cisco.com A?',
      answer: 'Refer to .com TLD: a.gtld-servers.net',
      cached: false,
      title: 'Step 2 — Resolver queries a Root Nameserver',
      detail: 'The resolver doesn\'t know www.cisco.com, so it asks a Root Nameserver (13 root server clusters). ' +
              'Root doesn\'t know the answer either — it refers to the .com TLD authoritative server. ' +
              'All lookups start at root if no cache hit exists.',
      ttl: '172800s (2 days)',
    },
    {
      hop: 'Resolver → TLD NS',
      from: 'DNS Resolver\n(8.8.8.8)', to: '.com TLD NS\n(a.gtld-servers.net)',
      query: 'Iterative query: www.cisco.com A?',
      answer: 'Refer to cisco.com auth NS: ns1.cisco.com',
      cached: false,
      title: 'Step 3 — Resolver queries the .com TLD',
      detail: 'The TLD server knows who is authoritative for cisco.com — it returns an NS referral. ' +
              'The resolver now knows to ask ns1.cisco.com for the actual record.',
      ttl: '172800s (2 days)',
    },
    {
      hop: 'Resolver → Authoritative NS',
      from: 'DNS Resolver\n(8.8.8.8)', to: 'Auth NS\n(ns1.cisco.com)',
      query: 'Iterative query: www.cisco.com A?',
      answer: 'www.cisco.com A → 72.163.4.185',
      cached: false,
      title: 'Step 4 — Resolver queries authoritative server',
      detail: 'The authoritative nameserver for cisco.com has the definitive record. It returns ' +
              'www.cisco.com → 72.163.4.185 with a TTL. The resolver caches this for future queries.',
      ttl: '300s (5 min)',
    },
    {
      hop: 'Resolver → Client',
      from: 'DNS Resolver\n(8.8.8.8)', to: 'Client\n(192.168.1.10)',
      query: '—',
      answer: 'www.cisco.com A = 72.163.4.185 (TTL 300)',
      cached: true,
      title: 'Step 5 — Resolver returns answer to client',
      detail: 'The resolver sends the fully resolved answer back to the client. The client caches it ' +
              'locally for the TTL duration (300s = 5 minutes). The next query for www.cisco.com within ' +
              'that window hits the local cache — zero network round trips.',
      ttl: '300s remaining',
    },
  ];

  const ITERATIVE_STEPS = [
    {
      hop: 'Client → Root NS',
      from: 'Client\n(192.168.1.10)', to: 'Root NS\n(a.root-servers.net)',
      query: 'Iterative query: www.cisco.com A?',
      answer: 'Refer to .com TLD: a.gtld-servers.net',
      title: 'Step 1 — Client queries Root directly',
      detail: 'In iterative mode the client itself makes each hop. It starts at a Root Nameserver. ' +
              'Root returns a referral — not the answer, just the next server to ask. ' +
              '(In practice, iterative mode is used between DNS servers, not end-client devices.)',
    },
    {
      hop: 'Client → TLD NS',
      from: 'Client\n(192.168.1.10)', to: '.com TLD NS\n(a.gtld-servers.net)',
      query: 'Iterative query: www.cisco.com A?',
      answer: 'Refer to cisco.com auth NS: ns1.cisco.com',
      title: 'Step 2 — Client queries .com TLD',
      detail: 'Armed with the referral, the client asks the .com TLD server. Again it gets a referral ' +
              '— now pointing at ns1.cisco.com. The client must follow each referral itself.',
    },
    {
      hop: 'Client → Authoritative NS',
      from: 'Client\n(192.168.1.10)', to: 'Auth NS\n(ns1.cisco.com)',
      query: 'Iterative query: www.cisco.com A?',
      answer: 'www.cisco.com A = 72.163.4.185 (TTL 300)',
      title: 'Step 3 — Client queries authoritative NS',
      detail: 'The authoritative server has the record and returns the final answer. ' +
              'The client now has the IP and can begin TCP/UDP communication with 72.163.4.185.',
    },
  ];

  let recStep = 0, iterStep = 0;

  function steps() { return mode === 'recursive' ? RECURSIVE_STEPS : ITERATIVE_STEPS; }
  function curStep() { return mode === 'recursive' ? recStep : iterStep; }

  function draw() {
    const ss = steps();
    const si = curStep();
    const s  = ss[si];

    containerEl.innerHTML = `
      <div style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:#c8ffc8;background:#0a0a0f;border:1px solid #1f2937;border-radius:8px;padding:18px;">

        <!-- Mode toggle -->
        <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;">
          ${[['recursive','🔁 Recursive (client asks resolver)'],['iterative','↪ Iterative (client follows referrals)']].map(([m,label]) => `
            <button class="dns-mode" data-mode="${m}" style="
              padding:5px 14px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.7rem;
              background:${mode===m?'rgba(99,102,241,0.12)':'transparent'};
              border:1px solid ${mode===m?'rgba(99,102,241,0.4)':'#374151'};
              color:${mode===m?'#a5b4fc':'#6b7280'};">${label}</button>`).join('')}
        </div>

        <!-- Progress -->
        <div style="display:flex;gap:3px;margin-bottom:12px;">
          ${ss.map((_, i) => `<div style="flex:1;height:4px;border-radius:2px;background:${
            i < si ? '#6366f1' : i === si ? 'rgba(99,102,241,0.5)' : '#1f2937'};"></div>`).join('')}
        </div>

        <div style="font-weight:700;color:#a5b4fc;font-size:0.72rem;margin-bottom:10px;">${s.title}</div>

        <!-- Packet arrow -->
        <div style="background:#060a0f;border:1px solid #1a2733;border-radius:6px;padding:14px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:12px;font-size:0.68rem;font-weight:700;white-space:pre-line;">
            <span style="color:#60a5fa;text-align:center;">${s.from}</span>
            <span style="color:#6ee7b7;text-align:center;">${s.to}</span>
          </div>
          <!-- Query arrow -->
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <div style="width:60px;font-size:0.58rem;color:#6b7280;text-align:center;">query</div>
            <div style="flex:1;position:relative;height:2px;background:linear-gradient(to right,#6366f1,rgba(0,0,0,0));">
              <div style="position:absolute;right:-5px;top:-5px;color:#6366f1;font-size:0.7rem;">▶</div>
            </div>
            <div style="width:60px;"></div>
          </div>
          <div style="text-align:center;margin-bottom:6px;">
            <span style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);border-radius:3px;padding:2px 10px;font-size:0.65rem;color:#a5b4fc;">${s.query}</span>
          </div>
          <!-- Reply arrow -->
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;margin-top:10px;">
            <div style="width:60px;"></div>
            <div style="flex:1;position:relative;height:2px;background:linear-gradient(to left,#22c55e,rgba(0,0,0,0));">
              <div style="position:absolute;left:-5px;top:-5px;color:#22c55e;font-size:0.7rem;">◀</div>
            </div>
            <div style="width:60px;font-size:0.58rem;color:#6b7280;text-align:center;">answer</div>
          </div>
          <div style="text-align:center;">
            <span style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:3px;padding:2px 10px;font-size:0.65rem;color:#86efac;">${s.answer}</span>
          </div>
        </div>

        <div style="font-size:0.7rem;color:#8b949e;line-height:1.6;margin-bottom:12px;background:#0f1117;border-left:3px solid #6366f1;padding:10px 12px;border-radius:0 4px 4px 0;">${s.detail}</div>

        ${s.ttl ? `
        <div style="margin-bottom:12px;font-size:0.65rem;display:flex;align-items:center;gap:8px;">
          <span style="color:#6b7280;">TTL cached:</span>
          <span style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:3px;padding:2px 8px;color:#fcd34d;">${s.ttl}</span>
          ${s.cached ? '<span style="color:#22c55e;font-size:0.62rem;">✓ Added to local cache</span>' : ''}
        </div>` : ''}

        <!-- Nav -->
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <button id="dns-prev" style="padding:5px 14px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.7rem;background:transparent;border:1px solid rgba(99,102,241,0.2);color:${si>0?'#a5b4fc':'#374151'};" ${si===0?'disabled':''}>← Prev</button>
          <span style="font-size:0.65rem;color:#6b7280;">${si+1} / ${ss.length}</span>
          <button id="dns-next" style="padding:5px 14px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:0.7rem;background:transparent;border:1px solid rgba(99,102,241,0.2);color:${si<ss.length-1?'#a5b4fc':'#374151'};" ${si===ss.length-1?'disabled':''}>Next →</button>
        </div>
      </div>`;

    containerEl.querySelectorAll('.dns-mode').forEach(btn =>
      btn.addEventListener('click', () => { mode = btn.dataset.mode; draw(); }));
    containerEl.querySelector('#dns-prev')?.addEventListener('click', () => {
      if (mode === 'recursive' && recStep > 0) recStep--;
      else if (mode === 'iterative' && iterStep > 0) iterStep--;
      draw();
    });
    containerEl.querySelector('#dns-next')?.addEventListener('click', () => {
      if (mode === 'recursive' && recStep < RECURSIVE_STEPS.length - 1) recStep++;
      else if (mode === 'iterative' && iterStep < ITERATIVE_STEPS.length - 1) iterStep++;
      draw();
    });
  }

  draw();
}
