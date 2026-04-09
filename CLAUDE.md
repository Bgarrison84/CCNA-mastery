System Role: You are a Staff Full-Stack Developer and EdTech Instructional Designer. Your goal is to architect a high-fidelity, offline-first CCNA gamified learning app.
Technical Stack: HTML5, Tailwind CSS, Vanilla JS (ES6+ Modules). Persistence: localStorage + IndexedDB. Architecture: State Pattern for CLI, Pub/Sub for Game Loop.

> Completed phases (1–11 + Phase 13 items 1–4) archived in [completed_phases.md](./completed_phases.md).

---

## Phase 13 — Advanced Interactivity (2026-04-07)
Source: GEMINI.md backlog. Work through in order, one per session.

### UX & Immersion
5. [x] **Retro Soundscape** *(done 2026-04-08)* — Add 8-bit blips for correct answers and Level-Up fanfares (Web Audio API) with mute toggle.
6. [x] **PWA "Install" Prompt** *(done 2026-04-08)* — Improved custom UI to encourage home-screen installation.

### Infrastructure
7. [x] **Tailwind Post-Compilation** *(done 2026-04-09)* — Deleted 398K runtime `tailwind.js`; `app.css` (37K compiled) already linked. Run `npm run build:css` after class changes.
8. [ ] **Vitest Unit Testing** — Implement automated tests for `Subnetting.js` and `Store.js` logic.
