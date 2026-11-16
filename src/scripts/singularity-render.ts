// The hero's draw passes, in order: the void (with the shock shell); the far side of the disk, the network and
// the quantum layer (behind him); the figure mesh and vapour; the near side of the disk; then bloom and the
// composite, where the shock refracts the whole image and the light theme maps luminance onto a pearl page.
import { DOT_STRIDE, FIG, GLYPH_STRIDE, RIB_STRIDE } from './singularity-config';
import type { Program, Target } from './singularity-gl';
import type { Res } from './singularity-resources';
import { clamp, type Pt } from './singularity-math';

/** Everything a frame draws, computed by the engine on the CPU. */
export interface Shot {
  W: number; H: number; DPR: number; t: number;
  fo: Pt; s: number; U: number; // figure origin (device px), figure scale, disk radius
  dc: Pt; tilt: number; headC: Pt; // disk centre, disk tilt, head centre
  mouse: { x: number; y: number; on: number };
  charge: number; flash: number; boot: number; surge: number; hover: number; glitch: number; front: number;
  bloomK: number; bloomRest: number; // the bloom now, and at rest (no charge, no absorb): his face keeps the rest level
  shock: [number, number, number, number]; shockW: number; // the shock shell: centre x, y, radius, strength; limb width (device px)
  ribN: number; ribBack: number; dotN: number; glyphN: number; // ribbon vertices drawn, and how many of them are behind him; dots; glyph particles
  haloRect: [number, number, number, number];
  auraRect: [number, number, number, number]; // figure px to his glow texture (singularity-figure.ts)
  absorb: number; // 0..1, eased: what he has absorbed of the page's energy; his hologram glows with it
  hit: number; // 0..1: a person's release, held 80 ms then gone within about 0.6 s (the light theme's release)
  column: [number, number, number, number]; // the head zone's column for the sky: left, right, floor
  N: number; // disk bits drawn
  shake: Pt; // device px: the charge tremor and the release jolt, for everything around him and never for him (O5)
  head: [number, number, number, number]; // his head box, figure px: centre x, y, radii (halo.head); the shock is cut there
  light: number; // 1 in the light theme: the composite maps the scene's luminance onto a pearl page
  expo: number; // the composite's exposure: below 1 on phones, so the lit figure keeps its cyan face
}

const LIGHT_SURGE = 0.3; // the share of the figure's surge and absorbed glow the light theme draws on the figure itself

/** One physics step of the disk on the GPU (transform feedback); the caller flips the ping-pong index. */
export function stepDisk(gl: WebGL2RenderingContext, res: Res, cur: number, N: number, p: { dt: number; t: number; charge: number; pulseK: number; md: Pt; mOn: number }): void {
  const P = res.pSim;
  gl.useProgram(P.p);
  gl.uniform1f(P.u.uDt, p.dt); gl.uniform1f(P.u.uTime, p.t); gl.uniform1f(P.u.uCharge, p.charge); gl.uniform1f(P.u.uPulse, p.pulseK);
  gl.uniform2f(P.u.uMD, p.md[0], p.md[1]); gl.uniform1f(P.u.uMOn, p.mOn);
  gl.enable(gl.RASTERIZER_DISCARD);
  gl.bindVertexArray(res.vSim[cur]); gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, res.tfo[cur]);
  gl.beginTransformFeedback(gl.POINTS); gl.drawArrays(gl.POINTS, 0, N); gl.endTransformFeedback();
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null); gl.disable(gl.RASTERIZER_DISCARD); gl.bindVertexArray(null);
}

export function renderFrame(gl: WebGL2RenderingContext, res: Res, sc: Target, chain: Target[], sh: Shot, cur: number): void {
  const { W, H, DPR, t, fo, s } = sh;
  const uC = (P: Program) => {
    gl.uniform2f(P.u.uRes, W, H); gl.uniform1f(P.u.uTime, t);
    if (P.u.uDpr) gl.uniform1f(P.u.uDpr, DPR);
    if (P.u.uAtlas) gl.uniform1i(P.u.uAtlas, 2);
    if (P.u.uShake) gl.uniform2f(P.u.uShake, sh.shake[0], sh.shake[1]);
    if (P.u.uHead) gl.uniform4f(P.u.uHead, ...sh.head);
  };
  const uFig = (P: Program) => {
    const u = P.u;
    gl.uniform1i(u.uFig, 0); gl.uniform1i(u.uAux, 1); gl.uniform1i(u.uTrace, 3);
    gl.uniform2f(u.uFigSize, FIG.w, FIG.h); gl.uniform2f(u.uFO, fo[0], fo[1]); gl.uniform1f(u.uS, s); gl.uniform1f(u.uFront, sh.front);
    gl.uniform2f(u.uMouseF, (sh.mouse.x - fo[0]) / s, (sh.mouse.y - fo[1]) / s); gl.uniform1f(u.uHover, sh.hover);
  };
  const uRib = () => {
    gl.useProgram(res.pRib.p); uC(res.pRib); gl.uniform1i(res.pRib.u.uHalo, 6); gl.uniform2f(res.pRib.u.uFO, fo[0], fo[1]);
    gl.uniform1f(res.pRib.u.uS, s); gl.uniform4f(res.pRib.u.uHaloRect, ...sh.haloRect); gl.bindVertexArray(res.vRib);
  };
  const ribbons = (from: number, to: number) => { if (to > from) { uRib(); gl.drawArrays(gl.TRIANGLES, from, to - from); } };
  const disk = (pass: number) => {
    gl.blendFunc(gl.ONE, gl.ONE); gl.useProgram(res.pDisk.p); uC(res.pDisk);
    gl.uniform2f(res.pDisk.u.uDC, sh.dc[0], sh.dc[1]); gl.uniform1f(res.pDisk.u.uU, sh.U); gl.uniform1f(res.pDisk.u.uTilt, sh.tilt);
    gl.uniform1f(res.pDisk.u.uPass, pass); gl.uniform1f(res.pDisk.u.uBoot, sh.boot); gl.uniform1f(res.pDisk.u.uCharge, sh.charge);
    gl.uniform1f(res.pDisk.u.uFlash, sh.flash);
    gl.bindVertexArray(res.vDisk[cur]); gl.drawArrays(gl.POINTS, 0, sh.N);
  };

  // light theme: a surging figure saturates into one flat cyan and his face is gone (Eric round 8), so most of the
  // surge and the absorbed glow are shown by the composite there (deeper field, more saturated hologram)
  const lit = sh.light ? LIGHT_SURGE : 1;

  gl.bindBuffer(gl.ARRAY_BUFFER, res.ribBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, res.ribData, 0, sh.ribN * RIB_STRIDE);
  if (sh.dotN) { gl.bindBuffer(gl.ARRAY_BUFFER, res.dotBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, res.dotData, 0, sh.dotN * DOT_STRIDE); }
  if (sh.glyphN) { gl.bindBuffer(gl.ARRAY_BUFFER, res.glyphBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, res.glyphData, 0, sh.glyphN * GLYPH_STRIDE); }

  gl.bindFramebuffer(gl.FRAMEBUFFER, sc.f); gl.viewport(0, 0, W, H);
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, res.tFig);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, res.tAux);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, res.tAtlas);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, res.tTr);
  gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, res.tHalo);
  gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, res.tAura);

  // the void, lensed around him
  gl.useProgram(res.pBG.p); uC(res.pBG);
  gl.uniform2f(res.pBG.u.uC, sh.headC[0], (sh.headC[1] + sh.dc[1]) / 2); gl.uniform2f(res.pBG.u.uM, sh.mouse.x, sh.mouse.y);
  gl.uniform1f(res.pBG.u.uMOn, sh.mouse.on); gl.uniform1f(res.pBG.u.uU, sh.U); gl.uniform1f(res.pBG.u.uCharge, sh.charge);
  gl.uniform1f(res.pBG.u.uBoot, sh.boot); gl.uniform1f(res.pBG.u.uFlash, sh.flash);
  gl.uniform1i(res.pBG.u.uAura, 7); gl.uniform4f(res.pBG.u.uAuraRect, ...sh.auraRect); gl.uniform2f(res.pBG.u.uFO, fo[0], fo[1]);
  gl.uniform1f(res.pBG.u.uS, s); gl.uniform1f(res.pBG.u.uAbsorb, sh.light ? 0 : sh.absorb); // light: the composite draws his glow
  gl.uniform4f(res.pBG.u.uShock, ...sh.shock); gl.uniform1f(res.pBG.u.uShockW, sh.shockW); gl.uniform4f(res.pBG.u.uZone, ...sh.column);
  gl.bindVertexArray(res.vFS); gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.enable(gl.BLEND);
  disk(0); // the far side of the disk, behind him
  ribbons(0, sh.ribBack); // the network's edges and the far ring
  if (sh.dotN) {
    gl.blendFunc(gl.ONE, gl.ONE); gl.useProgram(res.pDot.p); uC(res.pDot);
    gl.bindVertexArray(res.vDot); gl.drawArrays(gl.POINTS, 0, sh.dotN);
  }
  if (sh.glyphN) { // the data field: glyph particles, added like the dots, on the atlas bound above
    gl.blendFunc(gl.ONE, gl.ONE); gl.useProgram(res.pGlyph.p); uC(res.pGlyph);
    gl.bindVertexArray(res.vGlyph); gl.drawArrays(gl.POINTS, 0, sh.glyphN);
  }

  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(res.pMesh.p); uC(res.pMesh); uFig(res.pMesh);
  gl.uniform1f(res.pMesh.u.uCell, clamp(6 * DPR / s, 6, 40)); gl.uniform1f(res.pMesh.u.uGlitch, sh.glitch);
  gl.uniform1f(res.pMesh.u.uSurge, sh.surge * lit); gl.uniform1f(res.pMesh.u.uAbsorb, sh.absorb * lit);
  gl.bindVertexArray(res.vMesh); gl.drawElements(gl.TRIANGLES, res.nIdx, gl.UNSIGNED_INT, 0);

  gl.blendFunc(gl.ONE, gl.ONE);
  gl.useProgram(res.pVap.p); uC(res.pVap); uFig(res.pVap);
  gl.uniform1f(res.pVap.u.uAmt, 0.25 + 0.75 * Math.max(sh.charge, sh.flash)); gl.uniform1f(res.pVap.u.uU, sh.U);
  gl.bindVertexArray(res.vVap); gl.drawArrays(gl.POINTS, 0, res.nVap);
  disk(1); // the near side of the disk, in front of him
  ribbons(sh.ribBack, sh.ribN); // quantum wires, behind and in front of him

  bloom(gl, res, sc, chain);
  composite(gl, res, sc, chain[0], sh);
}

/** Half-resolution downsample chain with a bright-pass, then an upsample back up the chain. */
function bloom(gl: WebGL2RenderingContext, res: Res, sc: Target, chain: Target[]): void {
  gl.disable(gl.BLEND);
  let src: Target = sc;
  gl.useProgram(res.pDown.p); gl.bindVertexArray(res.vFS);
  chain.forEach((dst, i) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f); gl.viewport(0, 0, dst.w, dst.h);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, src.t); gl.uniform1i(res.pDown.u.uSrc, 4);
    gl.uniform2f(res.pDown.u.uTexel, 1 / src.w, 1 / src.h); gl.uniform1f(res.pDown.u.uThresh, i === 0 ? 0.8 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3); src = dst;
  });
  gl.useProgram(res.pUp.p); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  for (let i = chain.length - 1; i > 0; i--) {
    const s = chain[i], d = chain[i - 1];
    gl.bindFramebuffer(gl.FRAMEBUFFER, d.f); gl.viewport(0, 0, d.w, d.h);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, s.t); gl.uniform1i(res.pUp.u.uSrc, 4); gl.uniform2f(res.pUp.u.uTexel, 1 / s.w, 1 / s.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  gl.disable(gl.BLEND);
}

function composite(gl: WebGL2RenderingContext, res: Res, sc: Target, bloomTarget: Target, sh: Shot): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, sh.W, sh.H);
  gl.useProgram(res.pComp.p);
  gl.uniform2f(res.pComp.u.uRes, sh.W, sh.H); gl.uniform1f(res.pComp.u.uTime, sh.t); gl.uniform1f(res.pComp.u.uDpr, sh.DPR);
  gl.uniform4f(res.pComp.u.uHead, ...sh.head);
  gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, sc.t); gl.uniform1i(res.pComp.u.uScene, 4);
  gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, bloomTarget.t); gl.uniform1i(res.pComp.u.uBloom, 5);
  gl.uniform1f(res.pComp.u.uBloomK, sh.bloomK); gl.uniform1f(res.pComp.u.uBloomRest, sh.bloomRest); gl.uniform1f(res.pComp.u.uBoot, sh.boot); gl.uniform1f(res.pComp.u.uFlash, sh.flash);
  gl.uniform4f(res.pComp.u.uWave, sh.shock[0], sh.shock[1], sh.shock[2], sh.shock[3]);
  gl.uniform1f(res.pComp.u.uLight, sh.light); gl.uniform3f(res.pComp.u.uProj, sh.dc[0], sh.dc[1], sh.U); gl.uniform1f(res.pComp.u.uExpo, sh.expo); gl.uniform1f(res.pComp.u.uCharge, sh.charge);
  // the light theme's field is his own glow: his silhouette and its blurs (units 0 and 7, bound for the scene)
  gl.uniform1i(res.pComp.u.uAura, 7); gl.uniform1i(res.pComp.u.uFig, 0);
  gl.uniform2f(res.pComp.u.uFO, sh.fo[0], sh.fo[1]); gl.uniform1f(res.pComp.u.uS, sh.s); gl.uniform2f(res.pComp.u.uFigSize, FIG.w, FIG.h);
  gl.uniform4f(res.pComp.u.uAuraRect, ...sh.auraRect); gl.uniform1f(res.pComp.u.uAbsorb, sh.absorb); gl.uniform1f(res.pComp.u.uHit, sh.hit);
  gl.bindVertexArray(res.vFS); gl.drawArrays(gl.TRIANGLES, 0, 3);
}
