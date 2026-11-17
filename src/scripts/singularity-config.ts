// Tunables and fixed geometry of the Singularity hero. Every number a reviewer might ask about lives here.

export const CONFIG = {
  particles: 90000, // bits in the disk on the top GPU tier (lower tiers draw a share of these)
  autoPulse: 7, // seconds between pulses when nobody interacts
  bloom: 1.0,
  dprCap: 2,
  build: [0.9, 2.9] as const, // the figure builds in over this window (seconds)
  firstPulse: 3.3,
  chargeMs: 1800, // a full charge
  pressMs: 180, // a touch held this long starts charging; shorter is a tap
  moveSlopPx: 10, // a touch that drifts further than this is a scroll, never a pulse
  fpsIdle: 30, // frame cap after 20 s without input, on save-data, or on low battery
  idleMs: 20000,
} as const;

// discY: the disk's centre sits on his chest, at the page orbit's centre (ORBIT.cy of his height, energy-orbit.ts);
// at 760 it ringed his collar and read as his neck tightening (Eric round 10)
export const FIG = { w: 1309, h: 1201, axisX: 790, discY: 841, headC: [800, 300] as const };
export const FIG_HEAD_TOP = 40; // figure px from the top edge to the crown of his head
export const FIG_BOTTOM = { land: 1.02, stacked: 0.84 }; // where his feet sit, as a fraction of canvas height
// Glyph atlas cells, in order: binary and maths first, then short code tokens (Eric 2026-11-16: "I wanna codes,
// binaries and so much more"). The shaders index this list, so keep CODE_GLYPH_FIRST in step with it.
export const GLYPHS = [
  '0', '1', 'A', 'F', '7', '3', 'E', '9', '∑', '∫', '∂', 'ψ', 'λ', 'π', '∞', '⊗',
  'fn', 'let', 'impl', '->', '::', '{}', '0x', 'pub', 'mut', '=>', '&&', '[]', '<>', ';', 'Ok', '#',
];
export const CODE_GLYPH_FIRST = 16; // the first code token's atlas index
export const CODE_GLYPH_N = 16; // how many code tokens there are
export const PHONE_DPR_CAP = 2; // phones draw the figure at device resolution: a lower buffer reads soft (audit round 9)
export const PHONE_BLOOM = 0.5; // phones: bloom over the figure, so the hologram keeps its cyan face
export const PHONE_EXPOSURE = 0.8; // phones: the composite's exposure, which whited the figure out at 390 px
export const ASSETS = { fig: '/eric/eric-v11-figure.webp', aux: '/eric/eric-v11-aux.webp', trace: '/eric/eric-v11-region.webp' };

export const RIB_STRIDE = 7; // x, y | side, intensity | r, g, b
export const RIB_MAX = 96000; // ribbon vertices per frame (network edges, quantum wires)
export const DOT_STRIDE = 7; // x, y | r, g, b, a | size
export const DOT_MAX = 8192; // points per frame: the compute chips, tiles and towers are made of them
export const GLYPH_STRIDE = 8; // x, y | r, g, b, a | size | atlas index
export const GLYPH_MAX = 4096; // glyph particles per frame: the data field around him, its rain and the release burst

// The world's computing network: a deep 3D field of nodes joined by thin edges.
export const NET = {
  nodes: 380,
  neighbours: 2, // traces per node to its nearest neighbours in the field: fewer, so the chips read as chips
  roots: 6, // nodes that carry his traffic out into the field
  hopDelay: 0.075, // seconds for a release to relay one hop node to node
  idleRate: 4.5, // packets per second flowing out from him when nobody touches it
  chargeRate: 14, // packets per second gathering into him while charging
  maxPackets: 320,
  spread: 0.62, // field half-extent as a fraction of the canvas
  pull: 0.2, // how far nodes lean toward him at full charge
  spin: 0.03, // radians per second the field turns, slowly enough to read as a world
} as const;

// A release's energy relay: how long a release takes to reach each launch node, by distance. Times are seconds.
// Nothing line-like is drawn for it (Eric 2026-11-16: no line may leave his body); the timing sets the strike.
export const RELAY = {
  count: 26, // launch nodes, one per sector of the field around him
  growMin: 0.6,
  growMax: 1.5,
  growPerH: 1.6, // seconds of relay per canvas height of travel
} as const;

// The quantum layer behind him. Its share of the elements follows the GPU tier (see singularity-govern).
export const QUANTUM_DENSITY = { high: 1, mid: 0.6, low: 0.3 } as const;

// Governor: frame-time thresholds (ms) and the resolution steps they drive.
export const GOV = {
  p90Hi: 20,
  p90Lo: 12,
  calmMs: 5000,
  // under load the governor sheds disk particles (workScale), never canvas resolution: the figure stays sharp
  workStep: 0.25,
  workMin: 0.5,
  probeFrames: 30,
  probeSlowMs: 24,
} as const;

// A release's flash, surge and shock scale with how long he held (Eric round 10, O4/O6: "short tap = small burst, long
// hold = huge burst"). A tap earns TAP_GAIN of them; a full charge (k from FULL_K[0] to FULL_K[1], about 0.35 to 1.1 s
// of hold: k = 0.6 + 1.6 * charge) adds CHARGE_GAIN; the rest is earned only by what he absorbed, which takes seconds
// of holding. The auto pulse at idle keeps its approved look.
export const TAP_GAIN = 0.05;
export const CHARGE_GAIN = 0.32;
export const ABSORB_GAIN = 1 - TAP_GAIN - CHARGE_GAIN;
export const FULL_K = [0.9, 1.6] as const;
export const FLASH_DECAY = 3.2, FLASH_RING = 1.4; // per second; a full absorb rings longer (about 0.55 s instead of 0.31 s)
export const SHOCK_FAST = 0.6; // a full absorb's shock travels this much faster
export const HIT_HOLD_S = 0.08, HIT_FALL = 6.5; // a person's release: held for 80 ms, then gone within about 0.6 s
export const GLITCH_QUIET_S = 1; // no hologram glitch this soon after a release: bars across his chest read as damage
// A person's release sends a front through the computing behind him (G2): CSS px/s, and how far it carries (CSS px)
// for a tap and for a full release, so a tap's front dies close to him and a full one reaches every edge
export const WAVE_SPEED = 1650, WAVE_REACH_TAP = 300, WAVE_REACH_FULL = 2600, WAVE_LIFE_S = 2;
