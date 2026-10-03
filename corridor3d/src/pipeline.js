// Render pipeline for one frame:
//   1. path trace the scene (three-gpu-pathtracer, WebGL2) into two independent half buffers
//   2. raster G-buffers (albedo, view normal + depth) and an overlay of the things that glow
//   3. denoise: demodulate by albedo, variance-guided edge-avoiding a-trous, remodulate
//   4. volumetric dust in the lamp cones, bloom, lens distortion, chromatic aberration,
//      vignette, exposure, ACES, film grain, sRGB
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
  uniform sampler2D a; uniform sampler2D b; uniform sampler2D albedo; varying vec2 vUv;
  float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  void main() {
    vec3 al = max(texture2D(albedo, vUv).rgb, vec3(0.03));
    vec3 ia = max(texture2D(a, vUv).rgb, 0.0) / al;
    vec3 ib = max(texture2D(b, vUv).rgb, 0.0) / al;
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
  uniform sampler2D gbuf; uniform sampler2D gbufAA; varying vec2 vUv;
  void main() {
    vec3 al = max(texture2D(albedo, vUv).rgb, vec3(0.03));
    vec4 c = texture2D(gbuf, vUv);
    vec4 a = texture2D(gbufAA, vUv);
    float bend = 1.0 - length(a.xyz);
    float step_ = abs(a.a - c.a) / max(c.a, 0.1);
    float edge = clamp(max(bend * 14.0, step_ * 60.0), 0.0, 1.0);
    if (c.a <= 0.0) edge = 1.0;
    vec3 irr = mix(texture2D(tex, vUv).rgb, texture2D(raw, vUv).rgb, edge);
    gl_FragColor = vec4(irr * al + texture2D(overlay, vUv).rgb, 1.0);
  }
`;

const MAX_LAMPS = 12;
const FOG = /* glsl */ `
  #define MAX_LAMPS ${MAX_LAMPS}
  uniform sampler2D tex; uniform sampler2D gbuf;
  uniform mat4 invProj; uniform mat4 camWorld; uniform vec3 camPos;
  uniform vec3 lampPos[MAX_LAMPS]; uniform vec3 lampDir[MAX_LAMPS]; uniform vec3 lampCol[MAX_LAMPS]; uniform vec4 lampCone[MAX_LAMPS];
  uniform int lampCount; uniform float scatterK; uniform float extinction; uniform float halfWidth; uniform float seed; uniform vec3 ambient;
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
        float d2 = max(dot(d, d), 0.02);
        float c = dot(d / sqrt(d2), lampDir[k]);
        float cone = lampCone[k].z > 0.5 ? 1.0 : smoothstep(lampCone[k].x, lampCone[k].y, c);
        l += lampCol[k] * cone / d2;
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
  uniform sampler2D tex; uniform sampler2D bloom;
  uniform float exposure; uniform float bloomStrength; uniform float k1; uniform float zoom; uniform float ca;
  uniform float vignette; uniform float grain; uniform float seed; uniform float aspect; uniform vec2 res;
  varying vec2 vUv;
  vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
  vec3 aces(vec3 color) {
    const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
    const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
    color *= exposure / 0.6;
    color = inM * color; color = RRTAndODTFit(color); color = outM * color;
    return clamp(color, 0.0, 1.0);
  }
  vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
  float h21(vec2 p, float s) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973) + s * 0.137); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  vec2 distort(vec2 uv, float k) {
    vec2 c = (uv - 0.5) * vec2(aspect, 1.0);
    float r2 = dot(c, c);
    c *= (1.0 + k * r2) * zoom;
    return c / vec2(aspect, 1.0) + 0.5;
  }
  vec3 sampleHdr(vec2 uv) { return texture2D(tex, uv).rgb + bloomStrength * texture2D(bloom, uv).rgb; }
  void main() {
    // barrel distortion, a touch more for red than for blue: lateral chromatic aberration
    vec3 col;
    col.r = sampleHdr(distort(vUv, k1 + ca)).r;
    col.g = sampleHdr(distort(vUv, k1)).g;
    col.b = sampleHdr(distort(vUv, k1 - ca)).b;
    vec2 c = (vUv - 0.5) * vec2(aspect, 1.0);
    float r2 = dot(c, c) / (0.25 * (aspect * aspect + 1.0));
    col *= 1.0 / pow(1.0 + vignette * r2, 2.0);
    col = toSRGB(aces(col));
    // grain: two octaves, stronger in the shadows and midtones than in the highlights
    vec2 p = gl_FragCoord.xy;
    float n = (h21(p, seed) + h21(p + 17.0, seed + 3.0) - 1.0) * 0.7 + (h21(floor(p * 0.5), seed + 9.0) - 0.5) * 0.6;
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    float amt = grain * (0.35 + 0.65 * (1.0 - smoothstep(0.25, 0.95, l)));
    col += n * amt * vec3(1.0, 0.97, 0.92);
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
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
    pt.bounces = 5;
    pt.transmissiveBounces = 4;
    pt.filterGlossyFactor = 0.5;
    pt.multipleImportanceSampling = true;
    pt.tiles.set(1, 1);
    pt.textureSize.set(2048, 2048);
    // The tracer steps a ray off a surface by RAY_OFFSET * (1 + largest coordinate). The default
    // (1e-4) is 3 mm at the far end of a 29 m corridor: more than a decal floats above its wall.
    const tracing = pt._pathTracer.material;
    if (!tracing.fragmentShader.includes('#define RAY_OFFSET 1e-4')) throw new Error('RAY_OFFSET not found in the tracing shader');
    tracing.fragmentShader = tracing.fragmentShader.replace('#define RAY_OFFSET 1e-4', '#define RAY_OFFSET 3e-5');
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
      demod: fsq(DEMOD, { a: { value: null }, b: { value: null }, albedo: { value: null } }),
      prep: fsq(PREP, { tex: { value: null }, px: { value: new THREE.Vector2() } }),
      atrous: fsq(ATROUS, { tex: { value: null }, gbuf: { value: null }, px: { value: new THREE.Vector2() }, stepSize: { value: 1 }, invProj: { value: new THREE.Matrix4() }, sigmaL: { value: 4 } }),
      atrousEdge: fsq(ATROUS_EDGE, { tex: { value: null }, gbufAA: { value: null }, px: { value: new THREE.Vector2() }, stepSize: { value: 1 }, sigmaL: { value: 6 } }),
      remod: fsq(REMOD, { tex: { value: null }, raw: { value: null }, albedo: { value: null }, overlay: { value: null }, gbuf: { value: null }, gbufAA: { value: null } }),
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
    this.pt.setScene(scene, camera);
    for (const o of hidden) o.visible = true;
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
  accumulate(camera, target, tmp, n, draw, clearAlpha = 1) {
    const { renderer, w, h } = this;
    renderer.setClearColor(0x000000, clearAlpha);
    renderer.setRenderTarget(target);
    renderer.clear();
    const r = mulberry(1234);
    for (let i = 0; i < n; i++) {
      const jx = n === 1 ? 0 : r() - 0.5;
      const jy = n === 1 ? 0 : r() - 0.5;
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
  }

  // opts: { camera, poses(sample 0..1) -> applies the camera pose for that shutter time,
  //         samples, seed, exposure, lamps: [{pos, dir, color, cone}], fog, grain, post }
  render(opts) {
    const { renderer, pt, rt, q, scene, w, h } = this;
    const { camera, samples = 32, seed = 1, exposure = 1, lamps = [], shutter } = opts;
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
    this.accumulate(camera, rt.albedo, rt.albedoTmp, 12, () => renderer.render(scene, camera));
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
    this.accumulate(camera, rt.gbufAA, rt.gbuf2, 12, () => renderer.render(scene, camera), 0);
    renderer.setClearColor(0x000000, 1);
    scene.overrideMaterial = null;
    // overlay: the scene in black as an occluder, the glowing things as they are
    for (const [o, m] of meshes) {
      o.visible = !m.transparent;
      o.material = this.blackMat;
    }
    for (const o of overlays) o.visible = true;
    this.accumulate(camera, rt.overlay, rt.overlayTmp, 12, () => renderer.render(scene, camera));
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
    this.pass(q.demod, rt.p0);
    q.prep.material.uniforms.tex.value = rt.p0.texture;
    q.prep.material.uniforms.px.value = px;
    this.pass(q.prep, rt.p1);
    q.copy.material.uniforms.tex.value = rt.p1.texture;
    q.copy.material.uniforms.scale.value = 1;
    this.pass(q.copy, rt.raw);
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
    for (let i = 0; i < (opts.denoise === false ? 0 : 4); i++) {
      const u = q.atrousEdge.material.uniforms;
      u.tex.value = esrc.texture;
      u.gbufAA.value = rt.gbufAA.texture;
      u.px.value = px;
      u.stepSize.value = 1 << i;
      u.sigmaL.value = 6;
      this.pass(q.atrousEdge, edst);
      esrc = edst;
      edst = edst === rt.e0 ? rt.e1 : rt.e0;
    }
    q.remod.material.uniforms.raw.value = esrc.texture;
    q.remod.material.uniforms.gbuf.value = rt.gbuf.texture;
    q.remod.material.uniforms.gbufAA.value = rt.gbufAA.texture;
    this.pass(q.remod, rt.hdr);

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
      u.scatterK.value = opts.scatter ?? 0.00045;
      u.extinction.value = opts.extinction ?? 0.006;
      u.halfWidth.value = opts.halfWidth ?? 1;
      u.seed.value = seed % 977;
      u.ambient.value.set(...(opts.fogAmbient ?? [0, 0, 0]));
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
    }

    // 6. lens, tone, grain
    {
      const u = q.final.material.uniforms;
      const post = opts.post ?? {};
      u.tex.value = rt.fog.texture;
      u.bloom.value = this.bloomTex;
      u.exposure.value = exposure;
      u.bloomStrength.value = post.bloom ?? 0.055;
      u.k1.value = post.k1 ?? LENS.k1;
      u.ca.value = post.ca ?? LENS.ca;
      u.vignette.value = post.vignette ?? 0.5;
      u.grain.value = post.grain ?? 0.02;
      u.seed.value = seed % 1000;
      u.aspect.value = w / h;
      u.res.value.set(w, h);
      // zoom so the barrel-distorted frame still fills its corners
      u.zoom.value = lensZoom(w / h, u.k1.value + Math.abs(u.ca.value));
      this.pass(q.final, null);
    }
    renderer.setRenderTarget(null);
    this.gl.finish();
    return { trace: t1 - t0, total: performance.now() - t0, samples: half * 2 };
  }
}

export const LENS = { k1: 0.055, ca: 0.0025 };
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
