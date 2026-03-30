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

## Planned Improvements Backlog
Work through these one by one in upcoming sessions. Full notes in memory: improvements_backlog.md

### High Impact / Straightforward
1. [x] Exam Simulator Mode — done Phase 7 Pillar 1 (120Q, 120min, domain weighting, per-domain breakdown, exam history)
2. [x] Weak Area Dashboard — done Phase 7 Pillar 9 (accuracy by week/domain, Drill buttons, weak card on home)
3. [x] Wrong Answer Re-queue — done Phase 7 Pillar 7 (insertAt +5, toggle checkbox, re-queue badge)
4. [x] `show access-lists` + ACL rendering in `show running-config` — done (Terminal.js `_renderAccessLists()` + running-config ACL block)

### Content Gaps
5. [x] Story/Tutorial coverage — 16 new beats added 2026-03-23 covering TCP/UDP, ports, MAC tables, IPv6, topologies, inter-VLAN (ROAS), STP deep-dive, EtherChannel, wireless (CAPWAP/WLC), FHRP/HSRP, DNS, SNMP, threats taxonomy, AAA/TACACS+/RADIUS, IPsec VPN, and Ansible vs Puppet/Chef
6. [x] Drag-and-Drop Expansion — done Phase 5 (32 total) + Phase 9 Pillar 1 (additional sets)
6. [x] Multi-Part Scenario Questions — done Phase 7 Pillar 10 (30 scenarios × 3 sub-Qs = 90 sub-questions, type:"scenario")
7. [x] Subnetting Practice Mode — done Phase 9 Pillar 1 (VLSM drill tab: base /24 + 4 departments, +75 XP perfect)

### Engine / Technical
8. [x] Named ACL Mode — `ip access-list extended NAME` → ACL_CONFIG mode with permit/deny subcommands; named ACLs render as blocks in running-config (added 2026-03-23)
9. [x] Multi-Device Lab Support — `devices{}` wrapper in lab config, device-switcher UI, `switchDevice()` API, `_validateSingle()` per-device; unlocks OSPF neighbor lab lab_w3_ospf_neighbor (added 2026-03-23)
10. [x] Port Security Commands — `switchport port-security [maximum|mac-address sticky|violation]` fully implemented; validate() checks portSecurity; lab_w5_port_security added (added 2026-03-23)

### Engagement / Retention
11. [x] Daily Streak + Bonus XP — `store.checkStreak()` on init; streak 3+=1.25x, 7+=1.5x XP; multiplier applied in QuizEngine.answer(); HUD shows streak + multiplier badge; streak toast on extend (added 2026-03-23)
12. [x] Mistake Notebook — `store.recordMistake(id)` in submitQuizAnswer(); `getMistakeIds(2)` thresholds; Notebook view with drill mode reusing QuizEngine; nav button added (added 2026-03-23)
13. [x] Boss Battle Scaling — questions sorted easy→medium→hard via `_sortByDifficulty()`; damage scales 10/20/30 HP by phase; phase banner UI on phase transition; perfect-run bonus +100 XP; perfect-run shown on end screen (added 2026-03-23)

---

## Phase 5 Backlog (recommended 2026-03-23 — work through in order, one per session)
Full notes in memory: improvements_backlog.md

1. [x] **Spaced Repetition System (SRS)** — `reviewSchedule{}` in Store; intervals [1,3,7,14,30,90,180] days; `updateSRS()`, `getSRSState()`, `getSRSStats()`, `clearSRS()`; QuizEngine `srs:true` sorts pool by dueDate; SRS stats bar + SRS toggle in Grind view; NEW/DUE/LEARNING/MASTERED badge on each question; "caught up" screen when nothing due (added 2026-03-23)
2. [x] **Multi-Select Questions** — Checkbox UI in quiz + exam renderers; submit button activated on first check; `_revealMultiSelect()` green/red/yellow reveal; 21 new questions added across all 6 domains (added 2026-03-23)
3. [x] **Keyboard Shortcuts for Quiz** — 1–4 / A–D for MC and multi-select; T/F for true/false; Enter/Space to submit multi-select. Handler cleaned up on submit + nav. Hint text shown per question. Works in Grind + Exam. (added 2026-03-23)
4. [x] **More CLI Labs** — Terminal.js: DHCP_CONFIG mode, IPv6 (unicast-routing/address/route), HSRP standby, channel-group/Port-channel, STP vlan priority + portfast. 5 new labs added (28 total). (added 2026-03-23)
5. [x] **`interface vlan` / SVI Support** — `vlan → Vlan` alias; two-token `interface vlan N` fix; SVIs default shutdown=false; `ip routing` command + validation; VLAN validation. Lab: lab_svi_intervlan (29 labs total). (added 2026-03-23)
6. [x] **Drag-and-Drop Expansion** — 21 new questions (32 total). TCP teardown, ARP, OSI encap, CSMA/CD, full OSPF FSM, STP election + tiebreakers, EtherChannel, 802.1Q fields, LSA types, BGP FSM, subnetting, EIGRP DUAL, NAT PAT, DNS, SLAAC, 802.1X, troubleshooting, SDN, AD values, DR/BDR. (added 2026-03-23)
7. [x] **Study Timer** — `store.studyMinutes` + `addStudyTime()` + `studyHours` getter. `_viewEnterTime` flushed on every `switchView()`. Stats card: time studied, progress bar to 300hr goal, hrs remaining. (added 2026-03-23)
8. [x] **Question Flag System** — `store.toggleFlag/isFlagged/getFlaggedIds/clearFlags`. ⚐/⚑ button in quiz + exam. Notebook: flagged panel with drill, per-question unflag, clear-all. (added 2026-03-23)
9. [x] **True Offline Mode** — `css/tailwind.js` (398KB local copy). `sw.js`: cache-first + stale-while-revalidate, pre-caches all assets on install. `manifest.json` (PWA). SW registered in index.html. (added 2026-03-23)
10. [x] **Question Review on Summary Screen** — `_buildReviewDetail(q, userAnswer)` helper handles MC/true_false/multi_select/drag_drop with colour-coded options (green=correct, red=wrong pick, dim=missed). Quiz summary: expandable rows with ▶/▼ caret, max-h scroll. Exam summary: same expandable list below domain breakdown. Both use event delegation. (added 2026-03-23)

---

## Phase 6 Audit Findings (2026-03-23)
Full notes in memory: audit_findings.md

### Critical (in progress)
1. [x] **Deduplicate 18 question pairs** — 19 duplicate IDs removed from content.json (zero-day had 3 copies; 17 other pairs). Kept the higher-quality/domain-specific ID in each case. (done 2026-03-23)
2. [x] **Fix mislabeled lab_w4_dhcp** — was a basic interface/static-route/VTY lab with zero DHCP content. Renamed to `lab_w1_interface_route`, moved to Week 1, set easy/65 XP, fixed title/description/objectives/hints. `lab_dhcp_server` is the actual DHCP lab and is correct. (done 2026-03-23)
3. [x] **Hard question shortage** — target 25% ACHIEVED. Was 8% (269/3357). Added 757 questions across 10 batches → 25.0% (1026/4096). W1=25.0%, W2=25.2%, W3=25.8%, W4=25.2%, W5=25.6%, W6=26.1%. (done 2026-03-23)

### Medium (PAUSED — resuming next session)
4. [x] **Week 6 T/F imbalance** — Converted 12 of 18 T/F → MC. Kept 6 T/F (Ansible agentless, REST JSON/XML, NETCONF port 830, M365 SaaS, VM vs container, NFV≠SDN). W6 now: 426 MC / 6 T/F / 5 drag_drop / 3 multi_select. (done 2026-03-24)
5. [x] **Lab progression imbalance** — Added NAT support to Terminal.js (`ip nat inside/outside`, `ip nat pool`, `ip nat inside source list/static`). Added 3 W6 labs: `lab_w6_static_nat` (easy/95XP), `lab_w6_nat_pat` (medium/130XP), `lab_w6_enterprise_full` (hard/280XP). Week 6 now has 5 labs (was 2). (done 2026-03-24)
6. [x] **Dynamic domain dropdown** — `QuizEngine.DOMAINS` static getter replaced with `QuizEngine.domainsFrom(questions)` static method. Derives sorted unique domains from question bank at runtime. All 3 call sites in main.js updated (Grind filter, Stats domain totals init, Stats domain rows). New domains in content.json appear automatically. (done 2026-03-24)
7. [x] **WAN Technologies (55 legacy Qs)** — All 55 integrated: 39 NF→Week 1; 6 WAN/SD-WAN→IP Services Week 4; 4 cloud/virt→Automation Week 6; 6 wireless→Network Access Week 2. Week 0 is now empty. Totals: W1=1112, W2=829, W3=586, W4=652, W5=473, W6=444 (4096 total). (done 2026-03-24)

### Low (PAUSED — resuming next session)
8. [x] **Study timer flush order** — `_viewEnterTime` now set to `null` before render, then to `Date.now()` AFTER the render block. Eliminates race condition where render-triggered secondary `switchView` caused near-zero elapsed time to be discarded. Removed duplicate flush from `renderStats`. (done 2026-03-24)
9. [x] **Whitespace name validation** — prompt now loops until a non-blank name is entered or user cancels. Also triggers if playerName is falsy (null/""). Cancel keeps 'Network Cadet' default. (done 2026-03-24)
10. [x] **Inventory items are cosmetic** — All items now have mechanical effects: Console Cable → +2 hints on acquire; Packet Sniffer → +10% lab XP (passive); Subnet Calc Pro → shows /<cidr> = subnetMask in subnetting tool; Debug Badge → unlocks `debug` commands (already existed); CCNA Cert Frame → legendary cosmetic. Descriptions updated. (done 2026-03-24)
11. [x] **No Week 4 easy labs** — Added `lab_w4_ntp_syslog` (easy, 70 XP): hostname + Gi0/0 IP + enable secret + console/VTY lines. Week 4 now has 4 labs: easy/medium/medium/hard. (done 2026-03-24)
12. [x] **Exam time mismatch** — `EXAM_TIME_SECONDS` changed from 90*60 to 120*60. UI text updated to "120-minute timer". (done 2026-03-24)

---

## Phase 7 — "Complete the Journey" (planned 2026-03-23)
Full notes in memory: phase7_plan.md
Goal: carry a learner from zero to exam-ready across the full recommended ~300hr CCNA study journey.
Constraints: HTML5/Tailwind/Vanilla JS, localStorage only, 100% offline PWA, no install, PC + mobile.
Work through pillars in order, one per session. Ask before moving to next.

### Pillar 1 — Exam Simulator *(done 2026-03-25)*
- [x] 120 questions, 120 minutes (real CCNA 200-301 format, fixes current 90 min mismatch)
- [x] Domain-weighted draw: NF 20%, NA 20%, IC 25%, IS 10%, SF 15%, AP 10%
- [x] Per-domain score breakdown + pass/fail indicator on results screen
- [x] Exam history in Store (last 10 runs: score, date, domain breakdown) — `Store.examHistory[]` + `recordExamRun()`; shown on Exam launch screen and Stats screen (expandable per-domain breakdown)
- [x] Extends existing QuizEngine exam mode — config + UI changes only

### Pillar 2 — Exam Readiness Score *(done 2026-03-25)*
- [x] 0–100% readiness gauge on Stats screen — weighted: accuracy 30%, attempted 20%, SRS mastered 20%, study hrs 15%, labs 15%
- [x] Domain radar/spider chart (canvas-drawn via `_drawRadar()`, no external libs)
- [x] Colour-coded: <40% red, 40–70% amber, 70–85% green, 85%+ blue
- [x] Weak-area call-outs — 3 lowest-accuracy domains, each with "Drill" button → switches to Grind pre-filtered to that domain (via `_grindPresetDomain`)

### Pillar 3 — Study Planner / Daily Schedule *(done 2026-03-25)*
- [x] User enters exam date in Stats → Study Planner card (date picker + Save/Clear); back-calculates hrs/day needed
- [x] "Today's Mission" card on home (Story) screen: countdown, daily hrs target, suggested topic (by current week), SRS queue, quick-start buttons (Grind/Exam/Labs), study hours ring
- [x] Store additions: `examDate` (ISO string) + `daysUntilExam` getter, `setExamDate()` method
- [x] All in-app, no notifications

### Pillar 4 — Flashcard / Quick Recall Mode *(done 2026-03-25)*
- [x] New "Flash" nav + view: question face → tap/click (or Space) to 3D-flip → answer + explanation
- [x] Self-rate: Got It ✓ / Missed ✗ → calls `store.updateSRS()` for both; swipe-off CSS animation
- [x] Swipe left/right via Pointer Events API (mobile + desktop); keyboard Space=flip, ←=missed, →=got it
- [x] Filters: domain, week, all/SRS-due/flagged/mistakes; session size 10/20/50; summary screen with Study Again

### Pillar 5 — Concept Reference Library *(done 2026-03-25)*
- [x] New "📚 Reference" nav + `renderReference()` view
- [x] 10 sections: Subnetting/CIDR, Well-Known Ports, OSI vs TCP/IP, Routing Protocol Comparison, STP (states/roles/variants/timers), OSPF LSA Types & Area Types, IPv6 Address Types, HSRP/VRRP/GLBP, SNMP Versions, AAA/TACACS+/RADIUS, CLI Quick-Reference (8 topic groups)
- [x] Collapsible sections (click header), "Expand all / Collapse all" toggle, keyword search auto-opens matching sections

### Pillar 6 — Progress Calendar / Study Heatmap *(done 2026-03-25)*
- [x] GitHub-style 12-week rolling heatmap on Stats screen — `_renderHeatmap()` helper, HTML div grid
- [x] 5-level colour scale: 0=gray-900, 1-20=green-900, 21-60=green-800, 61-120=green-700, 120+=green-500; today outlined in green
- [x] `Store.studyLog {}` added to DEFAULT_STATE; `addStudyTime()` writes `{YYYY-MM-DD: minutes}`
- [x] Hover/touch shows floating tooltip: date + minutes; colour legend row

### Pillar 7 — Wrong Answer Re-Queue *(done 2026-03-25)*
- [x] Missed questions re-enter pool ~5 questions later (`insertAt = currentIdx + 5`; was +2)
- [x] "↩ Re-queue" toggle checkbox added to Grind settings; independent of SRS toggle
- [x] `startQuiz()` reads `quiz-requeue` checkbox; `requeueWrong` passed to QuizEngine
- [x] "↩ Re-queue" badge shown in quiz header when active; each question re-queued once only

### Pillar 8 — Mobile UX Overhaul *(done 2026-03-25)*
- [x] Bottom nav bar on mobile (<768px): Home | Grind | Labs | Flash | Stats
- [x] Touch drag-and-drop using Pointer Events API — `_initPointerDragSort()` helper; drag_drop rendered as interactive sortable list in Grind + Exam (replaces fill_blank fallback)
- [x] CLI terminal: `scrollIntoView` on focus (300ms delay for virtual keyboard)
- [x] Min 44px tap targets on all interactive elements via mobile CSS
- [x] `switchView()` updates bottom nav active state automatically via `[data-nav]` query

### Pillar 9 — Weak Area Dashboard *(done 2026-03-25)*
- [x] `weekStats` added to `recordQuizSession()` calls — per-week {correct, total} breakdown stored alongside domainStats
- [x] Stats screen: "Accuracy by Week" section — bars for W1–W6, colour-coded (<60% red, 60–80% amber, 80%+ green), Drill button for sub-80% weeks
- [x] Week Drill sets `_grindPresetWeek`, Grind adds `<select id="quiz-week">` dropdown, `startQuiz()` pre-filters pool by week
- [x] `_renderWeakCard()` — top-3 weakest domains card on home/story screen; mini bars + Drill buttons + "View all stats" link

### Pillar 10 — Scenario / Multi-Part Questions *(done 2026-03-25)*
- [x] `type: "scenario"` schema: `scenario_text`, `sub_questions[]`, `scenario_ref` fields
- [x] Flattened at load time in `init()`: each sub-question inherits `scenario_text`, `scenario_ref`, `scenario_id`, domain, week, difficulty from parent
- [x] Quiz + Exam renderers: blue scenario context box displayed above question when `q.scenario_text` is set
- [x] 30 scenarios × 3 sub-questions = 90 sub-questions added (5 per domain, all 6 domains)
- [x] Total questions post-flatten: 4,186 (was 4,096)

---

## Phase 8 — Landing Page & UX Polish *(ALL DONE 2026-03-27)*
Full notes in memory: phase8_plan.md
Goal: give the project a public face, improve first-run experience, and make the app more visually engaging and easier to navigate.

### Item 1 ✅ — Public Landing Page (`landing.html`)
New file at repo root served by GitHub Pages as the public entry point.
**Content sections:**
- Hero: app name, tagline ("Master the CCNA 200-301 — free, offline, gamified"), "Launch App →" CTA button linking to `index.html`
- Feature grid: one card per section (Story Mode, The Grind, CLI Labs, Exam Sim, Boss Battles, Subnetting, Flashcards, Reference Library) — icon + one-line description
- How it works: 3-step visual (Install PWA → Study daily → Track progress)
- CCNA Study Best Practices panel (see below)
- Tech/stats bar: "4,186 questions · 33 CLI labs · 6 boss battles · 100% offline"
- Footer: GitHub link, no-backend notice, Cisco disclaimer

**CCNA Study Best Practices to include on landing page:**
1. Follow the 6-week curriculum in order — builds on prior knowledge each week
2. Set a target exam date; work backwards to set a daily hours goal (300 hrs total recommended)
3. Do CLI labs every week — the real exam has simulation tasks; muscle memory matters
4. Use SRS daily — spaced repetition is the most evidence-based retention method
5. Practice subnetting until you can do /24–/30 splits in under 30 seconds
6. Take a full timed exam sim at the end of each week to measure readiness
7. Review every wrong answer before your next session — the Mistake Notebook auto-tracks these
8. Supplement with Jeremy's IT Lab (YouTube) or Cisco's Official Cert Guide for concepts
9. Join r/ccna — community context helps enormously when concepts don't click
10. Aim for 85%+ on practice exams before booking the real thing (820/1000 = pass)

**Visual style:** match the app's terminal/hacker aesthetic — dark background, green glows, monospace font, scanline overlay, typewriter headline animation.

### Item 2 — Onboarding / First-Run Tour
- On very first load (no localStorage), show a dismissable welcome modal: 3-slide carousel explaining Story Mode → Grind → Labs before prompting for callsign
- "Skip tour" link always visible
- Store a `onboardingDone` flag so it never shows again

### Item 3 — Animated Boot Sequence
- Replace the instant render with a 1.5s terminal boot sequence on first app load (not on return visits)
- Lines type out: `CCNA-MASTERY v1.0 ... LOADING CONTENT ... OK ... STARTING SESSION`
- Runs during the `fetch('./data/content.json')` await — hides latency, adds character
- Skippable with any keypress

### Item 4 — Visual Polish & Micro-Animations
- Floating "+XP" text animation that rises and fades when answering correctly (CSS keyframe, no lib)
- HP bar flash effect on boss battles (red pulse on damage)
- XP bar smooth fill animation already exists — add a brief glow pulse on level-up
- Correct answer: brief green border flash on the chosen option before revealing
- Wrong answer: brief red shake animation on the chosen option
- Card hover: subtle scale(1.01) + border glow on quiz option cards
- Stats radar chart: animate paths from center outward on render (CSS stroke-dashoffset)

### Item 5 — Loading / Error States
- Show a styled terminal loading screen while `content.json` fetches (replaces blank flash)
- If fetch fails, show a clear "OFFLINE — content failed to load" error with retry button instead of silently falling back to empty arrays
- Empty state screens for sections with no data (e.g., Grind before any sessions: "No quiz history yet — start your first session below")

### Item 6 — Navigation & Discoverability
- Keyboard shortcut `?` opens a cheat-sheet modal listing all keyboard shortcuts app-wide
- Breadcrumb / section subtitle in the top bar already shows current view — extend it to show context (e.g., "The Grind › Week 3 · IP Connectivity")
- "What's here?" tooltip/popover on each nav button (hover on desktop, long-press on mobile)
- Section landing pages: each view shows a brief one-liner about what it does and a "how to use" tip the first time it's visited

### Item 7 — Theming & Colour Unlock
- Add amber terminal theme (`--terminal-green: #ffb000`) unlocked at Level 5
- Add blue/cyan theme (`--terminal-green: #00bfff`) unlocked at Level 8
- Theme toggle in the sidebar footer or Stats screen settings
- Store theme in `store.state.settings.theme`; apply via CSS custom property swap on `<html>`

### Item 8 — Daily Challenge Card
- One featured question per day on the Story home screen (deterministic daily seed from date)
- Displayed as a compact "Daily Challenge" card above the weak-areas card
- Answering it grants +50 XP bonus; card greyed out for rest of day after completion
- Builds habit without requiring a full quiz session

### Item 9 — Print / Export Study Notes
- In the Notebook view: "Export Notebook" button downloads a formatted `.txt` or `.md` file listing all flagged questions + mistake questions with their correct answers and explanations
- Useful for offline paper review or sharing with study groups

### Item 10 — `index.html` → App; `landing.html` → Entry Point (routing)
- Rename current `index.html` → `app.html`; create new `index.html` as landing page
- GitHub Pages serves `index.html` by default → landing page is what visitors see first
- "Launch App" button on landing navigates to `app.html`
- Service worker and manifest point at `app.html` for PWA install
- 404.html redirect trick not needed since it's all static

### Item 11 — Visual Concept Diagrams & Deep-Dive Learning Mode
**Problem:** The app teaches through questions and quick-reference tables, but never *shows* concepts visually. A learner reading about OSI troubleshooting has no diagram to anchor it; the Reference section's OSI vs TCP/IP entry is a good cheat-sheet but not a teaching resource.

**Goal:** Add inline visual diagrams and deeper explanations so that concepts are shown, not just tested.

**Approach — two layers:**

1. **Inline concept panels in Story Mode beats** — when a beat introduces a topic (e.g., OSI model, subnetting, STP election), display a collapsible "📐 Concept Visual" block below the narrative containing an HTML/CSS diagram or ASCII art + a plain-English deeper explanation. No images needed — build diagrams from styled `<div>` and `<table>` elements (works offline).

2. **Expanded Reference entries** — each Reference section gets a "Deep Dive" toggle that reveals:
   - A rendered diagram (HTML/CSS, SVG inline, or styled table)
   - Step-by-step worked example
   - Common exam traps / misconceptions
   - Link to the relevant Story Mode beat or Grind drill

**Priority topics to build diagrams for (in order):**
- OSI model: 7-layer stack with PDU names, protocols per layer, encapsulation arrows; side-by-side TCP/IP comparison; troubleshooting flow (top-down vs bottom-up vs divide-and-conquer)
- Subnetting: visual bit-boundary diagram showing how a /26 carves a /24; worked example (network, broadcast, first/last host, next network)
- Ethernet frame: field-by-field visual with byte widths labelled
- STP: port state timeline (Blocking → Listening → Learning → Forwarding), root bridge election flowchart
- OSPF: neighbor state machine with triggering events on each arrow; LSA type table with scope illustrated
- TCP 3-way handshake and 4-way teardown: sequence diagram with flag labels
- NAT/PAT: before/after packet header diagram showing address translation
- VLAN/trunk: physical vs logical topology side-by-side showing tagged/untagged frames
- IPv6 address types: visual address space map (global unicast vs link-local vs multicast prefixes)
- ACL processing: flowchart showing top-down match logic with implicit deny

**Interactivity is a core design principle for all diagrams — not optional:**
- OSI model: click any layer → expands inline to show PDU name, real protocols, and a one-line "what happens here" explanation
- Subnetting diagram: user enters a CIDR → diagram redraws live showing the bit boundary, host count, and address range (ties into existing Subnetting.js engine)
- TCP handshake: step-through mode — user clicks "Next Step" to advance through SYN → SYN-ACK → ACK one at a time with each packet highlighted on the sequence diagram
- STP state machine: click any state (Blocking / Listening / Learning / Forwarding) → highlights valid transitions out, shows timer or trigger condition
- OSPF neighbor states: same step-through as TCP — advance through Down → Init → 2-Way → ExStart → Exchange → Loading → Full with event labels
- NAT/PAT diagram: toggle between "before translation" and "after translation" views, with the changing fields highlighted in amber
- VLAN/trunk: clickable ports — select a VLAN ID and watch which ports receive the frame (tagged vs untagged highlighted)
- ACL flowchart: paste in a sample ACL + source IP → the flowchart animates which rule matches and shows permit/deny outcome
- Traveling packet animation (SVG): a packet dot moves hop-by-hop along a topology path; click any device to inspect its routing table or ARP cache at that moment
- All interactive elements keyboard-accessible (Tab + Enter) for accessibility and for users without a mouse

**Implementation notes:**
- All diagrams built from HTML/CSS/SVG — zero external images, works 100% offline
- Interactive state managed in plain JS closures per diagram — no framework needed
- Diagrams live in a new `js/diagrams/` module, one file per topic (e.g., `diagrams/osi.js`, `diagrams/stp.js`)
- Each diagram module exports a `render(containerEl)` function that injects HTML/SVG and wires up its own event listeners
- Story Mode beat schema gains optional `concept_visual` field: `{ title, diagramId, explanation }` — `diagramId` maps to a diagrams module
- Reference section schema gains optional `deep_dive` field: `{ diagramId, worked_example, exam_traps }`
---

## Phase 9 — Expand Learning Depth (planned 2026-03-26)
Full notes in memory: project_phase9.md
Goal: interactivity audit + security training + cloud training + practical projects.
Work through pillars in order, one per session. Ask before moving to next pillar.

### Pillar 1 — Interactivity Audit *(done 2026-03-27)*
- [x] 5 new diagram modules: `ports.js` (searchable/filterable table), `routing.js` (AD bar chart + detail panel), `hsrp.js` (failover animation, HSRP/VRRP/GLBP tabs), `snmp.js` (GET/TRAP/INFORM step-through), `aaa.js` (802.1X/TACACS+/RADIUS packet flow)
- [x] All 5 wired into Reference sections via `diagramId` + DIAGRAM_MODULES map
- [x] Boss Battle end screen: per-phase accuracy breakdown bars (easy/medium/hard) + correct/total count; `phaseStats` + `correctCount` added to BossBattle result object
- [x] VLSM drill mode: new tab in Subnetting view; generates base /24 + 4 department host requirements; validates network address + CIDR per subnet; +75 XP for perfect
- [x] Story Mode 6-week timeline: collapsible week nodes (green=done, amber=active, gray=locked) with per-week beat progress bars, above mission card
- [x] Flashcard summary SRS distribution: NEW/DUE/LEARNING/MASTERED bar chart derived from `store.getSRSStats()` on session card IDs

### Pillar 2 — Security Training Module *(done 2026-03-27)*
- [x] AAA commands in Terminal.js: `aaa new-model`, `username`, `aaa authentication login default local`, `aaa authorization exec default local`; ZONE_CONFIG/CLASS_MAP_CONFIG/POLICY_MAP_CONFIG/ZONE_PAIR_CONFIG modes
- [x] ZBF commands: `zone security`, `zone-member security`, `class-map type inspect`, `match protocol`, `policy-map type inspect`, `class type inspect`, `inspect`, `zone-pair security`, `service-policy type inspect`; full running-config rendering + validate() support
- [x] 3 new security labs: `lab_w5_acl_hardening` (easy/80XP), `lab_w5_local_aaa` (medium/120XP), `lab_w5_zone_based_fw` (hard/200XP); labs total now 36
- [x] "The Breach" boss battle (boss_w5_the_breach, 15 questions, 350XP/150 perfect bonus); boss battles total now 7
- [x] 56 new questions: AAA (5), ACLs (6), Threats (6), SSH/hardening (5), VPN/crypto (3), port security/L2 (4), ZBF (2), wireless security (3), IDS/IPS (2), cryptography basics (3), misc security (7), IP Services security (2), multi-select (3), drag-drop (3)

### Pillar 3 — Cloud Training Module *(done 2026-03-27)*
- [x] `js/diagrams/cloud.js` — 4-tab interactive diagram: IaaS/PaaS/SaaS responsibility matrix (click column = model detail), Deployment Models (cards with pros/cons), Virtual Networking analogs (on-prem ↔ cloud clickable table), SD-WAN/SASE/Zero Trust cards
- [x] Cloud reference section added to Reference view with diagramId: 'cloud'; IaaS/PaaS/SaaS summary table
- [x] "The Migration" boss battle (boss_w6_the_migration, 15Q, 400XP/150 perfect bonus); boss battles total now 8
- [x] 50 new questions: cloud service models (6), cloud networking/VPC (4), virtualisation/NFV (4), SD-WAN/SASE/ZTNA (3), Ansible (5), APIs/NETCONF/RESTCONF (6), SDN (3), IaC/Terraform (2), multi-select (3), drag-drop (3), misc cloud/automation (11); questions total now 4,232

### Pillar 4 — Practical Projects Mode *(done 2026-03-27)*
- [x] `store.completedProjects{}` added to DEFAULT_STATE; `getProjectProgress()`, `recordProjectPhase()`, `completeProject()`, `isProjectComplete()` methods added to Store
- [x] `renderProjects()` — card grid showing all 8 projects with phase progress bars, locked/unlocked state (minLevel), difficulty/XP badges
- [x] `_renderProjectDetail()` — briefing panel, numbered phase stepper with objectives for next phase, phase launch buttons
- [x] `_runQuizProjectPhase()` — inline MC quiz renderer; 67% pass mark; retry on fail; auto-advances to project detail on pass
- [x] `_runCliProjectPhase()` — inline Terminal instance per phase; Objectives panel; Hint/Validate/Reset buttons; validate() checks phase targetConfig; objective checkboxes update on pass
- [x] 8 projects defined (PROJECTS constant): Small Office Network (400XP/med), Secure Branch Router (250XP/easy), OSPF Multi-Area (450XP/hard), NAT+DHCP+ACL (380XP/med), IPv6 Dual-Stack (500XP/hard), Zero-Trust Hardening (550XP/hard), Cloud-Connected HQ (500XP/hard), VLAN+PortSec (350XP/med)
- [x] Each project: 3 phases (mix of cli + quiz), objectives list, hints, targetConfig; 10% XP completion bonus on finishing all phases
- [x] Nav button "🔧 Projects" added to sidebar; 'projects' case added to switchView; breadcrumb label added

### Pillar 5 — Mega Labs *(done 2026-03-27)*
- [x] `store.megaLabProgress{}` + `badges[]` added to DEFAULT_STATE; `getMegaLabProgress()`, `recordMegaLabPhase()`, `recordMegaLabHint()` (−30 XP penalty), `completeMegaLab()`, `isMegaLabComplete()`, `awardBadge()`, `get badges()` methods added to Store
- [x] `renderMegaLabs()` — dramatic card grid with badge showcase, locked/unlocked state (minLevel), per-lab progress bars, difficulty/XP/time badges
- [x] `_renderMegaLabDetail()` — briefing + inline topology HTML/CSS diagram + stats bar (hints used) + phase stepper; objectives hidden (exam mode)
- [x] `_runMegaQuizPhase()` — inline MC quiz with 67% pass mark; retry on fail
- [x] `_runMegaCliPhase()` — inline Terminal instance per phase; Hint btn (−30 XP via `store.recordMegaLabHint()`); Validate/Reset; auto-advances on pass
- [x] `_checkMegaCompletion()` — awards badge, emits toast, grants 15% XP completion bonus
- [x] 5 Mega Labs defined (MEGA_LABS constant): Enterprise Campus Build (800XP/L5/90min/🏛️), Branch DR (700XP/L5/75min/🔄), Security Audit (750XP/L5/80min/🔐), Cloud-Edge Integration (850XP/L7/100min/☁️), ISP Core Simulation (900XP/L8/110min/🌐)
- [x] Each Mega Lab: 4–6 phases (CLI + quiz mix), topology HTML diagram, briefing narrative, badge spec; phase stepper green/amber/grey
- [x] Nav button "🏭 Mega Labs" added to sidebar; 'megalabs' case added to switchView; breadcrumb label added

Large-scale, multi-concept, multi-phase CLI labs that simulate real enterprise scenarios end-to-end. Unlike Projects (which are guided with hints), Mega Labs are closer to exam simulations — minimal hand-holding, full topology, multiple devices, cross-domain objectives.

**Design principles:**
- Each Mega Lab spans 4–8 phases, each unlocking after the previous is validated
- Phase completion is checked by `validate()` on the relevant device(s); partial credit per phase
- Topology diagrams shown inline (HTML/CSS, no images) — user can see the full network before starting
- "Briefing" narrative: a scenario context (e.g. "You are the new network engineer at Acme Corp...") sets the stakes
- Hint system still available but heavily penalised (−30 XP per hint used)
- Completion awards a unique title/badge stored in `store.state.badges[]`
- Mega Labs are gated: appear locked until the player reaches a minimum level or completes prerequisite labs

**Mega Lab catalogue (implement 5):**

1. **"Enterprise Campus Build"** — 800 XP · Hard · ~90 min
   Topology: Core switch, 2× distribution switches, 4× access switches, 1× router (Internet uplink)
   Phases: (1) VLANs + trunks across all switches, (2) STP root bridge election + PortFast on access ports, (3) Inter-VLAN routing via SVIs on core switch + `ip routing`, (4) OSPF between core switch and router, (5) DHCP pools per VLAN on router, (6) PAT for internet access, (7) ACL: block Guest VLAN from reaching management VLAN, (8) Port security on access ports
   Badge: 🏛 Campus Architect

2. **"Branch Office Disaster Recovery"** — 700 XP · Hard · ~75 min
   Topology: HQ router, Branch router, ISP cloud (simulated via loopbacks), 2× switches
   Phases: (1) Physical addressing + interface config both routers, (2) OSPF area 0 between HQ and Branch, (3) HSRP on HQ-side switches for gateway redundancy, (4) Site-to-site IPsec VPN tunnel HQ↔Branch, (5) ACL to permit only VPN traffic + management protocols, (6) Floating static route as OSPF backup (higher AD), (7) Verify failover: disable primary link, confirm traffic reroutes
   Badge: 🔄 Resilience Engineer

3. **"Full Security Hardening Audit"** — 750 XP · Hard · ~80 min
   Topology: Internet router, Firewall router (ZBF), internal switch, DMZ switch, internal hosts, DMZ server
   Start state: pre-populated running-config with 10 deliberate misconfigs (Telnet enabled, weak passwords, permissive ACLs, no SSH, banner missing, unused interfaces up, CDP on external interface, etc.)
   Phases: (1) Identify + fix authentication (passwords, secret, SSH), (2) Disable Telnet, enforce SSH v2, (3) Banner motd + login, (4) Shut unused interfaces + disable CDP on external ports, (5) Build Zone-Based Firewall zones (INSIDE/OUTSIDE/DMZ), (6) Class-maps + policy-maps: permit HTTP/HTTPS from inside, permit only return traffic from outside, (7) ACL: block RFC 1918 spoofing inbound on WAN, (8) Validate all 10 fixes
   Badge: 🔐 Security Auditor

4. **"Cloud-Edge Integration"** — 850 XP · Expert · ~100 min
   Topology: On-prem router, DMZ, internal network, simulated AWS VPC (loopback-based), SD-WAN stub
   Phases: (1) On-prem addressing + OSPF, (2) NAT/PAT for internet, (3) IPsec site-to-site VPN to "AWS VGW" (loopback), (4) BGP stub: advertise on-prem prefix to simulated ISP, accept default route, (5) Split tunnelling ACL: corporate traffic via VPN, internet via NAT, (6) IPv6 dual-stack on internal network + OSPFv3, (7) Automation checkpoint: write Ansible-style pseudoconfig YAML (quiz validation, not CLI), (8) Final audit: `show` command quiz — interpret outputs to confirm all services operational
   Badge: ☁️ Cloud-Edge Architect

5. **"ISP Core Simulation"** — 900 XP · Expert · ~110 min
   Topology: 4× routers (simulating ISP core), 2× customer edge routers, 2× customer switches
   Phases: (1) OSPF area design (backbone + 2 stub areas), (2) BGP iBGP full mesh between ISP routers, (3) BGP eBGP to customer edges, (4) Route filtering: prefix-lists to prevent customer routes leaking into ISP core, (5) QoS: mark customer traffic (DSCP EF for voice, AF for video, BE for data), apply queuing policy, (6) IPv6 BGP (MP-BGP) — add IPv6 address family, (7) MPLS stub config (label switching commands — conceptual validation via quiz), (8) Full end-to-end ping + traceroute validation across all paths
   Badge: 🌐 ISP Architect

**Implementation notes:**
- Mega Labs reuse `Terminal.js` multi-device engine (`devices{}` wrapper, `switchDevice()`)
- New `type: "megalab"` in content schema with fields: `phases[]`, `topology_html`, `briefing`, `min_level`, `prerequisite_labs[]`, `badge`
- Each phase: `{ id, title, objectives[], device, targetConfig{} }`  — validated independently
- `store.state.megaLabProgress: { [labId]: { phase: N, hintsUsed: N, startedAt, completedAt } }`
- New `renderMegaLabs()` view: dramatic card design, topology preview on hover, locked/unlocked state, badge showcase
- Phase stepper UI: numbered phases across the top; completed = green, active = amber, locked = grey
- Auto-save progress after each phase so the user can resume across sessions

---

## Phase 10 — Quality & Depth (planned 2026-03-27)
Brainstormed improvements from session review. Work through in order, one per session.

### High Value — Implement First
1. [x] **Confidence Rating System** *(done 2026-03-29)* — After selecting an answer, a 1–5 panel appears before submission. Identifies lucky guesses. SRS-adjusted: conf 1–2 = SRS reset; conf 3 = advance interval only (no streak); conf 4–5 = normal advance. `store.recordConfidence(id, rating, correct)` stores `confidenceLog{}`. Feedback shows confidence label + SRS note. Toggle: "Confidence" checkbox in Grind settings (off by default). `_handleAnswerSelection()` → `_selectAnswerForConfidence()` intercept pattern. Keyboard: 1–5 to rate after answer selection.
2. [x] **Adaptive Difficulty Weighting** *(done 2026-03-29)* — "Smart" checkbox in Grind settings. `_computeAdaptivePool(basePool, domain)` builds a weighted sample from easy/medium/hard buckets: acc<60%=3×, 60–74%=2×, ≥75%=1×, <20 answers=1×. Only activates when difficulty dropdown is 'all'. `difficultyStats{}` now recorded per quiz session in `quizHistory`. Smart badge in quiz header shows boosted tier + accuracy. `_smartDifficulty` + `_adaptiveInfo` module vars.
3. [x] **"Explain the Distractors"** *(done 2026-03-29)* — Optional `distractor_notes: string[]` field added to MC question schema (null for correct option). Wrong-answer feedback shows "WHY PEOPLE PICK THESE:" panel with all distractor notes; user's pick highlighted in amber. Correct-answer feedback shows collapsible `<details>` "WHY OTHERS PICK WRONG". Flashcard back also shows collapsible distractor panel. 24 new MC questions added (4 per domain × 6 domains) with distractor_notes — all covering common misconception-prone topics. Total questions: 4,296.
4. [x] **Prerequisite Concept Links** *(done 2026-03-29)* — On wrong answers, shows "REVIEW THIS FIRST:" panel with navigable buttons linking to the relevant Reference section or Story Mode beat. `PREREQ_MAP` constant in main.js maps 30 topic tag strings (osi, tcp_udp, ospf, vlan, acl, etc.) to `{ type, id, label }`. `_prereqLinksHtml(tags)` builds button HTML; `_goToPrereq(type, id)` navigates and auto-opens the target section. 24 new distractor-notes questions tagged in content.json (q_dn_nf_001 through q_dn_ap_004). `ntp` tag also added to PREREQ_MAP → `w4_ntp` story beat. Feature activates automatically on any question with `tags[]`.
5. [x] **Pomodoro Timer** *(done 2026-03-29)* — 🍅 button in HUD sidebar. Click to start 25-min work block (pulsing red countdown). On completion: `store.recordPomodoro()` + `addStudyTime(25)`, toast notification, auto-starts 5-min break (blue countdown). Break done: toast prompt to start next. Click during any phase to cancel. `store.pomodoroCount` + `store.pomodoroLog{}` (`{ YYYY-MM-DD: count }`). HUD shows total completed pomodoros. `_pomo` state object + `POMODORO_WORK_SECS`/`POMODORO_BREAK_SECS` constants. `initPomodoro()` called from `initHUD()`.

### Medium Value
6. [x] **Custom Question Creator** *(done 2026-03-29)* — "✏️ Custom Questions" panel in Notebook view. Collapsible `<details>` form: question textarea, 4 option inputs with radio correct-answer selector, explanation textarea, domain/difficulty/week dropdowns. Validates all fields. `store.addCustomQuestion()` → persisted to `store.state.customQuestions[]` with `_custom: true` flag + generated ID. "Drill Custom Questions" button reuses `startNotebookDrill()`. Per-question delete with confirm. Custom Qs merged into Grind pool in `startQuiz()` and Flashcard pool in `startFlash()`. ✏️ Custom badge in quiz header + flashcard metadata line. Included in notebook export (`.md` file has `## ✏️ Custom Questions` section). Export count in header shows `N custom`.
7. [x] **Export to Anki** *(done 2026-03-30)* — "↓ Anki Export" button in Notebook header. `_exportToAnki()` deduplicates flagged + mistake + custom questions, builds tab-separated lines (`front\tback\ttags`). Front includes question + options (HTML-encoded). Back includes bold correct answer + explanation. Tags: `ccna domain week_N difficulty [flagged] [mistake] [custom]`. Header lines: `#separator:tab`, `#html:true`, `#notetype:Basic`, `#deck:CCNA Mastery`. Downloads as `ccna-anki-YYYY-MM-DD.txt`; toast confirms count + filename. Empty guard: alert if nothing to export.
8. [x] **Session Quality Score** *(done 2026-03-30)* — `_lastSessionQuality` module var captures score in `bus.on('quiz:completed')`. Four components: accuracy (×0.40), SRS reviews (×0.20, 8 items = full), new Qs (×0.20, 5 items = full), time-on-task (×0.20, 20 min = full). Summary screen shows quality card above result list: gauge bar, label (Weak/Fair/Good/Great/Excellent), 4 component mini-bars with counts. `store.state.sessionHistory[]` (last 30) + `recordSessionQuality()` + `get sessionHistory` in Store. Stats screen: "Session Quality" section with SVG sparkline (`_renderSessionSparkline()`): filled area, polyline, avg dashed line, last-score dot colour-coded, legend.
9. [x] **Citation Panel** *(done 2026-03-30)* — `_citationHtml(sourceRef)` helper returns a `<details>` collapsible "📖 Source ▶" badge; empty string when no `source_ref`. Applied in 4 locations: (1) Grind feedback after explanation (`currentQ.source_ref`); (2) Exam feedback after explanation (`q.source_ref`), always shown even on correct; (3) Flashcard back after explanation; (4) `_buildReviewDetail()` quiz/exam summary review rows.
10. [x] **Peer Study Export** *(done 2026-03-30)* — "Share Progress" section on Stats screen. "Generate Card" button builds a fenced code-block plain-text card: callsign, level, XP, readiness % + label, overall accuracy over N questions, streak, labs done, last session quality score, days until exam (if set), top-3 weakest domains. Preview shown inline in monospace. "Copy to Clipboard" button appears after generation; uses `navigator.clipboard.writeText()` with `execCommand('copy')` fallback. Also added module-level `showToast(msg, duration)` helper (fixes latent bug in `_exportToAnki` where `showToast` was called but not in scope).

### Technical
11. [x] **Progressive content.json loading** *(done 2026-03-30)* — Python script splits content.json (3.8MB) into `data/meta.json` (178KB: labs/bossBattles/storyBeats) + `data/week1-6.json` (437–743KB each). `init()` fetches meta + currentWeek in parallel for first render; background-loads remaining weeks after 200ms. `_flattenQuestions()` helper reused per-chunk. `_weekState{}` tracks per-week load status; `_loadWeek(n)` merges flattened questions into `content.questions`; `_ensureAllWeeksLoaded()` / `_allWeeksLoaded()` guard Grind (all-weeks) and Exam modes with ⏳ spinner + auto-retry. sw.js bumped to `ccna-v4`, caches meta + week1-6 instead of monolithic content.json. Boot animation handles `[meta, weekData]` array result. First-render payload: ~920KB (meta + week1) vs 3.8MB.
12. [x] **IndexedDB migration** *(done 2026-03-30)* — Store now uses IndexedDB as primary storage with localStorage write-through. `_openIDB()` / `_loadFromIDB()` / `_saveToIDB()` / `_initIDB()` added. Constructor fires `_initIDB()` async; exposes `get ready()` Promise. `_persist()` writes localStorage synchronously + IDB best-effort async. If IDB holds a newer `lastSaved` than localStorage (e.g. localStorage cleared), state is upgraded from IDB and re-synced to localStorage. If IDB empty but localStorage has data, IDB is primed. `reset()` clears both stores. `importSave()` routes through `_persist()`. `init()` in main.js now opens with `await store.ready` before reading state. Graceful fallback: if IDB unavailable (private browsing, etc.) everything continues with localStorage only.
13. [x] **Difficulty-adaptive question pool** *(done 2026-03-30)* — QuizEngine gains `opts.adaptive` flag. When active (Smart ON + difficulty=all + SRS off), pool is split into `_buckets{easy,medium,hard}` (shuffled). Questions are picked lazily one-at-a-time via `_pickAdaptive()` after each answer. Per-tier desire weight: acc<60%→acc (de-emphasise: too hard), acc>70%→1-acc (de-emphasise: too easy), 60-70%→1.0 (in-zone: keep serving). Sliding window: last 8 answers per tier; needs ≥3 before overriding neutral weight. `adaptiveStats` getter exposes live per-tier accuracy for UI. `progress.total` reports `_totalCount` (stable count, not growing session array). Quiz header Smart badge updated to show live E:xx% M:xx% H:xx% colour-coded (green=in-zone, red=too hard, yellow=too easy). Complementary with Item 2 (historical pool pre-weighting): adaptive selection works within the pre-weighted pool.

### Network Automation Scripting Module *(done 2026-03-27)*
- [x] `js/engine/ScriptingEngine.js` — pattern-match validator for Python/bash labs; 10 check types; no external runtime required (100% offline)
- [x] 10 scripting labs: Netmiko basics, config push, multi-device loop, show-output parsing, config backup, bash ping sweep, bash config backup, YAML inventory, error handling, RESTCONF API
- [x] `renderScripting()` in main.js — 3-tab view (Labs / Theory / Quick Ref); code editor with syntax-aware placeholder; run + validate; per-check pass/fail feedback
- [x] 40 new questions added (Network Automation domain): Netmiko/Paramiko, Ansible, Python basics for net, RESTCONF/NETCONF, Bash scripting, SSH/SCP automation
- [x] Nav button "⌨ Scripting" added to sidebar; VIEW_LABELS entry; switchView case
