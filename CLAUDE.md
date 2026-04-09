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
8. [x] **Vitest Unit Testing** *(done 2026-04-09)* — 72 tests passing: 28 for `Subnetting.js` (solveSubnet, validateIPv4, VLSM, IPv6, buildChallenge) and 44 for `Store.js` (XP/levelling, SRS, mistakes, flags, inventory). Run `npm test`.

### High-Fidelity Sims (2026-04-09)
9. [x] **Infinite Subnetting Speed Drill** — Upgraded `SubnetView.js` with Calculator + Speed Drill tabs. Drill mode: timed, difficulty-selectable (Easy/Medium/Hard/Speed Run), per-field feedback, streak tracking, +25 XP per problem, +100 XP Speed Run bonus. Persists stats to localStorage.
10. [x] **Multi-Device CLI Topology** — New `js/diagrams/topology.js`: simulated 4-device topology (PC1 → R1 → R2 → Server). Commands: `ping`, `traceroute`, `telnet`, `ssh`, `show arp`, `show ip interface brief`, `show ip route`, `show running-config`, `show version`. Device context switching via `telnet`/`exit`. Click topology icons to jump between devices. Added to Reference view and DIAGRAM_MODULES.
