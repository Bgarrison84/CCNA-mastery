# CCNA Mastery - Gemini CLI Instructions

## System Role
You are a Staff Full-Stack Developer and EdTech Instructional Designer. Your goal is to architect and maintain a high-fidelity, offline-first CCNA gamified learning app.

## Technical Stack & Constraints
- **Frontend:** HTML5, Tailwind CSS, Vanilla JS (ES6+ Modules).
- **Persistence:** Unified `GameState` object synced to `localStorage` (and IndexedDB for larger assets/logs).
- **Architecture:** 
  - **State Management:** Robust `Store` class (in `js/store.js`) handling XP, Level, Inventory, and CompletedLabs.
  - **CLI Engine:** Class-based terminal simulation (`js/engine/Terminal.js`) with context-aware prompts and `validate()` method.
  - **Design Patterns:** State Pattern for the CLI, Pub/Sub or Observer pattern for the Game Loop.
- **Offline-First:** PWA with Service Worker (`sw.js`) and manifest.

## Project Structure
- `assets/`: Static assets (images, fonts).
- `css/`: Stylesheets (Tailwind and custom).
- `data/`: JSON content (Labs, Quizzes, Boss Battles).
- `js/`: Application logic.
  - `engine/`: Terminal and core game mechanics.
  - `ui/`: Component-specific rendering.
  - `utils/`: Helpers (Subnetting logic, etc.).
- `source material/`: Reference documents and citations.

## Development Workflows

### Testing & Validation
- Ensure all new logic is modular and tested.
- Validate JSON content against the schema (implied in `js/engine/`).
- Test offline capabilities by simulating network disconnection.

### Content Updates
- Add new labs or quiz questions to the appropriate JSON files in `data/`.
- Ensure `source_ref` fields are populated for citations.

## Phase 11 — Polish & Accessibility (Active)

### Engagement / UX
1. [ ] **Save Game Export / Import** — Wire UI to `store.importSave()` and `store.exportSave()`.
2. [ ] **Haptic Feedback** — Implement `navigator.vibrate()` for key events.
3. [ ] **Service Worker Update Notification** — Show toast when a new version is available.
4. [ ] **Mid-Boss-Battle Taunts** — Add dynamic flavor text during boss fights.
5. [ ] **Dyslexia-Friendly Font Option** — Add toggle to settings for `OpenDyslexic` font.

### Content / Discovery
6. [ ] **Jeremy's IT Lab Video Links** — Extend `source_ref` to support video URLs.
7. [ ] **Beginner CLI Ghost-Text Labs** — Implement `js/engine/practice_terminal.js` for guided typing.

### Technical / Infrastructure
8. [ ] **Mistake Notebook UX Rebrand** — Rename and add correct-streak tracking.
9. [ ] **Landing Page Social Proof Panel** — Add animated "Study Stats" to `index.html`.
10. [x] **Bug Fix — IDB Timeout & SW Missing Files** (Completed 2026-04-04).

## Phase 12 — Architectural Refactoring & Interactive Deep-Dives (Completed)

### Performance & Structure
1. [x] **Modularize `main.js`** — Successfully decomposed the 8k+ line monolith into domain-specific modules (Router, Views, Controllers).
2. [ ] **Compile Tailwind CSS** — (Pending) Move from the runtime `tailwind.js` to a build-step compiled CSS file.
3. [x] **Extract Inline Scripts** — Extracted core view rendering logic into external modules.

### Interactive Learning
4. [x] **Heavily Interactive Models** — Upgraded `js/diagrams/` modules with:
    - **Drag-and-Drop Challenges:** Match protocols/PDUs to OSI/TCP-IP layers (Completed).
    - **Header Builder:** Interactive UDP header construction (Completed).
    - **Flow Simulation:** Step-by-step FTP active flow challenge (Completed).
    - **Matching Games:** EtherType and Admin Distance matching (Completed).
5. [x] **Mobile-First UX Audit** — Increased hit targets and ensured touch-friendly interactions for all new models.

### Reliability
6. [ ] **Core Logic Unit Testing** — Add a testing framework and cover `Subnetting.js`, `Store.js`, and `Terminal.js` validation.

## Phase 13 — Advanced Interactivity & Performance (Backlog)

### High-Fidelity Simulations
1. [ ] **Animated Encapsulation Visualizer** — Step-by-step animation of Data → Segment → Packet → Frame traversal.
2. [ ] **Interactive ACL Simulator** — Drag-and-drop rule builder with real-time "Traffic Flow" permit/deny visualization.
3. [ ] **Infinite Subnetting Drill** — Dedicated mode for procedural subnetting problem sets with "Speed Run" timer.
4. [ ] **Multi-Device CLI Connectivity** — Support `ping`, `telnet`, and `ssh` between simulated lab devices.

### UX & Immersion
5. [ ] **Retro Soundscape** — Add 8-bit blips for correct answers and Level-Up fanfares (with mute toggle).
6. [ ] **Haptic Feedback Engine** — Vibration patterns for mobile users on success/fail events.
7. [ ] **PWA "Install" Prompt** — Improved custom UI to encourage home-screen installation.

### Infrastructure
8. [ ] **Tailwind Post-Compilation** — Move from runtime `tailwind.js` to a compiled CSS build to reduce initial payload by 1MB+.
9. [ ] **Vitest Unit Testing** — Implement automated tests for `Subnetting.js` and `Store.js` logic.
10. [ ] **Cloud-Sync (Optional)** — Explore standard Web-native ways to sync GameState across devices.

---
*Refer to `completed_phases.md` for historical context.*
