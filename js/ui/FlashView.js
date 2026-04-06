/**
 * FlashView.js — 3D Flip Flashcards with SRS
 */
import { QuizEngine } from '../engine/QuizEngine.js';

export class FlashView {
  constructor(content, store, containerEl) {
    this.content     = content;
    this.store       = store;
    this.containerEl = containerEl;
    this.state       = null;
  }

  render() {
    const domains = QuizEngine.domainsFrom(this.content.questions);
    this.containerEl.innerHTML = `
      <div class="max-w-xl mx-auto p-6 space-y-5">
        <h2 class="text-purple-400 font-bold text-xl">Flashcards</h2>
        <div class="bg-gray-900 border border-gray-700 rounded p-4 space-y-3">
          <button id="flash-start" class="w-full py-2.5 bg-purple-800 text-purple-200 rounded font-semibold transition-colors">Start Session</button>
        </div>
        <div id="flash-area" class="hidden"></div>
      </div>`;

    this.containerEl.querySelector('#flash-start')?.addEventListener('click', () => this.startSession());
  }

  startSession() {
    const pool = this.content.questions.filter(q => q.type === 'multiple_choice' || q.type === 'true_false');
    const cards = [...pool].sort(() => Math.random() - 0.5).slice(0, 20);

    this.state = {
      cards,
      currentIdx: 0,
      flipped: false
    };

    this.containerEl.querySelector('#flash-area').classList.remove('hidden');
    this.renderCard();
  }

  renderCard() {
    const q = this.state.cards[this.state.currentIdx];
    if (!q) { this.renderSummary(); return; }

    const area = document.getElementById('flash-area');
    area.innerHTML = `
      <div class="bg-gray-900 border border-purple-800 rounded-xl p-8 min-h-[200px] flex flex-col justify-center text-center cursor-pointer" id="flash-card">
        <div class="text-[10px] text-gray-500 uppercase mb-2">\${q.domain}</div>
        <div class="text-white text-lg">\${this.state.flipped ? q.correct_answer : q.question}</div>
        <div class="text-xs text-gray-600 mt-4 italic">Click to flip</div>
      </div>
      \${this.state.flipped ? \`
        <div class="flex gap-4 mt-4">
          <button id="flash-miss" class="flex-1 py-2 bg-red-900 text-white rounded">Missed</button>
          <button id="flash-got" class="flex-1 py-2 bg-green-900 text-white rounded">Got It</button>
        </div>\` : ''}`;

    document.getElementById('flash-card').onclick = () => {
      this.state.flipped = !this.state.flipped;
      this.renderCard();
    };

    if (this.state.flipped) {
      document.getElementById('flash-miss').onclick = () => this.next(false);
      document.getElementById('flash-got').onclick = () => this.next(true);
    }
  }

  next(correct) {
    this.state.currentIdx++;
    this.state.flipped = false;
    this.renderCard();
  }

  renderSummary() {
    this.containerEl.innerHTML = \`<div class="p-10 text-center"><h2 class="text-2xl text-purple-400">Session Complete</h2><button id="flash-close" class="mt-4 px-6 py-2 bg-gray-800 text-white rounded">Back</button></div>\`;
    this.containerEl.querySelector('#flash-close').onclick = () => this.render();
  }
}
