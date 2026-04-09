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
11. [x] **Practice Terminal as Diagram Module** *(done 2026-04-09)* — Added `render()` export to `practice_terminal.js`; registered as `practice_terminal` in `DIAGRAM_MODULES` (main.js) and Reference view SECTIONS. Lab-picker shows `intro_modes` + `intro_interface` with "Try another" flow and `ccna-xp` CustomEvent on completion.

## Long-Term Goals (from long_term_goals.md)

### LTG-1: Visual Traceroute Animation
- [x] **Done 2026-04-09** — `js/diagrams/traceroute.js`: SVG topology (PC1→R1→R2→R3→Server), animated glowing packet with CSS transitions, hop-by-hop routing decision panel, click-router routing-table inspector, Sabotage R2 mode (removes 172.16.4.0/24 route → ICMP unreachable + explosion animation), success flash. SW ccna-v17.

### LTG-2: Glossary Hover-Over
- [x] **Done 2026-04-09** — `js/utils/glossary.js`: 100+ CCNA terms; `glossarize(text)` converts plain text → HTML with `<abbr class="g-term" data-def="...">` tags. `initGlossary()` injects CSS + singleton tooltip div + event delegation (hover + tap). Applied to: quiz explanations (GrindView), story dialogue (StoryMode `_typeText`), story concept explanations, practice terminal step explanations. SW bumped to ccna-v16.

### LTG-3: Moving Character Animation
- [x] **Done 2026-04-09** — `js/ui/CharacterWidget.js`: SVG network-engineer character (glasses, jacket, tie) walking across a 6-zone road (Office→NOC→Server Room→Data Centre→Security HQ→Cloud). Position = seenBeats/totalBeats. CSS keyframe states: walk (leg/arm alternation + bob), jump (beat complete), celebrate (week advance + boss victory, star burst), stumble (boss wrong answer), idle (30s inactivity), idle-type (60s). EventBus: `story:beat_complete` → jump, `story:week_advance` → celebrate, `boss:wrong` → stumble, `boss:victory` → celebrate. Toggle in accessibility sidebar. `boss:wrong` + `boss:victory` events added to BossView. SW ccna-v18.
