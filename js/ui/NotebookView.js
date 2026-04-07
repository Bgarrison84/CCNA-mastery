/**
 * NotebookView.js — Mistake Notebook & Custom Questions
 */
import { QuizEngine } from '../engine/QuizEngine.js';
import { bus } from '../core/EventBus.js';
import { showToast } from '../utils/ui.js';

export class NotebookView {
  constructor(content, store, containerEl) {
    this.content     = content;
    this.store       = store;
    this.containerEl = containerEl;
  }

  render() {
    const mistakeIds  = this.store.getMistakeIds(2);  // wrong >= 2 times
    const allMistakes = Object.entries(this.store.state.mistakeNotebook || {})
      .sort(([, a], [, b]) => b - a);            // most wrong first
    const flaggedIds  = this.store.getFlaggedIds();
    const customQs    = this.store.getCustomQuestions();

    // Map question IDs to question objects
    const questionMap = {};
    this.content.questions.forEach(q => { questionMap[q.id] = q; });

    const mistakeQs = mistakeIds
      .map(id => questionMap[id])
      .filter(Boolean);

    const notebookRows = allMistakes.slice(0, 50).map(([id, count]) => {
      const q = questionMap[id];
      if (!q) return '';
      const inQueue = count >= 2;
      const streak  = this.store.getMistakeStreak ? this.store.getMistakeStreak(id) : 0;
      const streakBadge = streak > 0
        ? `<span class="text-green-600 text-[10px] shrink-0 font-mono" title="${streak}/3 correct in a row — graduates at 3">${streak}/3 ✓</span>`
        : '';
      return `<div class="flex items-start gap-3 py-2 border-b border-gray-800 text-xs">
        <span class="w-5 text-center font-bold ${count >= 4 ? 'text-red-400' : count >= 2 ? 'text-yellow-400' : 'text-gray-500'}">${count}×</span>
        <div class="flex-1 min-w-0">
          <div class="text-gray-300 truncate">${q.question?.substring(0, 80) || id}...</div>
          <div class="text-gray-600 mt-0.5">${q.domain} · ${q.difficulty}</div>
        </div>
        ${inQueue ? '<span class="text-green-600 text-[10px] shrink-0">in queue</span>' : ''}
        ${streakBadge}
      </div>`;
    }).join('');

    const flaggedQs   = flaggedIds.map(id => questionMap[id]).filter(Boolean);
    const flaggedRows = flaggedIds.slice(0, 50).map(id => {
      const q = questionMap[id];
      if (!q) return '';
      return `<div class="flex items-start gap-3 py-2 border-b border-gray-800 text-xs">
        <span class="text-yellow-400 text-sm shrink-0">🚩</span>
        <div class="flex-1 min-w-0">
          <div class="text-gray-300 truncate">${q.question?.substring(0, 80) || id}...</div>
          <div class="text-gray-600 mt-0.5">${q.domain} · ${q.difficulty}</div>
        </div>
        <button data-unflag="${id}" class="text-gray-700 hover:text-red-400 text-[10px] shrink-0 transition-colors">unflag</button>
      </div>`;
    }).join('');

    const domains = [...new Set(this.content.questions.map(q => q.domain))];
    const customRows = customQs.map((q, idx) => `
      <div class="flex items-start gap-3 py-2 border-b border-gray-800 text-xs">
        <span class="text-purple-400 shrink-0">✍️</span>
        <div class="flex-1 min-w-0">
          <div class="text-gray-300 truncate">${q.question?.substring(0, 80) || ''}...</div>
          <div class="text-gray-600 mt-0.5">${q.domain} · ${q.difficulty} · Week ${q.week}</div>
        </div>
        <button data-delete-custom="${q.id}" class="text-gray-700 hover:text-red-400 text-[10px] shrink-0 transition-colors">delete</button>
      </div>`).join('');

    this.containerEl.innerHTML = `
      <div class="max-w-2xl mx-auto p-6 space-y-5">
        <div class="flex items-center justify-between">
          <h2 class="text-orange-400 font-bold text-xl">Error Log</h2>
          <div class="flex items-center gap-3">
            <span class="text-xs text-gray-600">${mistakeQs.length} mistake${mistakeQs.length !== 1 ? 's' : ''} · ${flaggedIds.length} flagged · ${customQs.length} custom</span>
            <button id="export-notebook-btn"
              class="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 hover:border-gray-500 rounded transition-colors"
              title="Download flagged + mistake questions as a Markdown file">
              📥 Export Notes
            </button>
            <button id="export-anki-btn"
              class="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-900/40 hover:bg-blue-900/70 text-blue-300 border border-blue-800 hover:border-blue-600 rounded transition-colors"
              title="Export flagged + mistake questions in Anki import format (.txt)">
              📥 Anki Export
            </button>
          </div>
        </div>

        <!-- Flagged Questions -->
        <div class="bg-gray-900 border border-yellow-900/50 rounded p-5 space-y-3">
          <h3 class="text-sm text-yellow-600 uppercase tracking-widest">🚩 Flagged Questions</h3>
          <p class="text-gray-400 text-xs">Questions you've flagged during quizzes or exams for later review.</p>
          ${flaggedQs.length > 0 ? `
          <button id="start-flag-drill" class="w-full py-2.5 bg-yellow-900 hover:bg-yellow-800 text-yellow-200 rounded font-semibold text-sm">
            Drill Flagged Questions (${flaggedQs.length})
          </button>
          <div class="mt-2 space-y-0">${flaggedRows}</div>
          <div class="text-right">
            <button id="clear-flags" class="text-xs text-gray-700 hover:text-red-400 transition-colors">Clear all flags</button>
          </div>` : `
          <p class="text-gray-600 text-xs italic">No flagged questions yet. Use the 🚩 Flag button during any quiz to mark tricky questions.</p>`}
        </div>

        <!-- Mistake Drill -->
        <div class="bg-gray-900 border border-orange-900/50 rounded p-5 space-y-3">
          <h3 class="text-sm text-orange-600 uppercase tracking-widest">✖ Mistake Drill</h3>
          <p class="text-gray-400 text-xs">Questions you've answered wrong 2+ times are queued here for targeted review.</p>
          ${mistakeQs.length > 0 ? `
          <button id="start-notebook-drill" class="w-full py-2.5 bg-orange-800 hover:bg-orange-700 text-orange-200 rounded font-semibold text-sm">
            Start Notebook Drill (${mistakeQs.length} questions)
          </button>` : `
          <p class="text-gray-600 text-xs italic">No questions in queue yet. Questions you get wrong twice will appear here.</p>`}
        </div>

        <div class="bg-gray-900 border border-gray-700 rounded p-5">
          <h3 class="text-sm text-gray-400 uppercase tracking-widest mb-3">Mistake History (top 50)</h3>
          ${notebookRows || '<p class="text-gray-600 text-xs">No mistakes recorded yet.</p>'}
        </div>

        ${allMistakes.length > 0 ? `
        <div class="text-center">
          <button id="clear-notebook" class="text-xs text-gray-700 hover:text-red-400 transition-colors">
            Clear mistake history
          </button>
        </div>` : ''}

        <!-- ✍️ Custom Questions -->
        <div class="bg-gray-900 border border-purple-900/50 rounded p-5 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm text-purple-400 uppercase tracking-widest">✍️ Custom Questions</h3>
            <span class="text-xs text-gray-600">${customQs.length} created</span>
          </div>
          <p class="text-gray-400 text-xs">Create your own MC questions. They appear in Grind and Flashcard with a ✍️ badge.</p>

          ${customQs.length > 0 ? `
          <button id="start-custom-drill" class="w-full py-2.5 bg-purple-900 hover:bg-purple-800 text-purple-200 rounded font-semibold text-sm">
            Drill Custom Questions (${customQs.length})
          </button>
          <div class="mt-2 space-y-0">${customRows}</div>` : `
          <p class="text-gray-600 text-xs italic">No custom questions yet. Use the form below to create one.</p>`}

          <!-- Create Question Form -->
          <details id="create-q-details" class="mt-2">
            <summary class="cursor-pointer text-xs text-purple-500 hover:text-purple-300 font-mono select-none">+ Create a New Question ▶</summary>
            <form id="create-q-form" class="mt-3 space-y-3">
              <div>
                <label class="block text-[11px] text-gray-500 mb-1">Question text *</label>
                <textarea id="cq-question" rows="3" required
                  class="w-full bg-gray-800 border border-gray-700 focus:border-purple-600 rounded px-2 py-1.5 text-sm text-gray-200 resize-y"
                  placeholder="Enter your question..."></textarea>
              </div>
              <div class="space-y-2">
                <label class="block text-[11px] text-gray-500">Options * <span class="text-gray-600">(select the correct one)</span></label>
                ${[0,1,2,3].map(i => `
                <div class="flex items-center gap-2">
                  <input type="radio" name="cq-correct" value="${i}" id="cq-radio-${i}" class="accent-purple-500" ${i === 0 ? 'checked' : ''}>
                  <label for="cq-radio-${i}" class="text-purple-400 font-mono text-xs w-4">${String.fromCharCode(65+i)}.</label>
                  <input type="text" id="cq-opt-${i}" required
                    class="flex-1 bg-gray-800 border border-gray-700 focus:border-purple-600 rounded px-2 py-1.5 text-xs text-gray-200"
                    placeholder="Option ${String.fromCharCode(65+i)}">
                </div>`).join('')}
              </div>
              <div>
                <label class="block text-[11px] text-gray-500 mb-1">Explanation <span class="text-gray-600">(optional)</span></label>
                <textarea id="cq-explanation" rows="2"
                  class="w-full bg-gray-800 border border-gray-700 focus:border-purple-600 rounded px-2 py-1.5 text-xs text-gray-200 resize-y"
                  placeholder="Why is this the correct answer?"></textarea>
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div>
                  <label class="block text-[11px] text-gray-500 mb-1">Domain</label>
                  <select id="cq-domain" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200">
                    ${domains.map(d => `<option value="${d}">${d}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <label class="block text-[11px] text-gray-500 mb-1">Difficulty</label>
                  <select id="cq-difficulty" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200">
                    <option value="easy">Easy</option>
                    <option value="medium" selected>Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label class="block text-[11px] text-gray-500 mb-1">Week</label>
                  <select id="cq-week" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200">
                    ${[1,2,3,4,5,6].map(w => `<option value="${w}">Week ${w}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div id="cq-error" class="hidden text-xs text-red-400"></div>
              <button type="submit"
                class="w-full py-2 bg-purple-800 hover:bg-purple-700 text-purple-100 rounded font-semibold text-sm transition-colors">
                Save Question
              </button>
            </form>
          </details>
        </div>

      </div>`;

    this._attachListeners(flaggedQs, customQs, mistakeQs);
  }

  _attachListeners(flaggedQs, customQs, mistakeQs) {
    this.containerEl.querySelector('#export-notebook-btn')?.addEventListener('click', () => this._exportNotebook());
    this.containerEl.querySelector('#export-anki-btn')?.addEventListener('click', () => this._exportToAnki());

    this.containerEl.querySelector('#start-flag-drill')?.addEventListener('click', () => {
      this._startNotebookDrill(flaggedQs);
    });

    this.containerEl.querySelector('#start-custom-drill')?.addEventListener('click', () => {
      this._startNotebookDrill(customQs);
    });

    this.containerEl.querySelectorAll('[data-delete-custom]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Delete this custom question?')) {
          this.store.deleteCustomQuestion(btn.dataset.deleteCustom);
          this.render();
        }
      });
    });

    this.containerEl.querySelector('#create-q-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const errorEl   = this.containerEl.querySelector('#cq-error');
      const question    = this.containerEl.querySelector('#cq-question').value.trim();
      const opts        = [0,1,2,3].map(i => this.containerEl.querySelector(`#cq-opt-${i}`).value.trim());
      const correctVal  = this.containerEl.querySelector('input[name="cq-correct"]:checked')?.value ?? '0';
      const explanation = this.containerEl.querySelector('#cq-explanation').value.trim();
      const domain      = this.containerEl.querySelector('#cq-domain').value;
      const difficulty  = this.containerEl.querySelector('#cq-difficulty').value;
      const week        = Number(this.containerEl.querySelector('#cq-week').value);

      if (!question) { errorEl.textContent = 'Question text is required.'; errorEl.classList.remove('hidden'); return; }
      if (opts.some(o => !o)) { errorEl.textContent = 'All four options are required.'; errorEl.classList.remove('hidden'); return; }
      errorEl.classList.add('hidden');

      this.store.addCustomQuestion({ question, options: opts, correct_answer: correctVal, explanation, domain, difficulty, week });
      this.render();
      setTimeout(() => {
        this.containerEl.querySelector('#create-q-details')?.setAttribute('open', '');
      }, 50);
    });

    this.containerEl.querySelector('#clear-flags')?.addEventListener('click', () => {
      if (confirm('Clear all flagged questions?')) {
        this.store.clearFlags();
        this.render();
      }
    });

    this.containerEl.querySelectorAll('[data-unflag]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.store.toggleFlag(btn.dataset.unflag);
        this.render();
      });
    });

    this.containerEl.querySelector('#start-notebook-drill')?.addEventListener('click', () => {
      this._startNotebookDrill(mistakeQs);
    });

    this.containerEl.querySelector('#clear-notebook')?.addEventListener('click', () => {
      if (confirm('Clear all mistake history?')) {
        this.store.clearNotebook();
        this.render();
      }
    });
  }

  _startNotebookDrill(questions) {
    if (!questions.length) return;
    bus.emit('nav:switch', { view: 'grind', questions: questions, title: 'Notebook Drill' });
  }

  _exportNotebook() {
    const questionMap = {};
    this.content.questions.forEach(q => { questionMap[q.id] = q; });

    const flaggedIds  = this.store.getFlaggedIds();
    const allMistakes = Object.entries(this.store.state.mistakeNotebook || {})
      .sort(([, a], [, b]) => b - a);

    const today = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
    const lines = [];

    lines.push('# CCNA Mastery — Study Notebook Export');
    lines.push(`Generated: ${today} · Player: ${this.store.state.playerName}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    const formatQuestion = (q) => {
      if (!q) return [];
      const out = [];
      out.push(`**Q:** ${q.question}`);
      out.push('');

      if (q.type === 'multiple_choice' && q.options) {
        out.push('**Options:**');
        q.options.forEach((opt, i) => {
          const letter = String.fromCharCode(65 + i);
          const isCorrect = String(i) === String(q.correct_answer);
          out.push(`- ${letter}. ${opt}${isCorrect ? ' ← ✅ CORRECT' : ''}`);
        });
        out.push('');
        const correctLetter = String.fromCharCode(65 + Number(q.correct_answer));
        out.push(`**Answer:** ${correctLetter}. ${q.options[q.correct_answer] || ''}`);
      } else if (q.type === 'true_false') {
        const ans = String(q.correct_answer).toLowerCase() === 'true' ? 'True' : 'False';
        out.push(`**Answer:** ${ans}`);
      } else if (q.type === 'multi_select' && q.options) {
        out.push('**Options (select all that apply):**');
        const correct = Array.isArray(q.correct_answer) ? q.correct_answer.map(String) : [String(q.correct_answer)];
        q.options.forEach((opt, i) => {
          const isCorrect = correct.includes(String(i));
          out.push(`- [${isCorrect ? 'x' : ' '}] ${opt}`);
        });
      }

      if (q.explanation) {
        out.push('');
        out.push(`**Explanation:** ${q.explanation}`);
      }
      if (q.source_ref) {
        out.push('');
        out.push(`**Source:** ${q.source_ref}`);
      }
      out.push('');
      out.push(`*${q.domain || ''}${q.difficulty ? ' · ' + q.difficulty : ''}${q.week != null ? ' · Week ' + q.week : ''}*`);
      return out;
    };

    lines.push(`## 🚩 Flagged Questions (${flaggedIds.length})`);
    lines.push('');
    if (flaggedIds.length === 0) {
      lines.push('*No flagged questions.*');
    } else {
      flaggedIds.forEach((id, idx) => {
        const q = questionMap[id];
        if (!q) return;
        lines.push(`### ${idx + 1}.`);
        lines.push(...formatQuestion(q));
        lines.push('---');
        lines.push('');
      });
    }

    lines.push('');
    lines.push(`## ✖ Mistake Questions (${allMistakes.length} tracked)`);
    lines.push('');
    if (allMistakes.length === 0) {
      lines.push('*No mistakes recorded yet.*');
    } else {
      allMistakes.forEach(([id, count], idx) => {
        const q = questionMap[id];
        if (!q) return;
        lines.push(`### ${idx + 1}. *(wrong ${count}×)*`);
        lines.push(...formatQuestion(q));
        lines.push('---');
        lines.push('');
      });
    }

    const customQs = this.store.getCustomQuestions();
    lines.push('');
    lines.push(`## ✍️ Custom Questions (${customQs.length})`);
    lines.push('');
    if (customQs.length === 0) {
      lines.push('*No custom questions created yet.*');
    } else {
      customQs.forEach((q, idx) => {
        lines.push(`### ${idx + 1}.`);
        lines.push(...formatQuestion(q));
        lines.push('---');
        lines.push('');
      });
    }

    const md = lines.join('\n');
    const dateSlug = new Date().toISOString().slice(0, 10);
    const filename = `ccna-notebook-${dateSlug}.md`;
    const blob = new Blob([md], { type: 'text/markdown; charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  _exportToAnki() {
    const questionMap = {};
    this.content.questions.forEach(q => { questionMap[q.id] = q; });

    const flaggedIds  = this.store.getFlaggedIds();
    const mistakeIds  = Object.keys(this.store.state.mistakeNotebook || {});
    const customQs    = this.store.getCustomQuestions();

    const seen = new Set();
    const ids = [...flaggedIds, ...mistakeIds];
    const dedupedQs = [];
    ids.forEach(id => {
      if (!seen.has(id)) { seen.add(id); dedupedQs.push(questionMap[id]); }
    });
    customQs.forEach(q => {
      if (!seen.has(q.id)) { seen.add(q.id); dedupedQs.push(q); }
    });

    const ankiFront = (q) => {
      if (!q) return '';
      let front = q.question || '';
      if ((q.type === 'multiple_choice' || q.type === 'multi_select') && q.options) {
        front += '\n\n' + q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n');
        if (q.type === 'multi_select') front += '\n\n(Select all that apply)';
      }
      return front.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    };

    const ankiBack = (q) => {
      if (!q) return '';
      let back = '';
      if (q.type === 'multiple_choice' && q.options) {
        const idx = Number(q.correct_answer);
        back = `<b>${String.fromCharCode(65 + idx)}. ${q.options[idx] || ''}</b>`;
      } else if (q.type === 'true_false') {
        const ans = String(q.correct_answer).toLowerCase() === 'true' ? 'True' : 'False';
        back = `<b>${ans}</b>`;
      } else if (q.type === 'multi_select' && q.options) {
        const correct = Array.isArray(q.correct_answer) ? q.correct_answer.map(String) : [String(q.correct_answer)];
        const letters = correct.map(i => String.fromCharCode(65 + Number(i))).join(', ');
        const answers = correct.map(i => q.options[Number(i)]).join('; ');
        back = `<b>${letters}: ${answers}</b>`;
      } else {
        back = `<b>${q.correct_answer || ''}</b>`;
      }
      if (q.explanation) {
        back += `<br><br>${q.explanation.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}`;
      }
      return back;
    };

    const lines = ['#separator:tab','#html:true','#notetype:Basic','#deck:CCNA Mastery','#tags column:3'];
    let exported = 0;
    dedupedQs.forEach(q => {
      if (!q) return;
      const front = ankiFront(q);
      const back  = ankiBack(q);
      if (!front || !back) return;
      lines.push(`${front}\t${back}\tccna`);
      exported++;
    });

    if (exported === 0) { alert('No questions to export.'); return; }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain; charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'ccna-anki.txt';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Exported ${exported} cards to Anki format.`);
  }
}
