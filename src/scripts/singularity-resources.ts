// The hero's GPU resources, built once per context: the glyph atlas, the bit disk (transform feedback),
// the figure mesh, the vapour, the ribbon and dot streams, and the programs for the post chain.
import * as S from './singularity-shaders';
import { type glKit, type Halo, type Program } from './singularity-gl';
import { DOT_MAX, DOT_STRIDE, FIG, GLYPH_MAX, GLYPH_STRIDE, GLYPHS, RIB_MAX, RIB_STRIDE } from './singularity-config';
import type { Vapour } from './singularity-figure';

export type Kit = ReturnType<typeof glKit>;
export interface Images { fig: HTMLImageElement; aux: HTMLImageElement; trace: HTMLImageElement }

export interface Res {
  tFig: WebGLTexture; tAux: WebGLTexture; tTr: WebGLTexture; tAtlas: WebGLTexture; tHalo: WebGLTexture;
  pBG: Program; pSim: Program; pDisk: Program; pMesh: Program; pVap: Program; pRib: Program; pDot: Program;
  pDown: Program; pUp: Program; pComp: Program;
  vFS: WebGLVertexArrayObject;
  vSim: WebGLVertexArrayObject[]; vDisk: WebGLVertexArrayObject[]; tfo: WebGLTransformFeedback[]; bS: WebGLBuffer[];
  vMesh: WebGLVertexArrayObject; nIdx: number;
  vVap: WebGLVertexArrayObject; nVap: number;
  vRib: WebGLVertexArrayObject; ribBuf: WebGLBuffer; ribData: Float32Array;
  vDot: WebGLVertexArrayObject; dotBuf: WebGLBuffer; dotData: Float32Array;
  pGlyph: Program; vGlyph: WebGLVertexArrayObject; glyphBuf: WebGLBuffer; glyphData: Float32Array;
}

// 8x8 cells of 64 px: the shaders index them as (mod(g,8), floor(g/8)). Tokens wider than CELL_INK are shrunk to fit.
const CELL = 64, ATLAS_CELLS = 8, ATLAS = CELL * ATLAS_CELLS, CELL_INK = 56;
const FACE = '"JetBrains Mono Variable","JetBrains Mono",ui-monospace,Menlo,Consolas,"Cambria Math",serif';

function glyphAtlas(): HTMLCanvasElement {
  const at = document.createElement('canvas');
  at.width = at.height = ATLAS;
  const ax = at.getContext('2d')!;
  ax.fillStyle = '#fff'; ax.textAlign = 'center'; ax.textBaseline = 'middle';
  GLYPHS.forEach((g, i) => {
    const weight = i < 8 ? 700 : 500;
    let px = i < 8 ? 46 : 44;
    ax.font = `${weight} ${px}px ${FACE}`;
    const w = ax.measureText(g).width;
    if (w > CELL_INK) { px = Math.floor((px * CELL_INK) / w); ax.font = `${weight} ${px}px ${FACE}`; }
    ax.fillText(g, (i % ATLAS_CELLS) * CELL + CELL / 2, Math.floor(i / ATLAS_CELLS) * CELL + CELL / 2 + 3);
  });
  return at;
}

export function createResources(gl: WebGL2RenderingContext, K: Kit, img: Images, halo: Halo, vapour: Vapour, maxN: number, rnd: () => number): Res {
  const tFig = K.tex(img.fig), tAux = K.tex(img.aux), tTr = K.tex(img.trace), tAtlas = K.tex(glyphAtlas()), tHalo = K.texR8(halo.data, halo.w, halo.h);
  [tFig, tAtlas].forEach((t) => {
    gl.bindTexture(gl.TEXTURE_2D, t); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  });

  const pBG = K.prog(S.VS_FS, S.FS_BG), pSim = K.prog(S.VS_SIM, S.FS_NULL, ['oS']), pDisk = K.prog(S.VS_DISK, S.FS_POINT), pMesh = K.prog(S.VS_MESH, S.FS_MESH),
    pVap = K.prog(S.VS_VAPOR, S.FS_POINT), pRib = K.prog(S.VS_RIB, S.FS_RIB), pDot = K.prog(S.VS_DOT, S.FS_DOT), pGlyph = K.prog(S.VS_GLYPH, S.FS_GLYPH),
    pDown = K.prog(S.VS_FS, S.FS_DOWN), pUp = K.prog(S.VS_FS, S.FS_UP), pComp = K.prog(S.VS_FS, S.FS_COMP);
  const vFS = gl.createVertexArray()!;
  const fsBuf = K.buffer(new Float32Array([-1, -1, 3, -1, -1, 3]));
  [pBG, pDown, pUp, pComp].forEach((P) => K.bindAttr(P, vFS, 'aP', fsBuf, 2));

  // the disk: every bit starts far out and falls in; state ping-pongs between two buffers
  const S0 = new Float32Array(maxN * 4), KS = new Float32Array(maxN * 4);
  for (let i = 0; i < maxN; i++) {
    const u = rnd();
    const r0 = u < 0.1 ? 0.46 + 0.05 * rnd() : u < 0.8 ? 0.52 + 1.0 * Math.pow(rnd(), 1.3) : 1.45 + 0.9 * rnd();
    const a = rnd() * Math.PI * 2, R = 1.8 + rnd() * 1.6;
    S0.set([Math.cos(a) * R, Math.sin(a) * R, 0, 0], i * 4);
    KS.set([r0, rnd(), rnd(), rnd()], i * 4);
  }
  const bS = [K.buffer(S0, gl.DYNAMIC_COPY), K.buffer(S0, gl.DYNAMIC_COPY)], bK = K.buffer(KS);
  const vSim = [0, 1].map((i) => { const v = gl.createVertexArray()!; K.bindAttr(pSim, v, 'aS', bS[i], 4); K.bindAttr(pSim, v, 'aK', bK, 4); return v; });
  const vDisk = [0, 1].map((i) => { const v = gl.createVertexArray()!; K.bindAttr(pDisk, v, 'aS', bS[i], 4); K.bindAttr(pDisk, v, 'aK', bK, 4); return v; });
  const tfo = [0, 1].map((i) => {
    const t = gl.createTransformFeedback()!; gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, t);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, bS[1 - i]); return t;
  });
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null); gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);
  gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);

  // the figure: a grid over his silhouette, displaced by the shader
  const mUV: number[] = [], mIdx: number[] = [];
  {
    const step = 6, cols = Math.floor(FIG.w / step) + 1, rows = Math.floor(FIG.h / step) + 1;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) mUV.push(Math.min(i * step, FIG.w) / FIG.w, Math.min(j * step, FIG.h) / FIG.h);
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) { const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1; mIdx.push(a, b, c, b, d, c); }
  }
  const vMesh = gl.createVertexArray()!;
  K.attr(pMesh, vMesh, 'aUV', new Float32Array(mUV), 2);
  gl.bindVertexArray(vMesh);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(mIdx), gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  const vVap = gl.createVertexArray()!;
  K.attr(pVap, vVap, 'aUV', new Float32Array(vapour.uv), 2);
  K.attr(pVap, vVap, 'aR', new Float32Array(vapour.r), 4);

  // ribbons (the network edges, quantum wires) and dots (nodes, packets): rebuilt every frame
  const ribData = new Float32Array(RIB_MAX * RIB_STRIDE);
  const vRib = gl.createVertexArray()!;
  const ribBuf = K.buffer(ribData, gl.DYNAMIC_DRAW);
  gl.bindVertexArray(vRib); gl.bindBuffer(gl.ARRAY_BUFFER, ribBuf);
  ([['aP', 2, 0], ['aQ', 2, 8], ['aC', 3, 16]] as const).forEach(([n, size, off]) => {
    const loc = gl.getAttribLocation(pRib.p, n); gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, RIB_STRIDE * 4, off);
  });
  gl.bindVertexArray(null);

  const dotData = new Float32Array(DOT_MAX * DOT_STRIDE);
  const vDot = gl.createVertexArray()!;
  const dotBuf = K.buffer(dotData, gl.DYNAMIC_DRAW);
  gl.bindVertexArray(vDot); gl.bindBuffer(gl.ARRAY_BUFFER, dotBuf);
  ([['aP', 2, 0], ['aC', 4, 8], ['aS', 1, 24]] as const).forEach(([n, size, off]) => {
    const loc = gl.getAttribLocation(pDot.p, n); gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, DOT_STRIDE * 4, off);
  });
  gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);

  const glyphData = new Float32Array(GLYPH_MAX * GLYPH_STRIDE);
  const vGlyph = gl.createVertexArray()!;
  const glyphBuf = K.buffer(glyphData, gl.DYNAMIC_DRAW);
  gl.bindVertexArray(vGlyph); gl.bindBuffer(gl.ARRAY_BUFFER, glyphBuf);
  ([['aP', 2, 0], ['aC', 4, 8], ['aS', 1, 24], ['aG', 1, 28]] as const).forEach(([n, size, off]) => {
    const loc = gl.getAttribLocation(pGlyph.p, n); gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, GLYPH_STRIDE * 4, off);
  });
  gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return {
    pGlyph, vGlyph, glyphBuf, glyphData,
    tFig, tAux, tTr, tAtlas, tHalo,
    pBG, pSim, pDisk, pMesh, pVap, pRib, pDot, pDown, pUp, pComp,
    vFS, vSim, vDisk, tfo, bS, vMesh, nIdx: mIdx.length, vVap, nVap: vapour.uv.length / 2,
    vRib, ribBuf, ribData, vDot, dotBuf, dotData,
  };
}
