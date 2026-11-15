// GLSL for the Singularity hero, ported verbatim from design/eric-quantum-forge/v11 (source/main.js).
// Only FS_RIB differs: arcs fade out inside a halo around his head (Eric: nothing may hang around his head).
export const COMMON = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform float uDpr;
vec4 toClip(vec2 p){ return vec4(p.x/uRes.x*2.-1., 1.-p.y/uRes.y*2., 0., 1.); }
float hash(float n){ return fract(sin(n)*43758.5453123); }
float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
`;
export const VS_FS = `#version 300 es
in vec2 aP; void main(){ gl_Position = vec4(aP,0.,1.); }`;

/* ---------- the void: lensed stars, binary rain, spacetime grid, the pillar ---------- */
export const FS_BG = COMMON + `
uniform sampler2D uAtlas;
uniform vec2 uC; uniform vec2 uM; uniform float uMOn; uniform float uU; uniform float uCharge; uniform float uBoot;
uniform float uAxisX; uniform float uHeadTop; uniform float uPillar; uniform float uFlash;
out vec4 o;
vec3 sky(vec2 q){
  vec3 c = vec3(0.);
  // nebula
  vec2 nq = q/uU;
  float n = vnoise(nq*1.6 + vec2(uTime*.01, 0.))*.6 + vnoise(nq*4.1 - vec2(0., uTime*.015))*.4;
  c += vec3(.015,.06,.12)*n*n*1.6 + vec3(.0,.03,.05)*vnoise(nq*9.)*.5;
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
    float g = texture(uAtlas, (vec2(bit, 0.) + .15 + f*.7)/4.).a;
    float trail = pow(fract(-(y*.06) + hc*7.), 6.);
    c += vec3(.15,.55,.75)*g*trail*.20;
  }
  // spacetime grid (polar), only near him
  vec2 d = q - uC; float r = length(d)/uU; float a = atan(d.y, d.x);
  float rings = abs(fract(r*7.)-.5)/max(fwidth(r*7.), 1e-4);
  float spokes = abs(fract(a/6.28318*36.)-.5)/max(fwidth(a/6.28318*36.), 1e-4);
  float grid = (1.-min(rings,1.))*.7 + (1.-min(spokes,1.))*.35;
  c += vec3(.10,.40,.60)*grid*.10*smoothstep(1.6, .3, r);
  return c;
}
void main(){
  vec2 fc = vec2(gl_FragCoord.x, uRes.y-gl_FragCoord.y);
  // gravitational lensing around him, and a small lens at the cursor
  vec2 d = fc - uC; float r = length(d);
  float RE = .20*uU*(1. + .35*uCharge);
  vec2 q = fc - d/max(r,1.) * min(RE*RE/max(r, 1.), RE*.9)*smoothstep(0., RE*.8, r);
  vec2 dm = fc - uM; float rm = length(dm); float REm = .075*uU*uMOn;
  q -= dm/max(rm,1.) * REm*REm/max(rm, REm*.5);
  vec3 col = sky(q);
  // Einstein ring: light piling up at the lens radius
  col += vec3(.20,.65,.95)*exp(-pow((r-RE)/(RE*.10), 2.))*.10*(1. + 1.5*uCharge);
  col += vec3(.25,.75,1.)*exp(-pow((rm-REm)/(REm*.12+1.), 2.))*.18*uMOn;
  // his aura
  float da = length(d/vec2(1., 1.25))/uU;
  col += vec3(.05,.30,.52)*(.22 + .35*uCharge + .5*uFlash)*exp(-da*da*3.2);
  // the pillar of light on his axis
  float dx = abs(fc.x - uAxisX);
  float above = smoothstep(uHeadTop + .05*uU, uHeadTop - .10*uU, fc.y);
  float w = (2.5 + 1.5*uCharge)*uDpr + .02*uU*(1.-fc.y/uRes.y);
  float knots = pow(fract((uHeadTop - fc.y)/(.22*uU) - uTime*(.9 + 1.4*uCharge)), 10.);
  float fl = .8 + .2*vnoise(vec2(fc.y*.02, uTime*6.));
  float core = exp(-dx*dx/(w*w)), halo = exp(-dx*dx/(w*w*60.));
  float pil = (core*(1.1 + 2.5*knots) + halo*.20)*fl*(1. - fc.y/uRes.y*.2);
  col += vec3(.45,.92,1.)*pil*uPillar*mix(.25, 1., above)*(1. + 1.4*uCharge + 1.5*uFlash);
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
  gl_Position = toClip(sp);
  float r = length(p), spd = length(v);
  float heat = smoothstep(1.5, .42, r);
  vec3 deep = vec3(.05,.22,.55), cyan = vec3(.25,.82,1.), white = vec3(.92,.98,1.);
  vec3 c = mix(deep, cyan, heat) + white*pow(heat, 4.)*.45;
  float beam = 1. + 1.1*clamp(v.y*ca/.9, -.7, 1.);                    // the approaching side is brighter
  float isG = step(.955, aK.z);
  float a = (.30 + .32*heat)*beam*(1. + .8*uCharge + 1.2*uFlash)*uBoot*smoothstep(4., 1.6, r);
  a *= mix(1., .85, float(front));
  vGlyph = isG > .5 ? mod(floor(uTime*(3. + 8.*spd) + aK.y*91.), 2.) : -1.;
  float sz = (isG > .5 ? 9.5 : (1.3 + .9*heat))*uDpr*per*mix(1., 1.25, isG*heat);
  vCol = vec4(c, a*(isG > .5 ? 1.4 : 1.)); vAdd = 1.; vSize = sz; gl_PointSize = sz;
}`;
export const FS_POINT = `#version 300 es
precision highp float;
uniform sampler2D uAtlas;
in vec4 vCol; in float vGlyph; in float vAdd; in float vSize;
out vec4 o;
void main(){
  vec2 pc = gl_PointCoord; float a;
  if (vGlyph < -.5 || vSize < 4.5) { float d = length(pc-.5); a = smoothstep(.5,.15,d); }
  else { float g = floor(vGlyph+.5); vec2 cell = vec2(mod(g,4.), floor(g/4.)); a = texture(uAtlas,(cell+pc)/4.).a; }
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
in vec2 vUV; out vec4 o;
float glyph(float g, vec2 f){ vec2 cell = vec2(mod(g,4.), floor(g/4.)); return texture(uAtlas, (cell + .1 + f*.8)/4.).a; }
void main(){
  vec2 p = vUV*uFigSize;
  float row = floor(p.y/22.);
  float gk = uGlitch*step(.78, h2(vec2(row, floor(uTime*24.))));
  vec2 uv = vUV; uv.x += gk*(h2(vec2(row,3.))-.5)*.03;
  vec4 tx = texture(uFig, uv);
  float bld = built(p, uTime), fl = frontLine(p, uTime);
  float cov = tx.a*smoothstep(110., 470., p.x)*smoothstep(uFigSize.x, uFigSize.x-50., p.x)*(1.-smoothstep(1040., 1195., p.y));
  float vis = cov*max(bld, fl*.9);
  if (vis < .004) discard;
  float isHead = smoothstep(.8,.95,texture(uTrace,vUV).b);
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
  float gB = glyph(bit, f);
  float rim = clamp((1.-textureLod(uFig, uv, 3.).a)*2.2, 0., 1.)*tx.a;
  float body = I*(.5 + .5*scan);
  vec3 col = mix(deep, cyan, smoothstep(0., .65, body))*body*mix(.62, .80, isHead) + ice*pow(I, 4.)*.18;
  col += mix(cyan, ice, .35)*cont*(.70 + .10*isHead);
  col += mix(cyan, ice, .3)*gB*(.07 + .32*cl + .7*strm*cl)*(1.-.5*isHead + uSurge);
  col += ice*rim*(.65 + 1.8*uSurge) + ice*sweep*(.15 + .5*I)*.3 + ice*fl*1.8;
  col *= flick*(1. + uSurge*.75);
  col += cyan*gk*.3;
  float lens = uHover*smoothstep(170., 40., length(p - uMouseF));
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

/* ---------- lightning and rings (screen-space ribbons) ---------- */
export const VS_RIB = COMMON + `
in vec2 aP; in vec3 aQ;               // position (px) | side, intensity, 1 = keep clear of his head
out float vSide; out float vI; out float vClear;
void main(){ gl_Position = toClip(aP); vSide = aQ.x; vI = aQ.y; vClear = aQ.z; }`;
// uHalo: 1 on his head, falling to 0 a margin outside it (built in singularity-gl.ts from the region
// mask). uHaloRect maps figure px to the halo texture, which is padded so the margin also covers the
// space above his hair. This is a hard guarantee: whatever path a bolt takes, no arc pixel survives there.
export const FS_RIB = `#version 300 es
precision highp float; in float vSide; in float vI; in float vClear; out vec4 o;
uniform vec2 uRes; uniform sampler2D uHalo; uniform vec2 uFO; uniform float uS; uniform vec4 uHaloRect;
void main(){
  float core = exp(-vSide*vSide*10.) + .35*exp(-vSide*vSide*2.2);
  vec2 fc = vec2(gl_FragCoord.x, uRes.y-gl_FragCoord.y);
  vec2 hu = ((fc - uFO)/uS - uHaloRect.xy)/uHaloRect.zw;
  float inside = step(0., hu.x)*step(0., hu.y)*step(hu.x, 1.)*step(hu.y, 1.);
  float keep = 1. - vClear*inside*texture(uHalo, hu).r;
  o = vec4(mix(vec3(.35,.85,1.), vec3(.95,1.,1.), exp(-vSide*vSide*30.))*core*vI*keep, 0.);
}`;

/* ---------- post ---------- */
export const FS_DOWN = `#version 300 es
precision highp float; uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uThresh; out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy*uTexel*2.;
  vec4 t0 = texture(uSrc, uv), t1 = texture(uSrc, uv + uTexel*vec2(-1.,-1.)), t2 = texture(uSrc, uv + uTexel*vec2(1.,-1.)),
       t3 = texture(uSrc, uv + uTexel*vec2(-1.,1.)), t4 = texture(uSrc, uv + uTexel*vec2(1.,1.));
  float m = uThresh > 0. ? 1. : 0.;
  vec3 c = (t0.rgb*mix(1., t0.a, m)*4. + t1.rgb*mix(1., t1.a, m) + t2.rgb*mix(1., t2.a, m) + t3.rgb*mix(1., t3.a, m) + t4.rgb*mix(1., t4.a, m))/8.;
  if (uThresh > 0.) { float b = max(c.r, max(c.g, c.b)); c *= smoothstep(uThresh, uThresh+.35, b); }
  o = vec4(c, 1.);
}`;
export const FS_UP = `#version 300 es
precision highp float; uniform sampler2D uSrc; uniform vec2 uTexel; out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy*uTexel*.5;   // uTexel is the source texel; target is twice the size
  vec2 h = uTexel;
  vec3 c = texture(uSrc, uv + vec2(-h.x*2.,0.)).rgb + texture(uSrc, uv + vec2(h.x*2.,0.)).rgb
         + texture(uSrc, uv + vec2(0.,-h.y*2.)).rgb + texture(uSrc, uv + vec2(0.,h.y*2.)).rgb;
  c += (texture(uSrc, uv + vec2(-h.x,h.y)).rgb + texture(uSrc, uv + vec2(h.x,h.y)).rgb
      + texture(uSrc, uv + vec2(-h.x,-h.y)).rgb + texture(uSrc, uv + vec2(h.x,-h.y)).rgb)*2.;
  o = vec4(c/12., 1.);
}`;

export const FS_COMP = COMMON + `
uniform sampler2D uScene; uniform sampler2D uBloom; uniform float uBloomK; uniform float uBoot;
uniform vec4 uWave; uniform float uFlash;           // centre xy, radius, strength
out vec4 o;
void main(){
  vec2 fc = vec2(gl_FragCoord.x, uRes.y-gl_FragCoord.y);
  vec2 uv = gl_FragCoord.xy/uRes;
  // the shockwave refracts the whole image as it passes
  vec2 d = fc - uWave.xy; float r = length(d);
  float ring = (r - uWave.z)/(40.*uDpr);
  float k = uWave.w*exp(-ring*ring)*sin(ring*3.);
  vec2 off = (r > 0. ? d/r : vec2(0.))*k*18.*uDpr;
  vec2 cc = uv-.5;
  float ca = dot(cc,cc)*.008 + abs(k)*.006;
  vec2 u2 = (fc + off)/uRes; u2.y = 1.-u2.y;
  vec3 col = vec3(texture(uScene, u2 - cc*ca).r, texture(uScene, u2).g, texture(uScene, u2 + cc*ca).b);
  col += texture(uBloom, u2).rgb*uBloomK;
  col += vec3(.4,.85,1.)*abs(k)*.10;
  col += vec3(.5,.9,1.)*uFlash*.10;
  col = (col*(2.51*col+.03))/(col*(2.43*col+.59)+.14);
  col *= 1.-dot(cc*vec2(1.,1.2), cc*vec2(1.,1.2))*.9;
  col += (h2(fc+fract(uTime*7.)*91.)-.5)*.02;
  o = vec4(col*uBoot, 1.);
}`;
