# The face behind door 308

The scare is part of a video file (the corridor's clip, the variant with the door beat, which
is the one a visitor sees the first time).
The face in the gap is generated: a sliver of a woman's face in deep shadow, one eye catching
the torch. It is not a photograph and shows no real person (see `corridor-src/SOURCES.md`).

To put a photograph there instead:

1. Put one picture here, named exactly `face.avif`, `face.webp` or `face.png`:

   ```
   src/assets/scare/face.png
   ```

2. Build the clip again (needs ffmpeg with libx264 and libsvtav1, and the masters in
   `corridor-src/`):

   ```
   npm run corridor:video
   ```

3. Commit what changed under `public/corridor/` (the two `walk-door` files of each set and
   `manifest.json`), and the photograph.

The build takes the generated face out of the gap, and draws the photograph into the gap
between the door edge and the door frame in the scare frames before they are encoded:
darkened and tinted to the torch, lit on one side only, with the shadow of the door edge over
the half of the gap nearest the door. The hand gripping the door edge above the handle stays
as it is. The page itself does nothing with the photograph: it only plays the video, and the
photograph is not downloaded by anybody.

While no file is here, the videos carry the generated face. `manifest.json` says which it was
built with (`face: true` or `false`).

## The photograph to supply

- **Framing:** one face, front on or turned slightly to its left, filling the picture from
  hairline to chin. Portrait, about 3 : 4 (for example 600 x 800 px). Smaller is fine: on
  screen the picture is drawn about 100 px wide, on a desktop screen and on a phone alike, and
  it is seen for about half a second.
- **What shows of it:** one narrow upright strip. The gap is to the right of the door handle;
  the door edge is on its left and the door frame on its right. The door edge hides the left
  sixth of the picture and the frame everything right of about two fifths of its width. At its
  widest the gap is about 28 px wide on screen.
- **The eye:** the eye on the left of the picture is the one that is seen. Put it about a
  third of the way in from the left edge and a little above the middle of the picture, open
  and looking into the lens. The build does not look for a face: it places the picture by its
  edges, so that this spot lands where the generated eye is, in the lit half of the gap.
- **Background:** black, or as dark as possible. The picture is added to the darkness of the gap,
  so everything black in it disappears and everything bright in it shows.
- **Light:** lit from the front and a little from above, soft, no flash glare. The build keeps
  about the left third of the picture in the light, lets the rest fall away into the dark, and
  lays the shadow of the door edge over the half of the gap nearest the door. What is left
  is one eye and the cheek under it, no brighter than the hand on the door.
- **Expression and styling:** still, pale, no smile. Dark hair drawn back from the face or
  hanging beside it is how the generated face looks, and it frames the lit side against the
  dark of the room.
- **Colour:** any. It is reduced to almost monochrome and tinted warm.
- **Consent:** use a photograph you have the right to publish. If it is a real person, written
  consent. A minor's face should not be used without a guardian's written consent.

## How it is checked

`tests/corridor-face.spec.ts` runs the compositing the build uses (`scripts/corridor-face.cjs`)
on `tests/fixtures/face.png`: the photograph lights the gap and nothing outside it. It does
not encode anything. After building with your own picture, look at the result: scroll down
to the corridor once in a fresh tab.

The scare plays once per browser session, on the first play of the corridor. To see it again
while testing: close the tab, or clear `hotel:corridor` and `hotel:scare` in the tab's session
storage.

Where the picture goes (the head rectangle) and the outline of the gap for each frame of the
beat are worked out in `scripts/corridor-video.mjs` (`HEAD` there is the head of the generated
face in the master frames).
