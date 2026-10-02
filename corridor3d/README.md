# corridor3d: the third-floor corridor, authored in 3D and rendered offline

The site does not run any of this. It ships the result: an image sequence under
`public/corridor/` that `src/scripts/corridor.ts` scrubs on a 2D canvas. three.js is a
dev dependency of the render pipeline only and never reaches the browser bundle.

## What is here

| File | What it does |
|------|--------------|
| `assets.json`, `fetch-textures.mjs` | The CC0 sources (Poly Haven) and the script that downloads them into `textures/` (gitignored). See `CREDITS.md`. |
| `src/layout.js` | Dimensions, door and lamp positions, and the timeline: camera path, which lamp dies when, exposure, the scare. Pure maths, shared by the browser harness and the node scripts. |
| `src/shell.js`, `doors.js`, `lamps.js`, `props.js`, `figure.js` | The scene: walls, joinery, doors with panels and furniture, pendant lamps, and the props (clawed door, dried blood, boarded door, the shoe, peeling paper, trolley, exit sign, the figure behind door 308). |
| `src/textures.js`, `materials.js` | Texture loading and the authored canvas textures (wallpaper print, carpet runner, decal atlas, number plates, signs). |
| `src/pipeline.js` | One frame: path tracing, G-buffers, denoise, dust in the lamp cones, bloom, lens, tone mapping, grain. |
| `index.html`, `src/main.js` | The harness page. Exposes `window.corridor.frame(opts)`. |
| `render.mjs`, `server.mjs` | The driver: opens the harness in Playwright Chromium and writes PNGs to `out/` (gitignored). |
| `encode.mjs` | PNGs to the shipped AVIF/WebP frames, the scare patches, the posters and `manifest.json`. |
| `shots.json`, `crop.mjs` | Review shots of each prop, and a crop-and-enlarge helper for looking at them. |

## Run it

```
npm run corridor:fetch      # once: about 16 MB of CC0 textures at 1k (-- --res=2k for sharper wood up close)
npm run corridor:render     # both walks and the scare frames, about 2.5 hours on an Apple M5
npm run corridor:encode     # writes public/corridor/
```

A run can be interrupted and started again: frames that exist are skipped (`--force` redoes them).
For a quick look at one frame or one prop:

```
node corridor3d/render.mjs preview --set=mobile --frames=0,40,80 --scale=0.5 --samples=24
node corridor3d/render.mjs shots --file=corridor3d/shots.json --scale=0.6 --only=a-shoe,a-claw
node corridor3d/encode.mjs --dummy    # numbered placeholder frames, no GPU needed
```

## How a frame is made

1. **Path tracing** with `three-gpu-pathtracer` (WebGL2, real GPU through ANGLE Metal; the
   driver logs the `UNMASKED_RENDERER` string). Real global illumination: the upper walls and the
   ceiling are lit only by light bounced off the carpet and by the glow of the opal shades.
   Each lamp is a small disc light under its shade (soft penumbra), 48 samples per pixel, 5 bounces.
   The camera moves a little during the exposure, so frames carry a trace of motion blur.
2. **Denoise.** The traced image is split into two independent halves to estimate noise, divided
   by an albedo buffer (so texture detail is never blurred), filtered with a variance-guided
   edge-avoiding a-trous filter, and multiplied back. Pixels on silhouettes are filtered among
   themselves so antialiasing survives.
3. **Dust.** The lamp cones are ray-marched against the depth buffer: thin haze, thicker in the
   light, with slow density noise.
4. **Lens and film.** Bloom, slight barrel distortion, a little lateral chromatic aberration,
   vignette, ACES filmic tone mapping, fine grain. Exposure follows the walk: the eye opens up by
   three stops when the lamps are gone.

Everything is deterministic: progress in, pixels out. `Math.random` is replaced by a seeded
generator, there is no wall clock, and a frame's seed depends only on its set and index.

Things the tracer needed:

- `RAY_OFFSET` in its shader is 1e-4 times the largest coordinate, which is 3 mm at the far end
  of a 29 m corridor: more than a decal floats above its wall. The pipeline patches it to 3e-5.
- `clearcoat` renders black in this version, so varnish is plain low roughness.
- Emissive surfaces that are small and bright make fireflies. The bulbs are therefore drawn in a
  separate raster overlay and do their lighting through an explicit light.

## The two sets

| | Desktop | Mobile |
|---|---|---|
| Frame | 1600 x 900 | 720 x 1440 |
| Lens | 43.5 degrees vertical, about 26 mm | 80 degrees vertical, so floor, both walls and the lamps fit a phone |
| Frames | 168 | 112 |
| Format | AVIF | WebP |

They are two renders with their own cameras, not one render cropped.

## The scare

Door 308 is hinged on the walker's side and opens inwards, so the gap appears at the far jamb
and can be seen into from the corridor. Lamp 4 hangs just in front of it and is the last lamp
still alight: its light goes through the gap past the jamb and lands on a strip next to the
door edge, which is where one eye is.

The scare plays in real time (15 frames at 24 fps, 625 ms) over a walk frame that is held
still. The scare frames are full renders from that held camera with the same seed and sample
count, so they are identical to the walk frame except around the door; `encode.mjs` finds the
region that changed, feathers its edge and ships only that patch. Two variants are rendered:
`f` with the 3D stand-in face, and `g` with hand and empty gap for when a photograph is supplied
(`src/assets/scare/README.md`). The manifest carries, per scare frame, the quad the photograph
is drawn into and the outline of the gap it is clipped to, projected through the lens model.

## Changing something

- Timeline (who fails when, where the camera looks): `src/layout.js`. Captions on the site are
  timed in quarters of the walk; `SCARE_AT` and the lamp failures are in metres of walking.
- After any scene change, review with `shots`, then re-render. A change that touches only the
  figure needs `render.mjs scare --force`, not the walks.
