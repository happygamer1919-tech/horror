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
npm run corridor:render     # both walks and the scare frames, about 2 hours on an Apple M5 (nothing else on the GPU)
npm run corridor:encode     # writes public/corridor/
```

A run can be interrupted and started again: frames that exist are skipped (`--force` redoes them).
For a quick look at one frame or one prop:

```
node corridor3d/render.mjs preview --set=mobile --frames=0,40,80 --scale=0.5 --samples=24
node corridor3d/render.mjs shots --file=corridor3d/shots.json --scale=0.6 --only=a-shoe,a-claw
node corridor3d/render.mjs preview --scare=8:face --fig='{"y":1.2,"k":1.08}'   # try a pose for the figure
node corridor3d/encode.mjs --dummy    # numbered placeholder frames, no GPU needed
```

## How a frame is made

1. **Path tracing** with `three-gpu-pathtracer` (WebGL2, real GPU through ANGLE Metal; the
   driver logs the `UNMASKED_RENDERER` string). Real global illumination: the upper walls and the
   ceiling are lit only by light bounced off the carpet and by the glow of the opal shades.
   Each lamp is a small disc light under its shade (soft penumbra), 48 samples per pixel, 5 bounces.
   The camera moves a little during the exposure (an eighth of the step to the next frame), so
   frames carry a trace of motion blur. More than that and a frame looked soft when the scroll stops on it.
2. **Denoise.** The traced image is split into two independent halves to estimate noise, divided
   by an albedo buffer (so texture detail is never blurred), filtered with a variance-guided
   edge-avoiding a-trous filter, and multiplied back. Pixels on silhouettes are filtered among
   themselves so antialiasing survives.
3. **Dust.** The lamp cones are ray-marched against the depth buffer: thin haze, thicker in the
   light, with slow density noise.
4. **Lens and film.** Bloom, slight barrel distortion, a little lateral chromatic aberration,
   vignette, ACES filmic tone mapping, grain (stronger and coarser in the shadows, where the
   encoders would otherwise flatten them into blocks; dark frames are also encoded at a higher
   quality). Exposure follows the walk: the eye opens up by
   three stops when the lamps are gone.

Everything is deterministic: progress in, pixels out. `Math.random` is replaced by a seeded
generator, there is no wall clock, and a frame's seed depends only on its set and index. The
tracer's stratified sampler is rebuilt from that seed for every frame: it keeps its shuffle from
one frame to the next otherwise, and a frame then depends on the frames rendered before it in the
same browser (the held walk frame and the scare frames stopped matching outside the door).
Rendering the same frame twice now gives the same pixels to within 3/255.

Things the tracer needed:

- `RAY_OFFSET` in its shader is 1e-4 times the largest coordinate, which is 3 mm at the far end
  of a 29 m corridor: more than a decal floats above its wall. The pipeline patches it to 3e-5.
- `clearcoat` renders black in this version, so varnish is plain low roughness.
- Emissive surfaces that are small and bright make fireflies. The bulbs are therefore drawn in a
  separate raster overlay and do their lighting through an explicit light.
- One GPU client at a time. With a second render (or a browser test run) on the GPU, the canvas
  sometimes comes back as the previous frame, with no error, or a frame hangs. `render.mjs` treats
  a frame identical to the one before it, or one that takes over three minutes, as a failure and
  restarts the browser.
- Every material is made double sided in `scene.js`, so two coincident surfaces fight under that
  ray offset (it is still about a millimetre at the far end). The print and the back of the
  peeling wallpaper did, which showed as camouflage blotches; they are now 1.4 mm apart.

## The two sets

| | Desktop | Mobile |
|---|---|---|
| Frame | 1600 x 900 | 720 x 1440 |
| Lens | 43.5 degrees vertical, about 26 mm | 72 degrees vertical, so floor, both walls and the lamps fit a phone |
| Frames | 168 | 112 |
| Render time | about 25 s a frame, 72 min | about 20 s a frame, 37 min |
| Format | AVIF, quality 56 (up to 68 for dark frames) | WebP, quality 56 (up to 68 for dark frames) |

They are two renders with their own cameras, not one render cropped.

Choosing the formats (measured on rendered frames, sharp encoders, decode timed with
`createImageBitmap` in desktop Chromium):

| Frame | AVIF q40 | AVIF q56 | WebP q60 | WebP q70 |
|---|---|---|---|---|
| desktop, lit (045) | 24 KB, 37.0 dB | 52 KB, 38.5 dB | 44 KB, 36.9 dB | 51 KB, 37.3 dB |
| desktop, dark (080) | 18 KB, 38.4 dB | 38 KB, 39.8 dB | 28 KB, 38.0 dB | 34 KB, 38.4 dB |
| mobile (003) | 16 KB, 37.0 dB | 35 KB, 38.6 dB | 29 KB, 36.8 dB | 34 KB, 37.3 dB |

At the same PSNR AVIF is about 45 % smaller, and up close it keeps the wallpaper and the grain
where WebP smears them, so the desktop set is AVIF. Decoding took 4 to 5 ms for AVIF and 3 to
5 ms for WebP here; on a phone the gap is wider, and iOS before 16 cannot decode AVIF at all.
The phone set is therefore WebP, which every phone decodes, and fast. A desktop browser
without AVIF gets the phone set (the scrubber switches when a frame fails to decode).

## The scare

Door 308 is hinged on the walker's side and opens inwards, so the gap appears at the far jamb.
On the way to it the walker drifts towards the right wall and turns the head to the door (a
quarter turn on the phone, whose frame is narrow): when it opens, the gap is near the middle of
the picture and about 1.8 m away. Lamp 4, tired and dim, hangs right over the walker there and
is still alight; the wave of dying lamps starts the moment the door has shut.

The stand-in behind the door is a thin girl standing in the dark room beyond the door edge.
She holds the edge with one hand, four fingers hooked round it onto the corridor face of the
door, and leans her head out past it: one eye and one cheek come out, the rest of her face stays
behind the door. Long, wet hair, parted in the middle, hangs beside the face. The lamp lights
her from above and in front, as it would through that gap; two cheats shape it, as on a film set:

- a cold rim light from deeper in the room (as from a window), which draws the edge of the hair
  and the far cheek against the black;
- the catchlight in the open eye is drawn in the overlay pass (where the bulbs are), occluded by
  everything in front of it. A path-traced eye this small catches the lamp on a pixel at most.

On screen the visible part of the face is about 65 px wide on a 1440 px desktop and about 35 CSS px
on a 390 px phone (measured on docs/screenshots/19-scare-*), and it is there for about half a second. It is built to read as a pale face
and one wet eye in the dark at that size, not to survive a close look.

The scare plays in real time (15 frames at 24 fps, 625 ms) over a walk frame that is held, while
the page pushes the picture in slowly towards the door with a CSS transform (so the walk never
looks frozen to someone still scrolling). The scare frames are full renders from that held camera
with the same seed and sample count, so they are identical to the walk frame except around the
door; `encode.mjs` finds the region that changed, feathers its edge and ships only that patch.
Two variants are rendered: `f` with the 3D stand-in, and `g` with the hand and an empty gap for
when a photograph is supplied (`src/assets/scare/README.md`). The manifest carries, per scare
frame, the quad the photograph is drawn into and the outline of the gap it is clipped to,
projected through the lens model.

## Changing something

- Timeline (who fails when, where the camera looks): `src/layout.js`. Captions on the site are
  timed in quarters of the walk; `SCARE_AT` and the lamp failures are in metres of walking.
- After any scene change, review with `shots`, then re-render. A change that touches only the
  figure needs `render.mjs scare --force`, not the walks.
