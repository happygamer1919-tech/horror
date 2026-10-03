# corridor3d: the third-floor corridor, authored in 3D and rendered offline

The site does not run any of this. It ships the result: an image sequence under
`public/corridor/` that `src/scripts/corridor.ts` scrubs on a 2D canvas. three.js is a
dev dependency of the render pipeline only and never reaches the browser bundle.

## What is here

| File | What it does |
|------|--------------|
| `assets.json`, `fetch-textures.mjs` | The CC0 sources (Poly Haven, ambientCG) and the script that downloads them into `textures/` (gitignored). See `CREDITS.md`. |
| `src/layout.js` | Dimensions, door and lamp positions, and the timeline: camera path, which lamp dies when, exposure, the scare. Pure maths, shared by the browser harness and the node scripts. |
| `src/shell.js`, `doors.js`, `lamps.js`, `props.js`, `figure.js` | The scene: walls, joinery, doors with panels and furniture, pendant lamps, and the props (clawed door, dried blood, boarded door, the shoe, peeling paper, trolley, exit sign, the figure behind door 308). |
| `src/surfaces.js` | The hero surfaces, baked panel by panel from scans laid at true scale: walls (wallpaper over a boarded wainscot), the carpet runner, the door leaves. Seams, water, nicotine, picture ghosts, scuffs and wear are functions of the position in the corridor, so nothing repeats over its 29 m. |
| `src/textures.js`, `materials.js` | Texture loading and the other authored canvas textures (decal atlas, the clawed door, number plates, signs). |
| `src/pipeline.js` | One frame: path tracing through a thin lens, G-buffers through the same lens, denoise, dust in the lamp cones, bloom and halation, lens, tone mapping, grain. |
| `index.html`, `src/main.js` | The harness page. Exposes `window.corridor.frame(opts)`. |
| `render.mjs`, `server.mjs` | The driver: opens the harness in Playwright Chromium and writes PNGs to `out/` (gitignored). |
| `encode.mjs` | PNGs to the shipped AVIF/WebP frames, the scare patches, the posters and `manifest.json`. |
| `stills.json` | The six review keyframes (real frames of the desktop walk). Fixed for every review round. |
| `publish-stills.mjs` | Copies the stills for the reviewers: PNG, JPEG (quality 92) and a 2 x 3 contact sheet. |
| `still-stats.mjs` | Measures a still the way the reviewers do: share of pixels at luma 0 to 3 and at pure black, luma percentiles, a pixel column. |
| `shots.json`, `crop.mjs`, `sheet.mjs` | Review shots of each prop, a crop-and-enlarge helper and a contact-sheet helper for looking at them. |

## Run it

```
npm run corridor:fetch      # once: about 75 MB of CC0 scans (the hero ones at 2k)
node corridor3d/render.mjs stills   # the six review keyframes at final quality, about 3 min each, to out/stills/
npm run corridor:render     # both walks and the scare frames (see "The two sets" for the time)
npm run corridor:encode     # writes public/corridor/
```

A run can be interrupted and started again: frames that exist are skipped (`--force` redoes them).
For a quick look at one frame or one prop:

```
node corridor3d/render.mjs preview --set=mobile --frames=0,40,80 --scale=0.5 --samples=24
node corridor3d/render.mjs shots --file=corridor3d/shots.json --scale=0.6 --only=a-shoe,a-claw
node corridor3d/render.mjs preview --scare=8:face --fig='{"y":1.2,"k":1.08}'   # try a pose for the figure
node corridor3d/render.mjs stills --samples=64 --scale=0.5 --only=1-start,6-last-door --out=corridor3d/out/try
node corridor3d/render.mjs stills --publish=../stills/r2    # final quality, then PNG, JPEG (q 92) and sheet.jpg for the reviewers
node corridor3d/publish-stills.mjs ../stills/r2             # the same hand-over, from the stills already in out/stills/
node corridor3d/render.mjs tex --mat=paperL4,carpet2,door313,claw   # look at a baked texture
node corridor3d/still-stats.mjs corridor3d/out/stills/*.png --col=1300   # black share, percentiles, one column
node corridor3d/render.mjs probe [--haze=0.01]                     # float means of a wall and a carpet patch, traced and denoised
node corridor3d/encode.mjs --dummy    # numbered placeholder frames, no GPU needed
```

## Stills first

The owner's ruling: no full render until six stills pass review (two independent reviewers,
8 of 10 or more each for photographic realism, four rounds at most). `stills.json` names the
six: the first frame, mid walk, the glance at the clawed inside of door 305, the held frame at
door 308, the scare at its peak (stand-in face, variant `f`) and the last door. They are real
frames of the desktop walk, 1600 x 900, through the whole pipeline exactly as a shipped frame
goes, only with more samples (320 against the walk's 48 to 96). One command renders them:
`node corridor3d/render.mjs stills`.

## How a frame is made

1. **Path tracing** with `three-gpu-pathtracer` (WebGL2, real GPU through ANGLE Metal; the
   driver logs the `UNMASKED_RENDERER` string). Real global illumination, 7 bounces. Each lamp
   is a small disc light under its shade (soft penumbra); the opal glass glows as an emissive
   surface and is what lights the ceiling. The camera is a thin lens (f/2.2, about 35 mm on the
   wide frame, 55 degrees across): what
   is close to it, the walls at the edge of the frame, is soft, and the focus follows what the
   walker looks at (`focusDistance` in `layout.js`). It also moves a little during the exposure
   (an eighth of the step to the next frame).
2. **Denoise.** The traced image is split into two independent halves to estimate noise. Each
   half is first held to a few times what the other half sees in the 5 x 5 pixels round it (a
   firefly lands in one half only). Then the image is divided by an albedo buffer (so texture
   detail is never blurred), filtered with a variance-guided edge-avoiding a-trous filter, and
   multiplied back. The albedo and normal buffers are rastered through the same lens, 64 taps
   over the aperture, so they carry the same depth of field as the traced image. Pixels on
   silhouettes are filtered among themselves in plain radiance, never divided by albedo: on a
   pixel that straddles an edge the traced coverage and the rastered albedo never agree exactly
   and the quotient spikes. The same goes for a hard jump of the albedo on one plane (a decal,
   a sign): there the quotient left a pale one-pixel rim. A last pass removes lone pixels
   several times brighter than everything round them.
3. **Dust.** The lamp cones are ray-marched against the depth buffer: thin haze, thicker in the
   light, with slow density noise. The inverse square is held flat within about 60 cm of each
   bulb (`fogCore`).
4. **Lens and film** (`LOOK` in `pipeline.js`). A glare round the lamps with a long warm tail
   (it reaches 100 to 200 px) and a faint mirrored ghost, slight barrel distortion, lateral
   chromatic aberration, a softness that grows towards the corners, vignette, a half-corrected
   tungsten white balance (the paper stays cream, the runner red, the exit sign green). The film
   curve works on the brightest channel and scales the colour with it, so the edge of a pool of
   light keeps its hue (a per-channel curve turned every edge red); it is straight up to a knee,
   so the fall-off inside a pool survives (the wall is four times brighter at the top of a pool
   than at the rail), with a soft shoulder for the glass and the bulb and a toe that squeezes
   the deep shadows without clipping them. Scene black is then printed at about luma 6, a little
   warm (`lift`): no pixel of a frame is pure black, and the dark carries structure. Colour is
   rolled off in the shadows. Grain last: clumps of about two pixels, nearly monochrome with a
   little colour, strongest in the low midtones, fading into black and into the highlights,
   stronger where the exposure has been opened up (the site's hero `.grain` layer is the
   reference). Exposure is set for the pools of light and follows the walk.

Everything is deterministic: progress in, pixels out. `Math.random` is replaced by a seeded
generator, there is no wall clock, and a frame's seed depends only on its set and index. The
tracer's stratified sampler is rebuilt from that seed for every frame. The film grain has a
seed of its own: a scare frame is traced with the seed of the frame it is laid over (so it
differs from it only where the door moved) but carries its own grain, as film would. `encode.mjs`
finds the changed region by comparing frames: with grain that differs everywhere its threshold
has to sit above the grain (not checked in this round, the encode has not been run).

### Light

The corridor is pools of light with dark between them from the first frame. A bulb hangs level
with the rim of its shade and its cone fades over its outer half, so a pool on the wall has a
hot spot under the lamp, falls away towards the rail and ends in a penumbra some 40 cm deep; the
lamps hang off the centre line and none plumb, so no two pools have the same shape. The opal
glass glows on both faces: hot where the bulb sits behind it, dimmer to the rim, and its upper
face lights the ceiling (plaster with an albedo of about a half), the flex and the rose. What
the camera sees of the glass is drawn in the overlay pass on top of the traced glass
(`SHADE_SEEN` in `lamps.js`): a camera exposed for the pools clips its lamps, so the glass burns
out to white where the bulb sits behind it and rolls off warm to the rim, with a glow of 25 to
40 px round it, without the ceiling getting any more light. The last bulb sits crooked in its
holder and throws its light at door 313 and the left wall.

The owner's rule, applied literally in round 4: light only what holds up. The first lamp is an
orange ember in a dusty shade, so the walk starts in the dark and the first pool of light (with
the child's shoe in it) is six metres off; the runner and a near, large shade are never lit
heroes. The camera (`cameraPose` in `layout.js`) never stands square in the middle:

- s 0.35 (frame 0): 40 cm off the left wall, which takes the left third of the frame, dark and
  soft; the head turned 4 degrees right, 2.5 degrees of roll.
- to s 7.6 (frame 44): the walker crosses to the right half of the corridor (0.4 m right of the
  axis), looking across at the open door 305; the head stays down, so only the lower part of the
  swinging lamp's shade comes into the top of the frame.
- s 9.4 (frame 55): the glance at the clawed inside of door 305: the head turns 27 degrees left
  and 13 down, past the handle, so the door and the black room behind it fill the frame.
- he passes the open door on its right, comes back to the axis by s 13, drifts 0.2 m right and
  turns 23 degrees to door 308 for the scare (frame 99), turns back within a metre.
- from s 23.6 he drifts to the right wall and stops 33 cm off it (frame 167), the head turned
  6 degrees left to door 313, 3 degrees of roll: the right wall takes the right third of the
  frame, dark, and the door stands in the one pool of light. Exposure is half a stop under the
  rest there.
Every term is a smooth function of the distance walked, so the keyframes are points on one
continuous path; the frames between them have not been rendered or looked at. No two lamps are
the same lamp (`LAMP_KIND` in `layout.js`): different bulbs, flex, dust on the glass; lamp 1 is
a weak orange bulb; lamp 3 burnt out long ago and its shade is gone (a bare dead bulb), so there
is always a black gap in the middle of the corridor; lamp 4, over door 308, is tired. The far
lamps fail as before, and only the lamp over door 313 stays.

### Surfaces

The tracer keeps every texture in one array at one size, and a WebGL texture cannot be larger
than about 1.34 GB here (measured: 80 layers at 2048 px work, 84 do not), so 4096 px is out of
the question and the scene is kept at about 75 layers (`textureSize` 2048). Past the limit the
allocation fails with a console warning only and every frame comes back black in two seconds;
`pipeline.js` counts the layers and refuses. Resolution therefore comes from cutting the hero
surfaces into panels, each with its own albedo layer, over the scans' own normal and roughness
maps (one layer each, a texture transform per panel):

- **Walls**: 12 panels a side and one for the end wall, 2.53 x 2.62 m each (1.2 mm a texel).
  Wallpaper from the `decrepit_wallpaper` scan at its true 2.5 m, laid twice (the second lay
  turned over, let through in slow patches) so no repeat shows, under a faded print (sprigs in a
  half drop, 53 cm lengths, each from its own roll). On top, as functions of the position on
  the wall: nicotine towards the ceiling, soot under the cornice, the band of dirt above the
  rail, water that came down from the cornice (a brown field, tide lines, runs, mould), damp
  patches, hand grime beside every door, the paler rectangles where pictures hung with the dust
  line and the nail hole, seams that open and close on the way up with a corner come away here
  and there, scratches and spots. Below the rail a boarded wainscot from the
  `wood_cabinet_worn_long` scan (real wear: scratches, nails, rubbed edges), the boards
  shuffled over a 20 board period, each stained its own tone, kicked and mopped grey at the
  bottom, with the long skipping scrapes of a trolley.
- **Carpet**: 16 panels along the runner (0.9 mm a texel). The `Carpet015` scan (a woven red runner, 40 cm) with
  a dark stripe down each side, a pale path worn down the middle, a bald patch in front of
  every door, dirt at the edges, stains, lint. The mesh is a slab 12 mm thick with a bound edge, lies in
  shallow waves with two rucks and one lifted edge, and its edge is not a ruled line. Beside
  it worn strip parquet (the `plank_flooring` scan, strips along the corridor).
- **Doors**: a skin per leaf (four hero doors have their own, the rest share three), framed the
  way a door is (stiles upright, rails across, two panels, from the `wood_table_001` scan laid
  at half scale and graded to a quiet brown; the panels are real mouldings, shallow (9 mm) and
  matt, so that a lamp right over a door shades them in half tones, not in black and white bars):
  joints full of dirt, grease round the handle and along the lock edge, varnish rubbed through
  where hands push, moulding edges rubbed pale in broken lines, the bottom rail kicked, chips,
  key scratches round the lock. One shared roughness map: glossy where nothing touches it, dull
  at the handle, the bottom and on every ledge where dust lies.
- **Joinery**: skirting and dado rail carry their wear in vertex colours (rubbed nose, dust on
  what faces up).

### The haze

A true volume in the tracer (`FogVolumeMaterial`, a box round the corridor) is built and can be
turned on with `--haze=0.01`. It is off. What it cost, measured on this machine:

- about 40 % more trace time;
- with the camera inside the volume, the tracer's own output loses most of the direct light
  on the walls: the float mean of a lit wall patch in one traced half is 0.97 without the
  volume and 0.115 with it (the carpet 0.22 and 0.16), at any density down to 1e-6 per metre.
  Round 2 narrowed it down (`render.mjs probe`): it is still so with fog hits switched off in
  the shader (the particle distance forced to 1e9), so it is not absorption or scattering; the
  same box as an ordinary invisible mesh renders correctly, and so does a fog volume that does
  not contain the camera. The fault is in how this tracer carries "the path started inside a
  fog volume", and it was not found in the time given to it;
- paths that scatter beside a bulb leave fireflies (white specks in the dark above the last door);
- a box that ends just inside the room made the carpet render black wherever its waves came
  within the tracer's ray offset of the box's floor; the box must be larger than the room.

The stills therefore use the ray-marched pass (step 3), thin (both reviewers of round 1 read it
as air). The volume stays in the code, off.

### Things the tracer needed

- `RAY_OFFSET` in its shader is 1e-4 times the largest coordinate, which is 3 mm at the far end
  of a 29 m corridor: more than a decal floats above its wall. The pipeline patches it to 3e-5.
- It focuses on a sphere round the lens; a lens focuses on a plane, and the rastered buffers do.
  The pipeline patches the focal point to a plane.
- Its stratified sample table is `bounces + transmissiveBounces + 5` wide and the shader reads
  columns 0 to 16. With the former 5 + 4 bounces the table was 14 wide: the lobe choice of every
  surface (column 15) and two more were read out of range, and returned the same number for
  every sample of a pixel. Now 7 + 8 (20 wide), and the reads are wrapped into the table.
- It gives every pixel one fixed offset for all its random numbers (a 64 px blue-noise tile).
  With the haze volume that showed above about 90 samples as a lattice of bright dots, one per
  tile. The pipeline patches in an offset per pixel, sample, bounce and dimension.
- `clearcoat` renders black in this version, so varnish is plain low roughness.
- Emissive surfaces that are small and bright make fireflies. The bulbs are therefore drawn in a
  separate raster overlay and do their lighting through an explicit light.
- (The driver's check for a running Playwright test once matched the shell that had started
  the render, because that shell's command line contained the words: the render waited for
  ever. It now counts only the runner's own process.)
- One GPU client at a time. With a second render (or a browser test run) on the GPU, the canvas
  sometimes comes back as the previous frame, with no error, or a frame hangs. `render.mjs`
  waits while a Playwright test run is alive (before the browser starts and before every frame),
  treats a frame identical to the one before it, or one that takes over three minutes, as a
  failure and restarts the browser.
- The decal painters address pixels as `y * C + x`: the atlas is sized to whole-pixel cells
  (5 x 5 cells of 409 px). A fractional cell size striped every image-data decal.
- Every material is made double sided in `scene.js`, so two coincident surfaces fight under that
  ray offset (it is still about a millimetre at the far end). The print and the back of the
  peeling wallpaper did, which showed as camouflage blotches; they are now 1.4 mm apart.

## The two sets

| | Desktop | Mobile |
|---|---|---|
| Frame | 1600 x 900 | 900 x 1800 (a 2x phone shows about 780 x 1690 of it, so it is barely upscaled) |
| Lens | 43.5 degrees vertical, about 26 mm | 72 degrees vertical, so floor, both walls and the lamps fit a phone |
| Frames | 168 | 112 |
| Render time (estimate, 64 samples) | about 33 s a frame, 1 h 50 min with its scare frames | about 37 s a frame, 1 h 25 min with its scare frames |
| Format | AVIF, quality 56 (up to 68 for dark frames) | WebP, quality 56 (up to 68 for dark frames) |

They are two renders with their own cameras, not one render cropped. Neither has been
rendered with this pipeline yet (stills first). The estimate comes from the stills: 320 samples
of a 1600 x 900 frame take 138 to 165 s on an Apple M5, which is 0.3 to 0.36 s per megapixel
and sample; a set is its walk plus 27 scare frames (the held frame and 13 frames of each of
the two variants). 64 samples for both sets is about 3 h 15 min, inside the budget of 3 to 4 h;
96 samples would be about 4 h 50 min.

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
On the way to it the walker drifts towards the right wall and turns the head to the door: on
the phone a quarter turn, so the gap is near the middle of the narrow frame; on the wide frame
only 0.3 rad, so the door stays at the right of the picture (the gap at 79 % of the width, inside
the crop of any window from 5:4 up) and the corridor stays the subject. The gap is about 1.8 m
away. Lamp 4, tired and dim, hangs right over the walker there and is still alight. Once the
door has shut the head comes back to the corridor within a metre of walking, and only then does
the wave of dying lamps start: no frame is a dark wall filling the picture.

The stand-in behind the door is a thin girl standing in the dark room beyond the door edge,
leaning her head out past it. Long, black, wet hair hangs from a centre parting straight down in
front of her face like a curtain, draped over the brow, the nose and the chin (each strand is
laid over a depth map of the face, so it rests on what stands out and hangs on below it). The
curtain has come apart over one eye only: that eye, a strip of cheek and the bridge of the nose
show between two wet locks, and two single strands still cross them. Everything else of the face
is behind hair or behind the door edge, so most of it is dark without any painted shadow. Her
hand holds the door edge at the height of her chin: four long, thin fingers of different length
come round the edge and lie on the corridor face, bent at different angles and fanned (the
index rising, the little finger curled under), knuckles and nails towards the corridor; the
thumb is flat against the edge in the gap. The light, as on a film set:

- a narrow warm key from high on the open side, raking across the cheekbone and the eye;
- a faint cold rim from deeper in the room (as from a window) on the edge of the hair;
- the catchlight in the open eye is drawn in the overlay pass (where the bulbs are), occluded by
  everything in front of it, where the key is mirrored towards the walker. It is small and no
  brighter than a wet eye; a path-traced eye this small catches the light on a pixel at most.

On the wide frame the door stays at the right edge of the picture (the head turns a quarter less
than it used to) and the corridor stays the subject; on the tall phone frame the gap is near the
middle. It is there for about half a second, built to read as a face behind wet hair and a hand
on the door at that size, not to survive a close look.

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
