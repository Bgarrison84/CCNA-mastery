/**
 * ExamView.js — Timed CCNA Exam Simulator
 */
import { bus } from '../core/EventBus.js';

const EXAM_DOMAIN_WEIGHTS = [
  { domain: 'Network Fundamentals',        count: 17 },
  { domain: 'Network Access',              count: 17 },
  { domain: 'IP Connectivity',             count: 21 },
  { domain: 'IP Services',                 count: 10 },
  { domain: 'Security Fundamentals',       count: 13 },
  { domain: 'Automation & Programmability',count: 9 },
];
const EXAM_TIME_SECONDS = 120 * 60;

export class ExamView {
  constructor(content, store, containerEl) {
    this.content     = content;
    this.store       = store;
    this.containerEl = containerEl;
    this.state       = null;
  }

  render() {
    if (this.state?.timerId) clearInterval(this.state.timerId);
    this.state = null;

    const examHistory = (this.store.state.examHistory || []).slice().reverse();
    const historyRows = examHistory.length
      ? examHistory.map((run, i) => {
          const date = new Date(run.date).toLocaleDateString();
          const pass = run.score >= 70;
          return `
            <div class="exam-hist-row border border-gray-800 rounded px-3 py-2 text-xs flex justify-between items-center">
              <span class="font-bold ${pass ? 'text-green-400' : 'text-red-400'}">${pass ? 'PASS' : 'FAIL'}</span>
              <span class="text-gray-300 font-mono">${run.score}%</span>
              <span class="text-gray-500">${date}</span>
            </div>`;
        }).join('')
      : '<p class="text-gray-600 text-xs py-2 text-center">No exam runs yet.</p>';

    this.containerEl.innerHTML = `
      <div class="max-w-2xl mx-auto p-6 space-y-5">
        <h2 class="text-yellow-400 font-bold text-xl">Exam Simulator</h2>
        <div class="bg-gray-900 border border-yellow-900 rounded p-5 space-y-3">
          <h3 class="text-yellow-300 font-semibold">Ready for the 120-question gauntlet?</h3>
          <p class="text-xs text-gray-400">Proportional sampling from all 6 CCNA domains. 120 minutes. 70% to pass.</p>
          <button id="start-exam" class="w-full py-2.5 bg-yellow-800 text-yellow-200 rounded font-semibold transition-colors">Begin Exam</button>
        </div>
        <div class="bg-gray-900 border border-gray-700 rounded p-5">
          <h3 class="text-sm text-gray-400 uppercase tracking-widest mb-3">Exam History</h3>
          <div class="space-y-1">${historyRows}</div>
        </div>
        <div id="exam-area" class="hidden"></div>
      </div>`;

    this.containerEl.querySelector('#start-exam')?.addEventListener('click', () => this.startExam());
  }

  startExam() {
    if (!window._allWeeksLoaded?.()) {
      alert('Still loading question bank... please wait a few seconds.');
      return;
    }

    const allQ = this.content.questions.filter(q => q.type !== 'cli_lab');
    const session = [];
    for (const { domain, count } of EXAM_DOMAIN_WEIGHTS) {
      const pool = allQ.filter(q => q.domain === domain);
      session.push(...[...pool].sort(() => Math.random() - 0.5).slice(0, count));
    }
    session.sort(() => Math.random() - 0.5);

    this.state = {
      session,
      currentIdx: 0,
      results: [],
      startTime: Date.now(),
      secondsLeft: EXAM_TIME_SECONDS,
      timerId: setInterval(() => this._tick(), 1000)
    };

    this.containerEl.querySelector('#exam-area').classList.remove('hidden');
    this.renderQuestion();
  }

  _tick() {
    this.state.secondsLeft--;
    const el = document.getElementById('exam-timer');
    if (el) el.textContent = this._formatTime(this.state.secondsLeft);
    if (this.state.secondsLeft <= 0) this.finish();
  }

  renderQuestion() {
    const q = this.state.session[this.state.currentIdx];
    if (!q) { this.finish(); return; }

    const area = document.getElementById('exam-area');
    area.innerHTML = `
      <div class="bg-gray-900 border border-gray-700 rounded p-5 mt-4">
        <div class="flex justify-between text-[10px] text-gray-500 mb-2">
          <span>${q.domain}</span>
          <span id="exam-timer" class="font-mono text-yellow-400 font-bold">${this._formatTime(this.state.secondsLeft)}</span>
          <span>${this.state.currentIdx + 1} / ${this.state.session.length}</span>
        </div>
        <div class="text-white text-sm mb-4">${q.question}</div>
        <div class="space-y-2">
          ${q.options.map((opt, i) => `
            <button data-answer="${i}" class="exam-opt w-full text-left px-4 py-2 border border-gray-700 rounded text-sm hover:border-yellow-500 transition-colors">
              ${opt}
            </button>`).join('')}
        </div>
      </div>`;

    area.querySelectorAll('.exam-opt').forEach(btn => {
      btn.onclick = () => this.submitAnswer(btn.dataset.answer);
    });
  }

  submitAnswer(answer) {
    const q = this.state.session[this.state.currentIdx];
    const isCorrect = String(answer) === String(q.correct_answer);
    this.state.results.push({ correct: isCorrect, domain: q.domain });
    this.state.currentIdx++;
    this.renderQuestion();
  }

  finish() {
    clearInterval(this.state.timerId);
    const correct = this.state.results.filter(r => r.correct).length;
    const total = this.state.results.length;
    const score = Math.round((correct / total) * 100);
    
    this.store.recordExamRun({ score, correct, total, date: Date.now() });
    
    this.containerEl.innerHTML = `
      <div class="max-w-md mx-auto p-10 text-center space-y-4">
        <div class="text-5xl">${score >= 70 ? '🎉' : '💀'}</div>
        <h2 class="text-2xl font-bold ${score >= 70 ? 'text-green-400' : 'text-red-400'}">${score}% - ${score >= 70 ? 'PASSED' : 'FAILED'}</h2>
        <p class="text-gray-400">You got ${correct} out of ${total} questions correct.</p>
        <button id="exam-close" class="px-6 py-2 bg-gray-800 text-white rounded">Close</button>
      </div>`;
    this.containerEl.querySelector('#exam-close').onclick = () => this.render();
  }

  _formatTime(s) {
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return `${m}:${rs.toString().padStart(2, '0')}`;
  }
}
