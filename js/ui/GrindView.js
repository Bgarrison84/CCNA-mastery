/**
 * GrindView.js — Quiz Mode View
 */
import { QuizEngine } from '../engine/QuizEngine.js';
import { bus } from '../core/EventBus.js';
import { vibrate } from '../utils/ui.js';

export class GrindView {
  constructor(content, store, containerEl) {
    this.content     = content;
    this.store       = store;
    this.containerEl = containerEl;
    this.quiz        = null;
    
    this._confidenceMode  = false;
    this._smartDifficulty = false;
    this._adaptiveInfo    = null;
    this._sessionStartTime = 0;
    
    // Presets from other views (e.g. Stats)
    this.presetDomain = null;
    this.presetWeek   = null;
  }

  setPresets(domain, week) {
    this.presetDomain = domain;
    this.presetWeek   = week;
  }

  render() {
    const presetDomain = this.presetDomain;
    const presetWeek   = this.presetWeek;
    this.presetDomain = null; 
    this.presetWeek   = null;

    const allQIds = this.content.questions.filter(q => q.type !== 'cli_lab').map(q => q.id);
    const srs     = this.store.getSRSStats(allQIds);
    const srsTotal = srs.due + srs.new;

    this.containerEl.innerHTML = `
      <div class="max-w-2xl mx-auto p-6 space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-green-400 font-bold text-xl">The Grind — Quiz Mode</h2>
          <div class="flex gap-2 text-xs">
            <select id="quiz-domain" class="bg-gray-800 border border-gray-600 text-gray-300 rounded px-2 py-1">
              <option value="all">All Domains</option>
              \${QuizEngine.domainsFrom(this.content.questions).map(d => \`<option value="\${d}" \${d === presetDomain ? 'selected' : ''}>\${d}</option>\`).join('')}
            </select>
            <select id="quiz-week" class="bg-gray-800 border border-gray-600 text-gray-300 rounded px-2 py-1">
              <option value="all">All Weeks</option>
              \${[1,2,3,4,5,6].map(w => \`<option value="\${w}" \${String(w) === String(presetWeek) ? 'selected' : ''}>Week \${w}</option>\`).join('')}
            </select>
            <select id="quiz-difficulty" class="bg-gray-800 border border-gray-600 text-gray-300 rounded px-2 py-1">
              <option value="all">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <label class="flex items-center gap-1 cursor-pointer select-none border border-gray-600 rounded px-2 py-1" title="Spaced Repetition: serves due questions first">
              <input type="checkbox" id="quiz-srs" checked class="accent-green-500">
              <span class="text-gray-300">SRS</span>
            </label>
            <label class="flex items-center gap-1 cursor-pointer select-none border border-gray-600 rounded px-2 py-1" title="Re-queue: missed questions reappear ~5 questions later">
              <input type="checkbox" id="quiz-requeue" class="accent-yellow-500">
              <span class="text-gray-300">Re-queue</span>
            </label>
            <label class="flex items-center gap-1 cursor-pointer select-none border border-gray-600 rounded px-2 py-1" title="Confidence: rate how sure you were (1–5).">
              <input type="checkbox" id="quiz-confidence" class="accent-purple-500">
              <span class="text-gray-300">Confidence</span>
            </label>
            <label class="flex items-center gap-1 cursor-pointer select-none border border-gray-600 rounded px-2 py-1" title="Smart difficulty weighting">
              <input type="checkbox" id="quiz-smart" class="accent-blue-500">
              <span class="text-gray-300">Smart</span>
            </label>
            <button id="start-quiz" class="px-4 py-1 bg-green-700 hover:bg-green-600 text-white rounded font-semibold">Start</button>
          </div>
        </div>

        <div class="flex gap-3 text-[11px] font-mono bg-gray-900 border border-gray-700 rounded px-4 py-2">
          <span class="text-cyan-400">&#9632; New <strong>\${srs.new}</strong></span>
          <span class="text-yellow-400">&#9632; Due <strong>\${srs.due}</strong></span>
          <span class="text-blue-400">&#9632; Learning <strong>\${srs.learning}</strong></span>
          <span class="text-green-500">&#9632; Mastered <strong>\${srs.mastered}</strong></span>
          <span class="ml-auto text-gray-600">\${allQIds.length} total questions</span>
        </div>

        <div id="quiz-area" class="hidden"></div>
        <div id="quiz-prompt" class="text-center py-12">
          \${srsTotal > 0
            ? \`<p class="text-yellow-400 font-semibold">\${srs.due} due · \${srs.new} new</p>
               <p class="text-gray-400 text-sm mt-1">SRS mode will serve these first.</p>\`
            : \`<p class="text-green-400 font-semibold">You're all caught up!</p>
               <p class="text-gray-400 text-sm mt-1">No questions due. Come back tomorrow, or drill any domain below.</p>\`}
          <p class="text-xs text-gray-600 mt-3">Select a domain and difficulty, then press Start.</p>
        </div>
      </div>\`;

    this.containerEl.querySelector('#start-quiz')?.addEventListener('click', () => this.startQuiz());

    if (presetDomain || presetWeek) setTimeout(() => this.startQuiz(), 0);
  }

  startQuiz() {
    const domain     = document.getElementById('quiz-domain')?.value || 'all';
    const week       = document.getElementById('quiz-week')?.value   || 'all';
    const difficulty = document.getElementById('quiz-difficulty')?.value || 'all';
    const srsOn      = document.getElementById('quiz-srs')?.checked ?? true;
    const requeueOn  = document.getElementById('quiz-requeue')?.checked ?? false;
    this._confidenceMode  = document.getElementById('quiz-confidence')?.checked ?? false;
    this._smartDifficulty = document.getElementById('quiz-smart')?.checked ?? false;

    // Check loading state
    if (week === 'all' && !window._allWeeksLoaded?.()) {
      const prompt = document.getElementById('quiz-prompt');
      if (prompt) {
        prompt.innerHTML = \`<div class="text-center py-10"><p class="text-yellow-400">Loading remaining weeks...</p></div>\`;
      }
      window._ensureAllWeeksLoaded?.().then(() => this.startQuiz());
      return;
    }

    const customQs = this.store.getCustomQuestions();
    const basePool = week === 'all' ? [...this.content.questions, ...customQs] : [...this.content.questions.filter(q => String(q.week) === String(week)), ...customQs.filter(q => String(q.week) === String(week))];
    
    const useAdaptive = this._smartDifficulty && difficulty === 'all' && !srsOn;
    if (this._smartDifficulty && difficulty === 'all') {
      const { pool: adaptedPool, info } = this._computeAdaptivePool(basePool, domain);
      this._adaptiveInfo = info;
      this.quiz = new QuizEngine(adaptedPool, this.store, { domain: 'all', difficulty: 'all', count: 20, shuffle: !srsOn, srs: srsOn, requeueWrong: requeueOn, adaptive: useAdaptive });
    } else {
      this._adaptiveInfo = null;
      this.quiz = new QuizEngine(basePool, this.store, { domain, difficulty, count: 20, shuffle: !srsOn, srs: srsOn, requeueWrong: requeueOn, adaptive: false });
    }

    this._sessionStartTime = Date.now();

    if (!this.quiz.start()) {
      const prompt = document.getElementById('quiz-prompt');
      if (prompt) {
        prompt.classList.remove('hidden');
        prompt.innerHTML = \`<p class="text-yellow-400 py-10">No questions match these filters</p>\`;
      }
      return;
    }
    document.getElementById('quiz-prompt')?.classList.add('hidden');
    this.renderQuizQuestion();
  }

  _computeAdaptivePool(basePool, domain) {
    const questions = (domain === 'all' ? basePool : basePool.filter(q => q.domain === domain))
      .filter(q => q.type !== 'cli_lab');

    const history = this.store.state.quizHistory || [];
    const diffAcc = { easy: { c: 0, t: 0 }, medium: { c: 0, t: 0 }, hard: { c: 0, t: 0 } };
    history.forEach(s => {
      Object.entries(s.difficultyStats || {}).forEach(([diff, stat]) => {
        if (diffAcc[diff]) { diffAcc[diff].c += stat.correct; diffAcc[diff].t += stat.total; }
      });
    });

    const weights = {};
    const accuracy = {};
    ['easy', 'medium', 'hard'].forEach(tier => {
      const { c, t } = diffAcc[tier];
      if (t < 20) { weights[tier] = 1.0; accuracy[tier] = null; }
      else { const acc = c / t; accuracy[tier] = acc; weights[tier] = acc < 0.60 ? 3.0 : acc < 0.75 ? 2.0 : 1.0; }
    });

    const buckets = {
      easy:   questions.filter(q => q.difficulty === 'easy'),
      medium: questions.filter(q => q.difficulty === 'medium'),
      hard:   questions.filter(q => q.difficulty === 'hard'),
    };
    ['easy', 'medium', 'hard'].forEach(t => { if (!buckets[t].length) weights[t] = 0; });

    const totalW = weights.easy + weights.medium + weights.hard;
    if (totalW === 0) return { pool: questions, info: null };

    const SESSION = 20;
    const alloc = { easy: 0, medium: 0, hard: 0 };
    let allocated = 0;
    const tiers = ['easy', 'medium', 'hard'];
    tiers.forEach((tier, i) => {
      if (!buckets[tier].length || weights[tier] === 0) return;
      if (i < tiers.length - 1) {
        alloc[tier] = Math.max(1, Math.round(SESSION * weights[tier] / totalW));
        alloc[tier] = Math.min(alloc[tier], buckets[tier].length);
        allocated += alloc[tier];
      } else {
        alloc[tier] = Math.min(buckets[tier].length, Math.max(1, SESSION - allocated));
      }
    });

    const _shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
    const combined = [..._shuffle(buckets.easy).slice(0, alloc.easy), ..._shuffle(buckets.medium).slice(0, alloc.medium), ..._shuffle(buckets.hard).slice(0, alloc.hard)];
    const boosted = tiers.filter(t => weights[t] > 1.0).sort((a, b) => weights[b] - weights[a])[0] || null;

    return { pool: _shuffle(combined), info: { weights, accuracy, alloc, boosted } };
  }

  renderQuizQuestion() {
    const area = document.getElementById('quiz-area');
    if (!area) return;
    const q = this.quiz.currentQuestion;
    if (!q) return;

    const { current, total } = this.quiz.progress;
    area.classList.remove('hidden');
    area.innerHTML = \`
      <div class="space-y-4">
        <div class="flex items-center justify-between text-[10px] font-mono text-gray-500 uppercase tracking-widest">
          <div>Question \${current} / \${total}</div>
          <div>\${q.domain} \${q._custom ? '<span class="text-blue-400 ml-2">✏️ Custom</span>' : ''}</div>
        </div>
        
        <div class="bg-gray-900 border border-gray-800 rounded-lg p-5">
          \${q.scenario_text ? \`<div class="text-xs text-gray-500 mb-3 italic bg-black/30 p-3 rounded border border-gray-800">\${q.scenario_text}</div>\` : ''}
          <div class="text-green-100 leading-relaxed font-semibold">\${q.question}</div>
          
          <div id="quiz-options" class="mt-6 space-y-2">
            \${q.options.map((opt, i) => \`
              <button data-idx="\${i}" class="quiz-opt w-full text-left px-4 py-3 rounded border border-gray-700 hover:border-green-500 transition-colors text-sm text-gray-300">
                \${opt}
              </button>\`).join('')}
          </div>
        </div>
      </div>\`;

    area.querySelectorAll('.quiz-opt').forEach(btn => {
      btn.onclick = () => this.handleAnswer(parseInt(btn.dataset.idx));
    });
  }

  handleAnswer(idx) {
    const res = this.quiz.answer(idx);
    const currentQ = this.quiz.currentQuestion;

    // Mistake tracking + haptic
    if (!res.isCorrect && currentQ) this.store.recordMistake(currentQ.id);
    if (res.isCorrect && currentQ) this.store.recordMistakeCorrect(currentQ.id);
    vibrate(this.store, res.isCorrect ? 50 : [100, 50, 100]);

    if (res.isCorrect) {
       // Award XP
       this.store.addXP(10, 'quiz_correct');
    }
    
    if (this.quiz.isFinished) {
      this.renderResults();
    } else {
      setTimeout(() => this.renderQuizQuestion(), 1000);
    }
  }

  renderResults() {
    // Render quiz summary...
    this.containerEl.innerHTML = \`<div class="p-10 text-center"><h2 class="text-2xl text-green-400">Quiz Finished!</h2><button id="back-to-grind" class="mt-4 px-6 py-2 bg-green-700 text-white rounded">Back</button></div>\`;
    this.containerEl.querySelector('#back-to-grind').onclick = () => this.render();
  }
}
