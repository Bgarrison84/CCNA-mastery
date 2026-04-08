/**
 * StatsView.js — Performance Dashboard & Analytics
 */
import { QuizEngine } from '../engine/QuizEngine.js';
import { bus } from '../core/EventBus.js';
import { showToast } from '../utils/ui.js';

const EXAM_DOMAIN_WEIGHTS = [
  { domain: 'Network Fundamentals',        count: 17 },
  { domain: 'Network Access',              count: 17 },
  { domain: 'IP Connectivity',             count: 21 },
  { domain: 'IP Services',                 count: 10 },
  { domain: 'Security Fundamentals',       count: 13 },
  { domain: 'Automation & Programmability',count: 9 },
];

export class StatsView {
  constructor(content, store, containerEl) {
    this.content     = content;
    this.store       = store;
    this.containerEl = containerEl;
  }

  render() {
    const history = this.store.state.quizHistory || [];
    const domains = QuizEngine.domainsFrom(this.content.questions);

    // Aggregate all-time domain stats
    const domainTotals = {};
    domains.forEach(d => { domainTotals[d] = { correct: 0, total: 0 }; });

    const weekTotals = {};
    for (let w = 1; w <= 6; w++) weekTotals[w] = { correct: 0, total: 0 };

    history.forEach(session => {
      for (const [domain, stats] of Object.entries(session.domainStats || {})) {
        if (!domainTotals[domain]) domainTotals[domain] = { correct: 0, total: 0 };
        domainTotals[domain].correct += stats.correct;
        domainTotals[domain].total   += stats.total;
      }
      for (const [week, stats] of Object.entries(session.weekStats || {})) {
        const w = parseInt(week);
        if (w >= 1 && w <= 6) {
          weekTotals[w].correct += stats.correct;
          weekTotals[w].total   += stats.total;
        }
      }
    });

    const totalSessions = history.length;
    const recentSessions = history.slice(-10).reverse();

    const totalQuestions = this.content.questions.filter(q => q.type !== 'cli_lab').length;
    const totalLabs      = this.content.labs?.length || 0;

    const domainAccuracies = domains.map(d => {
      const t = domainTotals[d];
      return t.total > 0 ? (t.correct / t.total) * 100 : 0;
    });
    const avgAccuracy = domains.length
      ? domainAccuracies.reduce((s, v) => s + v, 0) / domains.length : 0;

    const srsSchedule   = this.store.state.reviewSchedule || {};
    const attempted     = Object.keys(srsSchedule).length;
    const attemptedPct  = totalQuestions > 0 ? Math.min(100, (attempted / totalQuestions) * 100) : 0;

    const masteredCount = Object.values(srsSchedule).filter(e => e.correctStreak >= 5).length;
    const masteredPct   = totalQuestions > 0 ? Math.min(100, (masteredCount / totalQuestions) * 100) : 0;

    const studyScore = Math.min(100, (this.store.studyHours / 100) * 100);
    const labsCompleted = this.store.state.completedLabs?.length || 0;
    const labScore      = totalLabs > 0 ? Math.min(100, (labsCompleted / totalLabs) * 100) : 0;

    const readiness = Math.round(0.30 * avgAccuracy + 0.20 * attemptedPct + 0.20 * masteredPct + 0.15 * studyScore + 0.15 * labScore);

    const readinessColor = readiness >= 85 ? 'text-blue-400' : readiness >= 70 ? 'text-green-400' : readiness >= 40 ? 'text-yellow-400' : 'text-red-400';
    const readinessBorder = readiness >= 85 ? 'border-blue-800' : readiness >= 70 ? 'border-green-800' : readiness >= 40 ? 'border-yellow-800' : 'border-red-800';
    const readinessLabel = readiness >= 85 ? 'Exam Ready' : readiness >= 70 ? 'On Track' : readiness >= 40 ? 'Developing' : 'Early Stage';

    const radarValues = domains.map(d => {
      const t = domainTotals[d];
      return t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0;
    });

    const weakDomains = domains
      .map(d => ({ domain: d, pct: domainTotals[d].total > 0 ? Math.round((domainTotals[d].correct / domainTotals[d].total) * 100) : null, total: domainTotals[d].total }))
      .filter(d => d.pct !== null)
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 3);

    const weakAreaCards = weakDomains.length
      ? weakDomains.map(d => {
          const color = d.pct >= 80 ? 'text-green-400 border-green-900' : d.pct >= 60 ? 'text-yellow-400 border-yellow-900' : 'text-red-400 border-red-900';
          return `
            <div class="flex items-center justify-between border ${color} rounded px-3 py-2.5">
              <div class="flex-1 min-w-0 mr-3">
                <div class="text-xs text-gray-300 truncate">${d.domain}</div>
              </div>
              <span class="font-mono font-bold text-sm ${color.split(' ')[0]} shrink-0 mr-3">${d.pct}%</span>
              <button class="drill-btn shrink-0 px-2.5 py-1 text-xs bg-green-900 hover:bg-green-700 text-green-300 rounded transition-colors" data-domain="${d.domain}">
                Drill
              </button>
            </div>`;
        }).join('')
      : '<p class="text-gray-600 text-xs py-2">Complete some quiz sessions to see weak areas.</p>';

    const domainRows = QuizEngine.domainsFrom(this.content.questions).map(domain => {
      const d   = domainTotals[domain];
      const pct = d.total > 0 ? Math.round((d.correct / d.total) * 100) : null;
      const barColor = pct === null ? 'bg-gray-700' : pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500';
      return `
        <div class="space-y-1">
          <div class="flex justify-between text-xs">
            <span class="text-gray-300">${domain}</span>
            <span class="${pct === null ? 'text-gray-600' : pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400'} font-mono">${pct === null ? 'No data' : pct + '%'}</span>
          </div>
          <div class="w-full bg-gray-800 rounded-full h-2">
            <div class="${barColor} h-2 rounded-full transition-all" style="width:${pct ?? 0}%"></div>
          </div>
        </div>`;
    }).join('');

    const recentRows = recentSessions.length
      ? recentSessions.map(s => {
          const date = new Date(s.date).toLocaleDateString();
          return `<div class="flex justify-between text-xs py-1 border-b border-gray-800">
            <span class="text-gray-500">${date} <span class="text-gray-700">${s.mode === 'exam' ? '[EXAM]' : '[GRIND]'}</span></span>
            <span class="${s.score >= 80 ? 'text-green-400' : s.score >= 60 ? 'text-yellow-400' : 'text-red-400'}">${s.score}%</span>
          </div>`;
        }).join('')
      : '<p class="text-gray-600 text-xs text-center py-4">No sessions yet.</p>';

    const studyHrs = this.store.studyHours;
    const daysLeft = this.store.daysUntilExam;
    const examDateVal = this.store.state.examDate || '';

    this.containerEl.innerHTML = `
      <div class="max-w-2xl mx-auto p-6 space-y-6">
        <h2 class="text-cyan-400 font-bold text-xl">Stats Dashboard</h2>

        <div class="bg-gray-900 border ${readinessBorder} rounded p-5">
          <h3 class="text-sm text-gray-400 uppercase tracking-widest mb-4">Exam Readiness Score</h3>
          <div class="flex items-center gap-6">
            <span class="text-5xl font-bold font-mono ${readinessColor}">${readiness}%</span>
            <div class="flex-1">
              <div class="text-sm ${readinessColor} font-semibold">${readinessLabel}</div>
              <p class="text-xs text-gray-600 mt-1">Based on accuracy, SRS progress, study time, and labs.</p>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-gray-900 border border-gray-700 rounded p-4">
            <h3 class="text-sm text-gray-400 uppercase tracking-widest mb-3">Domain Radar</h3>
            <canvas id="radar-canvas" width="260" height="260" class="mx-auto"></canvas>
          </div>
          <div class="bg-gray-900 border border-gray-700 rounded p-4">
            <h3 class="text-sm text-gray-400 uppercase tracking-widest mb-3">Weak Areas</h3>
            <div id="weak-area-list" class="space-y-2">${weakAreaCards}</div>
          </div>
        </div>

        <div class="bg-gray-900 border border-cyan-900 rounded p-5 space-y-3">
          <h3 class="text-sm text-gray-400 uppercase tracking-widest">Study Planner</h3>
          <div class="flex gap-3">
            <input id="exam-date-input" type="date" value="${examDateVal}" class="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-white text-sm outline-none">
            <button id="save-exam-date" class="px-4 py-1.5 bg-cyan-800 text-cyan-200 rounded text-sm font-semibold">Save</button>
          </div>
          ${daysLeft !== null ? `<div class="text-xs text-cyan-400 font-mono text-center">${daysLeft} days remaining until exam.</div>` : ''}
        </div>

        <div class="bg-gray-900 border border-gray-700 rounded p-5 space-y-4">
          <h3 class="text-sm text-gray-400 uppercase tracking-widest">Accuracy by Domain</h3>
          ${domainRows}
        </div>

        <div class="bg-gray-900 border border-gray-700 rounded p-5">
          <h3 class="text-sm text-gray-400 uppercase tracking-widest mb-3">Recent Sessions</h3>
          ${recentRows}
        </div>

        <div class="bg-gray-900 border border-gray-700 rounded p-5">
          <h3 class="text-sm text-gray-400 uppercase tracking-widest mb-3">Study Activity</h3>
          <div id="heatmap-container" class="overflow-x-auto"></div>
        </div>

        <div class="flex flex-wrap gap-3 justify-center">
          <button id="export-save" class="px-4 py-2 bg-green-900/30 border border-green-700 text-green-400 text-xs rounded">Export Save</button>
          <label class="px-4 py-2 bg-blue-900/30 border border-blue-700 text-blue-400 text-xs rounded cursor-pointer">
            Import Save <input id="import-save-input" type="file" class="hidden">
          </label>
        </div>
      </div>`;

    this._bindEvents();
    
    // Draw charts
    setTimeout(() => {
      this._drawRadar('radar-canvas', domains, radarValues);
      this._renderHeatmap('heatmap-container');
    }, 0);
  }

  _bindEvents() {
    this.containerEl.querySelector('#save-exam-date')?.addEventListener('click', () => {
      const val = document.getElementById('exam-date-input')?.value;
      if (val) { this.store.setExamDate(val); this.render(); }
    });

    this.containerEl.querySelector('#weak-area-list')?.addEventListener('click', e => {
      const btn = e.target.closest('.drill-btn');
      if (btn) bus.emit('nav:switch', { view: 'grind', domain: btn.dataset.domain });
    });

    this.containerEl.querySelector('#export-save')?.addEventListener('click', () => {
      const json = this.store.exportSave();
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'ccna-mastery-save.json';
      a.click();
    });

    this.containerEl.querySelector('#import-save-input')?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        e.target.value = ''; // reset so same file can be re-imported
        let parsed;
        try { parsed = JSON.parse(ev.target.result); }
        catch { showToast('Import failed — not valid JSON.'); return; }

        const REQUIRED = ['playerName', 'level', 'xp', 'quizHistory', 'completedLabs'];
        const missing = REQUIRED.filter(k => !(k in parsed));
        if (missing.length) { showToast(`Invalid save — missing: ${missing.join(', ')}.`); return; }

        const cur = this.store.state;
        const pct = n => `${Math.round(n)}%`;
        const curAcc = cur.quizHistory?.length
          ? pct(cur.quizHistory.reduce((s, r) => s + (r.score || 0), 0) / cur.quizHistory.length)
          : 'N/A';
        const impAcc = parsed.quizHistory?.length
          ? pct(parsed.quizHistory.reduce((s, r) => s + (r.score || 0), 0) / parsed.quizHistory.length)
          : 'N/A';
        const msg = [
          `Import "${parsed.playerName}" — Lv ${parsed.level} · ${parsed.xp} XP`,
          `Current: ${cur.playerName} — Lv ${cur.level} · ${cur.xp} XP · ${curAcc} avg`,
          `Imported: ${parsed.playerName} — Lv ${parsed.level} · ${parsed.xp} XP · ${impAcc} avg`,
          `\nThis will REPLACE your current save. Continue?`,
        ].join('\n');
        if (!confirm(msg)) return;

        try {
          this.store.importSave(ev.target.result);
          this.render();
          showToast('Save imported successfully!');
        } catch {
          showToast('Import failed — could not restore state.');
        }
      };
      reader.readAsText(file);
    });
  }

  // ─── Chart Helpers ─────────────────────────────────────────────────────────

  _drawRadar(canvasId, labels, values) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const r  = Math.min(cx, cy) - 40;
    const n  = labels.length;
    const step = (Math.PI * 2) / n;
    const start = -Math.PI / 2;

    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;

    // Grid
    [0.5, 1.0].forEach(frac => {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = start + i * step;
        const x = cx + Math.cos(a) * r * frac;
        const y = cy + Math.sin(a) * r * frac;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.stroke();
    });

    // Data
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = start + i * step;
      const val = (values[i] || 0) / 100;
      const x = cx + Math.cos(a) * r * val;
      const y = cy + Math.sin(a) * r * val;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(6,182,212,0.2)'; ctx.fill();
    ctx.strokeStyle = '#06b6d4'; ctx.stroke();
  }

  _renderHeatmap(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const studyLog = this.store.state.studyLog || {};
    const today = new Date(); today.setHours(0,0,0,0);
    
    // Simple 12-week block
    let html = '<div class="flex gap-1">';
    for (let i = 83; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0,10);
      const mins = studyLog[key] || 0;
      const color = mins === 0 ? '#111827' : mins < 20 ? '#14532d' : mins < 60 ? '#166534' : '#22c55e';
      html += `<div style="width:10px; height:10px; background:${color}; border-radius:1px;" title="${key}: ${Math.round(mins)} min"></div>`;
    }
    html += '</div>';
    container.innerHTML = html;
  }
}
