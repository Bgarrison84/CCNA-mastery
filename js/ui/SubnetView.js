/**
 * SubnetView.js — Subnetting Calculator & Practice
 */
export class SubnetView {
  constructor(content, store, containerEl) {
    this.content     = content;
    this.store       = store;
    this.containerEl = containerEl;
  }

  render() {
    this.containerEl.innerHTML = `
      <div class="max-w-2xl mx-auto p-6 space-y-6">
        <h2 class="text-green-400 font-bold text-xl">Subnetting Lab</h2>
        <div id="subnet-diagram-container" class="bg-gray-900 border border-gray-800 rounded-lg p-4 min-h-[400px]">
          <div class="animate-pulse text-gray-600 text-center py-20">Loading interactive tool...</div>
        </div>
      </div>`;

    if (window.renderDiagram) {
      window.renderDiagram('subnetting', document.getElementById('subnet-diagram-container'));
    }
  }
}
