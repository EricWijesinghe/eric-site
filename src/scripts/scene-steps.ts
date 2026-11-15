// A step rail: the stages of one process as numbered stations on a hairline, with a token riding
// between them. It is how each scene names its mechanism on the canvas. The rail takes a float
// position (0..n-1), so a still frame and an animated frame draw the same thing.
import { caption, hair, hairline, ink, PALETTE as P, stroke, tint } from './scene-core';
import { lineW } from './scene-core';

export interface Box {
  x: number;
  y: number;
  w: number;
}

/** Stations narrower than this drop their names and keep only the active one (phone width). */
const NAME_MIN_W = 84;
const STATION_R = 4;
const TOKEN_R = 3.2;
// Label baselines under the rail. Narrow rails show three-letter tags, then the active name on its own line,
// so no label lands on the chip rows below (scene-core chipY). Wide rails keep the full names on one line.
const NAME_Y = 22;
const TAG_Y = 22;
const ACTIVE_Y = 42;
const TAG_LEN = 3;
const TAG_HALF = 11; // half a three-letter mono tag, to centre it under its station

/**
 * Draws the rail at `box.y`. Stations up to the token are lit; the active name is drawn under the
 * rail, and every name when there is room for all of them.
 */
export function drawRail(g: CanvasRenderingContext2D, box: Box, labels: readonly string[], pos: number): void {
  const n = labels.length;
  const at = (i: number): number => box.x + ((i + 0.5) * box.w) / n;
  const p = Math.min(n - 1, Math.max(0, pos));
  const active = Math.round(p);

  g.lineWidth = lineW(1);
  g.strokeStyle = hairline(0.22);
  g.beginPath();
  g.moveTo(at(0), box.y);
  g.lineTo(at(n - 1), box.y);
  g.stroke();

  // The lit track runs from the first station to the token.
  g.strokeStyle = stroke('cyan', 0.7);
  g.lineWidth = lineW(1.5);
  g.beginPath();
  g.moveTo(at(0), box.y);
  g.lineTo(at(0) + (at(n - 1) - at(0)) * (p / (n - 1)), box.y);
  g.stroke();

  const showAll = box.w / n >= NAME_MIN_W;
  labels.forEach((name, i) => {
    const x = at(i);
    const lit = i <= p + 0.01;
    g.fillStyle = lit ? tint('cyan', 0.9) : `rgb(${hair()} / 0.3)`;
    g.beginPath();
    g.arc(x, box.y, STATION_R, 0, Math.PI * 2);
    g.fill();
    if (showAll) caption(g, name, x - name.length * 3.6, box.y + NAME_Y, ink(lit ? 0.85 : 0.45));
    else caption(g, name.slice(0, TAG_LEN), x - TAG_HALF, box.y + TAG_Y, ink(lit ? 0.85 : 0.45));
  });

  g.fillStyle = P.ice;
  g.beginPath();
  g.arc(at(0) + (at(n - 1) - at(0)) * (p / (n - 1)), box.y, TOKEN_R, 0, Math.PI * 2);
  g.fill();

  if (!showAll) caption(g, `${active + 1} / ${n} · ${labels[active]}`, box.x, box.y + ACTIVE_Y, ink(0.9));
}

/** Index position of a looping process: `t` seconds into a loop of `n` stations, `dwell` seconds each. */
export const railPos = (t: number, n: number, dwell: number): number => ((t / dwell) % n + n) % n;
