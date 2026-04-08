/**
 * BossView.js — Boss Battle Mode View
 */
import { BossBattle } from '../engine/BossBattle.js';
import { bus } from '../core/EventBus.js';
import { vibrate } from '../utils/ui.js';
import { playSound } from '../utils/sound.js';

// Flavour text per boss ID; falls back to 'default'.
const BOSS_TAUNTS = {
  boss_w1_the_architect: {
    wrong:     ['Your subnetting is appalling.', 'Even a hub knows better.', 'Layer 1 would be ashamed of you.'],
    frustrated:['You again? I expected better.', "Lucky guess, cadet. Don't count on it.", "Fine. You're smarter than I thought."],
  },
  boss_w2_the_switcher: {
    wrong:     ['Spanning Tree would block you too.', 'Your MAC table is empty like your knowledge.', 'BPDU storms are more consistent than you.'],
    frustrated:['How dare you. I am the root bridge!', "Beginner's luck. Your STP will converge eventually.", 'Unbelievable. A port just went to Forwarding.'],
  },
  boss_w3_the_router: {
    wrong:     ['Your routes are unreachable.', 'OSPF would never elect you DR.', 'The routing table rejects your packet.'],
    frustrated:['Your OSPF is... converging? Impossible.', 'You found the longest prefix match? Lucky.', 'Fine. Your routing table is less embarrassing now.'],
  },
  boss_w4_the_inspector: {
    wrong:     ['Access denied. As expected.', 'Your ACL matched the implicit deny.', 'NAT translation failed. Try again.'],
    frustrated:['You bypassed my ACL? Unacceptable.', 'Your NAT table is actually correct. Impressive.', 'I may need to rewrite my access-list.'],
  },
  boss_w5_the_breach: {
    wrong:     ['Security misconfiguration detected.', 'Your ZBF policy is wide open.', "SSH? You don't even know your own key."],
    frustrated:['Your hardening is... adequate. For now.', 'Zone-based firewall configured correctly. Suspicious.', "You've passed the audit. This time."],
  },
  boss_w6_the_migration: {
    wrong:     ['Your cloud architecture is on-prem thinking.', 'REST API error 403: Forbidden knowledge.', 'Ansible failed. Check your playbook.'],
    frustrated:['Automation working correctly? Unexpected.', 'Your API call returned 200 OK. Reluctantly impressed.', 'Fine. The migration can proceed.'],
  },
  default: {
    wrong:     ['Pathetic.', 'Is that your final answer?', 'Try again, cadet.', 'Your config is rejected.'],
    frustrated:["You're better than I expected.", "Lucky guess. Don't celebrate yet.", "Hmm. Perhaps you've been studying."],
  },
};

function _bossTaunt(bossId, type) {
  const pool = BOSS_TAUNTS[bossId]?.[type] || BOSS_TAUNTS.default[type];
  return pool[Math.floor(Math.random() * pool.length)];
}

export class BossView {
  constructor(content, store, containerEl) {
    this.content          = content;
    this.store            = store;
    this.containerEl      = containerEl;
    this.boss             = null;
    this._correctStreak   = 0;
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
          return `<div class="bg-gray-900 border ${defeated ? 'border-green-700' : 'border-red-900'} rounded p-4 flex items-center gap-4">
            <div class="text-5xl">${b.avatar}</div>
            <div class="flex-1">
              <div class="font-bold text-lg ${defeated ? 'text-green-400' : 'text-red-300'}">${b.name}</div>
              <div class="text-sm text-gray-400">${b.description}</div>
              <div class="text-xs text-yellow-400 mt-1">${b.xpReward} XP reward · Week ${b.week}</div>
            </div>
            <button data-boss="${b.id}" class="${locked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-red-700 cursor-pointer'} boss-start-btn px-4 py-2 bg-red-900 border border-red-700 text-red-200 rounded text-sm font-semibold" ${locked ? 'disabled' : ''}>
              ${defeated ? 'Rematch' : locked ? `LVL ${b.unlockLevel} req.` : 'Challenge'}
            </button>
          </div>`;
        }).join('')}
        ${!bosses.length ? '<p class="text-gray-500 text-center py-8">No bosses unlocked yet.</p>' : ''}
      </div>`;

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
    this._correctStreak = 0;

    this.containerEl.innerHTML = `
      <div class="max-w-xl mx-auto p-6 space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-4xl">${bossData.avatar}</span>
            <div>
              <div class="text-red-300 font-bold">${bossData.name}</div>
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
      <p class="text-white font-medium mb-4">${q.question}</p>
      <div class="space-y-2">
        ${q.options.map((opt, i) => `
          <button data-answer="${i}" class="boss-opt w-full text-left px-4 py-2 border border-gray-600 rounded text-sm text-gray-200">
            ${opt}
          </button>`).join('')}
      </div>`;

    area.querySelectorAll('.boss-opt').forEach(btn => {
      btn.onclick = () => this.submitAnswer(btn.dataset.answer);
    });
  }

  submitAnswer(answer) {
    const result = this.boss.answer(answer);

    // Haptic + sound + streak tracking
    vibrate(this.store, result.correct ? 50 : [100, 50, 100]);
    playSound(result.correct ? 'correct' : 'bossHit', this.store);
    if (result.correct) this._correctStreak++;
    else this._correctStreak = 0;

    // Boss taunt
    const bossId = this.boss.bossData?.id || '';
    const taunt = result.correct && this._correctStreak >= 3
      ? _bossTaunt(bossId, 'frustrated')
      : !result.correct
        ? _bossTaunt(bossId, 'wrong')
        : null;

    // Show feedback
    const feedbackEl = document.getElementById('boss-feedback');
    if (feedbackEl) {
      feedbackEl.classList.remove('hidden');
      feedbackEl.className = `mt-3 p-2 rounded text-xs ${result.correct ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'}`;
      const base = result.correct ? 'Correct!' : 'Incorrect!';
      feedbackEl.innerHTML = taunt ? `${base} <em class="opacity-70 ml-1">"${taunt}"</em>` : base;
    }

    // Update bars
    const hpBar = document.getElementById('boss-hp-bar');
    if (hpBar) hpBar.style.width = this.boss.hp + '%';

    if (result.done) {
      if (result.victory) { vibrate(this.store, 300); playSound('victory', this.store); }
      setTimeout(() => this.renderEnd(result), 1500);
    } else {
      setTimeout(() => this.renderQuestion(), 1500);
    }
  }

  renderEnd(result) {
    this.containerEl.innerHTML = `
      <div class="max-w-md mx-auto p-10 text-center space-y-4">
        <div class="text-6xl">${result.victory ? '🏆' : '💀'}</div>
        <h2 class="text-2xl font-bold">${result.victory ? 'BOSS DEFEATED!' : 'DEFEATED'}</h2>
        <button id="boss-close" class="px-6 py-2 bg-gray-800 text-white rounded">Back</button>
      </div>`;
    this.containerEl.querySelector('#boss-close').onclick = () => this.render();
  }
}
