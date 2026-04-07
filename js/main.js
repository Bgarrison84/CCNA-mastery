/**
 * main.js — Application Entry Point & Orchestrator
 * Bootstraps the Store, HUD, and Router.
 */

import { Store }       from './core/Store.js';
import { HUD }         from './ui/HUD.js';
import { Router }      from './ui/Router.js';

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
  subnetting: './js/diagrams/subnetting.js',
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

document.addEventListener('DOMContentLoaded', init);
