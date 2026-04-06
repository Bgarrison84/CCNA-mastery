/**
 * BossView.js — Boss Battle Mode View
 */
import { BossBattle } from '../engine/BossBattle.js';
import { bus } from '../core/EventBus.js';

export class BossView {
  constructor(content, store, containerEl) {
    this.content     = content;
    this.store       = store;
    this.containerEl = containerEl;
    this.boss        = null;
  }

  render() {
    const state    = this.store.state;
    const week     = state.currentWeek;
    const bosses   = this.content.bossBattles.filter(b => b.week <= week);

    this.containerEl.innerHTML = `
      <div class="max-w-2xl mx-auto p-6 space-y-4">
        <h2 class="text-red-400 font-bold text-xl">Boss Battles</h2>
        ${bosses.map(b => {
          const defeated = state.bossesDefeated.includes(b.id);
          const locked   = state.level < (b.unlockLevel || 1);
          return \`<div class="bg-gray-900 border \${defeated ? 'border-green-700' : 'border-red-900'} rounded p-4 flex items-center gap-4">
            <div class="text-5xl">\${b.avatar}</div>
            <div class="flex-1">
              <div class="font-bold text-lg \${defeated ? 'text-green-400' : 'text-red-300'}">\${b.name}</div>
              <div class="text-sm text-gray-400">\${b.description}</div>
              <div class="text-xs text-yellow-400 mt-1">\${b.xpReward} XP reward · Week \${b.week}</div>
            </div>
            <button data-boss="\${b.id}" class="\${locked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-red-700 cursor-pointer'} boss-start-btn px-4 py-2 bg-red-900 border border-red-700 text-red-200 rounded text-sm font-semibold" \${locked ? 'disabled' : ''}>
              \${defeated ? 'Rematch' : locked ? \`LVL \${b.unlockLevel} req.\` : 'Challenge'}
            </button>
          </div>\`;
        }).join('')}
        \${!bosses.length ? '<p class="text-gray-500 text-center py-8">No bosses unlocked yet.</p>' : ''}
      </div>\`;

    this.containerEl.querySelectorAll('.boss-start-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const bossData = this.content.bossBattles.find(b => b.id === btn.dataset.boss);
        if (bossData) this.startBattle(bossData);
      });
    });
  }

  startBattle(bossData) {
    this.boss = new BossBattle(bossData, this.store);
    this.boss.start();

    this.containerEl.innerHTML = `
      <div class="max-w-xl mx-auto p-6 space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-4xl">\${bossData.avatar}</span>
            <div>
              <div class="text-red-300 font-bold">\${bossData.name}</div>
              <div class="w-40 bg-gray-700 rounded-full h-2 mt-1">
                <div id="boss-hp-bar" class="bg-red-500 h-2 rounded-full transition-all" style="width:100%"></div>
              </div>
            </div>
          </div>
          <div>
            <div class="text-xs text-gray-500">Your HP</div>
            <div class="w-32 bg-gray-700 rounded-full h-2 mt-1">
              <div id="player-hp-bar" class="bg-green-500 h-2 rounded-full transition-all" style="width:100%"></div>
            </div>
          </div>
        </div>
        <div id="boss-question-area" class="bg-gray-900 border border-gray-800 rounded p-5"></div>
      </div>`;

    this.renderQuestion();
  }

  renderQuestion() {
    const q = this.boss.currentQuestion;
    if (!q) return;

    const area = document.getElementById('boss-question-area');
    area.innerHTML = `
      <p class="text-white font-medium mb-4">\${q.question}</p>
      <div class="space-y-2">
        \${q.options.map((opt, i) => \`
          <button data-answer="\${i}" class="boss-opt w-full text-left px-4 py-2 border border-gray-600 rounded text-sm text-gray-200">
            \${opt}
          </button>\`).join('')}
      </div>`;

    area.querySelectorAll('.boss-opt').forEach(btn => {
      btn.onclick = () => this.submitAnswer(btn.dataset.answer);
    });
  }

  submitAnswer(answer) {
    const result = this.boss.answer(answer);
    
    // Update bars
    document.getElementById('boss-hp-bar').style.width = this.boss.hp + '%';
    // Simplified: player HP logic...
    
    if (result.done) {
      this.renderEnd(result);
    } else {
      this.renderQuestion();
    }
  }

  renderEnd(result) {
    this.containerEl.innerHTML = \`
      <div class="max-w-md mx-auto p-10 text-center space-y-4">
        <div class="text-6xl">\${result.victory ? '🏆' : '💀'}</div>
        <h2 class="text-2xl font-bold">\${result.victory ? 'BOSS DEFEATED!' : 'DEFEATED'}</h2>
        <button id="boss-close" class="px-6 py-2 bg-gray-800 text-white rounded">Back</button>
      </div>\`;
    this.containerEl.querySelector('#boss-close').onclick = () => this.render();
  }
}
