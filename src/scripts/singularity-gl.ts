// WebGL2 plumbing for the Singularity hero (v11 source/main.js, typed), plus the head halo.

export type Uniforms = Record<string, WebGLUniformLocation | null>;
export interface Program { p: WebGLProgram; u: Uniforms }
export interface Target { t: WebGLTexture; f: WebGLFramebuffer; w: number; h: number }

export function glKit(gl: WebGL2RenderingContext, floatFB: boolean) {
  function sh(type: number, src: string): WebGLShader {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(`${gl.getShaderInfoLog(s)}\n${src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n')}`);
    }
    return s;
  }
  function prog(vs: string, fs: string, tfv?: string[]): Program {
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    if (tfv) gl.transformFeedbackVaryings(p, tfv, gl.SEPARATE_ATTRIBS);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link failed');
    // Uniforms the compiler optimised away stay absent; WebGL takes the missing (undefined → null) location as a no-op.
    const u: Uniforms = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i)!;
      u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }
  function bindAttr(P: Program, vao: WebGLVertexArrayObject, name: string, buf: WebGLBuffer, size: number): void {
    const loc = gl.getAttribLocation(P.p, name);
    if (loc < 0) return;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }
  function buffer(data: Float32Array, usage: number = gl.STATIC_DRAW): WebGLBuffer {
    const b = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    return b;
  }
  function attr(P: Program, vao: WebGLVertexArrayObject, name: string, data: Float32Array, size: number): WebGLBuffer {
    const b = buffer(data);
    bindAttr(P, vao, name, b, size);
    return b;
  }
  function clampLinear(): void {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  // Straight alpha: the figure's alpha is his silhouette, and premultiplying would darken his edges.
  function tex(src: TexImageSource): WebGLTexture {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    clampLinear();
    return t;
  }
  function texR8(data: Uint8Array, w: number, h: number): WebGLTexture {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    clampLinear();
    return t;
  }
  function target(w: number, h: number): Target {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (floatFB) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    clampLinear();
    const f = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, f, w, h };
  }
  return { prog, bindAttr, buffer, attr, tex, texR8, target };
}

export function load(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error(`could not load ${src}`));
    i.src = src;
  });
}

/* ---------- the head halo ---------- */
// The region mask marks his head (blue 255) against everything else (blue 84). The halo is 1 on
// the head and fades to 0 between HALO_IN and HALO_OUT figure px outside it, on a grid padded by
// HALO_PAD so the margin also covers the space above his hair.
const HALO_STEP = 4;
const HALO_PAD = 128;
const HALO_IN = 18;
const HALO_OUT = 64; // was 110: a wide halo left a visible blank clearing around his head (Eric 2026-11-16)
const HEAD_BLUE = 170;

export interface Halo {
  data: Uint8Array;
  w: number;
  h: number;
  /** Figure px → halo texture: origin x, y and size w, h. */
  rect: [number, number, number, number];
  /** 0..1 at a point in figure px. */
  at: (x: number, y: number) => number;
  /** The head's own extent in figure px (the blue-255 cells of the region mask). */
  head: { x0: number; x1: number; y0: number; y1: number };
}

export function buildHalo(region: HTMLImageElement, figW: number, figH: number): Halo {
  const w = Math.ceil((figW + 2 * HALO_PAD) / HALO_STEP);
  const h = Math.ceil((figH + 2 * HALO_PAD) / HALO_STEP);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(region, HALO_PAD / HALO_STEP, HALO_PAD / HALO_STEP, figW / HALO_STEP, figH / HALO_STEP);
  const px = x.getImageData(0, 0, w, h).data;

  // Two-pass chamfer distance (in grid cells) from the nearest head cell.
  const D = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) D[i] = px[i * 4 + 2] > HEAD_BLUE ? 0 : 1e9;
  const relax = (i: number, j: number, cost: number) => { if (D[j] + cost < D[i]) D[i] = D[j] + cost; };
  for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) {
    const i = r * w + q;
    if (q > 0) relax(i, i - 1, 1);
    if (r > 0) { relax(i, i - w, 1); if (q > 0) relax(i, i - w - 1, Math.SQRT2); if (q < w - 1) relax(i, i - w + 1, Math.SQRT2); }
  }
  for (let r = h - 1; r >= 0; r--) for (let q = w - 1; q >= 0; q--) {
    const i = r * w + q;
    if (q < w - 1) relax(i, i + 1, 1);
    if (r < h - 1) { relax(i, i + w, 1); if (q < w - 1) relax(i, i + w + 1, Math.SQRT2); if (q > 0) relax(i, i + w - 1, Math.SQRT2); }
  }
  const data = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const t = Math.min(Math.max((D[i] * HALO_STEP - HALO_IN) / (HALO_OUT - HALO_IN), 0), 1);
    data[i] = Math.round((1 - t * t * (3 - 2 * t)) * 255);
  }
  const at = (fx: number, fy: number): number => {
    const q = Math.round((fx + HALO_PAD) / HALO_STEP), r = Math.round((fy + HALO_PAD) / HALO_STEP);
    return q < 0 || r < 0 || q >= w || r >= h ? 0 : data[r * w + q] / 255;
  };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) {
    if (px[(r * w + q) * 4 + 2] <= HEAD_BLUE) continue;
    const fx = q * HALO_STEP - HALO_PAD, fy = r * HALO_STEP - HALO_PAD;
    x0 = Math.min(x0, fx); x1 = Math.max(x1, fx); y0 = Math.min(y0, fy); y1 = Math.max(y1, fy);
  }
  return { data, w, h, rect: [-HALO_PAD, -HALO_PAD, w * HALO_STEP, h * HALO_STEP], at, head: { x0, x1, y0, y1 } };
}
