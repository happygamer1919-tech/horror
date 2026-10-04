# Corridor masters: where each file came from

The corridor on the site is a walk made of AI-generated video (Higgsfield), not a photograph
and not a 3D render. This folder holds the masters; `npm run corridor:frames`
(`scripts/corridor-frames.mjs`) turns them into the frames under `public/corridor/`. Nothing
here is fetched at build time and nothing is generated again: the build only reads these files.

**The scare shows a generated face. It is not a photograph of anybody and depicts no real person.**

All jobs were run on 2026-10-04. Job ids are Higgsfield job ids.

## Files

| File | What it is | Size (bytes) | sha256 (first 16) |
|------|------------|--------------|-------------------|
| `seg1.mp4` | walk, keyframe K1 (door 301) to K2 (door 304) | 4574896 | 7d2ddbd7734aee70 |
| `seg2.mp4` | walk, K2 to K3 (the scratched door 305) | 4345086 | 6951bffdf8ab5513 |
| `seg3.mp4` | walk, K3 to K4 (door 308, shut) | 4870390 | 5822c5f48dc4288e |
| `seg4b.mp4` | walk, K4 to K5 (the last room, 313, in the left wall; the exit doors beyond) | 5198437 | 18a23866b5780e69 |
| `scareb.mp4` | locked-off shot that starts and ends on K4: door 308 opens a crack at its handle edge and shuts | 3112150 | 8698fa3843f711ab |
| `keyframes.json` | the job ids of the keyframe stills | | |

Every clip is 2560 x 1440, 24 frames a second, 124 frames, H.264. The keyframe stills
themselves (2752 x 1536 PNG) are not in the repository: each clip starts and ends on its
stills, so the clips carry them.

`seg4b.mp4` and `scareb.mp4` are from review round 2. They replaced `seg4.mp4` (job
`a3db1b14-e4ab-446f-b558-76f3ba2472b2`, K4 to the first version of K5, job
`fd2d4df5-a7db-44dc-8a40-e42c01a80c6c`: door 313 in the end wall) and `scare.mp4` (job
`39959c99-56c0-4b3e-8903-88003f72eb86`: the door opened at its hinge side) of round 1. Neither
round 1 file is in the repository, and no frame of them is shipped.

## Keyframe stills

Model requested: `nano_banana_pro`, resolution `2k`, aspect ratio `16:9`. The service
reported the finished jobs as model `nano_banana_2`. K2 to K4 were generated with K1 as the
image reference, K5 with K1 and K4, which is what keeps the corridor the same place in all five.

### K1, job `bae7a440-fd66-403d-9bdc-0781a701cb36`

No reference image. (A second candidate from the same request, job `0f13e1cd-cce2-46ed-9e49-b41cf7f5da7e`, was not used.)

> Photograph taken at night with a handheld camera: the long third-floor corridor of a neglected 1980s Eastern European hotel, seen from its start and lit only by the photographer's own handheld torch. The warm, narrow torch beam falls on the left wall and the first door: faded cream wallpaper with thin vertical stripes and a small sprig motif, yellowed, with brown water stains, tide marks and one peeling seam; a dark brown varnished wooden door with a simple panel moulding, a tarnished brass lever handle and a small engraved brass number plate reading 301; dark walnut wainscot panelling below a dado rail. A worn burgundy carpet runner with a plain darker border runs down the middle of a dark parquet floor into the distance. The ceiling lamps are dead: unlit opal glass pendant shades. Beyond the beam the corridor falls into near darkness, a row of closed doors barely visible, and a small green emergency exit sign glowing far away at the end. Slightly tilted handheld framing, 35 mm lens, shallow depth of field, the torch hot spot off-centre with a soft falloff, dust visible in the beam, natural film grain and high ISO noise in the shadows, muted colours. Documentary realism. No people. No text other than the door number.

### K2, job `3845160b-d386-4961-9e47-021dee34a6d6`

Image reference: K1 (`bae7a440-fd66-403d-9bdc-0781a701cb36`).

> Photograph at night, same hotel corridor, taken about a third of the way down it while walking forward: the camera looks ahead and a little to the right, the torch beam falls on the right wall and the nearest door on the right. On the carpet runner, at the lower edge of the beam, lies a single small worn child's leather shoe on its side. More closed doors recede ahead into darkness and a small green emergency exit sign glows far away at the end. It is exactly the same corridor as in the reference image: the same faded cream striped wallpaper with the small sprig motif and brown water stains, the same dark walnut wainscot panelling and dado rail, the same dark brown varnished doors with simple panel mouldings, brass lever handles and small engraved brass number plates, the same worn burgundy carpet runner with a darker border on dark herringbone parquet, the same unlit opal glass pendant lamps. Lit only by the photographer's handheld torch: a warm narrow beam with a soft falloff, everything outside it close to black. Handheld, slightly tilted, 35 mm lens, shallow depth of field, natural film grain, high ISO noise in the shadows, muted colours, documentary realism. No people. No text other than the door number. The only readable number plate is 304.

### K3, job `9742d126-3f53-43a5-b7f5-ca5f28572a08`

Image reference: K1 (`bae7a440-fd66-403d-9bdc-0781a701cb36`).

> Photograph at night, same hotel corridor: a close three-quarter view of one door on the left side, from about one metre away, the torch held low so its beam rakes across the wood. The door carries deep, frantic scratch marks gouged through the dark varnish down to pale raw wood, in clusters of parallel lines around the brass lever handle and down the lower panel, with splinters; old, dusty, not fresh. The brass number plate reads 305. A strip of wallpaper and the door frame are visible at the left edge, the dark corridor continues at the right edge of the frame. It is exactly the same corridor as in the reference image: the same faded cream striped wallpaper with the small sprig motif and brown water stains, the same dark walnut wainscot panelling and dado rail, the same dark brown varnished doors with simple panel mouldings, brass lever handles and small engraved brass number plates, the same worn burgundy carpet runner with a darker border on dark herringbone parquet, the same unlit opal glass pendant lamps. Lit only by the photographer's handheld torch: a warm narrow beam with a soft falloff, everything outside it close to black. Handheld, slightly tilted, 35 mm lens, shallow depth of field, natural film grain, high ISO noise in the shadows, muted colours, documentary realism. No people. No text other than the door number.

### K4, job `ca2281be-60bd-4ce4-b3a4-bbfdbdae45cd`

Image reference: K1 (`bae7a440-fd66-403d-9bdc-0781a701cb36`).

> Photograph at night, same hotel corridor: a close oblique view of one closed door on the right side, from about one and a half metres away, the camera angled so the door frame and the edge of the door where it meets the frame are clearly visible on the left of the picture. The torch beam lights the upper half of the door and its small brass number plate, which reads 308; the brass lever handle catches a small glint lower down, in the dimmer spill. The door is shut. To the left of the door frame the wallpaper falls away into darkness. It is exactly the same corridor as in the reference image: the same faded cream striped wallpaper with the small sprig motif and brown water stains, the same dark walnut wainscot panelling and dado rail, the same dark brown varnished doors with simple panel mouldings, brass lever handles and small engraved brass number plates, the same worn burgundy carpet runner with a darker border on dark herringbone parquet, the same unlit opal glass pendant lamps. Lit only by the photographer's handheld torch: a warm narrow beam with a soft falloff, everything outside it close to black. Handheld, slightly tilted, 35 mm lens, shallow depth of field, natural film grain, high ISO noise in the shadows, muted colours, documentary realism. No people. No text other than the door number.

### K5, job `86150bb1-de27-4f55-b734-90e4bba9805a`

Image references: K1 and K4 (`bae7a440-fd66-403d-9bdc-0781a701cb36` and `ca2281be-60bd-4ce4-b3a4-bbfdbdae45cd`). (A second candidate from the same request, job `f410c051-3721-4436-8ce0-1495cefac104`, was not used.)

> Photograph at night, near the far end of the same hotel corridor as in the reference images: a close oblique view of the last guest-room door, which is in the left-hand side wall, from about one and a half metres away. The camera is angled so the door fills the left two thirds of the picture, and at the right edge of the picture the end of the corridor is visible a few metres further on: dark wooden double doors with a small green emergency exit sign glowing above them. The handheld torch beam has a bright warm hot core and a soft wide falloff; the core lands on the upper panel of the door just beside its small brass number plate, which reads 313 and is the same style of small notched embossed brass plate as on the other doors. The brass lever handle and keyhole sit lower, in the dimmer spill, catching only a small glint. The door is shut and looks older and more worn than the others: rubbed varnish, grime around the handle, scuffs along the bottom rail. To the left of the door frame the stained wallpaper falls away into darkness; the carpet runner continues along the corridor towards the double doors. Exactly the same corridor: the same faded cream striped wallpaper with the small sprig motif and brown water stains, the same dark walnut wainscot and dado rail, the same dark brown varnished panelled doors, the same worn burgundy carpet runner with a darker border on dark herringbone parquet, the same unlit opal glass pendant lamps. Lit only by the torch, everything outside the beam close to black. Handheld, slightly tilted, 35 mm lens, shallow depth of field, natural film grain, high ISO noise in the shadows, muted colours, documentary realism. No people. No text other than the door number and the exit sign pictogram.

## Video clips

Model: `minimax_h3` (MiniMax H3), duration 5 s, aspect ratio `16:9`, 2K (the only resolution
this model has), with first and last frame control: `start_image` and `end_image` are the
keyframe stills named below. The service's suggested preset ("IN THE DARK") was declined
(`declined_preset_id` `24bae836-2c4a-48e0-89b6-49fcc0b21612`), so the prompts ran as written.

### `seg1.mp4`, job `8ea0e6f4-419a-4954-a3eb-7d2b6d50280e`

Start and end image: K1 to K2 (`bae7a440-fd66-403d-9bdc-0781a701cb36` to `3845160b-d386-4961-9e47-021dee34a6d6`).

> First-person handheld camera walking slowly forward down a dark hotel corridor at night, lit only by the handheld torch. One continuous shot, no cuts: the camera moves steadily forward at walking pace while the torch beam and the view swing smoothly from the wall and door on the left across the corridor to the door on the right. Slight natural handheld sway. The corridor, wallpaper, doors, brass number plates, carpet runner and ceiling lamps stay exactly as in the frames, nothing appears or disappears, no people. Photorealistic, film grain, no text overlays.

### `seg2.mp4`, job `72c0069a-870a-459e-9915-2d8bfbff9b97`

Start and end image: K2 to K3 (`3845160b-d386-4961-9e47-021dee34a6d6` to `9742d126-3f53-43a5-b7f5-ca5f28572a08`).

> First-person handheld camera in a dark hotel corridor at night, lit only by the handheld torch. The camera keeps walking forward down the corridor and turns left towards a door on the left side, coming close to it, while the torch beam swings smoothly from the right wall across the corridor onto that door and its scratched wood. One continuous handheld shot with slight natural sway, no cuts, slow walking pace. The corridor, wallpaper, doors, brass number plates, carpet runner and ceiling lamps stay exactly as in the frames, nothing appears or disappears, no people. Photorealistic, film grain, no text overlays.

### `seg3.mp4`, job `f32b922a-5e71-48e8-bdaf-33927b5e8bb2`

Start and end image: K3 to K4 (`9742d126-3f53-43a5-b7f5-ca5f28572a08` to `ca2281be-60bd-4ce4-b3a4-bbfdbdae45cd`).

> First-person handheld camera in a dark hotel corridor at night, lit only by the handheld torch. The camera turns away from the scratched door on the left, walks on down the corridor and turns right towards a closed door on the right side, stopping close to it at an angle, while the torch beam swings smoothly across the corridor onto that door. One continuous handheld shot with slight natural sway, no cuts, slow walking pace. The corridor, wallpaper, doors, brass number plates, carpet runner and ceiling lamps stay exactly as in the frames, nothing appears or disappears, no people. Photorealistic, film grain, no text overlays.

### `seg4b.mp4`, job `a1b244c8-77b8-4d5f-a2ee-c36ee467128b`

Start and end image: K4 to K5 (`ca2281be-60bd-4ce4-b3a4-bbfdbdae45cd` to `86150bb1-de27-4f55-b734-90e4bba9805a`).

> First-person handheld camera in a dark hotel corridor at night, lit only by the handheld torch. The camera turns away from the closed door on the right, walks forward down the corridor towards the dark double doors and the small green exit sign at its far end, then turns left towards the last guest-room door in the left-hand wall and stops close to it at an angle, while the torch beam swings across the corridor and settles on that door beside its brass number plate. One continuous handheld shot with slight natural sway, no cuts, slow walking pace. The corridor, wallpaper, doors, brass number plates, carpet runner and ceiling lamps stay exactly as in the frames, nothing appears or disappears, no people. Photorealistic, film grain, no text overlays.

### `scareb.mp4`, job `4693039b-7dff-4d5c-bd40-4b4d35046ac0`

Start and end image: K4 to K4 (`ca2281be-60bd-4ce4-b3a4-bbfdbdae45cd` to `ca2281be-60bd-4ce4-b3a4-bbfdbdae45cd`).

> Locked-off handheld shot of a closed hotel room door at night, lit by a handheld torch. The camera does not move and the framing stays exactly the same from the first frame to the last. The door slowly opens inward by only a few centimetres at its right-hand edge, the edge that carries the brass lever handle and the lock; the hinges are on the left edge, which stays in place. In the narrow black gap that appears between the handle edge of the door and the door frame on the right, a pale gaunt adult woman's face is half visible deep inside the dark room, almost entirely in shadow: only one eye and the edge of one cheek catch the warm torch light, and two or three pale fingertips with fingernails curl around the edge of the door just above the handle. She stares, motionless. Then the door closes again and everything is exactly as at the start. The wallpaper, the door frame, the number plate and the light do not change. Photorealistic, film grain, no text overlays.

## What the build does with them

- **The walk** is the four segments in order, 493 frames. Segment N ends on the still segment
  N+1 starts on, and the two renderings of that still differ slightly, so the duplicate frame
  is dropped and the last three frames of a segment dissolve into the first frame of the next.
  At door 308 the walk dissolves into the first frame of `scareb.mp4` instead, so the frame the
  scare is played over is the scare clip's own first frame.
- **Frames are picked at equal steps of motion**, not of time: the clips ease in and out of
  every keyframe, and equal steps of time would rush through the middle of each segment and
  freeze at its ends.
- **Desktop set:** 168 frames, 1600 x 900 (Lanczos), AVIF. **Phone set:** 112 frames, a
  720 x 1440 window of each frame that follows the subject, enlarged to 900 x 1800, WebP.
- **The finishing pass** (`scripts/corridor-finish.cjs`) is applied to every frame at its
  final size: everything outside the torch beam about a stop darker, a slightly lifted black,
  fine film grain with a new pattern per frame.
- **The scare:** 13 frames of `scareb.mp4`, graded (`scripts/corridor-grade.cjs`) so that the
  face in the gap sits in deep shadow, shipped as patches over the held walk frame. A second
  set of the same patches has the gap empty, for the case that a photograph is supplied
  (`src/assets/scare/README.md`).
