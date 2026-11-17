// GLSL for the hero's post chain: bloom (down and up), then the composite, where the shock refracts the whole image
// and the light theme maps the scene onto a pearl page with his glow behind him.
import { COMMON, HEAD_KEEP } from './singularity-shaders';
import { FIG } from './singularity-config';

const AXIS_X = `${FIG.axisX}.`;
// Dark theme: how much brighter his face gets at the peak of a charge, absorb or release, in the cyan (he is brighter,
// never greyer), and the soft knee that keeps its highlights from flattening into one tone
const FACE_LIFT = '.45';
const FACE_KNEE = '.2';
const FACE_BLOOM = '.5'; // share of the idle bloom his face keeps while energised

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

// The light theme (Eric rounds 3 to 10). The scene's luminance becomes azure ink on a pearl page, and he stays the
// positive cyan hologram (never inverted, never true colour) on a deep field, because cyan cannot read on white.
// That field has no shape of its own (round 10: "soft edge is too much, I wanna my image to feel like a flow to
// other sides"). Beside him it is linear in his blurred silhouette: full navy only in the first few px of his
// outline, then royal, azure and the page over 110+ px (the tight blur, uAura.r) and 200+ px at his shoulders (the
// wide blur, uAura.b), with noise that drifts outward so no line of equal depth follows his outline. Above his ear
// lobes it narrows to nothing at his crown, so no cap or hood forms over his head. Away from him the field is carried
// by a few soft streams that leave his shoulders and upper arms at different heights and slight angles, drifting
// outward and fading at their tips: never at head height, never one straight bar.
const LIGHT_K = `
const float HUG_GAIN = 2.1, BODY_GAIN = 1.9;          // the blurs are about .5 at his outline: full navy right there
const float CROWN = 40., BROW = 300., EAR_LOBE = 520.; // figure px: the field's width tapers from his ear lobes to his crown
const float TOP_K = .3;                               // and is at most this deep above his brows
const float BAND_K = .78;                             // a stream's depth where it leaves him (navy-royal), easing to ice
const int BANDS = 6;
// streams, figure px: start height, slope (dy per px outward; negative rises), half-thickness, reach; left, right, ...
const vec4 BAND[6] = vec4[6](vec4(790., -.14, 50., 1150.), vec4(760., -.24, 45., 820.), vec4(880., .08, 65., 1080.),
                             vec4(900., .04, 60., 860.), vec4(990., .30, 80., 980.), vec4(1010., .36, 75., 800.));
`;
const LIGHT = `
  if (uLight > .5) {
    // a release's flash brightens the scene; on the light page that washed the field into one pale mass (Eric round 8),
    // so the scene's luminance is compressed by as much. His figure takes no flash (above), so his tones are read
    // uncompressed and the release lifts him by colour (his absorbed glow is held 80 ms, singularity-hero.ts)
    float lum = dot(col, vec3(.299,.587,.114));
    float l = clamp(lum*1.3/(uExpo*(1. + .5*uFlash)), 0., 1.);    // uExpo: a phone's darker scene is for the dark theme
    float lf = clamp(lum*1.3/uExpo, 0., 1.);
    // the page: the site's own pearl (--bg), with faint ice and mint patches, so the canvas has no edge to see
    vec3 paper = mix(vec3(.945,.968,.995), vec3(.925,.952,1.), uv.y);
    paper = mix(paper, vec3(.84,.91,1.), smoothstep(.55, 1., vnoise(uv*2.2 + vec2(uTime*.02, 0.)))*.4);
    paper = mix(paper, vec3(.78,.95,1.), smoothstep(.5, 1., vnoise(uv*3.1 - vec2(0., uTime*.015) + 4.))*.4);
    paper = mix(paper, vec3(.80,1.,.94), smoothstep(.6, 1., vnoise(uv*2.6 + 9.))*.25);
    // everything that is not him stays pastel: the scene's light as soft azure ink
    vec3 ink = mix(vec3(.30,.58,.96), vec3(.08,.36,.80), smoothstep(.3, 1., l));
    vec3 outside = mix(paper, ink, smoothstep(.03, .45, l)*.62);

    float grow = 1. + .15*uCharge + .15*uAbsorb + .25*uHit;          // the field swells as he charges, absorbs and releases
    float ox = fp.x - ${AXIS_X}, sx = abs(ox);
    float drift = vnoise(vec2(sx*.0035 - uTime*.07, fp.y*.005)) - .5; // drifts outward from his axis
    float wob = 1. + .7*drift;                                        // +-35% of the field's width
    // the narrow hug (navy only in its first few px) holds his face from his brows down, for its 4.5:1 (L1, M2), and
    // thins to nothing at his crown; the wide field narrows from his ear lobes up and is faint above his brows
    float vy = fp.y + 60.*drift;
    float hugT = smoothstep(CROWN, BROW, vy), wideT = mix(TOP_K*hugT, 1., smoothstep(BROW, EAR_LOBE, vy));
    float near = max(clamp(au.r*HUG_GAIN*wob*grow, 0., 1.)*hugT, clamp(au.b*BODY_GAIN*wob*grow, 0., 1.)*wideT);
    float band = 0.;
    for (int i = 0; i < BANDS; i++) {
      vec4 B = BAND[i];
      float dx = ox*(i % 2 == 0 ? -1. : 1.);                         // outward on this stream's side
      if (dx < 0.) continue;
      float u = dx/B.w;
      float yc = B.x + B.y*dx + 30.*sin(u*3.1 + float(i)*1.7 + uTime*.12); // a slow bend: never a straight bar
      float dy = (fp.y - yc)/(B.z*(.7 + .7*u));                        // it widens as it leaves him
      float knots = .55 + .45*vnoise(vec2(dx*.004 - uTime*.22, float(i)*7.)); // brighter knots drift outward along it
      band = max(band, exp(-dy*dy)*(1. - smoothstep(.6, 1., u))*knots);
    }
    float low = 1. - smoothstep(880., 1190., fp.y);                    // it leaves with his body, which the mesh fades out here
    // phone and portrait: the field thins with the canvas's long bottom mask (hero-light.css), so no navy meets its edge
    float isPort = step(uRes.x, uRes.y), port = isPort*smoothstep(.62, .97, 1. - uv.y);
    float field = clamp(max(near, band*BAND_K), 0., 1.)*low*(1. - port);
    // the release's hit deepens the field for a moment; it is gone again within about 0.6 s (uHit, singularity-hero.ts)
    vec3 navy = mix(vec3(.055,.118,.42), vec3(.03,.12,.56), uAbsorb*.6)*(1. - .25*uCharge - .25*uHit);
    // wide, overlapping ramps: each tone hands over to the next across a long run, so no ring of equal colour reads as
    // the field's edge (round 10 critique: "a soft blob with an edge, not a flow into the page")
    vec3 fcol = mix(vec3(.72,.87,1.), vec3(.38,.62,.95), smoothstep(0., .42, field)); // ice to azure
    fcol = mix(fcol, vec3(.16,.35,.82), smoothstep(.36, .78, field));               // royal
    fcol = mix(fcol, navy, smoothstep(.72, .96, field));                            // navy only right beside him
    float fa = smoothstep(0., .62, field)*smoothstep(0., .62, field);
    // on the field only sparks of the scene count, in a deeper azure than his own cyan
    float sparks = smoothstep(.5, .95, l)*.6*(1. - .6*max(uCharge, uAbsorb));
    col = mix(outside, mix(fcol, vec3(.30,.62,1.), sparks*(1. - .7*band)), fa);
    // a release sends one saturated azure pressure band outward through the page; never across his head or his figure
    float pr = (length(fc - uWave.xy) - uWave.z)/(100.*uDpr);
    float press = exp(-pr*pr)*uWave.w*headKeep(fp)*(1. - smoothstep(.02, .35, figA))*(1. - smoothstep(0., 600.*uDpr, uWave.z));
    col = mix(col, vec3(.16,.40,.94), clamp(press*.35, 0., .35));

    // his hologram: brighter with charge and with what he absorbed, at every step (M2, O3); the release's hit adds
    // saturation and contrast for about 100 ms, never blur
    float hi = smoothstep(.7 - .25*uAbsorb, 1., lf);
    vec3 holo = mix(vec3(.10,.73,1.), vec3(.62,.95,1.), hi);          // capped white: the highlights stay cyan on navy
    holo = mix(holo, vec3(.06,.80,1.), uCharge*.4*(1. - hi));          // charge: a more saturated, slightly brighter cyan
    holo = mix(holo, vec3(.20,.90,1.), uAbsorb*.7*(1. - hi));          // absorbed: a brighter, luminous cyan, still never white
    vec2 pd = (fc - uProj.xy - vec2(0., uProj.z*.3))/(uProj.z*1.6);
    holo *= 1. + .45*smoothstep(-.4, .1, pd.y); // lift the shoulders and lower body (they read against the field)
    float tone = smoothstep(.06 + .03*uAbsorb + .12*uHit, .62 - .08*uHit, lf); // the hit: more contrast, not a wash
    // his silhouette, a little dilated and faded where the mesh fades him: only on it does scene light become hologram
    // (portrait: over a longer run, with the field, so his lit lower body does not end on a line across the phone)
    float figM = smoothstep(.04, .5, figA)*smoothstep(110., 470., fp.x)*(1. - smoothstep(mix(1040., 800., isPort), 1195., fp.y))*(1. - port);
    col = mix(col, mix(navy, holo, tone), figM);
    // round 12, "I should glow": a saturated cyan glow just outside his outline, rising with the charge, what he
    // absorbed and the release's hit. Colour on the navy field, never white. Round 12b: round his head too, a little
    // softer there (Eric: the field "can be around me", only no lines from his head); the wide au.b breath it had
    // over the field mixed with the page's mint patches into olive blotches beside his shoulder, so it is gone
    float glowL = clamp(max(max(uCharge, uAbsorb), uHit), 0., 1.)*(.85 + .15*sin(uTime*11.));
    float hugG = clamp(au.r*(1. - au.r)*4., 0., 1.)*(1. - figM)*mix(.6, 1., headKeep(fp))*low*(1. - port);
    col = mix(col, vec3(.05,.70,1.), clamp(hugG*glowL*.85, 0., .8));
    // deep-teal rim on his left silhouette: a dark pixel with a bright neighbour to its right is the outer edge
    float rimL = clamp(dot(texture(uScene, u2 + vec2(6./uRes.x, 0.)).rgb - texture(uScene, u2).rgb, vec3(.299,.587,.114)), 0., 1.);
    // only along his outline: across the half page it caught every scene glyph and left teal-olive specks (round 12b)
    col = mix(col, vec3(.0,.42,.50), clamp(rimL*4.*(1. + uHit), 0., 1.)*smoothstep(0., -.3, pd.x)*.85*clamp(au.r*(1. - au.r)*4., 0., 1.));
  }`;

export const FS_COMP = COMMON + `
uniform sampler2D uScene; uniform sampler2D uBloom; uniform float uBloomK; uniform float uBoot;
uniform float uBloomRest;                           // the bloom at rest (no charge, no absorb): his face keeps it
uniform vec4 uWave; uniform float uFlash;           // centre xy, radius, strength
uniform float uLight; uniform vec3 uProj;           // light theme on/off; the disk's centre xy and radius (device px)
uniform float uExpo;                                // exposure: phones draw the scene a little darker so the face keeps its cyan
uniform float uCharge; uniform float uAbsorb;       // charging and absorbing must not wash him out (Eric rounds 8, 10)
uniform float uHit;                                 // light: a person's release, 1 for ~80 ms then gone by ~0.6 s
uniform sampler2D uFig; uniform sampler2D uAura;    // his silhouette, and (light theme) his glow (singularity-figure.ts)
uniform vec2 uFO; uniform float uS; uniform vec2 uFigSize; uniform vec4 uAuraRect; // where the figure is, and figure px to the glow texture
out vec4 o;${HEAD_KEEP}${LIGHT_K}
void main(){
  vec2 fc = vec2(gl_FragCoord.x, uRes.y-gl_FragCoord.y);
  vec2 uv = gl_FragCoord.xy/uRes;
  vec2 fp = (fc - uFO)/uS, fu = fp/uFigSize;
  float figA = textureLod(uFig, fu, 3.).a*step(0., fu.x)*step(fu.x, 1.)*step(0., fu.y)*step(fu.y, 1.);
  vec3 au = texture(uAura, (fp - uAuraRect.xy)/uAuraRect.zw).rgb; // his glow's blurs (singularity-figure.ts)
  // the shockwave bends what is behind him as it passes, never him: refracting his face smeared it, his torso turned to
  // moire, and the column above his head would draw an arc there (round 10 review)
  vec2 d = fc - uWave.xy; float r = length(d);
  float ring = (r - uWave.z)/(40.*uDpr);
  float k = uWave.w*exp(-ring*ring)*sin(ring*3.)*headKeep(fp)*(1. - smoothstep(.02, .35, figA));
  // a bend of a few px only: at 18 px the release's own glyphs stretched into colour dabs beside his shoulders
  vec2 off = (r > 0. ? d/r : vec2(0.))*k*mix(8., 4., uLight)*uDpr;
  vec2 cc = uv-.5;
  // no shock-driven split: a per-channel offset across a bright shell turned its edge yellow-orange (Eric round 2)
  float ca = dot(cc,cc)*.008;
  vec2 u2 = (fc + off)/uRes; u2.y = 1.-u2.y;
  vec3 col = vec3(texture(uScene, u2 - cc*ca).r, texture(uScene, u2).g, texture(uScene, u2 + cc*ca).b);
  // dark: a charge, a release or what he absorbed brightens him without a white haze over his face (Eric round 10, O3)
  float hw = 1. - smoothstep(.75, 1.1, length((fp - uHead.xy)/uHead.zw));
  float e = clamp(max(max(uCharge, uFlash), uAbsorb), 0., 1.)*(1. - uLight);
  // light: charge adds no white bloom. Dark: the bloom over his torso thins so his jacket lines stay drawn, and over
  // his face it is held near half its idle level: the charged scene's bloom fogged his face at full strength, and none
  // at all crushed his eyes and hair to black (round 10 review)
  float bk = uBloomK*mix(1., 1. - .7*uCharge, uLight)*(1. - e*.7*figA); // .7: the halo round his head bled into his hair
  col += texture(uBloom, u2).rgb*mix(bk, uBloomRest*${FACE_BLOOM}, e*hw); col *= uExpo;
  col += vec3(.4,.85,1.)*abs(k)*.10;
  float onFace = hw*smoothstep(.1, .6, figA);
  // the flash lifts the world, not a veil over his face (dark) or his figure (light, where it flattened him)
  col += vec3(.5,.9,1.)*uFlash*.10*(1. - mix(.85*onFace, smoothstep(.1, .6, figA), uLight));
  col = (col*(2.51*col+.03))/(col*(2.43*col+.59)+.14);
  // and at the peak his face is a brighter cyan face: a gain with a soft knee on his own tones (never a cap, whose flat
  // plateau read as a mask), its hue held, so every feature keeps its depth and nothing falls below idle
  // the lift keeps rising with what he absorbed, so a 5 s hold reads brighter than a 1.5 s one (round 12b)
  float L = dot(col, vec3(.299,.587,.114)), fg = 1. + ${FACE_LIFT}*min(1.3, .65*e + .65*uAbsorb*(1. - uLight));
  col = mix(col, vec3(.30,.86,1.)*(L*fg/(1. + (fg - 1.)*L*${FACE_KNEE})/.709), e*onFace*.75);
  // charged, he stays a cyan hologram: the white bloom and rim read grey or beige on him, so red is held under green,
  // on him and in the glow round him (round 12b: his shoulders' glow read milky grey, RGB 106,129,135)
  col.r = mix(col.r, min(col.r, .7*col.g), e*max(smoothstep(.1, .6, figA), smoothstep(.03, .3, au.b)));
  col *= 1.-dot(cc*vec2(1.,1.2), cc*vec2(1.,1.2))*.9;${LIGHT}
  col += (h2(fc+fract(uTime*7.)*91.)-.5)*.02;
  o = vec4(col*uBoot, 1.);
}`;
