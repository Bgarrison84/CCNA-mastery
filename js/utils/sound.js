/**
 * sound.js — Retro 8-bit soundscape via Web Audio API
 *
 * All sounds are synthesised at runtime (no audio files required — 100% offline).
 * Uses square-wave oscillators for that classic 8-bit / chiptune feel.
 *
 * Public API:
 *   playSound(name, store)  — plays a named sound if sfx is enabled
 *   SOUND_NAMES             — array of all valid sound names
 */

let _ctx = null;

function getCtx() {
  if (!_ctx) {
    try { _ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { return null; }
  }
  // Resume if suspended (browser autoplay policy)
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

/**
 * Play a single square-wave tone.
 * @param {number} freq      Frequency in Hz
 * @param {number} startTime AudioContext time to start
 * @param {number} duration  Duration in seconds
 * @param {number} gain      Peak gain (0–1)
 */
function tone(ctx, freq, startTime, duration, gain = 0.18) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, startTime);

  // Quick attack, slight release for less harshness
  env.gain.setValueAtTime(0, startTime);
  env.gain.linearRampToValueAtTime(gain, startTime + 0.005);
  env.gain.setValueAtTime(gain, startTime + duration - 0.015);
  env.gain.linearRampToValueAtTime(0, startTime + duration);

  osc.connect(env);
  env.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

/**
 * Sound definitions — each is an array of [freq, offsetSec, durationSec, gain?]
 */
const SOUNDS = {
  // Correct answer: quick ascending two-tone blip
  correct: [
    [523.25, 0,      0.07],   // C5
    [659.25, 0.07,   0.10],   // E5
  ],

  // Wrong answer: low descending buzz
  wrong: [
    [220, 0,    0.06],
    [185, 0.06, 0.10],
    [155, 0.14, 0.12, 0.14],
  ],

  // XP gain: short high blip
  xp: [
    [880, 0, 0.05, 0.12],
  ],

  // Boss hit (player takes damage): low thud
  bossHit: [
    [120, 0,    0.04, 0.22],
    [90,  0.04, 0.09, 0.16],
  ],

  // Boss victory fanfare: ascending 4-note arpeggio
  victory: [
    [261.63, 0,    0.10],  // C4
    [329.63, 0.10, 0.10],  // E4
    [392.00, 0.20, 0.10],  // G4
    [523.25, 0.30, 0.22],  // C5
  ],

  // Level-up: triumphant 6-note fanfare
  levelUp: [
    [261.63, 0,    0.08],  // C4
    [329.63, 0.08, 0.08],  // E4
    [392.00, 0.16, 0.08],  // G4
    [523.25, 0.24, 0.08],  // C5
    [659.25, 0.32, 0.08],  // E5
    [783.99, 0.40, 0.22],  // G5
  ],

  // Quiz session start: quick ready blip
  sessionStart: [
    [440, 0,    0.06],
    [554, 0.07, 0.06],
    [659, 0.14, 0.10],
  ],

  // Navigation click: minimal tick
  click: [
    [1046, 0, 0.03, 0.08],
  ],
};

export const SOUND_NAMES = Object.keys(SOUNDS);

/**
 * Play a named sound effect.
 * Respects store.state.settings.sfxEnabled.
 * Safe to call when AudioContext is unavailable.
 *
 * @param {string} name  Key from SOUNDS
 * @param {object} store Store instance (may be null for standalone use)
 */
export function playSound(name, store = null) {
  // Respect mute setting
  if (store && store.state?.settings?.sfxEnabled === false) return;

  const def = SOUNDS[name];
  if (!def) return;

  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  def.forEach(([freq, offset, dur, gain]) => tone(ctx, freq, now + offset, dur, gain));
}
