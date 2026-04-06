/**
 * ReferenceView.js — Quick Reference & Concept Diagrams
 */
export class ReferenceView {
  constructor(content, store, containerEl) {
    this.content     = content;
    this.store       = store;
    this.containerEl = containerEl;
  }

  render() {
    this.containerEl.innerHTML = `
      <div class="max-w-3xl mx-auto p-6 space-y-6">
        <h2 class="text-cyan-400 font-bold text-xl mb-4">CCNA Reference Library</h2>
        <div id="reference-list" class="space-y-4">
           <!-- Sections will be rendered here -->
           <p class="text-gray-500">Loading reference material...</p>
        </div>
      </div>`;
    
    this._renderContent();
  }

  _renderContent() {
    const list = this.containerEl.querySelector('#reference-list');
    if (!list) return;

    // This is a simplified version of the huge list in main.js
    // In a real refactor, we'd move the data to a JSON or constant file
    list.innerHTML = `
      <div class="bg-gray-900 border border-gray-800 rounded p-4">
        <h3 class="font-bold text-gray-200 mb-2">OSI Model</h3>
        <div id="diag-osi" class="min-h-[200px]"></div>
      </div>
      <div class="bg-gray-900 border border-gray-800 rounded p-4">
        <h3 class="font-bold text-gray-200 mb-2">Well-Known Ports</h3>
        <div id="diag-ports" class="min-h-[200px]"></div>
      </div>
      <div class="bg-gray-900 border border-gray-800 rounded p-4">
        <h3 class="font-bold text-gray-200 mb-2">Subnetting Cheat Sheet</h3>
        <div id="diag-subnetting" class="min-h-[200px]"></div>
      </div>
    `;

    if (window.renderDiagram) {
      window.renderDiagram('osi', document.getElementById('diag-osi'));
      window.renderDiagram('ports', document.getElementById('diag-ports'));
      window.renderDiagram('subnetting', document.getElementById('diag-subnetting'));
    }
  }
}
