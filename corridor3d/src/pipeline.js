// Render pipeline for one frame:
//   1. path trace the scene (three-gpu-pathtracer, WebGL2) into two independent half buffers
//   2. raster G-buffers (albedo, view normal + depth) and an overlay of the things that glow
//   3. denoise: demodulate by albedo, variance-guided edge-avoiding a-trous, remodulate
//   4. bloom and halation, lens distortion, chromatic aberration, softness towards the corners,
//      vignette, exposure, ACES, film grain, sRGB
// The lens is real: a thin lens with an aperture in the tracer (PhysicalCamera), and the raster
// G-buffers are accumulated through the same lens so the denoiser is guided by what the tracer
// saw. The haze is a thin ray-marched in-scatter pass against the depth buffer. A true volume in
// the tracer (FogVolumeMaterial, scene.js, `--haze=<density>`) is built and was tried: see the
// README for what it cost and why it is off.
// Everything is deterministic for a given seed: Math.random is replaced by a seeded generator.
import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { mulberry } from './util.js';

let rand = mulberry(1);
Math.random = () => rand();
export const seedRandom = (seed) => {
  rand = mulberry(seed);
};

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const fsq = (frag, uniforms, extra = {}) =>
  new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, ...extra }));

const COPY4 = /* glsl */ `
  uniform sampler2D tex; uniform float scale; varying vec2 vUv;
  void main() { gl_FragColor = texture2D(tex, vUv) * scale; }
`;
const COPY = /* glsl */ `
  uniform sampler2D tex; uniform float scale; varying vec2 vUv;
  void main() { gl_FragColor = vec4(texture2D(tex, vUv).rgb * scale, 1.0); }
`;

// view-space normal and linear depth
const GBUF_VERT = /* glsl */ `
  varying vec3 vN; varying float vZ;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vZ = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const GBUF_FRAG = /* glsl */ `
  varying vec3 vN; varying float vZ;
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    gl_FragColor = vec4(n, vZ);
  }
`;

const DEMOD = /* glsl */ `
  uniform sampler2D a; uniform sampler2D b; uniform sampler2D albedo; uniform float demod; uniform vec2 px; varying vec2 vUv;
  float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  void main() {
    // demod 0 leaves the radiance as it is (the edge path, see REMOD)
    vec3 al = mix(vec3(1.0), max(texture2D(albedo, vUv).rgb, vec3(0.03)), demod);
    vec3 ra = max(texture2D(a, vUv).rgb, 0.0);
    vec3 rb = max(texture2D(b, vUv).rgb, 0.0);
    // A firefly (one path that found a bulb by a freak bounce) lands in one half only. Each half
    // is held to a few times what the OTHER half sees in the 5 x 5 pixels round
    // it: a neighbourhood, not the one pixel, because with a dozen lights and one picked per
    // sample the two halves of a single honest pixel can differ by more than that.
    float ma = 0.0; float mb = 0.0;
    for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
      vec2 uv = vUv + vec2(float(x), float(y)) * px;
      ma += lum(max(texture2D(a, uv).rgb, 0.0));
      mb += lum(max(texture2D(b, uv).rgb, 0.0));
    }
    ma /= 25.0; mb /= 25.0;
    float la = lum(ra); float lb = lum(rb);
    float ca = 6.0 * mb + 0.004; float cb = 6.0 * ma + 0.004;
    if (la > ca) ra *= ca / la;
    if (lb > cb) rb *= cb / lb;
    vec3 ia = ra / al;
    vec3 ib = rb / al;
    float d = 0.5 * (lum(ia) - lum(ib));
    gl_FragColor = vec4(0.5 * (ia + ib), d * d);
  }
`;

// Firefly clamp and a first 3x3 blur of the variance estimate.
const PREP = /* glsl */ `
  uniform sampler2D tex; uniform vec2 px; varying vec2 vUv;
  float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  void main() {
    vec4 c = texture2D(tex, vUv);
    float mean = 0.0; float mx = 0.0; float var = 0.0; float wsum = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec4 s = texture2D(tex, vUv + vec2(float(x), float(y)) * px);
      float w = (x == 0 ? 2.0 : 1.0) * (y == 0 ? 2.0 : 1.0);
      var += s.a * w; wsum += w;
      if (x != 0 || y != 0) { float l = lum(s.rgb); mean += l / 8.0; mx = max(mx, l); }
    }
    float l = lum(c.rgb);
    float cap = max(mx, mean * 3.0) * 1.1 + 0.002;
    if (l > cap) c.rgb *= cap / l;
    gl_FragColor = vec4(c.rgb, var / wsum);
  }
`;

const ATROUS = /* glsl */ `
  uniform sampler2D tex; uniform sampler2D gbuf; uniform vec2 px; uniform float stepSize;
  uniform mat4 invProj; uniform float sigmaL;
  varying vec2 vUv;
  float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  vec3 viewPos(vec2 uv, float z) {
    vec4 p = invProj * vec4(uv * 2.0 - 1.0, 0.0, 1.0);
    return vec3(p.xy / -p.z, -1.0) * z;
  }
  void main() {
    vec4 c = texture2D(tex, vUv);
    vec4 g = texture2D(gbuf, vUv);
    if (g.a <= 0.0) { gl_FragColor = c; return; }
    vec3 P = viewPos(vUv, g.a);
    float lc = lum(c.rgb);
    float sd = sigmaL * sqrt(max(c.a, 0.0)) + 1e-4;
    vec3 sum = c.rgb; float vsum = c.a; float wsum = 1.0;
    float k[3]; k[0] = 0.375; k[1] = 0.25; k[2] = 0.0625;
    for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
      if (x == 0 && y == 0) continue;
      vec2 uv = vUv + vec2(float(x), float(y)) * px * stepSize;
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) continue;
      vec4 q = texture2D(tex, uv);
      vec4 gq = texture2D(gbuf, uv);
      if (gq.a <= 0.0) continue;
      vec3 Q = viewPos(uv, gq.a);
      float wn = pow(max(dot(g.xyz, gq.xyz), 0.0), 48.0);
      float plane = abs(dot(g.xyz, Q - P));
      float wz = exp(-plane / (0.012 + 0.004 * g.a));
      float wl = exp(-abs(lum(q.rgb) - lc) / sd);
      float w = k[x < 0 ? -x : x] * k[y < 0 ? -y : y] / (0.375 * 0.375) * wn * wz * wl;
      sum += q.rgb * w; vsum += q.a * w * w; wsum += w;
    }
    gl_FragColor = vec4(sum / wsum, vsum / (wsum * wsum));
  }
`;

// The same filter for pixels that straddle an edge, guided by the jittered (averaged) G-buffer:
// an edge pixel is blended with pixels that are covered the same way, so the silhouette stays
// antialiased but loses most of its noise.
const ATROUS_EDGE = /* glsl */ `
  uniform sampler2D tex; uniform sampler2D gbufAA; uniform vec2 px; uniform float stepSize; uniform float sigmaL;
  varying vec2 vUv;
  float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  void main() {
    vec4 c = texture2D(tex, vUv);
    vec4 g = texture2D(gbufAA, vUv);
    float gl = length(g.xyz);
    float lc = lum(c.rgb);
    float sd = sigmaL * sqrt(max(c.a, 0.0)) + 1e-4;
    vec3 sum = c.rgb; float vsum = c.a; float wsum = 1.0;
    float k[3]; k[0] = 0.375; k[1] = 0.25; k[2] = 0.0625;
    for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
      if (x == 0 && y == 0) continue;
      vec2 uv = vUv + vec2(float(x), float(y)) * px * stepSize;
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) continue;
      vec4 q = texture2D(tex, uv);
      vec4 gq = texture2D(gbufAA, uv);
      float ql = length(gq.xyz);
      float wn = pow(max(dot(g.xyz, gq.xyz) / max(gl * ql, 1e-4), 0.0), 24.0) * exp(-abs(gl - ql) * 12.0);
      float wz = exp(-abs(g.a - gq.a) / (0.015 * max(g.a, 0.2)));
      float wl = exp(-abs(lum(q.rgb) - lc) / sd);
      float w = k[x < 0 ? -x : x] * k[y < 0 ? -y : y] / (0.375 * 0.375) * wn * wz * wl;
      sum += q.rgb * w; vsum += q.a * w * w; wsum += w;
    }
    gl_FragColor = vec4(sum / wsum, vsum / (wsum * wsum));
  }
`;

// Back to radiance. The a-trous filter decides per pixel centre, which would turn every
// antialiased silhouette into stair steps: on pixels that straddle an edge (the jittered
// G-buffer disagrees with the centre sample) keep the traced, antialiased value instead.
const REMOD = /* glsl */ `
  uniform sampler2D tex; uniform sampler2D raw; uniform sampler2D albedo; uniform sampler2D overlay;
  uniform sampler2D gbuf; uniform sampler2D gbufAA; uniform vec2 px; varying vec2 vUv;
  float lumA(vec2 uv) { return dot(max(texture2D(albedo, uv).rgb, vec3(0.03)), vec3(0.2126, 0.7152, 0.0722)); }
  void main() {
    vec3 al = max(texture2D(albedo, vUv).rgb, vec3(0.03));
    vec4 c = texture2D(gbuf, vUv);
    vec4 a = texture2D(gbufAA, vUv);
    float bend = 1.0 - length(a.xyz);
    float step_ = abs(a.a - c.a) / max(c.a, 0.1);
    float edge = clamp(max(bend * 14.0, step_ * 60.0), 0.0, 1.0);
    if (c.a <= 0.0) edge = 1.0;
    // Where the albedo itself jumps on one plane (the runner on the boards, a decal on a door)
    // there is no geometric edge, but the traced coverage and the rastered albedo disagree by a
    // fraction of a pixel all the same: the quotient spiked into a pale one-pixel rim along the
    // runner. Such pixels go the radiance way too.
    float la = lumA(vUv);
    float ae = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 o = i == 0 ? vec2(px.x, 0.0) : i == 1 ? vec2(-px.x, 0.0) : i == 2 ? vec2(0.0, px.y) : vec2(0.0, -px.y);
      float ln = lumA(vUv + o);
      ae = max(ae, abs(ln - la) / (ln + la));
    }
    // (only a hard jump counts: the weave of the runner or the print of the paper must stay on
    // the albedo path, or they are filtered flat)
    edge = max(edge, smoothstep(0.42, 0.62, ae));
    // The filtered image is irradiance (divided by albedo, multiplied back here). The edge path
    // is plain radiance, never divided: on a pixel that straddles an edge the traced coverage and
    // the rastered albedo never agree exactly, and their quotient spikes.
    vec3 rad = mix(texture2D(tex, vUv).rgb * al, texture2D(raw, vUv).rgb, edge);
    gl_FragColor = vec4(rad, 1.0);
  }
`;

// A lone pixel (or two) several times brighter than everything round it is a path that found a
// bulb through the haze, not a highlight: a real glint has neighbours along its edge. Replace
// it by its surroundings. The glowing things (bulbs) are laid over afterwards, so a distant bulb
// two pixels wide is never taken for a speck.
const DESPECK = /* glsl */ `
  uniform sampler2D tex; uniform sampler2D overlay; uniform vec2 px; varying vec2 vUv;
  float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  void main() {
    vec3 c = texture2D(tex, vUv).rgb;
    float l = lum(c);
    float mx = 0.0; vec3 mean = vec3(0.0); float n = 0.0;
    for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
      if ((x < 0 ? -x : x) < 2 && (y < 0 ? -y : y) < 2) continue;
      vec3 s = texture2D(tex, vUv + vec2(float(x), float(y)) * px).rgb;
      mx = max(mx, lum(s)); mean += s; n += 1.0;
    }
    if (l > 2.5 * mx + 0.0015) c = mean / n;
    gl_FragColor = vec4(c + texture2D(overlay, vUv).rgb, 1.0);
  }
`;

const MAX_LAMPS = 12;
const FOG = /* glsl */ `
  #define MAX_LAMPS ${MAX_LAMPS}
  uniform sampler2D tex; uniform sampler2D gbuf;
  uniform mat4 invProj; uniform mat4 camWorld; uniform vec3 camPos;
  uniform vec3 lampPos[MAX_LAMPS]; uniform vec3 lampDir[MAX_LAMPS]; uniform vec3 lampCol[MAX_LAMPS]; uniform vec4 lampCone[MAX_LAMPS];
  uniform int lampCount; uniform float scatterK; uniform float extinction; uniform float halfWidth; uniform float seed; uniform vec3 ambient; uniform float nearR2;
  varying vec2 vUv;
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float dust(vec3 p) { return 0.55 + 0.9 * vnoise(p * 1.7) * vnoise(p * 4.3 + 7.0); }
  void main() {
    vec4 g = texture2D(gbuf, vUv);
    vec3 col = texture2D(tex, vUv).rgb;
    if (scatterK <= 0.0 && extinction <= 0.0) { gl_FragColor = vec4(col, 1.0); return; }
    vec4 pv = invProj * vec4(vUv * 2.0 - 1.0, 0.0, 1.0);
    vec3 dirV = normalize(vec3(pv.xy / -pv.z, -1.0));
    vec3 dir = normalize(mat3(camWorld) * dirV);
    float zmax = g.a > 0.0 ? g.a : 60.0;
    float tmax = zmax / -dirV.z;
    const int STEPS = 48;
    float jitter = hash(vec3(gl_FragCoord.xy, seed));
    vec3 scatter = vec3(0.0);
    float dt = tmax / float(STEPS);
    for (int i = 0; i < STEPS; i++) {
      float t = (float(i) + jitter) * dt;
      vec3 p = camPos + dir * t;
      if (abs(p.x) > halfWidth) continue;
      float dens = dust(p);
      vec3 l = vec3(0.0);
      for (int k = 0; k < MAX_LAMPS; k++) {
        if (k >= lampCount) break;
        vec3 d = p - lampPos[k];
        float r2 = dot(d, d);
        float c = dot(d * inversesqrt(max(r2, 1e-6)), lampDir[k]);
        float cone = lampCone[k].z > 0.5 ? 1.0 : smoothstep(lampCone[k].x, lampCone[k].y, c);
        // A soft core: the inverse square is held flat inside about 60 cm of the bulb, so the
        // air right under a lamp glows a little, not as a hot box over whatever is behind it.
        l += lampCol[k] * cone / (r2 + nearR2);
      }
      scatter += (l * scatterK * dens + ambient) * exp(-extinction * t) * dt;
    }
    float trans = exp(-extinction * tmax);
    gl_FragColor = vec4(col * trans + scatter, 1.0);
  }
`;

const DOWN = /* glsl */ `
  uniform sampler2D tex; uniform vec2 px; uniform float clampMax; varying vec2 vUv;
  void main() {
    vec3 s = vec3(0.0);
    s += min(texture2D(tex, vUv + px * vec2(-1.0, -1.0)).rgb, clampMax);
    s += min(texture2D(tex, vUv + px * vec2( 1.0, -1.0)).rgb, clampMax);
    s += min(texture2D(tex, vUv + px * vec2(-1.0,  1.0)).rgb, clampMax);
    s += min(texture2D(tex, vUv + px * vec2( 1.0,  1.0)).rgb, clampMax);
    gl_FragColor = vec4(s * 0.25, 1.0);
  }
`;
const UP = /* glsl */ `
  uniform sampler2D tex; uniform sampler2D prev; uniform vec2 px; uniform float mixIn; varying vec2 vUv;
  void main() {
    vec3 s = vec3(0.0);
    s += texture2D(prev, vUv + px * vec2(-1.0, -1.0)).rgb + texture2D(prev, vUv + px * vec2(1.0, -1.0)).rgb;
    s += texture2D(prev, vUv + px * vec2(-1.0, 1.0)).rgb + texture2D(prev, vUv + px * vec2(1.0, 1.0)).rgb;
    s += 2.0 * (texture2D(prev, vUv + px * vec2(-2.0, 0.0)).rgb + texture2D(prev, vUv + px * vec2(2.0, 0.0)).rgb);
    s += 2.0 * (texture2D(prev, vUv + px * vec2(0.0, -2.0)).rgb + texture2D(prev, vUv + px * vec2(0.0, 2.0)).rgb);
    gl_FragColor = vec4(mix(texture2D(tex, vUv).rgb, s / 12.0, mixIn), 1.0);
  }
`;

const FINAL = /* glsl */ `
  uniform sampler2D tex; uniform sampler2D bloom; uniform sampler2D halo;
  uniform float exposure; uniform float bloomStrength; uniform float haloStrength; uniform float k1; uniform float zoom; uniform float ca;
  uniform float vignette; uniform float grain; uniform float seed; uniform float aspect; uniform vec2 res; uniform float sat;
  uniform float soft; uniform float contrast; uniform vec3 balance; uniform vec3 lift; uniform float white; uniform float ghost; uniform float toe;
  varying vec2 vUv;
  // The film curve. It works on the brightest channel and scales the colour with it, so a pool
  // of tungsten light keeps its hue all the way down its edge (a per-channel curve bends the
  // edge of every pool to red) and only bleaches towards white where it is about to clip. Nearly
  // Straight up to the knee, so the fall-off inside a pool of light survives as it is (the wall
  // is four times brighter at the top of a pool than at the rail), then an exponential shoulder
  // for the glass and the bulb.
  vec3 film(vec3 c) {
    c *= exposure * 1.08;
    float m = max(max(c.r, c.g), max(c.b, 1e-6));
    float knee = white;
    float t = m < knee ? m : knee + (1.0 - knee) * (1.0 - exp(-(m - knee) / (1.0 - knee)));
    // the toe of the negative: the deep shadows are compressed (never clipped: the print's own
    // black, the lift, is added after), so the dark between the lamps stays dark
    // (the toe takes 1 / (1 + toe) off everything, white included: white is given back at the
    // top of the curve only, so the shadows and the midtones stay exactly where they were)
    t *= (t / (t + toe)) * mix(1.0, 1.0 + toe, smoothstep(0.55, 0.97, t));
    vec3 o = c * (t / m);
    // what is far over white burns out to white: the core of a lamp, the bulb
    float bleach = 0.5 * smoothstep(0.7, 1.0, t) + 0.5 * smoothstep(1.2, 3.2, m);
    o = mix(o, vec3(t), bleach);
    return clamp(o, 0.0, 1.0);
  }
  vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
  float h21(vec2 p, float s) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973) + s * 0.137); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  // value noise, for grain with the soft clumps of the site's film layer (an SVG turbulence at
  // 0.9 cycles a pixel, two octaves): not one independent value per pixel
  float vn(vec2 p, float s) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i, s), h21(i + vec2(1.0, 0.0), s), f.x), mix(h21(i + vec2(0.0, 1.0), s), h21(i + vec2(1.0, 1.0), s), f.x), f.y);
  }
  vec2 distort(vec2 uv, float k) {
    vec2 c = (uv - 0.5) * vec2(aspect, 1.0);
    float r2 = dot(c, c);
    c *= (1.0 + k * r2) * zoom;
    return c / vec2(aspect, 1.0) + 0.5;
  }
  // the warm glow of the bulbs spread wide by the lens and the emulsion (halation is red-orange)
  // and a faint ghost of the brightest things, mirrored through the middle of the frame
  vec3 glow(vec2 uv) {
    vec3 g = bloomStrength * texture2D(bloom, uv).rgb + haloStrength * texture2D(halo, uv).rgb * vec3(1.0, 0.5, 0.22);
    vec2 m = vec2(0.5) + (vec2(0.5) - uv) * 0.82;
    g += ghost * texture2D(halo, m).rgb * vec3(0.45, 1.0, 0.7) * smoothstep(0.75, 0.2, length(uv - 0.5));
    return g;
  }
  // A lens is sharp in the middle and soft towards the corners: a small disc of taps whose
  // radius grows with the square of the image height, stretched along the radius (coma, field
  // curvature), on top of whatever the aperture already did in the tracer.
  vec3 sampleHdr(vec2 uv, float r2n, vec2 dir) {
    vec3 c = texture2D(tex, uv).rgb;
    float rad = soft * r2n;
    if (rad > 0.15) {
      vec2 px = 1.0 / res;
      vec2 tang = vec2(-dir.y, dir.x);
      vec3 acc = c; float w = 1.0;
      for (int i = 0; i < 8; i++) {
        float a = (float(i) + 0.5) * 0.7853982;
        float rr = (i < 4 ? 1.0 : 0.55) * rad;
        vec2 o = (dir * cos(a) * 1.45 + tang * sin(a) * 0.8) * rr;
        acc += texture2D(tex, uv + o * px).rgb; w += 1.0;
      }
      c = acc / w;
    }
    return c + glow(uv);
  }
  void main() {
    vec2 c = (vUv - 0.5) * vec2(aspect, 1.0);
    float r2 = dot(c, c) / (0.25 * (aspect * aspect + 1.0));
    vec2 dir = length(c) > 1e-5 ? normalize(c) : vec2(1.0, 0.0);
    // barrel distortion, a touch more for red than for blue: lateral chromatic aberration
    vec3 col;
    col.r = sampleHdr(distort(vUv, k1 + ca), r2, dir).r;
    col.g = sampleHdr(distort(vUv, k1), r2, dir).g;
    col.b = sampleHdr(distort(vUv, k1 - ca), r2, dir).b;
    col *= 1.0 / pow(1.0 + vignette * r2, 2.0);
    col *= balance;
    col = film(col);
    col = pow(col, vec3(contrast));
    col = toSRGB(col);
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    // colour dies in the shadows of a negative: below about luma 20 the wood stops being red
    col = mix(vec3(l), col, sat * mix(0.5, 1.0, smoothstep(0.015, 0.1, l)));
    // the toe: scene black is not paper black. It lands a little above zero, a little warm, and
    // whatever structure the shadows have rides on top of it
    // one hue over everything is a tint, not a photograph: the deep shadows drift a little
    // cooler and greener than the tungsten pools (their level is not touched)
    col *= mix(vec3(0.93, 1.02, 1.07), vec3(1.0), smoothstep(0.02, 0.22, l));
    col = lift + col * (1.0 - lift);
    // grain, matched to the film layer the site lays over its hero: clumps of about two pixels,
    // nearly monochrome with a little colour, strongest in the low midtones, fading into the
    // blacks and into the highlights
    vec2 p = gl_FragCoord.xy;
    float n = (vn(p * 0.58, seed) + 0.6 * vn(p * 1.1 + 31.0, seed + 3.0) - 0.8) * 1.7;
    vec3 chroma = vec3(vn(p * 0.5 + 7.0, seed + 11.0), vn(p * 0.5 + 13.0, seed + 12.0), vn(p * 0.5 + 19.0, seed + 13.0)) - 0.5;
    float amt = grain * (0.3 + 0.7 * smoothstep(0.02, 0.18, l)) * (1.0 - 0.75 * smoothstep(0.45, 0.95, l));
    col += n * vec3(1.0, 0.98, 0.94) * amt + chroma * (0.4 * amt + 0.006 * (1.0 - smoothstep(0.03, 0.2, l)));
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

// Debug views: depth (grey = metres / 30, red where the G-buffer is empty) or the fog alone.
const DEBUG = /* glsl */ `
  uniform sampler2D gbuf; uniform sampler2D a; uniform sampler2D b; uniform int mode; varying vec2 vUv;
  void main() {
    vec4 g = texture2D(gbuf, vUv);
    if (mode == 0) { gl_FragColor = g.a <= 0.0 ? vec4(1.0, 0.0, 0.0, 1.0) : vec4(vec3(g.a / 30.0), 1.0); return; }
    vec3 f = texture2D(b, vUv).rgb - texture2D(a, vUv).rgb;
    gl_FragColor = vec4(sqrt(max(f * 2.0, 0.0)), 1.0);
  }
`;

export class Pipeline {
  constructor(canvas) {
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setClearColor(0x000000, 1);
    this.renderer = renderer;
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
    this.gl = gl;

    const pt = new WebGLPathTracer(renderer);
    pt.renderDelay = 0;
    pt.minSamples = 0;
    pt.fadeDuration = 0;
    pt.dynamicLowRes = false;
    pt.rasterizeScene = false;
    pt.renderToCanvas = false;
    // The tracer's stratified sample table is (bounces + transmissiveBounces + 5) wide and 20
    // high; the shader reads columns 0 to 16 of it and one row per ray of a path. Outside the
    // table a read returns nothing, and every sample of a pixel then gets the same "random"
    // number (its blue-noise offset): the russian roulette of a long path never fires on the
    // pixels whose offset is small, and with the haze (long paths, a column 16 read) that showed
    // as a lattice of bright dots, one per 64 px tile. So: a table 20 wide (7 + 8 + 5), and the
    // reads wrapped into it.
    pt.bounces = 7;
    pt.transmissiveBounces = 8;
    pt.filterGlossyFactor = 0.5;
    pt.multipleImportanceSampling = true;
    pt.tiles.set(1, 1);
    pt.textureSize.set(2048, 2048);
    // The tracer steps a ray off a surface by RAY_OFFSET * (1 + largest coordinate). The default
    // (1e-4) is 3 mm at the far end of a 29 m corridor: more than a decal floats above its wall.
    const tracing = pt._pathTracer.material;
    if (!tracing.fragmentShader.includes('#define RAY_OFFSET 1e-4')) throw new Error('RAY_OFFSET not found in the tracing shader');
    tracing.fragmentShader = tracing.fragmentShader.replace('#define RAY_OFFSET 1e-4', '#define RAY_OFFSET 3e-5');
    // The tracer focuses on a sphere round the lens (a fixed distance along every ray). A lens
    // focuses on a plane, and the raster G-buffers below are taken through a plane-focus lens:
    // make the tracer agree, or the denoiser divides a blurred edge by a sharp one.
    const sphere = 'vec3 focalPoint = ray.origin + normalize( ray.direction ) * physicalCamera.focusDistance;';
    if (!tracing.fragmentShader.includes(sphere)) throw new Error('focal point not found in the tracing shader');
    tracing.fragmentShader = tracing.fragmentShader.replace(
      sphere,
      'vec3 camFwd = normalize( ( cameraWorldMatrix * vec4( 0.0, 0.0, - 1.0, 0.0 ) ).xyz ); vec3 focalPoint = ray.origin + normalize( ray.direction ) * ( physicalCamera.focusDistance / max( dot( normalize( ray.direction ), camFwd ), 0.05 ) );',
    );
    // (see the note at pt.bounces above: reads of the stratified table are wrapped into it)
    const table = 'ivec2 uv = ivec2( v, sobolBounceIndex );';
    if (!tracing.fragmentShader.includes(table)) throw new Error('stratified table read not found in the tracing shader');
    tracing.fragmentShader = tracing.fragmentShader.replace(table, 'ivec2 tsz = textureSize( stratifiedTexture, 0 ); ivec2 uv = ivec2( v % tsz.x, int( sobolBounceIndex ) % tsz.y );');
    // The tracer gives every pixel one fixed offset (a 64 px blue-noise tile) for all its random
    // numbers, for the whole frame. Give every pixel, sample, bounce and dimension its own.
    const swap = (from, to) => {
      if (!tracing.fragmentShader.includes(from)) throw new Error(`not found in the tracing shader: ${from}`);
      tracing.fragmentShader = tracing.fragmentShader.replace(from, to);
    };
    swap('vec4 pixelSeed = vec4( 0 );', 'vec4 pixelSeed = vec4( 0 ); uint frameSeed = 0u;');
    swap('pixelSeed = texture( stratifiedOffsetTexture, uv );', 'pixelSeed = texture( stratifiedOffsetTexture, uv ); frameSeed = uint( frame );');
    swap(
      'return fract( stratifiedSample + pixelSeed.r );',
      `uint hh = uint( gl_FragCoord.x ) * 1973u + uint( gl_FragCoord.y ) * 9277u + frameSeed * 26699u + uint( v ) * 7919u + sobolBounceIndex * 104729u;
      hh ^= hh >> 16u; hh *= 0x7feb352du; hh ^= hh >> 15u; hh *= 0x846ca68bu; hh ^= hh >> 16u;
      uint h2 = hh * 0x9e3779b9u + 0x7f4a7c15u; h2 ^= h2 >> 15u; h2 *= 0x2c1b3c6du; h2 ^= h2 >> 12u;
      vec4 off = vec4( float( hh & 0xffffu ), float( hh >> 16u ), float( h2 & 0xffffu ), float( h2 >> 16u ) ) / 65536.0;
      return fract( stratifiedSample + off );`,
    );
    tracing.needsUpdate = true;
    this.pt = pt;

    const rt = (type = THREE.FloatType, filter = THREE.NearestFilter) =>
      new THREE.WebGLRenderTarget(4, 4, { type, format: THREE.RGBAFormat, minFilter: filter, magFilter: filter, depthBuffer: false });
    this.rt = {
      a: rt(),
      b: rt(),
      albedo: rt(THREE.HalfFloatType),
      albedoTmp: new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true }),
      gbuf: new THREE.WebGLRenderTarget(4, 4, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true }),
      gbufAA: rt(),
      gbuf2: new THREE.WebGLRenderTarget(4, 4, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true }),
      raw: rt(),
      e0: rt(),
      e1: rt(),
      overlay: rt(THREE.HalfFloatType),
      overlayTmp: new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true }),
      p0: rt(),
      p1: rt(),
      hdr: rt(THREE.FloatType, THREE.LinearFilter),
      fog: rt(THREE.FloatType, THREE.LinearFilter),
    };
    this.mips = [];
    this.q = {
      copy: fsq(COPY, { tex: { value: null }, scale: { value: 1 } }),
      acc: fsq(COPY4, { tex: { value: null }, scale: { value: 1 } }, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, transparent: true }),
      demod: fsq(DEMOD, { a: { value: null }, b: { value: null }, albedo: { value: null }, demod: { value: 1 }, px: { value: new THREE.Vector2() } }),
      prep: fsq(PREP, { tex: { value: null }, px: { value: new THREE.Vector2() } }),
      atrous: fsq(ATROUS, { tex: { value: null }, gbuf: { value: null }, px: { value: new THREE.Vector2() }, stepSize: { value: 1 }, invProj: { value: new THREE.Matrix4() }, sigmaL: { value: 4 } }),
      atrousEdge: fsq(ATROUS_EDGE, { tex: { value: null }, gbufAA: { value: null }, px: { value: new THREE.Vector2() }, stepSize: { value: 1 }, sigmaL: { value: 6 } }),
      despeck: fsq(DESPECK, { tex: { value: null }, overlay: { value: null }, px: { value: new THREE.Vector2() } }),
      remod: fsq(REMOD, { px: { value: new THREE.Vector2() }, tex: { value: null }, raw: { value: null }, albedo: { value: null }, overlay: { value: null }, gbuf: { value: null }, gbufAA: { value: null } }),
      fog: fsq(FOG, {
        tex: { value: null },
        gbuf: { value: null },
        invProj: { value: new THREE.Matrix4() },
        camWorld: { value: new THREE.Matrix4() },
        camPos: { value: new THREE.Vector3() },
        lampPos: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector3()) },
        lampDir: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector3(0, -1, 0)) },
        lampCol: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector3()) },
        lampCone: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector4()) },
        lampCount: { value: 0 },
        scatterK: { value: 0.002 },
        extinction: { value: 0.012 },
        halfWidth: { value: 1 },
        seed: { value: 0 },
        ambient: { value: new THREE.Vector3() },
        nearR2: { value: 0.36 },
      }),
      down: fsq(DOWN, { tex: { value: null }, px: { value: new THREE.Vector2() }, clampMax: { value: 1e6 } }),
      up: fsq(UP, { tex: { value: null }, prev: { value: null }, px: { value: new THREE.Vector2() }, mixIn: { value: 0.6 } }),
      final: fsq(FINAL, {
        tex: { value: null },
        bloom: { value: null },
        exposure: { value: 1 },
        bloomStrength: { value: 0.05 },
        k1: { value: 0.05 },
        zoom: { value: 1 },
        ca: { value: 0.0018 },
        vignette: { value: 0.55 },
        grain: { value: 0.022 },
        seed: { value: 0 },
        aspect: { value: 1 },
        res: { value: new THREE.Vector2() },
        sat: { value: 0.88 },
        halo: { value: null },
        haloStrength: { value: 0 },
        soft: { value: 0 },
        contrast: { value: 1 },
        lift: { value: new THREE.Vector3() },
        white: { value: 4 },
        toe: { value: 0.03 },
        ghost: { value: 0 },
        balance: { value: new THREE.Vector3(1, 1, 1) },
      }),
    };
    this.gbufMat = new THREE.ShaderMaterial({ vertexShader: GBUF_VERT, fragmentShader: GBUF_FRAG, side: THREE.DoubleSide });
    this.blackMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    this.albedoMats = new Map();
    this.w = 0;
    this.h = 0;
  }

  setSize(w, h) {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    for (const t of Object.values(this.rt)) t.setSize(w, h);
    for (const m of this.mips) m.dispose();
    this.mips = [];
    let mw = w;
    let mh = h;
    for (let i = 0; i < 6; i++) {
      mw = Math.max(2, Math.round(mw / 2));
      mh = Math.max(2, Math.round(mh / 2));
      this.mips.push(new THREE.WebGLRenderTarget(mw, mh, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }));
    }
    this.mipsUp = this.mips.map((m) => m.clone());
  }

  // Debug: mean and median luminance of a rectangle (fractions of the frame, origin bottom left)
  // of one of the float targets of the last frame: 'a' (a traced half), 'hdr' (after the denoiser).
  probe(name, [x0, y0, x1, y1]) {
    const t = this.rt[name];
    const x = Math.floor(x0 * this.w);
    const y = Math.floor(y0 * this.h);
    const w = Math.max(1, Math.floor((x1 - x0) * this.w));
    const h = Math.max(1, Math.floor((y1 - y0) * this.h));
    const px = new Float32Array(w * h * 4);
    this.renderer.readRenderTargetPixels(t, x, y, w, h, px);
    const l = [];
    let sum = 0;
    let bad = 0;
    for (let i = 0; i < px.length; i += 4) {
      const v = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      if (!Number.isFinite(v)) bad++;
      else {
        l.push(v);
        sum += v;
      }
    }
    l.sort((p, q) => p - q);
    return { mean: sum / Math.max(1, l.length), median: l[l.length >> 1], p90: l[Math.floor(l.length * 0.9)], max: l[l.length - 1], bad, n: l.length };
  }

  // Block until the GPU has caught up (gl.finish alone does not wait under ANGLE Metal).
  sync(target) {
    const px = new Float32Array(4);
    this.renderer.readRenderTargetPixels(target, 0, 0, 1, 1, px);
  }

  pass(quad, target) {
    this.renderer.setRenderTarget(target);
    quad.render(this.renderer);
  }

  // Build or update the path tracer's copy of the scene. Call after any geometry change.
  setScene(scene, camera) {
    this.scene = scene;
    scene.updateMatrixWorld(true);
    const hidden = [];
    scene.traverse((o) => {
      if (o.userData.overlay && o.visible) {
        o.visible = false;
        hidden.push(o);
      }
    });
    // a fog volume is for the tracer only: the raster passes must never draw its box
    const volumes = [];
    scene.traverse((o) => {
      if (o.userData.volume) {
        volumes.push(o);
        o.visible = o.userData.volumeOn !== false;
      }
    });
    // The tracer packs every texture into one array, and here a texture cannot be larger than
    // about 1.34 GB (80 layers at 2048 px worked, 84 did not). Past that the allocation fails
    // with a console warning only and every frame comes back black in two seconds: refuse instead.
    {
      const layers = new Set();
      scene.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) for (const k in m) if (m[k] && m[k].isTexture) layers.add(`${m[k].source.uuid}:${m[k].colorSpace}`);
      });
      this.layers = layers.size;
      const bytes = layers.size * this.pt.textureSize.x * this.pt.textureSize.y * 4;
      if (bytes > 1.32e9) throw new Error(`${layers.size} texture layers (${(bytes / 1e9).toFixed(2)} GB): more than the tracer's texture array can hold`);
    }
    this.pt.setScene(scene, camera);
    for (const o of hidden) o.visible = true;
    for (const o of volumes) o.visible = false;
  }
  // The tracing shader is compiled for the features the scene uses; wait for it, a sample
  // asked for while it compiles is silently dropped.
  async compiled() {
    const tracer = this.pt._pathTracer;
    tracer.material.onBeforeRender();
    await tracer.compileMaterial();
    while (tracer.isCompiling) await new Promise((r) => setTimeout(r, 30));
  }
  refresh({ materials = false, lights = false } = {}) {
    if (materials) this.pt.updateMaterials();
    if (lights) this.pt.updateLights();
  }

  albedoFor(m) {
    let a = this.albedoMats.get(m.uuid);
    if (!a) {
      const glow = m.emissiveIntensity > 0 && m.emissive && m.emissive.getHex() !== 0;
      const flat = glow || m.transmission > 0;
      a = new THREE.MeshBasicMaterial({
        map: flat ? null : m.map,
        color: flat ? new THREE.Color(1, 1, 1) : m.color,
        vertexColors: flat ? false : m.vertexColors,
        transparent: m.transparent,
        opacity: m.opacity,
        side: m.side,
        depthWrite: m.depthWrite,
        polygonOffset: m.polygonOffset,
        polygonOffsetFactor: m.polygonOffsetFactor,
        polygonOffsetUnits: m.polygonOffsetUnits,
      });
      this.albedoMats.set(m.uuid, a);
    }
    return a;
  }

  // Raster a pass over the scene with sub-pixel jitter, averaged into `target`.
  // With an aperture (camera.bokehSize, millimetres) each pass is also taken from another point
  // of the lens, the frustum sheared so the plane of focus stays put: the buffers get the same
  // depth of field as the traced image.
  accumulate(camera, target, tmp, n, draw, clearAlpha = 1) {
    const { renderer, w, h } = this;
    renderer.setClearColor(0x000000, clearAlpha);
    renderer.setRenderTarget(target);
    renderer.clear();
    const r = mulberry(1234);
    const R = ((camera.bokehSize ?? 0) * 0.5) / 1000;
    const lens = R > 0 && n > 1;
    const home = camera.position.clone();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
    const P = h / (2 * Math.tan((camera.fov * Math.PI) / 360)) / (camera.focusDistance ?? 1);
    for (let i = 0; i < n; i++) {
      let jx = n === 1 ? 0 : r() - 0.5;
      let jy = n === 1 ? 0 : r() - 0.5;
      if (lens) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * R;
        const dx = Math.cos(a) * d;
        const dy = Math.sin(a) * d;
        camera.position.copy(home).addScaledVector(right, dx).addScaledVector(up, dy);
        camera.updateMatrixWorld(true);
        jx -= dx * P;
        jy += dy * P;
      }
      camera.setViewOffset(w, h, jx, jy, w, h);
      renderer.setRenderTarget(tmp);
      renderer.clear();
      draw();
      this.q.acc.material.uniforms.tex.value = tmp.texture;
      this.q.acc.material.uniforms.scale.value = 1 / n;
      renderer.autoClear = false;
      this.pass(this.q.acc, target);
      renderer.autoClear = true;
    }
    camera.clearViewOffset();
    if (lens) {
      camera.position.copy(home);
      camera.updateMatrixWorld(true);
    }
  }

  // opts: { camera, poses(sample 0..1) -> applies the camera pose for that shutter time,
  //         samples, seed, exposure, lamps: [{pos, dir, color, cone}], fog, grain, post }
  render(opts) {
    const { renderer, pt, rt, q, scene, w, h } = this;
    const { camera, samples = 32, seed = 1, exposure = 1, lamps = [], shutter } = opts;
    if (opts.bounces && pt.bounces !== opts.bounces) pt.bounces = Math.max(4, opts.bounces);
    if (pt.bounces + pt.transmissiveBounces + 5 < 17) throw new Error('stratified table too narrow: raise bounces or transmissiveBounces');
    const taps = (camera.bokehSize ?? 0) > 0 ? 64 : 12;
    const t0 = performance.now();
    seedRandom(seed);
    pt._pathTracer.material.seed = (seed * 7919) % 100000;
    // The tracer's stratified sampler keeps its shuffle between frames, so without this the
    // noise of a frame depends on which frames were rendered before it in the same browser. A
    // fresh sampler (shuffled from the seeded Math.random) makes a frame a function of its seed
    // alone: the held walk frame and the scare frames then differ only where the door moved.
    // (same dimensions as renderSample asks for, or it builds another one mid-frame)
    const ptm = pt._pathTracer.material;
    const strat = ptm.stratifiedTexture;
    strat.sampler = null;
    strat.init(20, ptm.bounces + ptm.transmissiveBounces + 5);

    // 1. path trace, two halves
    const half = Math.max(1, Math.floor(samples / 2));
    const srand = mulberry(seed + 99);
    if (shutter) shutter(0.5);
    camera.updateMatrixWorld(true);
    pt._pathTracer.setCamera(camera);
    for (const target of [rt.a, rt.b]) {
      pt.reset();
      for (let i = 0; i < half; i++) {
        if (shutter) {
          shutter((i + srand()) / half);
          camera.updateMatrixWorld(true);
          pt._pathTracer.setCamera(camera);
        }
        pt.renderSample();
      }
      q.copy.material.uniforms.tex.value = pt.target.texture;
      q.copy.material.uniforms.scale.value = 1;
      this.pass(q.copy, target);
    }
    if (shutter) {
      shutter(0.5);
      camera.updateMatrixWorld(true);
    }
    this.sync(rt.b);
    const t1 = performance.now();

    // 2. G-buffers and the overlay
    const meshes = [];
    const overlays = [];
    scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      if (o.userData.overlay) overlays.push(o);
      else meshes.push([o, o.material]);
    });
    // albedo, antialiased like the traced image
    for (const o of overlays) o.visible = false;
    for (const [o, m] of meshes) o.material = this.albedoFor(m);
    this.accumulate(camera, rt.albedo, rt.albedoTmp, taps, () => renderer.render(scene, camera));
    // view normal + depth: one centre sample, decals left out
    for (const [o, m] of meshes) {
      o.material = m;
      if (m.transparent) o.visible = false;
    }
    scene.overrideMaterial = this.gbufMat;
    renderer.setRenderTarget(rt.gbuf);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    // the same again, jittered and averaged: where it disagrees with the centre sample there is an edge
    this.accumulate(camera, rt.gbufAA, rt.gbuf2, taps, () => renderer.render(scene, camera), 0);
    renderer.setClearColor(0x000000, 1);
    scene.overrideMaterial = null;
    // overlay: the scene in black as an occluder, the glowing things as they are
    for (const [o, m] of meshes) {
      o.visible = !m.transparent;
      o.material = this.blackMat;
    }
    for (const o of overlays) o.visible = true;
    this.accumulate(camera, rt.overlay, rt.overlayTmp, taps, () => renderer.render(scene, camera));
    for (const [o, m] of meshes) {
      o.material = m;
      o.visible = true;
    }

    // 3. denoise
    const px = new THREE.Vector2(1 / w, 1 / h);
    const invProj = camera.projectionMatrixInverse;
    q.demod.material.uniforms.a.value = rt.a.texture;
    q.demod.material.uniforms.b.value = rt.b.texture;
    q.demod.material.uniforms.albedo.value = rt.albedo.texture;
    q.demod.material.uniforms.px.value = px;
    // the edge path first: radiance, firefly clamped, into rt.raw
    q.demod.material.uniforms.demod.value = 0;
    this.pass(q.demod, rt.p0);
    q.prep.material.uniforms.tex.value = rt.p0.texture;
    q.prep.material.uniforms.px.value = px;
    this.pass(q.prep, rt.raw);
    // then the irradiance for the filter
    q.demod.material.uniforms.demod.value = 1;
    this.pass(q.demod, rt.p0);
    this.pass(q.prep, rt.p1);
    let src = rt.p1;
    let dst = rt.p0;
    const iterations = opts.denoise === false ? 0 : (opts.iterations ?? 5);
    for (let i = 0; i < iterations; i++) {
      const u = q.atrous.material.uniforms;
      u.tex.value = src.texture;
      u.gbuf.value = rt.gbuf.texture;
      u.px.value = px;
      u.stepSize.value = 1 << i;
      u.invProj.value = invProj;
      u.sigmaL.value = opts.sigmaL ?? 3.5;
      this.pass(q.atrous, dst);
      [src, dst] = [dst, src];
    }
    q.remod.material.uniforms.tex.value = src.texture;
    q.remod.material.uniforms.albedo.value = rt.albedo.texture;
    q.remod.material.uniforms.overlay.value = rt.overlay.texture;
    // edge pixels: filtered among themselves
    let esrc = rt.raw;
    let edst = rt.e0;
    for (let i = 0; i < (opts.denoise === false ? 0 : 5); i++) {
      const u = q.atrousEdge.material.uniforms;
      u.tex.value = esrc.texture;
      u.gbufAA.value = rt.gbufAA.texture;
      u.px.value = px;
      u.stepSize.value = 1 << i;
      u.sigmaL.value = 9;
      this.pass(q.atrousEdge, edst);
      esrc = edst;
      edst = edst === rt.e0 ? rt.e1 : rt.e0;
    }
    q.remod.material.uniforms.raw.value = esrc.texture;
    q.remod.material.uniforms.gbuf.value = rt.gbuf.texture;
    q.remod.material.uniforms.gbufAA.value = rt.gbufAA.texture;
    q.remod.material.uniforms.px.value = px;
    // (the filter's result is in src: write into the other of the pair)
    this.pass(q.remod, dst);
    q.despeck.material.uniforms.tex.value = dst.texture;
    q.despeck.material.uniforms.overlay.value = rt.overlay.texture;
    q.despeck.material.uniforms.px.value = px;
    this.pass(q.despeck, rt.hdr);

    // 4. dust in the light
    {
      const u = q.fog.material.uniforms;
      u.tex.value = rt.hdr.texture;
      u.gbuf.value = rt.gbuf.texture;
      u.invProj.value = invProj;
      u.camWorld.value = camera.matrixWorld;
      u.camPos.value.setFromMatrixPosition(camera.matrixWorld);
      u.lampCount.value = Math.min(lamps.length, MAX_LAMPS);
      lamps.slice(0, MAX_LAMPS).forEach((l, i) => {
        u.lampPos.value[i].copy(l.pos);
        u.lampDir.value[i].copy(l.dir);
        u.lampCol.value[i].copy(l.color);
        u.lampCone.value[i].set(l.cone[0], l.cone[1], l.omni ? 1 : 0, 0);
      });
      // with a real volume in the tracer (opts.volume) this pass stays out of the way
      u.scatterK.value = opts.scatter ?? (opts.volume ? 0 : LOOK.dust);
      u.extinction.value = opts.extinction ?? (opts.volume ? 0 : LOOK.extinction);
      u.halfWidth.value = opts.halfWidth ?? 1;
      u.seed.value = seed % 977;
      u.ambient.value.set(...(opts.fogAmbient ?? [0, 0, 0]));
      u.nearR2.value = opts.fogCore ?? 0.36;
      this.pass(q.fog, rt.fog);
    }

    // 5. bloom pyramid
    {
      let prev = rt.fog;
      this.mips.forEach((m, i) => {
        const u = q.down.material.uniforms;
        u.tex.value = prev.texture;
        u.px.value.set(0.5 / prev.width, 0.5 / prev.height);
        u.clampMax.value = i === 0 ? 40 : 1e6;
        this.pass(q.down, m);
        prev = m;
      });
      let up = this.mips[this.mips.length - 1];
      for (let i = this.mips.length - 2; i >= 0; i--) {
        const u = q.up.material.uniforms;
        u.tex.value = this.mips[i].texture;
        u.prev.value = up.texture;
        u.px.value.set(1 / up.width, 1 / up.height);
        u.mixIn.value = 0.62;
        this.pass(q.up, this.mipsUp[i]);
        up = this.mipsUp[i];
      }
      this.bloomTex = up.texture;
      this.haloTex = this.mipsUp[Math.min(3, this.mipsUp.length - 2)].texture;
    }

    // 6. lens, tone, grain
    {
      const u = q.final.material.uniforms;
      const post = opts.post ?? {};
      u.tex.value = rt.fog.texture;
      u.bloom.value = this.bloomTex;
      u.exposure.value = exposure;
      u.bloomStrength.value = post.bloom ?? LOOK.bloom;
      u.halo.value = this.haloTex;
      u.haloStrength.value = post.halo ?? LOOK.halo;
      u.soft.value = (post.soft ?? LOOK.soft) * (h / 900);
      u.contrast.value = post.contrast ?? LOOK.contrast;
      u.lift.value.set(...(post.lift ?? LOOK.lift));
      u.white.value = post.white ?? LOOK.white;
      u.toe.value = post.toe ?? LOOK.toe;
      u.ghost.value = post.ghost ?? LOOK.ghost;
      u.balance.value.set(...(post.balance ?? LOOK.balance));
      u.k1.value = post.k1 ?? LENS.k1;
      u.ca.value = post.ca ?? LENS.ca;
      u.vignette.value = post.vignette ?? LOOK.vignette;
      // more gain, more grain: the exposure opens up in the dark and the film shows it
      u.grain.value = (post.grain ?? LOOK.grain) * (opts.grainGain ?? 1);
      u.seed.value = (opts.grainSeed ?? seed) % 1000;
      u.aspect.value = w / h;
      u.res.value.set(w, h);
      u.sat.value = post.sat ?? LOOK.sat;
      // zoom so the barrel-distorted frame still fills its corners
      u.zoom.value = lensZoom(w / h, u.k1.value + Math.abs(u.ca.value));
      this.pass(q.final, null);
    }
    if (opts.debug === 'trace' || opts.debug === 'hdr') {
      // one traced half, or the image after the denoiser, straight to the canvas (no lens, no film)
      this.q.copy.material.uniforms.tex.value = opts.debug === 'trace' ? rt.a.texture : rt.hdr.texture;
      this.q.copy.material.uniforms.scale.value = 0.5 * exposure;
      this.pass(this.q.copy, null);
    }
    if (opts.debug === 'albedo') {
      this.q.copy.material.uniforms.tex.value = rt.albedo.texture;
      this.q.copy.material.uniforms.scale.value = 1;
      this.pass(this.q.copy, null);
    }
    if (opts.debug === 'depth' || opts.debug === 'fog') {
      if (!this.q.dbg) this.q.dbg = fsq(DEBUG, { gbuf: { value: null }, a: { value: null }, b: { value: null }, mode: { value: 0 } });
      const u = this.q.dbg.material.uniforms;
      u.gbuf.value = rt.gbuf.texture;
      u.a.value = rt.hdr.texture;
      u.b.value = rt.fog.texture;
      u.mode.value = opts.debug === 'depth' ? 0 : 1;
      this.pass(this.q.dbg, null);
    }
    renderer.setRenderTarget(null);
    this.gl.finish();
    return { trace: t1 - t0, total: performance.now() - t0, samples: half * 2 };
  }
}

export const LENS = { k1: 0.055, ca: 0.0032 };
// The look of the film and the lens, in one place.
export const LOOK = {
  dust: 0.00011, // in-scatter of the lamp cones, thin
  extinction: 0.004, // per metre: the far end loses a tenth of its contrast
  bloom: 0.2, // the glow round a lamp: 25 to 40 px at 1600 wide
  halo: 0.2, // the long warm tail: it reaches 100 to 200 px from a lamp
  ghost: 0.02,
  soft: 1.6, // radius of the corner softness, pixels at the corner of a 900 px high frame
  vignette: 0.6,
  white: 0.6, // the knee of the film curve: straight below it, a soft shoulder above
  toe: 0.09, // scene values well below this are squeezed towards black
  lift: [0.027, 0.0235, 0.02], // scene black on the print: about luma 6, a little warm
  contrast: 1.08,
  sat: 0.86,
  grain: 0.034,
  // white balance: a tungsten bulb half corrected, so the paper is cream, not orange, and the
  // red of the runner and the green of the exit sign stay colours
  balance: [0.9, 1.0, 1.22],
};
// Barrel distortion samples outside the source towards the corners: zoom in just enough.
export const lensZoom = (aspect, k) => 1 / (1 + k * 0.25 * (aspect * aspect + 1));

// The lens model of the FINAL pass, for projecting scene points to frame pixels (manifest quads).
// Returns the frame uv (0..1, origin bottom left) that shows the undistorted source uv.
export function lensForward(src, aspect, k1, zoom = 1) {
  // FINAL samples source = distort(out). Invert numerically.
  let x = src[0];
  let y = src[1];
  for (let i = 0; i < 12; i++) {
    const cx = (x - 0.5) * aspect;
    const cy = y - 0.5;
    const r2 = cx * cx + cy * cy;
    const f = (1 + k1 * r2) * zoom;
    const sx = (cx * f) / aspect + 0.5;
    const sy = cy * f + 0.5;
    x += src[0] - sx;
    y += src[1] - sy;
  }
  return [x, y];
}
