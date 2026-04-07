​System Role: You are a Staff Full-Stack Developer and EdTech Instructional Designer. Your goal is to architect a high-fidelity, offline-first CCNA gamified learning app.
​Task: Provide a technical architecture, JSON schema, and a functional "Core Engine" prototype.
​Technical Stack & Constraints:
​Frontend: HTML5, Tailwind CSS, Vanilla JS (ES6+ Modules).
​Persistence: A unified GameState object synced to localStorage.
​Architecture: Use a State Pattern for the CLI and a Pub/Sub or Observer pattern for the Game Loop (to trigger XP/Level updates across UI components).
​Core Module Requirements:
​State Management: Create a robust Store class that handles XP, Level, Inventory (e.g., "Console Cable", "Packet Sniffer"), and CompletedLabs.
​The CLI Engine: Implement a class-based terminal simulation. It must support:
​Context-aware prompts: Router>, Router#, Router(config)#.
​A validate() method to compare the current running-config against a targetConfig JSON object.
​JSON Content Schema: Provide a schema that supports multiple-choice, drag-and-drop, and CLI-based "Boss Battles," including a source_ref field for Jeremy’s IT Lab or Official Cert Guide (OCG) citations.
​The Subnetting Logic: A JS utility function that generates a random IP/CIDR and returns an object containing the valid Network ID, Broadcast, and First/Last Usable for validation.
​Output Deliverables:
​File Structure: A clean, modular directory layout.
​The JSON Schema: A sample entry for a CLI Lab and a Quiz Question.
​The Boilerplate: Provide the core Terminal class and the GameState controller.
​Implementation Guide: A brief explanation of how to scale the "6-week narrative" without bloating the index.html.

---

> Completed phases (1–10) have been moved to [completed_phases.md](./completed_phases.md).

---

## Phase 13 — Advanced Interactivity (2026-04-07)
Source: GEMINI.md backlog. Work through in order, one per session.

### High-Fidelity Simulations
1. [x] **Animated Encapsulation Visualizer** — `js/diagrams/encapsulation.js`; 7-step OSI Layer 7→1 PDU build-up with color-coded header blocks; layer selector strip; keyboard nav; wired into `DIAGRAM_MODULES` + `ReferenceView.js` + `sw.js` (ccna-v8). (done 2026-04-07)
2. [x] **Interactive ACL Simulator** — `js/diagrams/acl.js` rebuilt with two tabs: **Trace** (animated top-down match with IP input) + **Build** (drag-and-drop rule reorder; real-time traffic-flow matrix for 4 test IPs; add/delete/reset rules). (done 2026-04-07)
3. [x] **Infinite Subnetting Drill / Speed Run** — `js/diagrams/subnetting.js` extended with third tab **⚡ Speed Drill**: 90-second countdown timer, procedural question generation (/8–/30, 6 question types: net/bcast/first/last/hosts/mask), streak counter, personal best in localStorage, XP award (8 XP/correct), hint + skip buttons, free-text input for speed. (done 2026-04-07)
4. [ ] **Multi-Device CLI Connectivity** — Support `ping`, `telnet`, and `ssh` between simulated lab devices in `Terminal.js`. Requires device-awareness and cross-device reachability checks.

### UX & Immersion
5. [ ] **Retro Soundscape** — Add 8-bit blips for correct answers and Level-Up fanfares (Web Audio API) with mute toggle.
6. [ ] **PWA "Install" Prompt** — Improved custom UI to encourage home-screen installation.

### Infrastructure
7. [ ] **Tailwind Post-Compilation** — Move from runtime `tailwind.js` to a compiled CSS build to reduce initial payload by 1MB+.
8. [ ] **Vitest Unit Testing** — Implement automated tests for `Subnetting.js` and `Store.js` logic.

---

## Phase 11 — Polish & Accessibility (planned 2026-04-04)
Source: Gemini suggestions review (feasible subset). Work through in order, one per session.

### Engagement / UX
1. [ ] **Save Game Export / Import** — "Export Save" button on Stats screen downloads `ccna-save-YYYY-MM-DD.json` (full `store.state` serialized). "Import Save" file picker re-hydrates state via `store.importSave()`. Useful for device transfers and backups. Already have `importSave()` in Store — just needs UI wiring. Guard: validate required top-level keys before importing; show diff summary before confirm.
2. [ ] **Haptic Feedback** — `navigator.vibrate()` calls on key events: short pulse (50ms) on correct answer, double-pulse (100,50,100ms) on wrong answer, long pulse (300ms) on level-up or boss battle win. Check `'vibrate' in navigator` before calling. Add `settings.haptic` toggle in settings panel (on by default). Mobile-only API — silently no-ops on desktop.
3. [ ] **Service Worker Update Notification** — When a new SW version is waiting (`navigator.serviceWorker.addEventListener('controllerchange', ...)`), show a non-blocking toast: "Update available — tap to reload". Tap reloads the page so the new SW activates. Prevents stale-cache confusion without forcing hard refreshes. Fires in `main.js` after SW registration.
4. [ ] **Mid-Boss-Battle Taunts** — Boss battle phases trigger dynamic flavor text. `BOSS_TAUNTS` constant per boss (array of strings per phase). After submitting a wrong answer during a boss fight, display a taunting line from the boss in the feedback panel. After a correct answer streak (3+), display a "frustrated boss" reaction line. Adds narrative tension; implementation is UI-only (no engine changes needed).
5. [ ] **Dyslexia-Friendly Font Option** — Settings panel toggle: "Dyslexia font". Swaps body font-family to `OpenDyslexic` (self-hosted WOFF2, ~100KB, precached in SW). Store in `settings.dyslexiaFont`. Apply via CSS class on `<body>`. Font files live in `fonts/` directory. Accessibility win with minimal complexity.

### Content / Discovery
6. [ ] **Jeremy's IT Lab Video Links** — Extend `source_ref` field (already in schema and rendered by Citation Panel) to support a `video_url` shape: `{ text, url, type: 'video' }`. Citation panel shows a "▶ Watch on YouTube" link when type is 'video'. Add 10–20 high-value questions with Jeremy's IT Lab YouTube URLs on the most-missed CCNA topics. Requires internet for the links to work; Citation panel notes "(requires internet)" inline.
7. [ ] **Beginner CLI Ghost-Text Labs** — New `js/engine/practice_terminal.js` module (standalone, does NOT replace Terminal.js). Renders a simplified terminal where the expected command appears as gray ghost text in the input; user types over it letter-by-letter. Correct keystrokes advance a pointer; wrong keystrokes flash the input red without advancing. 2 intro labs: "Your First Command" (navigating modes: `enable` → `show version`) and "Basic Interface Config" (entering config mode and setting an IP). Displayed only for the first 1–2 labs in the Labs view (flagged `beginner_ghost: true` in lab data).

### Technical / Infrastructure
8. [ ] **Mistake Notebook UX Rebrand** — Rename UI label from "Mistake Notebook" to "Error Log" (or keep name, update the copy). Add a "Streak of correct" counter per question in the notebook view — shows how many times in a row the user has answered a mistake-tracked question correctly. Auto-removes from notebook after 3 correct-in-a-row (configurable). Store: add `mistakeStreaks: {}` to DEFAULT_STATE; `recordMistakeCorrect(id)` increments streak and clears on wrong; `getMistakeIds()` filters out graduated questions.
9. [ ] **Landing Page Social Proof Panel** — Add a "Study Stats" counter panel to `index.html` (the landing page): animated count-up of "4,296 questions · 36 labs · 8 boss battles · 5 mega labs · 100% offline". Update these numbers whenever content grows. Static HTML with a small JS count-up animation on scroll-into-view (IntersectionObserver, no external lib).
10. [ ] **Bug Fix — IDB Timeout & SW Missing Files** — Already applied in the 2026-04-04 session: (a) `_openIDB()` now has 3-second timeout + `req.onblocked` handler so init never hangs; (b) `sw.js` bumped to `ccna-v5`, added `ScriptingEngine.js` + 6 diagram modules to PRECACHE_URLS; (c) `main.js` bash template literals in Scripting Quick Ref escaped (`\${HOSTS[@]}`, `\${HOST}`); (d) `init()` wrapped in `.catch()` error boundary with visible UI + retry button.
