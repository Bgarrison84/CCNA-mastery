System Role: You are a Staff Full-Stack Developer and EdTech Instructional Designer. Your goal is to architect a high-fidelity, offline-first CCNA gamified learning app.
Technical Stack: HTML5, Tailwind CSS, Vanilla JS (ES6+ Modules). Persistence: localStorage + IndexedDB. Architecture: State Pattern for CLI, Pub/Sub for Game Loop.

> Completed phases (1–10 + Phase 13 items 1–3) archived in [completed_phases.md](./completed_phases.md).

---

## Phase 13 — Advanced Interactivity (2026-04-07)
Source: GEMINI.md backlog. Work through in order, one per session.

### High-Fidelity Simulations
4. [x] **Multi-Device CLI Connectivity** *(done 2026-04-08)* — Support `ping`, `telnet`, and `ssh` between simulated lab devices in `Terminal.js`. Requires device-awareness and cross-device reachability checks.

### UX & Immersion
5. [ ] **Retro Soundscape** — Add 8-bit blips for correct answers and Level-Up fanfares (Web Audio API) with mute toggle.
6. [ ] **PWA "Install" Prompt** — Improved custom UI to encourage home-screen installation.

### Infrastructure
7. [ ] **Tailwind Post-Compilation** — Move from runtime `tailwind.js` to a compiled CSS build to reduce initial payload by 1MB+.
8. [ ] **Vitest Unit Testing** — Implement automated tests for `Subnetting.js` and `Store.js` logic.

---

## Phase 11 — Polish & Accessibility
Source: Gemini suggestions review (feasible subset). Work through in order, one per session.

### Engagement / UX
1. [ ] **Save Game Export / Import** — "Export Save" button on Stats screen downloads `ccna-save-YYYY-MM-DD.json` (full `store.state` serialized). "Import Save" file picker re-hydrates state via `store.importSave()`. Guard: validate required top-level keys before importing; show diff summary before confirm.
2. [ ] **Haptic Feedback** — `navigator.vibrate()` calls: 50ms correct, [100,50,100]ms wrong, 300ms level-up/boss win. Check `'vibrate' in navigator`. `settings.haptic` toggle (on by default).
3. [ ] **Service Worker Update Notification** — On new SW waiting, show toast: "Update available — tap to reload". Fires in `main.js` after SW registration.
4. [ ] **Mid-Boss-Battle Taunts** — `BOSS_TAUNTS` constant per boss. Wrong answer shows taunt; 3+ correct streak shows "frustrated boss" line. UI-only.
5. [ ] **Dyslexia-Friendly Font Option** — Settings toggle swaps to OpenDyslexic (self-hosted WOFF2, ~100KB, precached). `settings.dyslexiaFont`. CSS class on `<body>`.

### Content / Discovery
6. [ ] **Jeremy's IT Lab Video Links** — `source_ref` supports `{ text, url, type: 'video' }`. Citation panel shows "▶ Watch on YouTube". Add 10–20 questions with Jeremy IT Lab URLs. Notes "(requires internet)".
7. [ ] **Beginner CLI Ghost-Text Labs** — `js/engine/practice_terminal.js` (standalone). Ghost text shows expected command; correct keystrokes advance pointer; wrong keystrokes flash red. 2 intro labs flagged `beginner_ghost: true`.

### Technical / Infrastructure
8. [ ] **Mistake Notebook UX Rebrand** — Add "streak of correct" counter per question. Auto-remove after 3 correct-in-a-row. `mistakeStreaks: {}` in DEFAULT_STATE; `recordMistakeCorrect(id)` increments; `getMistakeIds()` filters graduated questions.
9. [ ] **Landing Page Social Proof Panel** — Animated count-up of "4,296 questions · 36 labs · 8 boss battles · 5 mega labs · 100% offline" in `index.html`. IntersectionObserver scroll-trigger, no external lib.
10. [ ] **Bug Fix — IDB Timeout & SW Missing Files** — `_openIDB()` 3s timeout + `onblocked` handler; SW precache includes all view files; bash template literals escaped in Scripting Quick Ref; `init()` has `.catch()` error boundary with retry button.
