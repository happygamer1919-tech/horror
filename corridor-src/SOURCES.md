# Corridor masters: where each file came from

The corridor on the site is a walk made of AI-generated video (Higgsfield), not a photograph
and not a 3D render. This folder holds the masters; `npm run corridor:frames`
(`scripts/corridor-frames.mjs`) turns them into the frames under `public/corridor/`. Nothing
here is fetched at build time and nothing is generated again: the build only reads these files.

**The scare shows a generated face. It is not a photograph of anybody and depicts no real person.**

All jobs were run on 2026-10-04, in three rounds (the stills were reviewed after each). Job ids
are Higgsfield job ids. Credits spent: round 1 62, round 2 24, round 3 52, 138 in all.

## Files: what the shipped frames are built from

| File | Round | What it is | Size (bytes) | sha256 (first 16) |
|------|-------|------------|--------------|-------------------|
| `seg1.mp4` | 1 | walk, keyframe K1 (door 301) to K2 (door 304) | 4574896 | 7d2ddbd7734aee70 |
| `seg2.mp4` | 1 | walk, K2 to K3 (the scratched door 305) | 4345086 | 6951bffdf8ab5513 |
| `seg3.mp4` | 1 | walk, K3 to K4 (door 308, shut) | 4870390 | 5822c5f48dc4288e |
| `seg4c.mp4` | 3 | walk, K4 to K5 (the last room, 313, in the left wall; the exit doors beyond), 10 seconds | 7947735 | 99b17ce9c559884f |
| `scarec.mp4` | 3 | locked-off shot that starts and ends on K4: door 308 opens inward at its handle edge, a hand grips the edge, a sliver of a face in the gap, the door shuts | 3383864 | 6542914b19978e88 |
| `keyframes.json` | | the job ids of the keyframe stills | | |

Every clip is 2560 x 1440, 24 frames a second, H.264: 124 frames (5 seconds), `seg4c.mp4` 243
frames (10 seconds). The keyframe stills themselves (2752 x 1536 PNG) are not in the
repository: each clip starts and ends on its stills, so the clips carry them.

## Every generation, used or not

| What | Round | Job id | Status |
|------|-------|--------|--------|
| still K1 | 1 | `bae7a440-fd66-403d-9bdc-0781a701cb36` | used (start of `seg1.mp4`) |
| still K1, second candidate | 1 | `0f13e1cd-cce2-46ed-9e49-b41cf7f5da7e` | not used |
| still K2 | 1 | `3845160b-d386-4961-9e47-021dee34a6d6` | used |
| still K3 | 1 | `9742d126-3f53-43a5-b7f5-ca5f28572a08` | used |
| still K4 | 1 | `ca2281be-60bd-4ce4-b3a4-bbfdbdae45cd` | used |
| still K5, first version (door 313 in the end wall) | 1 | `fd2d4df5-a7db-44dc-8a40-e42c01a80c6c` | superseded in round 2 |
| still K5 | 2 | `86150bb1-de27-4f55-b734-90e4bba9805a` | used (end of `seg4c.mp4`) |
| still K5, second candidate | 2 | `f410c051-3721-4436-8ce0-1495cefac104` | not used |
| still K1b (K1 with another handle on door 301) | 3 | `19966fee-5ac8-4f53-8cff-d03f54fb9ac8` | not used: it belongs to the rejected clip `seg1c` |
| clip `seg1.mp4` | 1 | `8ea0e6f4-419a-4954-a3eb-7d2b6d50280e` | used |
| clip K1 to K2 with `kling3_0` | 1 | none | not generated: the plan does not include that model |
| clip `seg2.mp4` | 1 | `72c0069a-870a-459e-9915-2d8bfbff9b97` | used |
| clip `seg3.mp4` | 1 | `f32b922a-5e71-48e8-bdaf-33927b5e8bb2` | used |
| clip `seg4.mp4` (K4 to the first K5) | 1 | `a3db1b14-e4ab-446f-b558-76f3ba2472b2` | superseded in round 2 |
| clip `scare.mp4` (the door opened at its hinge side) | 1 | `39959c99-56c0-4b3e-8903-88003f72eb86` | superseded in round 2 |
| clip `seg4b.mp4` (K4 to K5, 5 seconds) | 2 | `a1b244c8-77b8-4d5f-a2ee-c36ee467128b` | superseded in round 3 |
| clip `scareb.mp4` | 2 | `4693039b-7dff-4d5c-bd40-4b4d35046ac0` | superseded in round 3 |
| clip `seg1c.mp4` (K1b to K2, 10 seconds) | 3 | `142c87fd-1fa9-4642-b73b-c1bbce604430` | rejected: the camera swings into a blown-out close-up of the wall half way |
| clip `seg4c.mp4` | 3 | `eb7ac304-388d-4fae-8ce7-7a89a22d1af4` | used |
| clip `scarec.mp4` | 3 | `ed521a28-9293-495f-ae20-170b9835324c` | used |

Only the five files marked "used" under "clip" are in this folder, and no frame of any other
clip is shipped. `keyframes.json` lists K1b under `1` and the K1 that is used under `1_round1`.

## Keyframe stills

Model requested: `nano_banana_pro`, resolution `2k`, aspect ratio `16:9`. The service
reported the finished jobs as model `nano_banana_2`. K2 to K4 were generated with K1 as the
image reference, K5 with K1 and K4, which is what keeps the corridor the same place in all five.

### K1, job `bae7a440-fd66-403d-9bdc-0781a701cb36` (used)

No reference image.

> Photograph taken at night with a handheld camera: the long third-floor corridor of a neglected 1980s Eastern European hotel, seen from its start and lit only by the photographer's own handheld torch. The warm, narrow torch beam falls on the left wall and the first door: faded cream wallpaper with thin vertical stripes and a small sprig motif, yellowed, with brown water stains, tide marks and one peeling seam; a dark brown varnished wooden door with a simple panel moulding, a tarnished brass lever handle and a small engraved brass number plate reading 301; dark walnut wainscot panelling below a dado rail. A worn burgundy carpet runner with a plain darker border runs down the middle of a dark parquet floor into the distance. The ceiling lamps are dead: unlit opal glass pendant shades. Beyond the beam the corridor falls into near darkness, a row of closed doors barely visible, and a small green emergency exit sign glowing far away at the end. Slightly tilted handheld framing, 35 mm lens, shallow depth of field, the torch hot spot off-centre with a soft falloff, dust visible in the beam, natural film grain and high ISO noise in the shadows, muted colours. Documentary realism. No people. No text other than the door number.

### K2, job `3845160b-d386-4961-9e47-021dee34a6d6` (used)

Image reference: K1 (`bae7a440-fd66-403d-9bdc-0781a701cb36`).

> Photograph at night, same hotel corridor, taken about a third of the way down it while walking forward: the camera looks ahead and a little to the right, the torch beam falls on the right wall and the nearest door on the right. On the carpet runner, at the lower edge of the beam, lies a single small worn child's leather shoe on its side. More closed doors recede ahead into darkness and a small green emergency exit sign glows far away at the end. It is exactly the same corridor as in the reference image: the same faded cream striped wallpaper with the small sprig motif and brown water stains, the same dark walnut wainscot panelling and dado rail, the same dark brown varnished doors with simple panel mouldings, brass lever handles and small engraved brass number plates, the same worn burgundy carpet runner with a darker border on dark herringbone parquet, the same unlit opal glass pendant lamps. Lit only by the photographer's handheld torch: a warm narrow beam with a soft falloff, everything outside it close to black. Handheld, slightly tilted, 35 mm lens, shallow depth of field, natural film grain, high ISO noise in the shadows, muted colours, documentary realism. No people. No text other than the door number. The only readable number plate is 304.

### K3, job `9742d126-3f53-43a5-b7f5-ca5f28572a08` (used)

Image reference: K1 (`bae7a440-fd66-403d-9bdc-0781a701cb36`).

> Photograph at night, same hotel corridor: a close three-quarter view of one door on the left side, from about one metre away, the torch held low so its beam rakes across the wood. The door carries deep, frantic scratch marks gouged through the dark varnish down to pale raw wood, in clusters of parallel lines around the brass lever handle and down the lower panel, with splinters; old, dusty, not fresh. The brass number plate reads 305. A strip of wallpaper and the door frame are visible at the left edge, the dark corridor continues at the right edge of the frame. It is exactly the same corridor as in the reference image: the same faded cream striped wallpaper with the small sprig motif and brown water stains, the same dark walnut wainscot panelling and dado rail, the same dark brown varnished doors with simple panel mouldings, brass lever handles and small engraved brass number plates, the same worn burgundy carpet runner with a darker border on dark herringbone parquet, the same unlit opal glass pendant lamps. Lit only by the photographer's handheld torch: a warm narrow beam with a soft falloff, everything outside it close to black. Handheld, slightly tilted, 35 mm lens, shallow depth of field, natural film grain, high ISO noise in the shadows, muted colours, documentary realism. No people. No text other than the door number.

### K4, job `ca2281be-60bd-4ce4-b3a4-bbfdbdae45cd` (used)

Image reference: K1 (`bae7a440-fd66-403d-9bdc-0781a701cb36`).

> Photograph at night, same hotel corridor: a close oblique view of one closed door on the right side, from about one and a half metres away, the camera angled so the door frame and the edge of the door where it meets the frame are clearly visible on the left of the picture. The torch beam lights the upper half of the door and its small brass number plate, which reads 308; the brass lever handle catches a small glint lower down, in the dimmer spill. The door is shut. To the left of the door frame the wallpaper falls away into darkness. It is exactly the same corridor as in the reference image: the same faded cream striped wallpaper with the small sprig motif and brown water stains, the same dark walnut wainscot panelling and dado rail, the same dark brown varnished doors with simple panel mouldings, brass lever handles and small engraved brass number plates, the same worn burgundy carpet runner with a darker border on dark herringbone parquet, the same unlit opal glass pendant lamps. Lit only by the photographer's handheld torch: a warm narrow beam with a soft falloff, everything outside it close to black. Handheld, slightly tilted, 35 mm lens, shallow depth of field, natural film grain, high ISO noise in the shadows, muted colours, documentary realism. No people. No text other than the door number.

### K5, job `86150bb1-de27-4f55-b734-90e4bba9805a` (used)

Image references: K1 (`bae7a440-fd66-403d-9bdc-0781a701cb36`), K4 (`ca2281be-60bd-4ce4-b3a4-bbfdbdae45cd`).

> Photograph at night, near the far end of the same hotel corridor as in the reference images: a close oblique view of the last guest-room door, which is in the left-hand side wall, from about one and a half metres away. The camera is angled so the door fills the left two thirds of the picture, and at the right edge of the picture the end of the corridor is visible a few metres further on: dark wooden double doors with a small green emergency exit sign glowing above them. The handheld torch beam has a bright warm hot core and a soft wide falloff; the core lands on the upper panel of the door just beside its small brass number plate, which reads 313 and is the same style of small notched embossed brass plate as on the other doors. The brass lever handle and keyhole sit lower, in the dimmer spill, catching only a small glint. The door is shut and looks older and more worn than the others: rubbed varnish, grime around the handle, scuffs along the bottom rail. To the left of the door frame the stained wallpaper falls away into darkness; the carpet runner continues along the corridor towards the double doors. Exactly the same corridor: the same faded cream striped wallpaper with the small sprig motif and brown water stains, the same dark walnut wainscot and dado rail, the same dark brown varnished panelled doors, the same worn burgundy carpet runner with a darker border on dark herringbone parquet, the same unlit opal glass pendant lamps. Lit only by the torch, everything outside the beam close to black. Handheld, slightly tilted, 35 mm lens, shallow depth of field, natural film grain, high ISO noise in the shadows, muted colours, documentary realism. No people. No text other than the door number and the exit sign pictogram.

### K5, first version, job `fd2d4df5-a7db-44dc-8a40-e42c01a80c6c` (superseded)

Image reference: K1 (`bae7a440-fd66-403d-9bdc-0781a701cb36`).

> Photograph at night, the far end of the same hotel corridor: the last door stands in the end wall, straight ahead and close, seen slightly from the left from about one and a half metres. The torch beam lights the middle of the door and its small brass number plate, which reads 313; the lower part of the door, its brass lever handle and the end of the carpet runner sit in the dimmer spill, and the wallpapered walls on both sides fall away into darkness. The door is shut and looks older and more worn than the others, with grime around the handle. It is exactly the same corridor as in the reference image: the same faded cream striped wallpaper with the small sprig motif and brown water stains, the same dark walnut wainscot panelling and dado rail, the same dark brown varnished doors with simple panel mouldings, brass lever handles and small engraved brass number plates, the same worn burgundy carpet runner with a darker border on dark herringbone parquet, the same unlit opal glass pendant lamps. Lit only by the photographer's handheld torch: a warm narrow beam with a soft falloff, everything outside it close to black. Handheld, slightly tilted, 35 mm lens, shallow depth of field, natural film grain, high ISO noise in the shadows, muted colours, documentary realism. No people. No text other than the door number.

### K1b, job `19966fee-5ac8-4f53-8cff-d03f54fb9ac8` (not used)

Image references: K1 (`bae7a440-fd66-403d-9bdc-0781a701cb36`), K4 (`ca2281be-60bd-4ce4-b3a4-bbfdbdae45cd`).

> Reproduce the first reference image exactly, with one single change: the handle of door 301. Replace it with one horizontal brass lever handle on a narrow tarnished brass backplate with a keyhole below the lever, the same kind of lever handle as on the door in the second reference image. Everything else stays exactly as in the first reference image: the same camera position and framing, the same torch beam on the left wall and the door, the same faded striped wallpaper with the same brown water stains and peeling seam, the same dark varnished door with its brass number plate reading 301, the same wainscot, the same burgundy carpet runner on herringbone parquet, the same unlit opal glass pendant lamps, the same dark corridor with the small green exit sign at the far end. Photograph at night by handheld torch, documentary realism, natural film grain. No people.

## Video clips

Model: `minimax_h3` (MiniMax H3), aspect ratio `16:9`, 2K (the only resolution this model
has), with first and last frame control: `start_image` and `end_image` are the keyframe
stills named below. Duration 5 s, or 10 s where it says so. The service's suggested preset
("IN THE DARK") was declined (`declined_preset_id` `24bae836-2c4a-48e0-89b6-49fcc0b21612`), so
the prompts ran as written.

### `seg1.mp4`, job `8ea0e6f4-419a-4954-a3eb-7d2b6d50280e` (used)

Duration 5 s. Start image K1 (`bae7a440-fd66-403d-9bdc-0781a701cb36`), end image K2 (`3845160b-d386-4961-9e47-021dee34a6d6`).

> First-person handheld camera walking slowly forward down a dark hotel corridor at night, lit only by the handheld torch. One continuous shot, no cuts: the camera moves steadily forward at walking pace while the torch beam and the view swing smoothly from the wall and door on the left across the corridor to the door on the right. Slight natural handheld sway. The corridor, wallpaper, doors, brass number plates, carpet runner and ceiling lamps stay exactly as in the frames, nothing appears or disappears, no people. Photorealistic, film grain, no text overlays.

### `seg2.mp4`, job `72c0069a-870a-459e-9915-2d8bfbff9b97` (used)

Duration 5 s. Start image K2 (`3845160b-d386-4961-9e47-021dee34a6d6`), end image K3 (`9742d126-3f53-43a5-b7f5-ca5f28572a08`).

> First-person handheld camera in a dark hotel corridor at night, lit only by the handheld torch. The camera keeps walking forward down the corridor and turns left towards a door on the left side, coming close to it, while the torch beam swings smoothly from the right wall across the corridor onto that door and its scratched wood. One continuous handheld shot with slight natural sway, no cuts, slow walking pace. The corridor, wallpaper, doors, brass number plates, carpet runner and ceiling lamps stay exactly as in the frames, nothing appears or disappears, no people. Photorealistic, film grain, no text overlays.

### `seg3.mp4`, job `f32b922a-5e71-48e8-bdaf-33927b5e8bb2` (used)

Duration 5 s. Start image K3 (`9742d126-3f53-43a5-b7f5-ca5f28572a08`), end image K4 (`ca2281be-60bd-4ce4-b3a4-bbfdbdae45cd`).

> First-person handheld camera in a dark hotel corridor at night, lit only by the handheld torch. The camera turns away from the scratched door on the left, walks on down the corridor and turns right towards a closed door on the right side, stopping close to it at an angle, while the torch beam swings smoothly across the corridor onto that door. One continuous handheld shot with slight natural sway, no cuts, slow walking pace. The corridor, wallpaper, doors, brass number plates, carpet runner and ceiling lamps stay exactly as in the frames, nothing appears or disappears, no people. Photorealistic, film grain, no text overlays.

### `seg4c.mp4`, job `eb7ac304-388d-4fae-8ce7-7a89a22d1af4` (used)

Duration 10 s. Start image K4 (`ca2281be-60bd-4ce4-b3a4-bbfdbdae45cd`), end image K5 (`86150bb1-de27-4f55-b734-90e4bba9805a`).

> First-person handheld camera in a dark hotel corridor at night, lit only by the handheld torch. The camera turns slowly away from the closed door on the right, walks forward down the corridor towards the dark double doors and the small green exit sign at its far end, then turns slowly left towards the last guest-room door in the left-hand wall and stops close to it at an angle, while the torch beam swings slowly across the corridor and settles on that door beside its brass number plate. One continuous handheld shot with slight natural sway, no cuts, a slow, unhurried walking pace with slow smooth turns of the head, so every frame stays sharp with very little motion blur. The corridor, wallpaper, doors, brass number plates and their numerals, door handles, carpet runner, parquet and ceiling lamps stay exactly as in the frames, crisp and unchanged, nothing appears or disappears, no people. Photorealistic, film grain, no text overlays.

### `scarec.mp4`, job `ed521a28-9293-495f-ae20-170b9835324c` (used)

Duration 5 s. Start image K4 (`ca2281be-60bd-4ce4-b3a4-bbfdbdae45cd`), end image K4 (`ca2281be-60bd-4ce4-b3a4-bbfdbdae45cd`).

> Locked-off handheld shot of a closed hotel room door at night, lit by a handheld torch. The camera does not move and the framing stays exactly the same from the first frame to the last. The door slowly swings inward, away from the camera and into the dark room, by only a few centimetres at its right-hand edge, the edge that carries the brass lever handle and the lock; the hinges are on the left edge, which stays in place. In the narrow black gap that appears between the handle edge of the door and the door frame on the right, a pale gaunt adult woman's face is half visible deep inside the dark room, almost entirely in shadow: only one eye and the edge of one cheek catch the warm torch light. A thin, bony, real human hand grips the edge of the door just above the handle from inside: three fingers with visible knuckles, wrinkled skin, tendons and short dirty fingernails, lit warm by the torch and casting a small hard shadow on the wood. She stares, motionless. Then the door closes again and everything is exactly as at the start. The wallpaper, the door frame, the number plate and the light do not change. Photorealistic, film grain, no text overlays.

### `seg4.mp4`, job `a3db1b14-e4ab-446f-b558-76f3ba2472b2` (round 1, superseded)

Duration 5 s. Start image K4 (`ca2281be-60bd-4ce4-b3a4-bbfdbdae45cd`), end image K5 (round 1) (`fd2d4df5-a7db-44dc-8a40-e42c01a80c6c`).

> First-person handheld camera in a dark hotel corridor at night, lit only by the handheld torch. The camera turns away from the door on the right, walks forward to the far end of the corridor where the last door stands in the end wall, and stops in front of it, while the torch beam swings forward and settles on that last door. One continuous handheld shot with slight natural sway, no cuts, slow walking pace. The corridor, wallpaper, doors, brass number plates, carpet runner and ceiling lamps stay exactly as in the frames, nothing appears or disappears, no people. Photorealistic, film grain, no text overlays.

### `scare.mp4`, job `39959c99-56c0-4b3e-8903-88003f72eb86` (round 1, superseded)

Duration 5 s. Start image K4 (`ca2281be-60bd-4ce4-b3a4-bbfdbdae45cd`), end image K4 (`ca2281be-60bd-4ce4-b3a4-bbfdbdae45cd`).

> Locked-off handheld shot of a closed hotel room door at night, lit by a handheld torch; the camera does not move and the framing stays exactly the same. The door slowly opens inward by a narrow crack, on its own. In the dark gap a pale gaunt adult woman's face appears, almost entirely in deep shadow, only one eye catching the torch light, and pale thin fingers curl around the edge of the door. She stares, motionless. Then the door pulls shut again and everything is exactly as at the start. Nothing else in the picture changes. Photorealistic, film grain, no text overlays.

### `seg4b.mp4`, job `a1b244c8-77b8-4d5f-a2ee-c36ee467128b` (round 2, superseded)

Duration 5 s. Start image K4 (`ca2281be-60bd-4ce4-b3a4-bbfdbdae45cd`), end image K5 (`86150bb1-de27-4f55-b734-90e4bba9805a`).

> First-person handheld camera in a dark hotel corridor at night, lit only by the handheld torch. The camera turns away from the closed door on the right, walks forward down the corridor towards the dark double doors and the small green exit sign at its far end, then turns left towards the last guest-room door in the left-hand wall and stops close to it at an angle, while the torch beam swings across the corridor and settles on that door beside its brass number plate. One continuous handheld shot with slight natural sway, no cuts, slow walking pace. The corridor, wallpaper, doors, brass number plates, carpet runner and ceiling lamps stay exactly as in the frames, nothing appears or disappears, no people. Photorealistic, film grain, no text overlays.

### `scareb.mp4`, job `4693039b-7dff-4d5c-bd40-4b4d35046ac0` (round 2, superseded)

Duration 5 s. Start image K4 (`ca2281be-60bd-4ce4-b3a4-bbfdbdae45cd`), end image K4 (`ca2281be-60bd-4ce4-b3a4-bbfdbdae45cd`).

> Locked-off handheld shot of a closed hotel room door at night, lit by a handheld torch. The camera does not move and the framing stays exactly the same from the first frame to the last. The door slowly opens inward by only a few centimetres at its right-hand edge, the edge that carries the brass lever handle and the lock; the hinges are on the left edge, which stays in place. In the narrow black gap that appears between the handle edge of the door and the door frame on the right, a pale gaunt adult woman's face is half visible deep inside the dark room, almost entirely in shadow: only one eye and the edge of one cheek catch the warm torch light, and two or three pale fingertips with fingernails curl around the edge of the door just above the handle. She stares, motionless. Then the door closes again and everything is exactly as at the start. The wallpaper, the door frame, the number plate and the light do not change. Photorealistic, film grain, no text overlays.

### `seg1c.mp4`, job `142c87fd-1fa9-4642-b73b-c1bbce604430` (round 3, rejected)

Duration 10 s. Start image K1b (`19966fee-5ac8-4f53-8cff-d03f54fb9ac8`), end image K2 (`3845160b-d386-4961-9e47-021dee34a6d6`).

> First-person handheld camera walking slowly forward down a dark hotel corridor at night, lit only by the handheld torch. The camera moves steadily forward while the torch beam and the view swing slowly and smoothly from the wall and door on the left across the corridor to the door on the right. One continuous handheld shot with slight natural sway, no cuts, a slow, unhurried walking pace with slow smooth turns of the head, so every frame stays sharp with very little motion blur. The corridor, wallpaper, doors, brass number plates and their numerals, door handles, carpet runner, parquet and ceiling lamps stay exactly as in the frames, crisp and unchanged, nothing appears or disappears, no people. Photorealistic, film grain, no text overlays.

## What the build does with them

- **The walk** is the four segments in order, 612 frames. Segment N ends on the still segment
  N+1 starts on, and the two renderings of that still differ slightly, so the duplicate frame
  is dropped and the last three frames of a segment dissolve into the first frame of the next.
  At door 308 the walk dissolves into the first frame of `scarec.mp4` instead, so the frame the
  scare is played over is the scare clip's own first frame.
- **Frames are picked at equal steps of motion**, not of time: the clips ease in and out of
  every keyframe, and equal steps of time would rush through the middle of each segment and
  freeze at its ends.
- **Desktop set:** 168 frames, 1600 x 900 (Lanczos), AVIF. **Phone set:** 112 frames, a
  720 x 1440 window of each frame that follows the subject, enlarged to 900 x 1800, WebP.
- **Sharpness is evened out** (`scripts/corridor-even.cjs`) on every frame at its final size:
  the keyframes come out of the video model crisper than the frames in motion, so crisp
  frames are softened a touch and soft ones get an unsharp mask.
- **The finishing pass** (`scripts/corridor-finish.cjs`) follows on every frame: everything
  outside the torch beam about a stop darker, a slightly lifted black, fine film grain with a
  new pattern per frame. In the first two segments the video model lit the whole corridor as
  if by a second lamp, so up to door 305 everything outside the beam is pulled down further,
  and that extra darkening fades out over the 30 timeline frames after it.
- **The scare:** 13 frames of `scarec.mp4`, graded (`scripts/corridor-grade.cjs`) so that the
  face in the gap sits in deep shadow, shipped as patches over the held walk frame. A second
  set of the same patches has the gap empty, for the case that a photograph is supplied
  (`src/assets/scare/README.md`).
