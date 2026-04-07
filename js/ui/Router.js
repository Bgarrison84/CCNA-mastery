/**
 * Router.js — View Management & Navigation
 */
import { bus } from '../core/EventBus.js';
import { StoryMode } from './StoryMode.js';
import { LabView } from './LabView.js';
import { GrindView } from './GrindView.js';
import { StatsView } from './StatsView.js';
import { ExamView } from './ExamView.js';
import { BossView } from './BossView.js';
import { SubnetView } from './SubnetView.js';
import { ReferenceView } from './ReferenceView.js';
import { FlashView } from './FlashView.js';
import { NotebookView } from './NotebookView.js';
import { InventoryView } from './InventoryView.js';
import { ProjectsView } from './ProjectsView.js';
import { MegaLabsView } from './MegaLabsView.js';
import { ScriptingView } from './ScriptingView.js';

export class Router {
  constructor(content, store, appViewEl) {
    this.content    = content;
    this.store      = store;
    this.appViewEl  = appViewEl;
    this.currentView = null;
    this.views = {};

    this._init();
  }

  _init() {
    // Registry of view classes
    this.viewRegistry = {
      story:     StoryMode,
      lab:       LabView,
      grind:     GrindView,
      stats:     StatsView,
      exam:      ExamView,
      boss:      BossView,
      subnet:    SubnetView,
      reference: ReferenceView,
      flash:     FlashView,
      notebook:  NotebookView,
      inventory: InventoryView,
      projects:  ProjectsView,
      megalabs:  MegaLabsView,
      scripting: ScriptingView,
    };

    bus.on('nav:switch', e => this.switchView(e.view, e));
    
    // Global exposure for legacy compatibility if needed
    window.switchView = (view) => this.switchView(view);
  }

  switchView(viewId, params = {}) {
    if (!this.viewRegistry[viewId]) {
      console.error(`View not found: ${viewId}`);
      return;
    }

    // Clean up current view if needed
    if (this.currentViewInstance?.destroy) {
      this.currentViewInstance.destroy();
    }

    this.currentView = viewId;
    
    // Update nav UI
    document.querySelectorAll('[data-nav]').forEach(btn => {
      btn.classList.toggle('nav-active', btn.dataset.nav === viewId);
    });

    // Instantiate or reuse view
    const ViewClass = this.viewRegistry[viewId];
    const instance = new ViewClass(this.content, this.store, this.appViewEl);
    
    // Special handling for Grind presets
    if (viewId === 'grind' && (params.domain || params.week)) {
      instance.setPresets(params.domain, params.week);
    }

    this.currentViewInstance = instance;
    instance.render();

    // Scroll to top
    window.scrollTo(0, 0);
    
    console.log(`[Router] Switched to ${viewId}`);
  }
}
