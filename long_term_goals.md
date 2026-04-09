# Long-Term Goals — CCNA Mastery

Features that are desirable but require significant design or engineering investment.
Not scheduled for any current phase. Revisit when the core feature set is stable.

---

## 1. Visual Traceroute Animation ✓ DONE 2026-04-09

**Concept:**
After a student completes a routing or multi-hop lab, a packet animation plays across an
inline topology diagram. A glowing dot (the "packet") travels hop-by-hop along the path,
pausing briefly at each router to show the routing decision (destination, next-hop, interface).

**Success behaviour:**
The packet reaches the destination and a "Connection Established" banner flashes.

**Failure behaviour:**
The packet travels as far as it can, then burns up / explodes at the failure point
(e.g., a missing route, wrong subnet mask, or interface that is shut down).
A tooltip indicates what went wrong at that hop.

**Implementation notes:**
- Topology diagram: HTML/CSS or inline SVG — no external images, 100% offline
- Packet animation: CSS `transition` moving an absolutely-positioned `<div>` along waypoints
  defined as `[x, y]` coordinates in the lab's topology data
- Failure point derived from the lab's `validate()` result — whichever device/interface
  fails first determines where the burn-up animation triggers
- Optional: user can click any router mid-animation to inspect its routing table at that moment
- Ties into the existing multi-device Terminal engine (`devices{}` wrapper)

---

## 2. Glossary Hover-Over (Inline Definitions) ✓ DONE 2026-04-09

**Concept:**
Technical terms throughout the app (in question text, story beats, lab descriptions,
reference panels) get a subtle dotted underline. Tapping or hovering over the term
shows a compact tooltip with a plain-English one-sentence definition.

**Example:**
"Configure **OSPF** on the router" — hover "OSPF" → tooltip: "A link-state routing
protocol where routers share full topology maps to calculate the shortest path."

**Implementation notes:**
- A `GLOSSARY` constant (object) maps term strings to definitions — ~150 terms to start
- A `_glossarize(htmlString)` helper wraps matched terms in `<abbr class="glossary-term">` tags
- Applied to: story beat narrative text, lab description/objectives, quiz explanations,
  reference section body text
- Tooltip: CSS + JS, positioned above/below the term, dismisses on click-outside or Escape
- Mobile: tap to show, tap again to dismiss (no hover dependency)
- Terms are matched case-insensitively; only the first occurrence per visible text block
  is wrapped (avoids visual clutter)
- Must work fully offline — no external dictionary API

---

## 3. Moving Character Animation (Story Progression)

**Concept:**
A side-scrolling or walking character animation that plays as the learner progresses
through Story Mode beats — similar to the Google Chrome Dinosaur Game aesthetic but
mapped to the CCNA narrative (network engineer character, server rack obstacles, etc.).

**Inspiration:**
Google Chrome's offline Dinosaur Game — simple, charming, and infinitely engaging
despite being built from trivial graphics. The character jumps over obstacles,
celebrates milestones, and reacts to player performance.

**How it could work in CCNA Mastery:**
- A pixel-art or CSS-drawn character walks left-to-right at the top of the Story Mode view
- The character's position on the "road" corresponds to progress through the 6-week story arc
  (week 1 = start of road, week 6 = destination city / data centre)
- Completing a story beat advances the character by one step; completing a lab makes
  the character jump or do a celebratory animation
- Wrong answers on a boss battle cause the character to stumble or look worried
- Reaching a new week unlocks a new background segment (office → server room → cloud → etc.)

**Design principles:**
- Character and backgrounds built entirely from CSS shapes / ASCII art / inline SVG
  — no external image assets, works offline
- Animation driven by CSS keyframes + JS class toggling; no canvas or WebGL required
- Should not be distracting during active quizzes — only visible/animated in Story Mode
  and on transition screens
- Must be skippable / hideable via a settings toggle for learners who find it distracting

**Stretch goal:**
An idle animation loop (character taps on keyboard, drinks coffee) when no activity
has been detected for 30+ seconds — adds life to long reading sessions.
