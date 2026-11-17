// The page-wide energy's numbers (energy-overlay.ts), kept apart so the overlay's logic stays under the file ceiling.
// Every value is a judgement made by eye on Eric's screenshots; the reason for each sits beside it.

export const ORBIT_GLYPHS = ['0', '1', '0', '1', '0', '1', '0x', 'fn', '->', '::', '{}', 'u8', 'ff', 'c9']; // short: a swarm, not words
export const OUT_GLYPHS = ['0', '1', '0', '1', '0x', 'fn', 'let', '->', '::', '{}', 'impl', 'u8', 'ff', 'c9'];
export const FIGURE_SRC = '/eric/eric-v11-figure.webp';
export const SLOTS = { desk: 150, phone: 110, minShare: 0.75 }; // places on the orbit: the horizon, thin enough to read as one
export const SLOT_JITTER = 0.3, NEAR_FAST = 0.14; // slots: even but not a ruler; the near side sweeps faster (~1.8x on screen)
export const DEPTH_S = [0.6, 1.6] as const, GROW = 0.35; // glyph scale, far side .. near side (alpha: the palette's farA .. 1); the near side's growth at full mass
export const SPAWN_PER_S = { charge: 170, mass: 230 }; // entering from the screen's edges: at full charge, then more as he fills
export const PRESS_GLYPHS = 36, PRESS_INSET = [120, 200] as const; // the press answers at once: glyphs already on their way in
export const DIVE_PER_S = 40, DIVE_MASS = 1.5; // pulled off the orbit into him at full charge, up to 2.5x at full mass
export const ABSORB_FROM = 0.2, MASS_FULL = 500; // a moment of gathering first (anticipation); glyphs absorbed for a full-power release: about 6 s of holding
export const LANE = 0.07, MASS_SQUEEZE = 0.5; // the two lanes' spread; it compresses as he charges and fills
export const SPIN = { base: 0.6, charge: 2.2, mass: 2.4 }; // rad/s: ever faster with the charge and with what he holds
export const FAR_JOIN = 0.55; // rad: glyphs from above join behind his shoulders' ends, never down past his head
export const CAPTURE_PX = 80, GATHER_MAX_S = 1.2, GATHER_SPEED = { base: 800, charge: 900, mass: 700 }; // px/s: quick enough that the first glyphs reach him inside a short tap-hold
export const DIVE_BEHIND = -0.45, DWELL_S = 0.25, DIVE_S = 0.9, DIVE_LEAD = 2.4, ARRIVE_LEAD_S = 0.22; // sin of the orbit angle: nothing falls in from behind him
export const DIVE_S0 = [0.9, 1.3] as const, DIVE_END = 0.65; // a falling glyph: about its orbit size, shrinking as it goes into him
export const DIVE_FROM_FILL = 0.8, DIRECT = 0.4; // the orbit is thinned into him only while this full; share of arrivals that fall straight in
export const TRAIL = [0.5, 0.32, 0.18], TRAIL_S = 0.06, TRAIL_SHRINK = 0.86; // the copies behind a falling glyph, so the eye follows the stream in
export const STREAMS = [0.24, 0.38, 0.52, 0.68, 0.84], STREAM_JITTER = 0.012; // figure-width columns where the streams enter him
// Eric (round 12b): the field "can be around me", head included, so some of what falls in goes into his head: from
// the side it was on, curving in over a temple or the crown, never straight down onto it (no line from his head).
// It ends on the face oval and dissolves over the last stretch outside it (`fade`, of the oval's radius: tighter
// than the 1.3 every other glyph keeps, which hid the whole approach), so his features stay crisp.
export const HEAD_DIVE = { share: 0.2, mass: 0.25, rim: 1, fade: 1.15, deg: [[-170, -105], [-75, -10]] } as const;
export const REACH = { tap: 250, far: [0.55, 1.5] as const }; // px at the weakest; share of the way to the screen's edge at full
export const TAU_S = { base: 0.21, lead: 1.3, rest: [0.7, 1] as const }, TWIST = 0.35; // ease-out time of a flight, one for every side so none lags; spin a flung orbit glyph keeps
export const LEAD = { share: 0.25, size: 1.4 }; // the burst's front: the first quarter out are bigger, white-hot and faster
export const HOT_S = [0.15, 0.4] as const, BIRTH_S = 1.55, OUT_TRAIL_S = 0.25; // leaving his outline: ~20 px and white-hot, then it cools; a short smear at first
export const LIFE_S = { base: 0.9, power: 0.3 }, DRAIN_PER_S = 1.8, SURGE_MS = 1300;
export const QUIET_MS = 250, FONT_PX = 13, FONT_PHONE_PX = 11, PHONE_W = 600;
export const HAZE = { orbit: 0.7, dive: 0.7, rRef: 400, twinkle: 3, flare: 1.5 }; // strength per glyph; radius from the palette at rRef
export const SPACING = 1.15; // glyph heights: no glyph in orbit is drawn this close to one already drawn this frame
export const FULL_HZ = 1.2, FULL_FROM = 0.9; // once he holds all he can, the haze breathes: holding longer adds nothing
export const STAGE_FADE = [0.78, 0.98] as const; // the hero canvas dissolves into the page over this share of its height
// half-width of the column under his face where the orbit fades out (figure widths); wider on the far side, which
// rises to his head's height once swollen and must pass behind him there
export const NECK_COL = 0.3, FAR_COL = 0.5, TAU = 2 * Math.PI;
export const SMALL_W = 1280, SMALL_MIN = 0.42; // narrower screens get a proportional share of the glyphs, never under 42 %
export const MIN_PITCH = 19 * (Math.PI / 180); // the fury's precession never tips the plane flatter than this (energy-orbit.ts)
// The release's centre (figure heights): his chin, so rays up leave round his head and rays down leave his chest.
// Downward rays that would start below the fold start where the orbit's near side is, at most LOW_PX above the bottom.
export const BURST_Y = 0.52, LOW_PX = 90;
export const DOWN_FROM = 0.35; // ...anywhere from this share of the way there, so they do not start in one band
export const SEC_AT_S = 0.2; // ?debug: the on-screen spread of the release is counted this long after it
