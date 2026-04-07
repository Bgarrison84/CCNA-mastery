/**
 * InventoryView.js — Items & Achievements
 */
import { bus } from '../core/EventBus.js';

export class InventoryView {
  constructor(content, store, containerEl) {
    this.content     = content;
    this.store       = store;
    this.containerEl = containerEl;
  }

  render() {
    const state = this.store.state;
    this.containerEl.innerHTML = `
      <div class="max-w-xl mx-auto p-6 space-y-4">
        <h2 class="text-yellow-400 font-bold text-xl">Inventory & Achievements</h2>

        <div>
          <h3 class="text-sm text-gray-500 uppercase tracking-widest mb-2">Items (${state.inventory.length})</h3>
          <ul id="inventory-list" class="space-y-1"></ul>
        </div>

        <div>
          <h3 class="text-sm text-gray-500 uppercase tracking-widest mb-2 mt-4">Achievements (${state.achievements.length})</h3>
          ${state.achievements.length
            ? state.achievements.map(a => `<div class="text-purple-300 text-sm py-1 border-b border-gray-800">${a.name}</div>`).join('')
            : '<p class="text-gray-600 text-sm">No achievements yet.</p>'}
        </div>

        <div class="mt-6 pt-4 border-t border-gray-800">
          <h3 class="text-sm text-gray-500 uppercase tracking-widest mb-2">Danger Zone</h3>
          <button id="reset-btn" class="px-4 py-2 bg-red-900 hover:bg-red-800 border border-red-700 text-red-300 rounded text-sm">
            Reset All Progress
          </button>
        </div>
      </div>`;

    const ul = this.containerEl.querySelector('#inventory-list');
    if (ul) {
      const { inventory } = state;
      if (!inventory.length) {
        ul.innerHTML = '<li class="text-gray-500 text-sm italic">No items yet. Gain levels to unlock items.</li>';
      } else {
        const rarityColors = { common: 'text-gray-300', uncommon: 'text-green-300', rare: 'text-blue-300', legendary: 'text-yellow-300' };
        inventory.forEach(item => {
          const li = document.createElement('li');
          li.className = `py-1.5 border-b border-gray-800 ${rarityColors[item.rarity] || 'text-gray-300'}`;
          li.innerHTML = `<span class="font-semibold">${item.name}</span> <span class="text-xs opacity-60">[${item.rarity}]</span><div class="text-xs opacity-50 mt-0.5">${item.description}</div>`;
          ul.appendChild(li);
        });
      }
    }

    this.containerEl.querySelector('#reset-btn')?.addEventListener('click', () => {
      if (confirm('Reset ALL progress? This cannot be undone.')) {
        this.store.reset();
        bus.emit('nav:switch', { view: 'story' });
      }
    });
  }
}
