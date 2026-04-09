/**
 * main.js — Application Entry Point & Orchestrator
 * Bootstraps the Store, HUD, and Router.
 */

import { Store }         from './core/Store.js';
import { HUD }           from './ui/HUD.js';
import { Router }        from './ui/Router.js';
import { showToast }     from './utils/ui.js';
import { initGlossary }  from './utils/glossary.js';

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const store   = new Store();
let router    = null;
let content   = null;

// Award XP from custom events (e.g., from diagrams/models)
document.addEventListener('ccna-xp', e => {
  if (e.detail?.amount) {
    store.addXP(e.detail.amount, e.detail.reason || 'interaction');
  }
});

// ─── Diagram Dispatcher (Legacy Compatibility) ────────────────────────────────

const DIAGRAM_MODULES = {
  osi:        './js/diagrams/osi.js',
  tcp:        './js/diagrams/tcp.js',
  udp:        './js/diagrams/udp.js',
  ftp:        './js/diagrams/ftp.js',
  stp:        './js/diagrams/stp.js',
  ospf:       './js/diagrams/ospf.js',
  ethernet:   './js/diagrams/ethernet.js',
  nat:        './js/diagrams/nat.js',
  vlan:       './js/diagrams/vlan.js',
  acl:        './js/diagrams/acl.js',
  ipv6:       './js/diagrams/ipv6.js',
  aaa:        './js/diagrams/aaa.js',
  snmp:       './js/diagrams/snmp.js',
  hsrp:       './js/diagrams/hsrp.js',
  cloud:      './js/diagrams/cloud.js',
  ports:      './js/diagrams/ports.js',
  routing:    './js/diagrams/routing.js',
  subnetting:    './js/diagrams/subnetting.js',
  encapsulation: './js/diagrams/encapsulation.js',
  topology:      './js/diagrams/topology.js',
  dhcp:          './js/diagrams/dhcp.js',
  arp:           './js/diagrams/arp.js',
  dns:           './js/diagrams/dns.js',
  stp_timeline:     './js/diagrams/stp_timeline.js',
  practice_terminal: './js/engine/practice_terminal.js',
  traceroute:        './js/diagrams/traceroute.js',
};

window.renderDiagram = async function(id, container) {
  const path = DIAGRAM_MODULES[id];
  if (!path) return;
  try {
    const mod = await import(path);
    mod.render(container);
  } catch (err) {
    console.error(`Failed to load diagram: ${id}`, err);
    container.innerHTML = `<div class="text-red-500 text-xs">Error loading diagram</div>`;
  }
};

// ─── Core Init ───────────────────────────────────────────────────────────────

async function init() {
  try {
    await store.ready;

    const firstWeek = Math.min(Math.max(store.state.currentWeek || 1, 1), 6);
    
    // Loading bootstrap data
    const [meta, weekData] = await Promise.all([
      fetch('./data/meta.json').then(r => { if(!r.ok) throw new Error('Meta fail'); return r.json(); }),
      fetch(`./data/week${firstWeek}.json`).then(r => { if(!r.ok) throw new Error('Week fail'); return r.json(); })
    ]);

    content = {
      labs:        meta.labs        || [],
      bossBattles: meta.bossBattles || [],
      storyBeats:  meta.storyBeats  || [],
      questions:   weekData.questions || [],
    };

    // Init UI Components
    new HUD(store, {
      levelBadge:      document.getElementById('hud-level'),
      xpBar:           document.getElementById('hud-xp-bar'),
      xpText:          document.getElementById('hud-xp-text'),
      playerName:      document.getElementById('hud-player-name'),
      hintCount:       document.getElementById('hud-hints'),
      inventoryList:   document.getElementById('inventory-list'),
      toastContainer:  document.getElementById('toast-container'),
      weekBadge:       document.getElementById('hud-week'),
    });

    router = new Router(content, store, document.getElementById('app-view'));
    router.switchView('story');

    initAccessibility();
    initGlossary();
    document.body.classList.remove('loading');
  } catch (err) {
    console.error('[init] Critical failure:', err);
    document.body.innerHTML = `
      <div style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#0a0a0a; color:#f87171; font-family:monospace; padding:20px; text-align:center;">
        <h1 style="font-size:1.5rem; margin-bottom:10px;">⚠️ Boot Error</h1>
        <p style="font-size:0.8rem; color:#6b7280; max-width:400px; line-height:1.5;">
          Failed to load critical application data. This might be due to a connection issue or an outdated cache.
        </p>
        <button onclick="location.reload()" style="margin-top:20px; padding:10px 20px; background:#1f2937; border:1px solid #374151; color:#fff; border-radius:4px; cursor:pointer;">Retry</button>
      </div>`;
  }
}

window._allWeeksLoaded = () => true;

// ─── Accessibility Init ───────────────────────────────────────────────────────

function initAccessibility() {
  const hapticEl   = document.getElementById('haptic-toggle');
  const dyslexiaEl = document.getElementById('dyslexia-toggle');
  const sfxEl      = document.getElementById('sfx-toggle');

  if (hapticEl)   hapticEl.checked   = store.state.settings?.haptic ?? true;
  if (dyslexiaEl) dyslexiaEl.checked = store.state.settings?.dyslexiaFont ?? false;
  if (sfxEl)      sfxEl.checked      = store.state.settings?.sfxEnabled ?? true;

  // Apply stored dyslexia font on load
  if (store.state.settings?.dyslexiaFont) document.body.classList.add('dyslexia-font');

  hapticEl?.addEventListener('change', () => store.setSetting('haptic', hapticEl.checked));

  dyslexiaEl?.addEventListener('change', () => {
    store.setSetting('dyslexiaFont', dyslexiaEl.checked);
    document.body.classList.toggle('dyslexia-font', dyslexiaEl.checked);
  });

  sfxEl?.addEventListener('change', () => store.setSetting('sfxEnabled', sfxEl.checked));

  // SW update notification — fires when controllerchange indicates a new SW took over
  window.addEventListener('sw:update-ready', () => {
    // Remove any existing update banner first (shouldn't happen, but be safe)
    document.getElementById('sw-update-banner')?.remove();

    const banner = document.createElement('div');
    banner.id = 'sw-update-banner';
    banner.style.cssText = [
      'position:fixed', 'bottom:72px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:9999', 'display:flex', 'align-items:center', 'gap:10px',
      'padding:10px 16px', 'border-radius:8px', 'box-shadow:0 4px 20px rgba(0,0,0,0.6)',
      'background:#1e3a5f', 'border:1px solid #3b82f6', 'color:#93c5fd',
      'font-family:monospace', 'font-size:0.75rem', 'cursor:pointer',
      'white-space:nowrap', 'max-width:90vw',
    ].join(';');
    banner.innerHTML = `
      <span style="font-size:1rem;">🔄</span>
      <span>New version available</span>
      <button style="
        padding:4px 12px; border-radius:4px; background:#3b82f6; border:none;
        color:#fff; font-family:monospace; font-size:0.72rem; cursor:pointer; font-weight:700;
      ">Reload</button>
      <button id="sw-banner-dismiss" style="
        background:transparent; border:none; color:#6b7280;
        cursor:pointer; font-size:1rem; line-height:1; padding:0 2px;
      " aria-label="Dismiss">✕</button>`;

    document.body.appendChild(banner);

    banner.querySelector('button:not(#sw-banner-dismiss)')
      .addEventListener('click', () => window.location.reload());
    banner.querySelector('#sw-banner-dismiss')
      .addEventListener('click', e => { e.stopPropagation(); banner.remove(); });
  });
}

document.addEventListener('DOMContentLoaded', init);
