// The circle's temper (energy-overlay.ts). Eric (2026-11-17, round 12): "the white circle should expand in size and
// behave violently". Before, it drew in as he charged and read as calm. Now, as the charge and what he holds rise,
// the orbit swells to about 1.9x, its radius surges in beats that never line up, its plane precesses (the tilt
// circles round like a spinning top's, faster as it fills) and shudders, and now and then it flares: a sudden swell
// that kicks the radius out and lights it, gone in a blink. Every term is zero at rest and grows with `v`, so a tap
// still shows the calm circle and 1 s, 3 s and 6 s of holding look different. Sines, not noise: smooth at 60 Hz.

const DEG = Math.PI / 180, TAU = 2 * Math.PI;
const GROW = { charge: 0.2, mass: 0.7 }; // radius added at full charge, then by what he holds: 1.9x at full (round 12b: 1.5 s and 5 s must differ)
const SURGE = [[0.09, 5.3], [0.035, 11.7], [0.025, 2.1]] as const; // [share of radius, rad/s]: beating pulses
const PRECESS = { deg: 12, hz: [0.3, 1.4] } as const; // the plane's tilt circles round this far, this fast: visible in one frame
const SHUDDER = { deg: 1.8, rad: [53, 71, 89] } as const; // a fast tremor of roll and pitch on top
const YAW_WOBBLE = { deg: 5, rad: 1.7 } as const;
const FLARE = { perS: 1.8, kick: 0.35, tauS: 0.16 } as const; // at full fury: about two swells a second
const JITTER = 0.045; // each glyph shivers radially by up to this share of the radius at full fury

export interface Fury {
  v: number; // 0 calm .. 1 all he can hold
  grow: number; // the radius's steady multiplier (the orbit caps it to the screen, energy-orbit.ts)
  beat: number; // added on top, uncapped: the surges and flares, so the violence still shows on a full screen
  pitch: number; roll: number; yaw: number; // radians added to the plane's own
  jitter: number; // share of the radius a glyph may shiver
  flare: number; // 0..1, decaying: brightness and kick of the last flare
}

const smoothstep = (v: number): number => { const k = Math.max(0, Math.min(1, v)); return k * k * (3 - 2 * k); };

export function makeFury(): (dt: number, t: number, live: number, k: number) => Fury {
  let phase = 0, flare = 0;
  return (dt, t, live, k) => {
    // half from the charge (the first 1.8 s), half from what he holds (on to about 6 s); let go and it is gone
    const v = Math.min(1, 0.5 * live ** 1.5 + 0.5 * k * live);
    phase += TAU * (PRECESS.hz[0] + (PRECESS.hz[1] - PRECESS.hz[0]) * v) * dt;
    flare *= Math.exp(-dt / FLARE.tauS);
    if (Math.random() < FLARE.perS * v * v * dt) flare = 1;
    let surge = 0;
    SURGE.forEach(([a, w], i) => { surge += a * Math.sin(w * t + i * 2.1); });
    const shudder = (i: number): number => SHUDDER.deg * DEG * v * Math.sin(SHUDDER.rad[i] * t + i);
    const tilt = PRECESS.deg * DEG * v;
    return {
      v,
      grow: 1 + GROW.charge * smoothstep(live) + GROW.mass * k * live,
      beat: surge * v + FLARE.kick * flare,
      pitch: tilt * Math.cos(phase) + shudder(0),
      roll: tilt * Math.sin(phase) + shudder(1),
      yaw: YAW_WOBBLE.deg * DEG * v * Math.sin(YAW_WOBBLE.rad * t) + shudder(2) * 0.5,
      jitter: JITTER * v + 0.03 * flare,
      flare,
    };
  };
}
