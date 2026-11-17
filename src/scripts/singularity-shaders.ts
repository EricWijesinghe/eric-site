// GLSL for the Singularity hero's scene. The figure, disk and vapour are ported from design/eric-quantum-forge/v11
// (source/main.js); the background, ribbons and colours are the Signal redesign's. The post chain (bloom and the
// composite, with the light theme) is in singularity-shaders-post.ts.
import { glsl, SPECTRUM } from './singularity-palette';
import { CODE_GLYPH_FIRST, CODE_GLYPH_N } from './singularity-config';

const PALETTE = SPECTRUM.map(glsl).join(', ');
// The glyph atlas is 8 cells wide (singularity-resources): a glyph index g sits at (mod(g,8), floor(g/8)).
const ATLAS_COLS = '8.';
const CODE_FIRST = `${CODE_GLYPH_FIRST}.`, CODE_N = `${CODE_GLYPH_N}.`;

export const COMMON = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform float uDpr;
uniform vec2 uShake; // device px: the charge tremor, applied to everything around him and never to him (Eric round 10, O5)
vec4 toClip(vec2 p){ return vec4(p.x/uRes.x*2.-1., 1.-p.y/uRes.y*2., 0., 1.); }
float hash(float n){ return fract(sin(n)*43758.5453123); }
float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
`;
// 0 on his head, the column above it and a margin at ear height; 1 well clear of them. Above the head's centre only
// the sideways distance counts, so the column runs up to the canvas edge. uHead is halo.head (centre, radii; figure
// px), passed from the engine so a new figure image keeps its face protected. Needs uFO and uS declared.
export const HEAD_KEEP = `
uniform vec4 uHead;
float headKeep(vec2 fp){
  vec2 q = (fp - uHead.xy)/uHead.zw;
  return smoothstep(1.15, 1.8, q.y < 0. ? abs(q.x) : length(q));
}
`;
export const VS_FS = `#version 300 es
in vec2 aP; void main(){ gl_Position = vec4(aP,0.,1.); }`;

/* ---------- the void: nebula, aurora and light trails across the spectrum, lensed around him, and his shockwave ---------- */
export const FS_BG = COMMON + `
uniform sampler2D uAtlas;
uniform vec2 uC; uniform vec2 uM; uniform float uMOn; uniform float uU; uniform float uCharge; uniform float uBoot;
uniform float uFlash; uniform vec4 uShock; uniform float uShockW; // shock: centre xy, radius, strength
uniform vec4 uZone; // the head zone's column: left, right, floor (device px)
// what he absorbed (m2c:absorb, 0..1) glows around his own outline: his blurred silhouette (singularity-figure.ts)
uniform sampler2D uAura; uniform vec4 uAuraRect; uniform vec2 uFO; uniform float uS; uniform float uAbsorb;
out vec4 o;${HEAD_KEEP}
const vec3 PAL[7] = vec3[7](${PALETTE});
// his glow at full charge or absorb. Round 12b: 2.0 with a whitish rim read as milky grey fog on his shoulders once
// tone-mapped; a saturated cyan at 1.5 stays luminous cyan-white at its peak instead
const float AURA_K = 1.5;
const vec3 AURA_RIM = vec3(.05,.70,1.), AURA_FIELD = vec3(.02,.27,.72);
const float SHOCK_FRONT = .085; // the front's peak per unit of strength: about .12 at the strongest release
vec3 pal(float x){ float y = mod(x, 7.); int i = int(floor(y)); float f = y - floor(y); float s = f*f*(3.-2.*f); return mix(PAL[i], PAL[(i+1)%7], s); }
// vk: 1 normally, 0 in the column above his head, where the light trails, aurora rays and binary rain would stand on
// his head like an antenna (Eric round 2: a diagonal streak above the head read as a line from it); the nebula and stars stay.
vec3 sky(vec2 q, float vk){
  vec3 c = vec3(0.);
  // nebula: two octaves of slow noise, coloured by the spectrum
  vec2 nq = q/uU;
  float n1 = vnoise(nq*1.3 + vec2(uTime*.02, 0.)), n2 = vnoise(nq*2.9 - vec2(0., uTime*.03) + 5.);
  c += pal(n1*3. + n2*2. + uTime*.03) * smoothstep(.30, .85, n1*.6 + n2*.4) * .2;
  c += pal(n2*4. + 2.) * smoothstep(.55, .95, n1) * .05;
  // aurora: vertical curtains that ripple across the upper field
  float ax = q.x/(uU*1.6) + vnoise(vec2(q.x/(uU*1.1), uTime*.08))*3.;
  float bq = (q.y/uRes.y - (.42 + .10*sin(ax*.6 + uTime*.2)))/.16; float band = exp(-bq*bq);
  float rays = pow(vnoise(vec2(ax*6., uTime*.5)), 2.5);
  c += pal(ax*.22 + uTime*.04 + 1.) * band * (.5 + .5*sin(ax*1.7 + uTime*.4)) * mix(.35, rays, vk) * .32;
  // light trails: diagonal streaks, some lit, each in its own colour
  float d1 = (q.x*.8 - q.y*.6)/uU, id = floor(d1*3.), hid = h2(vec2(id, 11.));
  float sq = (fract(d1*3. + uTime*.03*(hid+.5)) - .5)/.03; float streak = exp(-sq*sq);
  float seg = smoothstep(.25, .6, vnoise(vec2((q.x*.6 + q.y*.8)/uU*.5, id)));
  c += pal(hid*7. + .5) * streak * seg * step(.45, hid) * .18 * vk;
  // stars at three scales
  for (int k = 0; k < 3; k++) {
    float sc = (3.5 + float(k)*4.)*uDpr; vec2 cell = floor(q/sc); vec2 f = fract(q/sc)-.5;
    float h = h2(cell + float(k)*17.);
    if (h > .985 - float(k)*.004) {
      vec2 off = vec2(h2(cell+3.), h2(cell+9.))-.5;
      float d = length(f - off*.6);
      float tw = .6 + .4*sin(uTime*(1.5+h*4.) + h*40.);
      c += mix(vec3(.55,.8,1.), vec3(1.), h2(cell+5.))*smoothstep(.22, .0, d)*tw*(.5 + .8*float(k==2));
    }
  }
  // faint binary rain
  float cs = 15.*uDpr; vec2 gq = q/cs; float col = floor(gq.x);
  float hc = h2(vec2(col, 2.));
  if (hc > .55) {
    float y = gq.y + uTime*(1.5 + 4.*hc);
    vec2 ci = vec2(col, floor(y)); vec2 f = vec2(fract(gq.x), fract(y));
    float bit = step(.5, h2(ci + floor(uTime*2.*hc)));
    float g = texture(uAtlas, (vec2(bit, 0.) + .15 + f*.7)/${ATLAS_COLS}).a;
    float trail = pow(fract(-(y*.06) + hc*7.), 4.);
    c += vec3(.22,.68,.92)*g*trail*.42*vk;
  }
  // no polar spacetime grid: its rings and spokes were circles and radial lines centred on his head (round 10 review)
  return c;
}
void main(){
  vec2 fc = vec2(gl_FragCoord.x, uRes.y-gl_FragCoord.y) - uShake;
  // gravitational lensing around him, and a small lens at the cursor. Both deflections are smooth in r: a min() or
  // max() in them left a crease that drew a thin circle round his head and neck (round 10 review, O1: no ring)
  vec2 d = fc - uC; float r = length(d);
  float RE = .20*uU*(1. + .35*uCharge);
  vec2 q = fc - d/max(r,1.) * RE*RE*r/(r*r + .6*RE*RE);
  // the cursor lens is off while he is pressed or charging and whenever the pointer is on his head (uMOn, set by the
  // engine, and headKeep here): pressing his face is the natural gesture and must not bend his face's surroundings
  vec2 dm = fc - uM; float rm = length(dm); float REm = .075*uU*uMOn*headKeep((uM - uFO)/uS);
  q -= dm/max(rm,1.) * REm*REm*rm/(rm*rm + .6*REm*REm);
  // the column above his head: the zone the ribbons are cut from (singularity-zone.ts)
  // the feather is tight, so the fade ends where the CPU cut ends (singularity-zone.ts), not inside the copy's side
  float inCol = smoothstep(uZone.x - 8., uZone.x + 8., fc.x) * smoothstep(uZone.y + 8., uZone.y - 8., fc.x) * smoothstep(uZone.z + 8., uZone.z - 8., fc.y);
  vec3 col = sky(q, 1. - inCol);
  // no Einstein ring and no cursor ring: each was a thin circle round his jaw and neck (Eric round 10, O1: no ring)
  // his aura. Phone and portrait: the charge's glow thins with the canvas's bottom mask, as his figure does, so it
  // never fills the lower stage as a slab with an edge (round 10 review); a quarter of it is left there
  float da = length(d/vec2(1., 1.25))/uU;
  float lowStage = 1. - .75*step(uRes.x, uRes.y)*smoothstep(.5, .85, fc.y/uRes.y);
  col += vec3(.05,.30,.52)*(.22 + (.35*uCharge + .5*uFlash)*lowStage)*exp(-da*da*3.2);
  // his glow: luminous cyan hugging his outline (the blur is 0.5 there) and a deep cyan field further out, round his
  // whole figure, head included (Eric round 12b: "that field ... can be around me and I become more bright", only no
  // straight lines from his head). Both sit outside his outline: the mesh is translucent, so anything drawn behind him
  // fogged his face and jacket lines. A blur has no edge, so it is never a drawn ring
  vec2 afp = (fc - uFO)/uS;
  vec3 au = texture(uAura, (afp - uAuraRect.xy)/uAuraRect.zw).rgb;
  float outside = 1. - smoothstep(.3, .5, au.r); // gone at his outline: inside it, it lifted his hair's dark gaps to haze
  col += (AURA_FIELD*au.b + AURA_RIM*au.r*(1. - au.r)*4.)*outside*uAbsorb*AURA_K*lowStage
    *(.8 + .35*vnoise(vec2(uTime*7., 3.))*uAbsorb); // a full glow crackles: its strength flickers, its shape never moves
  // his shockwave: a wide, faint pressure front with a fainter volume inside it, never a bright limb (a limb read as a
  // halo arc over his head, Eric rounds 2 and 10). It is cut from his head and the column above it, so it leaves him
  // sideways and downward only
  float sl = length(fc - uShock.xy), sr = sl/max(uShock.z, 1.);
  float rq = (sl - uShock.z)/uShockW, hk = headKeep((fc - uFO)/uS);
  col += pal(.5 + sr*1.5 + uTime*.05) * exp(-rq*rq) * uShock.w * SHOCK_FRONT * hk;
  col += pal(1. + sr*2.) * exp(-sr*sr*2.2) * uShock.w * .09 * smoothstep(1.1, .8, sr) * hk;
  o = vec4(col*uBoot, 1.);
}`;

/* ---------- the disk: GPU physics (transform feedback) ---------- */
export const VS_SIM = `#version 300 es
precision highp float;
in vec4 aS; in vec4 aK;              // state: x, z, vx, vz (disk plane, units of U) | r0, seed, glyph, thickness
uniform float uDt; uniform float uTime; uniform float uCharge; uniform float uPulse; uniform vec2 uMD; uniform float uMOn;
out vec4 oS;
vec2 curl(vec2 p){ float e = .01;
  float n1 = sin(p.y*1.7 + uTime*.3)*cos(p.x*1.3 - uTime*.2), n2 = sin((p.y+e)*1.7 + uTime*.3)*cos(p.x*1.3 - uTime*.2);
  float n3 = sin(p.y*1.7 + uTime*.3)*cos((p.x+e)*1.3 - uTime*.2);
  return vec2((n2-n1)/e, -(n3-n1)/e); }
void main(){
  vec2 p = aS.xy, v = aS.zw;
  float r = max(length(p), .02); vec2 dir = p/r, tg = vec2(-dir.y, dir.x);
  float r0 = aK.x*mix(1., .62, uCharge);
  vec2 vt = tg*(.62/sqrt(max(r, .12)))*(1. + 1.3*uCharge)*(.9 + .2*aK.y);
  float vtan = dot(v, tg);
  vec2 acc = (vt - v)*1.5 - dir*(r - r0)*(2.2 + 2.*uCharge) - dir*vtan*vtan/r;
  acc += curl(p*2.2 + aK.y*3.)*.10;
  vec2 dm = p - uMD; float dl = length(dm);
  acc += dm/max(dl*dl, .004)*.030*uMOn*smoothstep(.45, .0, dl);       // the cursor parts the disk
  v += acc*uDt;
  v += dir*uPulse*(.75 + .5*aK.y)*smoothstep(2.2, .2, r);              // the shockwave
  p += v*uDt;
  if (length(p) > 4.5 || p != p) { float a = aK.y*6.2831 + uTime; p = vec2(cos(a), sin(a))*3.2; v = vec2(0.); }
  oS = vec4(p, v);
}`;
export const FS_NULL = `#version 300 es
precision highp float; out vec4 o; void main(){ o = vec4(0.); }`;

export const VS_DISK = COMMON + `
in vec4 aS; in vec4 aK;
uniform vec2 uDC; uniform float uU; uniform float uTilt; uniform float uPass; uniform float uBoot; uniform float uCharge; uniform float uFlash;
out vec4 vCol; out float vGlyph; out float vAdd; out float vSize;
void main(){
  vec2 p = aS.xy, v = aS.zw;
  float sa = sin(uTilt), ca = cos(uTilt);
  float y = (aK.w-.5)*.035*smoothstep(.3, 1.2, length(p));            // a little thickness, thicker further out
  float zz = p.y*ca + y*sa;
  float per = 3.4/(3.4 - zz);
  vec2 sp = uDC + vec2(p.x, p.y*sa - y*ca)*per*uU;
  bool front = zz > 0.;
  if ((uPass > .5) != front) { gl_Position = vec4(2.,2.,2.,1.); return; }
  gl_Position = toClip(sp + uShake);
  float r = length(p), spd = length(v);
  float heat = smoothstep(1.5, .42, r);
  vec3 deep = vec3(.05,.22,.55), cyan = vec3(.25,.82,1.), white = vec3(.92,.98,1.);
  vec3 c = mix(deep, cyan, heat) + white*pow(heat, 4.)*.45;
  float beam = 1. + 1.1*clamp(v.y*ca/.9, -.7, 1.);                    // the approaching side is brighter
  float isG = step(.955, aK.z);
  float a = (.30 + .32*heat)*beam*(1. + .8*uCharge + 1.2*uFlash)*uBoot*smoothstep(4., 1.6, r);
  a *= mix(1., .85, float(front));
  // charging, the disk hands over to the page's glyph horizon (energy-overlay.ts): gone by about 1 s of hold, and it
  // stays out through the release flash, so it never flares into a collar or rings out as a circle (Eric round 10)
  a *= 1. - smoothstep(.10, .55, max(uCharge, uFlash));
  float codeG = step(.5, fract(aK.z*997.));   // about half the glyph particles are code tokens, the rest 0 and 1
  vGlyph = isG > .5 ? mix(mod(floor(uTime*(3. + 8.*spd) + aK.y*91.), 2.), ${CODE_FIRST} + floor(fract(aK.y*53.)*${CODE_N}), codeG) : -1.;
  float sz = (isG > .5 ? mix(9.5, 13., codeG) : (1.3 + .9*heat))*uDpr*per*mix(1., 1.25, isG*heat);
  vCol = vec4(c, a*(isG > .5 ? mix(1.4, 2.2, codeG) : 1.)); vAdd = 1.; vSize = sz; gl_PointSize = sz;
}`;
export const FS_POINT = `#version 300 es
precision highp float;
uniform sampler2D uAtlas;
in vec4 vCol; in float vGlyph; in float vAdd; in float vSize;
out vec4 o;
void main(){
  vec2 pc = gl_PointCoord; float a;
  if (vGlyph < -.5 || vSize < 4.5) { float d = length(pc-.5); a = smoothstep(.5,.15,d); }
  else { float g = floor(vGlyph+.5); vec2 cell = vec2(mod(g,8.), floor(g/8.)); a = texture(uAtlas,(cell+pc)/8.).a; }
  a *= vCol.a;
  if (a < .003) discard;
  o = vec4(vCol.rgb*a, a*(1.-vAdd));
}`;

/* ---------- Eric: the v10 binary hologram ---------- */
export const FIGS = `
uniform sampler2D uFig; uniform sampler2D uAux; uniform sampler2D uTrace;
uniform vec2 uFigSize; uniform vec2 uFO; uniform float uS; uniform float uFront; uniform vec2 uMouseF; uniform float uHover;
vec2 figScreen(vec2 p){ return uFO + p*uS; }
float wob(vec2 p, float t){ return 30.*sin(p.x*.011 + t*1.3) + 20.*(vnoise(vec2(p.x*.008, t*.4))*2.-1.); }
float built(vec2 p, float t){ return 1. - smoothstep(uFront-24., uFront+24., p.y + wob(p,t)); }
float frontLine(vec2 p, float t){ return exp(-pow((p.y + wob(p,t) - uFront)/16., 2.)); }
`;
export const VS_MESH = COMMON + FIGS + `
in vec2 aUV; out vec2 vUV;
void main(){ gl_Position = toClip(figScreen(aUV*uFigSize)); vUV = aUV; }`;
export const FS_MESH = COMMON + FIGS + `
uniform sampler2D uAtlas; uniform float uCell; uniform float uGlitch; uniform float uSurge;
uniform float uAbsorb; // 0..1: what he has absorbed of the page's energy (m2c:absorb); he glows brighter with it
in vec2 vUV; out vec4 o;${HEAD_KEEP}
// He gets brighter by gain on his own shading, never by a flat fill (a fill turned his face into a cyan mask with
// black holes, round 10 review). The rim's extra glow is full from his shoulders down and half on his head: at full
// strength it drew a halo line round his hair and ears (hard rule 3). Gains are per unit of absorb (or surge).
// his head takes no gain here: the composite brightens his face after tone mapping, where a gain keeps its contrast
const float ABSORB_RIM = 2.4, ABSORB_BODY = .18, ABSORB_GAIN = .2, SURGE_GAIN = .75; // round 12: a stronger glow from his shoulders down
const float HEAD_RIM = .5;     // share of the absorbed rim on his hair and ears: a soft glow round him, never a line
const float KNEE = .35;          // the gain's soft knee: highlights rise less than mid-tones, nothing clips flat
const float BREATH_HZ = 1.2, BREATH = .12; // a full charge breathes on his rim
float glyph(float g, vec2 f){ vec2 cell = vec2(mod(g,8.), floor(g/8.)); return texture(uAtlas, (cell + .1 + f*.8)/8.).a; }
void main(){
  vec2 p = vUV*uFigSize;
  float row = floor(p.y/22.);
  float isHead = smoothstep(.8,.95,texture(uTrace,vUV).b);
  // the glitch bars never cross his face: nothing sits over it
  float gk = uGlitch*step(.78, h2(vec2(row, floor(uTime*24.))))*(1. - isHead);
  vec2 uv = vUV; uv.x += gk*(h2(vec2(row,3.))-.5)*.03;
  vec4 tx = texture(uFig, uv);
  float bld = built(p, uTime), fl = frontLine(p, uTime);
  float cov = tx.a*smoothstep(110., 470., p.x)*smoothstep(uFigSize.x, uFigSize.x-50., p.x)*(1.-smoothstep(1040., 1195., p.y));
  float vis = cov*max(bld, fl*.9);
  if (vis < .004) discard;
  float l = dot(tx.rgb, vec3(.299,.587,.114));
  float lb = dot(textureLod(uFig, uv, 4.).rgb, vec3(.299,.587,.114));
  float I = pow(clamp(l + (l-lb)*1.5, 0., 1.), .85);
  float cont = texture(uAux, uv).b;
  vec3 deep = vec3(.02,.16,.30), cyan = vec3(.25,.85,.95), ice = vec3(.85,.98,1.);
  float scan = .58 + .42*sin(gl_FragCoord.y*1.5708/uDpr);
  float sweep = exp(-pow((p.y - mod(uTime*230., 1700.) + 250.)/12., 2.));
  float flick = .93 + .07*vnoise(vec2(uTime*9., 1.));
  float cell = uCell; vec2 ci = floor(p/cell); vec2 f = fract(p/cell);
  float cl = dot(texture(uFig, (ci+.5)*cell/uFigSize).rgb, vec3(.299,.587,.114));
  float hc = h2(vec2(ci.x, 9.));
  float strm = pow(fract(ci.y*.05*(.6+hc) - uTime*(.3+.6*hc)*(1.+2.*uSurge) + hc*13.), 9.);
  float bit = step(.5, h2(ci + floor(uTime*(.6+5.*strm) + h2(ci)*9.)));
  float codeC = step(.82, hc);   // some columns of the figure's cells carry code tokens, not only 0 and 1
  float tok = ${CODE_FIRST} + floor(h2(ci + 3.)*${CODE_N});
  bit = mix(bit, tok, codeC);
  float gB = glyph(bit, f);
  float rim = clamp((1.-textureLod(uFig, uv, 3.).a)*2.2, 0., 1.)*tx.a;
  float body = I*(.5 + .5*scan);
  vec3 col = mix(deep, cyan, smoothstep(0., .65, body))*body*mix(.62, .80, isHead) + ice*pow(I, 4.)*.18;
  col += mix(cyan, ice, .35)*cont*(.70 + .10*isHead);
  col += mix(cyan, ice, .3)*gB*(.07 + .32*cl + .7*strm*cl)*(1.-.5*isHead + uSurge*(1. - .8*isHead)); // a surge's glyphs would fog his features
  float hz = headKeep(p); // 0 on his head and the column above it, 1 from his shoulders down
  float breath = 1. + BREATH*uAbsorb*uAbsorb*sin(uTime*6.2832*BREATH_HZ);
  // the absorbed rim wraps his head too, at HEAD_RIM (round 12b), in cyan: ice at this gain read grey once bloomed
  col += ice*rim*.65 + mix(cyan, ice, .25)*rim*(1.8*uSurge*hz + ABSORB_RIM*uAbsorb*breath*mix(HEAD_RIM, 1., hz)) + ice*sweep*(.15 + .5*I)*.3 + ice*fl*1.8;
  col += cyan*body*uAbsorb*ABSORB_BODY*(1. - isHead); // his body takes a little cyan; his face only gains (below)
  float g = 1. + (SURGE_GAIN*uSurge + ABSORB_GAIN*uAbsorb)*(1. - isHead);
  col = flick*col*g/(1. + KNEE*(g - 1.)*col);
  col += cyan*gk*.3;
  // the hover lens never repaints his face (nothing sits over it), and the engine fades uHover out while pressed
  float lens = uHover*smoothstep(170., 40., length(p - uMouseF))*(1. - isHead);
  col = mix(col, mix(cyan*.6, ice, cl)*gB*(.35 + 1.5*cl) + cyan*cont*.8, lens*.85);
  o = vec4(col*vis, vis*(.48 + .34*I));            // more solid than v10: the disk passes behind him
}`;

/* ---------- bits rising off his body ---------- */
export const VS_VAPOR = COMMON + FIGS + `
in vec2 aUV; in vec4 aR;
uniform float uAmt; uniform float uU;
out vec4 vCol; out float vGlyph; out float vAdd; out float vSize;
void main(){
  vec2 p = aUV*uFigSize;
  vec4 tx = texture(uFig, aUV);
  float life = fract(uTime*(.10 + .14*aR.x) + aR.z*9.);
  vec2 s = figScreen(p);
  vec2 pos = s + vec2(sin(life*5. + aR.y*20.)*.03*uU + (aR.w-.5)*.10*uU*life, -life*(.10 + .25*aR.y)*uU);
  float a = step(aR.w, uAmt)*smoothstep(0., .08, life)*(1.-smoothstep(.5, 1., life))*step(.3, tx.a)
          *smoothstep(110., 470., p.x)*(1.-smoothstep(1000., 1150., p.y))*built(p, uTime)*.75;
  gl_Position = toClip(pos);
  float isG = step(.8, aR.y);
  vGlyph = isG > .5 ? mod(floor(uTime*9. + aR.w*61.), 2.) : -1.;
  vSize = isG > .5 ? 8.*uDpr : 1.7*uDpr; gl_PointSize = vSize;
  vCol = vec4(vec3(.40,.90,1.), a); vAdd = 1.;
}`;

/* ---------- glowing ribbons: network edges and quantum wires (colour per vertex, fades inside his head) ---------- */
export const VS_RIB = COMMON + `
in vec2 aP; in vec2 aQ; in vec3 aC;   // position (px) | side, intensity | colour
out float vSide; out float vI; out vec3 vC;
void main(){ gl_Position = toClip(aP + uShake); vSide = aQ.x; vI = aQ.y; vC = aC; }`;
// uHalo: 1 on his head, falling to 0 a margin outside it (built in singularity-gl.ts from the region
// mask). uHaloRect maps figure px to the halo texture, which is padded so the margin also covers the
// space above his hair. This is a hard guarantee: whatever path a ribbon takes, no pixel survives there.
export const FS_RIB = `#version 300 es
precision highp float; in float vSide; in float vI; in vec3 vC; out vec4 o;
uniform vec2 uRes; uniform sampler2D uHalo; uniform vec2 uFO; uniform float uS; uniform vec4 uHaloRect;
void main(){
  float s2 = vSide*vSide;
  float core = exp(-s2*10.) + .35*exp(-s2*2.2);
  vec2 fc = vec2(gl_FragCoord.x, uRes.y-gl_FragCoord.y);
  vec2 hu = ((fc - uFO)/uS - uHaloRect.xy)/uHaloRect.zw;
  float inside = step(0., hu.x)*step(0., hu.y)*step(hu.x, 1.)*step(hu.y, 1.);
  float keep = 1. - inside*texture(uHalo, hu).r;
  vec3 hot = mix(vC, vec3(.95,1.,1.), exp(-s2*30.)*.7);
  o = vec4(hot*core*vI*keep, 0.);
}`;

/* ---------- the world's network: soft additive dots for nodes and packets (keep-clear is decided on the CPU) ---------- */
export const VS_DOT = COMMON + `
in vec2 aP; in vec4 aC; in float aS;   // position (px) | rgba | size (px)
out vec4 vC;
void main(){ gl_Position = toClip(aP + uShake); gl_PointSize = aS; vC = aC; }`;
export const FS_DOT = `#version 300 es
precision highp float; in vec4 vC; out vec4 o;
void main(){
  float d = length(gl_PointCoord - .5)*2.;
  float a = exp(-d*d*1.6)*vC.a;
  if (a < .003) discard;
  o = vec4(vC.rgb*a, 0.);
}`;

/* ---------- the data field: glyph particles (binary, hex and code tokens) sampled from the atlas, added like the dots ---------- */
export const VS_GLYPH = COMMON + `
in vec2 aP; in vec4 aC; in float aS; in float aG;   // position (px) | rgba | size (px) | atlas index
out vec4 vC; out float vG;
void main(){ gl_Position = toClip(aP + uShake); gl_PointSize = aS; vC = aC; vG = aG; }`;
export const FS_GLYPH = `#version 300 es
precision highp float;
uniform sampler2D uAtlas;
in vec4 vC; in float vG; out vec4 o;
void main(){
  float g = floor(vG + .5); vec2 cell = vec2(mod(g, 8.), floor(g/8.));
  float a = texture(uAtlas, (cell + gl_PointCoord)/8.).a*vC.a;
  if (a < .003) discard;
  o = vec4(vC.rgb*a, 0.);
}`;
