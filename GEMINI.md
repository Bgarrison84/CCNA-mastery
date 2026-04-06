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

## Phase 12 — Architectural Refactoring & Interactive Deep-Dives (Planned)

### Performance & Structure
1. [ ] **Modularize `main.js`** — Break down the 8k+ line monolithic entry point into domain-specific modules (Router, Views, Controllers).
2. [ ] **Compile Tailwind CSS** — Move from the runtime `tailwind.js` to a build-step compiled CSS file for better PWA performance.
3. [ ] **Extract Inline Scripts** — Move inline JavaScript from `app.html` and `index.html` into external modules.

### Interactive Learning
4. [x] **Heavily Interactive Models** — Upgrade `js/diagrams/` modules with:
    - **Drag-and-Drop Challenges:** Match protocols/PDUs to OSI/TCP-IP layers (Completed).
    - **Header Builder:** Interactive UDP header construction (Completed).
    - **Flow Simulation:** Step-by-step FTP active flow challenge (Completed).
    - **Matching Games:** EtherType and Admin Distance matching (Completed).
5. [x] **Mobile-First UX Audit** — Ensure all interactive elements have 44px+ hit targets and respond well to touch gestures (Implemented for OSI/Diagrams).

### Reliability
6. [ ] **Core Logic Unit Testing** — Add a testing framework and cover `Subnetting.js`, `Store.js`, and `Terminal.js` validation.

---
*Refer to `completed_phases.md` for historical context.*
