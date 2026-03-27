# Gamified Certification Study App — Reusable Blueprint

A domain-agnostic architecture guide for building offline-first, gamified exam-prep apps.
Based on the CCNA Mastery app (ccna-mastery). Adapt the content; reuse the engine.

---

## 1. Core Concept

Every certification study app built from this template shares one architecture but different content layers.

```
┌─────────────────────────────────────────────────────┐
│  Content Layer  (JSON: questions, labs, story beats) │
│  ─────────────────────────────────────────────────── │
│  App Engine     (Store, QuizEngine, Terminal, EventBus) │
│  ─────────────────────────────────────────────────── │
│  UI Shell       (app.html, main.js, diagrams/)       │
│  ─────────────────────────────────────────────────── │
│  PWA / SW       (sw.js, manifest.json, offline CSS)  │
└─────────────────────────────────────────────────────┘
```

To build a new app (e.g., Security+, Python for Beginners):
1. Fork the repo
2. Replace `data/content.json` with domain-specific content
3. Replace/extend `js/diagrams/` modules with domain visuals
4. Update story beats in `data/content.json → story[]`
5. Adjust branding, colour palette, and domain labels
6. Keep engine files (Store, QuizEngine, Terminal, EventBus) unchanged unless the domain needs new mechanics

---

## 2. Tech Stack & Constraints

| Constraint | Reason |
|---|---|
| HTML5 + Vanilla JS (ES6 modules) | Zero build step; works offline; no framework lock-in |
| Tailwind CSS (local copy, no CDN) | Offline-safe; utilities only; dark theme via CSS vars |
| localStorage persistence | No server; works everywhere; export/import for backup |
| ES module `import`/`export` | Clean separation; browser-native; no bundler needed |
| No external images | All diagrams: HTML/CSS/SVG inline; truly offline |
| Single `content.json` data file | Easy to version-control and replace per domain |

---

## 3. File Structure

```
project-root/
├── index.html              ← landing page (GitHub Pages default)
├── app.html                ← main app shell (nav, HUD, view container)
├── manifest.json           ← PWA manifest
├── sw.js                   ← Service Worker (cache-first offline)
├── data/
│   └── content.json        ← ALL domain content (see §4 for schema)
├── css/
│   └── tailwind.js         ← local Tailwind CSS (398KB, no CDN needed)
├── js/
│   ├── core/
│   │   ├── Store.js        ← GameState (XP, level, SRS, history)
│   │   ├── EventBus.js     ← Pub/Sub bus (bus.emit / bus.on)
│   │   └── QuizEngine.js   ← Question pool, SRS sort, answer checking
│   ├── engine/
│   │   ├── Terminal.js     ← CLI simulator (for hands-on labs)
│   │   ├── BossBattle.js   ← HP system, phase scaling, scoring
│   │   └── Subnetting.js   ← Domain-specific drill engine (adapt/replace)
│   ├── diagrams/           ← One file per interactive concept diagram
│   │   ├── osi.js          ← render(container) → injects HTML/SVG + events
│   │   └── [topic].js      ← Add one per major concept visual
│   ├── ui/
│   │   ├── HUD.js          ← XP bar, level, streak badge
│   │   └── StoryMode.js    ← Story beat renderer + Today's Mission card
│   └── main.js             ← View router, all renderX() functions, event wiring
└── APP_TEMPLATE.md         ← This file
```

---

## 4. Content JSON Schema

`data/content.json` is the entire domain. Here is the full schema with all supported fields:

### 4.1 Top-Level Structure

```json
{
  "story": [ /* StoryBeat[] */ ],
  "questions": [ /* Question[] */ ],
  "labs": [ /* Lab[] */ ],
  "bosses": [ /* Boss[] */ ]
}
```

### 4.2 Question Schema

```json
{
  "id": "unique_snake_case_id",
  "domain": "Domain Name",
  "week": 1,
  "difficulty": "easy | medium | hard",
  "type": "multiple_choice | true_false | drag_drop | multi_select | scenario",
  "question": "Question text here",

  /* multiple_choice / multi_select */
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correct_answer": 1,           /* 0-indexed for MC; array of indices for multi_select */

  /* true_false */
  "correct_answer": "true | false",

  /* drag_drop */
  "items": ["Item 1", "Item 2", "Item 3"],
  "correct_order": [2, 0, 1],    /* indices of items[] in correct order */

  /* scenario — parent container, flattened at load time */
  "scenario_text": "Context paragraph...",
  "scenario_ref": "OCG Ch.12 §3",
  "sub_questions": [ /* Question[] without scenario_text */ ],

  /* shared optional fields */
  "explanation": "Why the correct answer is correct.",
  "hints": ["Hint 1 text", "Hint 2 text"],
  "source_ref": "Jeremy's IT Lab — OSPFv2 playlist, video 3",
  "tags": ["ospf", "area", "lsa"]
}
```

### 4.3 CLI Lab Schema

```json
{
  "id": "lab_w2_vlan_trunking",
  "title": "VLAN & Trunking",
  "description": "Configure VLANs and trunk links on a 2-switch topology.",
  "week": 2,
  "difficulty": "medium",
  "xp": 110,
  "objectives": [
    "Create VLAN 10 named SALES and VLAN 20 named MGMT",
    "Configure Gi0/0 as a trunk port with 802.1Q encapsulation"
  ],
  "hints": ["Use `vlan 10` in global config mode", "Use `switchport mode trunk`"],
  "source_ref": "OCG Vol.2 Ch.8",

  /* Single-device lab */
  "targetConfig": {
    "hostname": "SW1",
    "vlans": { "10": "SALES", "20": "MGMT" },
    "interfaces": {
      "GigabitEthernet0/0": { "trunk": true, "encapsulation": "dot1q" }
    }
  },

  /* OR multi-device lab — wrap in devices{} */
  "devices": {
    "Router1": { "targetConfig": { /* ... */ } },
    "Switch1": { "targetConfig": { /* ... */ } }
  }
}
```

### 4.4 Boss Battle Schema

```json
{
  "id": "boss_w3_the_router",
  "name": "The Router",
  "week": 3,
  "description": "15-question gauntlet covering all of IP Connectivity.",
  "xpReward": 300,
  "perfectBonus": 150,
  "questions": [ /* Question[] — subset, all types supported */ ]
}
```

### 4.5 Story Beat Schema

```json
{
  "id": "beat_w1_osi",
  "week": 1,
  "title": "The OSI Model",
  "narrative": "Markdown or plain text narrative shown to the player...",
  "xpReward": 25,
  "concept_visual": {
    "title": "OSI Layer Stack",
    "diagramId": "osi",          /* maps to js/diagrams/osi.js */
    "explanation": "Each layer adds a header during encapsulation..."
  },
  "quiz": [ /* 3-5 inline Question[] shown after the beat */ ]
}
```

---

## 5. Engine Mechanics (Reuse As-Is)

| Module | What it does | When to change |
|---|---|---|
| `Store.js` | XP, level, SRS schedule, streaks, study log, history | Add domain-specific state (e.g., `completedCertPath[]`) |
| `QuizEngine.js` | Pool filtering, SRS sort, answer checking, re-queue | Add new question types or scoring variants |
| `Terminal.js` | Cisco IOS CLI simulator | Replace/extend for domain CLI (bash, Python REPL, AWS CLI, etc.) |
| `BossBattle.js` | HP system, phase damage scaling, timing | Reuse unchanged — works with any question set |
| `EventBus.js` | Pub/Sub `bus.emit()` / `bus.on()` | Reuse unchanged |
| `HUD.js` | XP bar, level, streak multiplier | Adjust display labels only |
| `StoryMode.js` | Beat renderer, mission card, week timeline | Update week labels and topic names |

---

## 6. Diagram Module Contract

Each `js/diagrams/topic.js` must export exactly one function:

```js
/**
 * render — inject interactive diagram into container.
 * Must be self-contained: no globals, no shared state.
 * @param {HTMLElement} container
 */
export function render(container) {
  container.innerHTML = `...`;
  // wire up all event listeners inside this function
}
```

Register in `main.js`:
```js
const DIAGRAM_MODULES = {
  osi:        () => import('./js/diagrams/osi.js'),
  stp:        () => import('./js/diagrams/stp.js'),
  /* add new diagramId: () => import('./js/diagrams/topic.js') */
};
```

---

## 7. Domain Adaptation Guide

### Replacing the CLI Engine

`Terminal.js` simulates Cisco IOS. For other domains:

| Target domain | Replace Terminal.js with |
|---|---|
| CompTIA Security+ | No CLI labs needed (Security+ is MCQ-only) — remove Lab nav button |
| Python for Beginners | Pyodide-based Python REPL (runs real Python in browser via WASM) |
| AWS Solutions Architect | AWS CLI simulator (limited command set; validate JSON policy docs) |
| Linux+ / LPIC | Bash shell simulator (filesystem state machine, file I/O commands) |
| Kubernetes / CKA | kubectl simulator (resource YAML validation against targetConfig) |

### Replacing the Drill Mechanic

The Subnetting drill in `js/engine/Subnetting.js` is domain-specific. Replace with:

| Target domain | Drill mechanic |
|---|---|
| Security+ | Port ↔ Protocol matching drill (rapid-fire flashcards) |
| Python | Code output prediction ("what does this print?") |
| AWS | Cost estimation drill (choose cheapest architecture option) |
| Linux+ | Regex builder drill (construct regex to match a given string) |

### Updating Domain Weeks

In `data/content.json`, `week` maps to a curriculum unit. Update the labels in `main.js`:

```js
// Replace with your domain's unit names
const WEEK_LABELS = {
  1: 'Unit 1 — Foundations',
  2: 'Unit 2 — Core Concepts',
  // ...
};
```

---

## 8. New App Checklist

Use this checklist when starting a new domain instance:

### Content
- [ ] Define 6–8 curriculum units (maps to `week` field)
- [ ] Define domain taxonomy (maps to `domain` field in questions)
- [ ] Write 500+ questions minimum (1000+ for production quality)
  - Target: ~65% medium, 25% hard, 10% easy
  - Target: ~70% MC, 10% drag_drop, 10% multi_select, 5% T/F, 5% scenario
- [ ] Write 15–30 CLI/hands-on labs (or MCQ-only if no CLI component)
- [ ] Write 4–8 boss battles (1 per unit, 10–20 questions each)
- [ ] Write 1 story beat per major topic (narrative + 3–5 inline questions)
- [ ] Verify no duplicate question IDs (`jq '[.questions[].id] | group_by(.) | map(select(length>1))' data/content.json`)

### Engine Adaptation
- [ ] Extend or replace `Terminal.js` if domain has hands-on CLI labs
- [ ] Replace `Subnetting.js` drill with domain-specific rapid-fire drill
- [ ] Update `WEEK_LABELS` in `main.js`
- [ ] Update domain list (replaces current CCNA domain names)
- [ ] Update exam weighting in `QuizEngine.js` EXAM_WEIGHTS constant

### Diagrams
- [ ] Build 1 diagram module per major concept (min 5 for a good reference library)
- [ ] Each diagram must be interactive (click/step-through) — not just a static table
- [ ] Register each in `DIAGRAM_MODULES` map in `main.js`

### Branding & UX
- [ ] Update app name and tagline in `index.html` (landing) and `app.html` (HUD)
- [ ] Update colour palette CSS variables in `app.html` (currently terminal green)
- [ ] Update `manifest.json` (name, short_name, theme_color)
- [ ] Update landing page feature cards and stats bar
- [ ] Update study hours goal (currently 300hr for CCNA) in `main.js`

### Pre-Launch
- [ ] Test offline (disable network in DevTools → reload)
- [ ] Test PWA install on mobile (Add to Home Screen)
- [ ] Test all question types render correctly in Grind, Exam, and Flashcard views
- [ ] Verify SRS intervals match study cadence (currently 1,3,7,14,30,90,180 days)
- [ ] Verify `data/content.json` passes JSON.parse without errors

---

## 9. Domain Knowledge Requirements

What you need to know before building content for each domain:

### CCNA 200-301 (this app)
- **Networking fundamentals**: OSI, TCP/IP, Ethernet, switching, routing
- **Cisco IOS**: Configuration syntax, modes (exec/config/interface), validation commands
- **Tools needed**: Cisco Packet Tracer or GNS3 to verify lab configs
- **Primary references**: Cisco Official Cert Guide Vol.1 & Vol.2; Jeremy's IT Lab (YouTube)
- **Questions to write**: 4,000+ across NF/NA/IC/IS/SF/AP domains
- **Time to build content**: ~80–120 hrs

### CompTIA Security+ SY0-701
- **Security domains**: Threats/attacks, cryptography, PKI, IAM, network security, cloud, compliance
- **No CLI component** — all MCQ/drag-drop; remove Terminal.js and Lab nav
- **Tools needed**: None — Security+ is conceptual
- **Primary references**: CompTIA Security+ Study Guide (Mike Chapple); Professor Messer (YouTube)
- **New mechanics needed**: Acronym drill (CIA triad, AAA, PKI terms), attack categorisation drag-drop
- **Questions to write**: 2,000+ across 5 domains
- **Exam format differences**: 90Q, 90min, performance-based questions (PBQ) — model as scenario type
- **Time to build content**: ~40–60 hrs

### Python for Beginners
- **Topics**: Variables, types, operators, control flow, functions, lists/dicts, file I/O, modules, OOP basics, error handling
- **CLI component**: Python REPL via Pyodide (WebAssembly Python) — runs real code in browser
- **Terminal.js replacement**: Pyodide REPL — learner writes code, output compared against expected
- **New mechanics**: Code completion questions, "predict the output" questions, debugging labs
- **No boss battles** (replace with timed code challenge "Sprint Mode")
- **Primary references**: Python.org docs, Automate the Boring Stuff (free online), CS50P
- **Weeks/units**: Variables → Conditions → Loops → Functions → Lists → Dicts → Files → Modules
- **Questions to write**: 800–1,200 (fewer needed; code labs carry more weight)
- **Time to build content**: ~30–50 hrs

### AWS Solutions Architect Associate (SAA-C03)
- **Topics**: Compute (EC2/Lambda), Storage (S3/EBS/EFS), Database (RDS/DynamoDB), Networking (VPC/ALB/Route53), Security (IAM/KMS), Serverless, Well-Architected Framework
- **CLI component**: AWS CLI simulator (limited; validate IAM policy JSON, CloudFormation YAML structure)
- **Drill mechanic**: Architecture decision drill — "cheapest/most available/most fault-tolerant option?"
- **Diagrams**: AWS architecture icons (SVG — can be drawn in HTML), VPC topology, IAM policy flow
- **Primary references**: AWS official docs; A Cloud Guru; Stephane Maarek (Udemy)
- **Exam format**: 65Q, 130min, scenario-heavy (long paragraph → MCQ)
- **Questions to write**: 1,500–2,000
- **Time to build content**: ~50–80 hrs

### Linux+ / LPIC-1
- **Topics**: File system, permissions, shell scripting (bash), package management (apt/yum/dnf), processes, networking commands (ip, ss, netstat), systemd, users/groups, logs
- **CLI component**: Bash shell simulator — state machine with virtual filesystem (dirs/files/perms)
- **Drill mechanic**: Command flag recall drill (`ls -lah`, `grep -r`, `chmod 755`)
- **Primary references**: Linux man pages; Linux Foundation training; CompTIA Linux+ Study Guide
- **New mechanics**: File permission calculator, regex builder, systemd unit file validator
- **Questions to write**: 1,500–2,000
- **Time to build content**: ~40–60 hrs

---

## 10. Shared Feature Set (all instances get these for free)

Every new app built on this template inherits:

| Feature | Where |
|---|---|
| Spaced Repetition (SRS) | `Store.js` + `QuizEngine.js` |
| XP / Levels / Streaks | `Store.js` + `HUD.js` |
| Mistake Notebook | `main.js` `renderNotebook()` |
| Question Flag System | `Store.js` + quiz renderer |
| Flashcard mode | `main.js` `renderFlash()` |
| Exam Simulator | `QuizEngine.js` exam mode |
| Exam History | `Store.js` + Stats screen |
| Study Timer + Heatmap | `Store.js` + Stats screen |
| SRS / Accuracy stats | Stats screen `renderStats()` |
| Exam Readiness Score | `_calcReadiness()` in main.js |
| Progress Calendar | `_renderHeatmap()` in main.js |
| Drag-and-drop questions | `_initPointerDragSort()` |
| Multi-select questions | Quiz renderer |
| Keyboard shortcuts | Global handler in main.js |
| Mobile bottom nav | `app.html` |
| Theme unlocks (amber/blue) | CSS vars in app.html |
| PWA offline install | `sw.js` + `manifest.json` |
| Boot animation | First-run sequence in main.js |
| Onboarding tour | First-run modal in main.js |
| Export study notes | `_exportNotebook()` in main.js |
| Daily challenge card | Story view in main.js |
| Wrong-answer re-queue | `QuizEngine.js` |
| Projects mode | `renderProjects()` |
| Mega Labs mode | `renderMegaLabs()` |
| Reference library | `renderReference()` |
| Concept diagrams | `js/diagrams/` + DIAGRAM_MODULES |
| Weak area dashboard | Stats screen |
| Study planner | Stats screen |
| Boss battles | `BossBattle.js` |

---

## 11. Estimated Effort by Domain

| Domain | Content Hours | Engine Changes | Total Effort |
|---|---|---|---|
| CompTIA Security+ | 40–60 hrs | Minimal (remove Terminal, add acronym drill) | ~50–70 hrs |
| Python for Beginners | 30–50 hrs | Medium (add Pyodide REPL, code question type) | ~50–70 hrs |
| AWS SAA | 50–80 hrs | Low–medium (IAM policy validator, arch drill) | ~60–90 hrs |
| Linux+ / LPIC | 40–60 hrs | Medium (bash shell simulator) | ~60–80 hrs |
| Kubernetes / CKA | 60–100 hrs | High (kubectl simulator, YAML validation) | ~80–120 hrs |
| CCNP ENCOR | 80–120 hrs | Low (reuse Terminal.js with more commands) | ~90–130 hrs |

---

*Template version: 2026-03-27 — derived from CCNA Mastery v9.0*
