/**
 * ui.js — UI Utilities
 */

/** Spawn a floating "+N XP" label near an anchor element (or viewport centre). */
export function spawnFloatingXP(amount, anchorEl) {
  if (!amount || amount <= 0) return;
  const el = document.createElement('div');
  el.className = 'float-xp';
  el.textContent = `+${amount} XP`;

  // Position near anchor or fallback to bottom-centre of viewport
  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    el.style.left = `${rect.left + rect.width / 2 - 28}px`;
    el.style.top  = `${rect.top - 8}px`;
  } else {
    el.style.left = '50%';
    el.style.top  = '60%';
    el.style.transform = 'translateX(-50%)';
  }

  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

/** Render a simple toast notification. */
export function showToast(msg, duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'bg-gray-800 border border-gray-600 text-gray-200 rounded px-3 py-2 text-xs max-w-xs shadow-lg transition-opacity duration-300';
  div.textContent = msg;
  container.appendChild(div);
  
  // Fade out before removal
  setTimeout(() => {
    div.style.opacity = '0';
    setTimeout(() => div.remove(), 300);
  }, duration - 300);
}
