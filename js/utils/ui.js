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

/**
 * Short vibration helper. Respects the user's haptic setting and silently
 * no-ops on desktop (navigator.vibrate is undefined there).
 * @param {Store} store
 * @param {number|number[]} pattern  e.g. 50 or [100, 50, 100]
 */
export function vibrate(store, pattern) {
  if (!store?.state?.settings?.haptic) return;
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

/**
 * Returns a collapsible 📖 Source badge for a question's source_ref, or '' if absent.
 * source_ref can be a plain string OR: { text, url, type: 'video' }
 */
export function citationHtml(sourceRef, extraClass = '') {
  if (!sourceRef) return '';
  let body;
  if (typeof sourceRef === 'object' && sourceRef.type === 'video') {
    const safeText = (sourceRef.text || "Jeremy's IT Lab").replace(/</g, '&lt;');
    body = `<span class="text-[11px] text-gray-500">${safeText}</span>
      <a href="${sourceRef.url}" target="_blank" rel="noopener noreferrer"
         class="ml-2 text-[11px] text-red-400 hover:text-red-300 underline font-mono">
        &#9654; Watch on YouTube
      </a>
      <span class="text-[10px] text-gray-700 ml-1">(requires internet)</span>`;
  } else {
    const safeRef = String(sourceRef).replace(/</g, '&lt;');
    body = `<p class="mt-1 text-[11px] text-gray-500 leading-relaxed pl-1">${safeRef}</p>`;
  }
  return `<details class="mt-1.5 ${extraClass}">
    <summary class="text-[10px] text-gray-500 font-mono cursor-pointer hover:text-gray-300 select-none inline-flex items-center gap-1">&#128218; Source &#9658;</summary>
    <div class="mt-1 pl-1">${body}</div>
  </details>`;
}
