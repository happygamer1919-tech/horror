# The face behind door 308

Put one photograph here, named exactly:

```
src/assets/scare/face.avif   (or face.webp, or face.png)
```

Nothing else is needed. On the next build the site uses it: the door opens a hand's width at
its handle edge, and the photograph is drawn into the gap between the door edge and the door
frame, darkened and tinted to the torch, lit on one side only, with film grain added.

While no file is here, the scare frames are used as they were generated: a sliver of a
woman's face in deep shadow, one eye catching the torch. That face is generated; it is not a
photograph and shows no real person (see `corridor-src/SOURCES.md`). The hand gripping the door
edge above the handle is part of the frames either way.

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
  and looking into the lens. The site does not look for a face: it places the picture by its
  edges, so that this spot lands where the generated eye is, in the lit half of the gap.
- **Background:** black, or as dark as possible. The picture is added to the darkness of the gap,
  so everything black in it disappears and everything bright in it shows.
- **Light:** lit from the front and a little from above, soft, no flash glare. The site keeps
  about the left third of the picture in the light, lets the rest fall away into the dark, and
  lays the shadow of the door edge over the half of the gap nearest the door. What is left
  is one eye and the cheek under it, no brighter than the hand on the door.
- **Expression and styling:** still, pale, no smile. Dark hair drawn back from the face or
  hanging beside it is how the generated face looks, and it frames the lit side against the
  dark of the room.
- **Colour:** any. It is reduced to almost monochrome and tinted warm.
- **Size on disk:** under 150 kB. It loads only when a visitor reaches the door.
- **Consent:** use a photograph you have the right to publish. If it is a real person, written
  consent. A minor's face should not be used without a guardian's written consent.

## How it is checked

`tests/corridor.spec.ts` ("a supplied face photo is composited into the door gap") runs the same
code path with `tests/fixtures/face.png`. To try your own picture before committing it, drop it
here, run `npm run build && npm test`, and walk the corridor once in a fresh tab.

The scare plays once per browser session. To see it again while testing: close the tab, or
clear `hotel:scare` in the tab's session storage.

Where the picture goes (the quad) and the outline of the gap for each frame of the beat are in
`public/corridor/manifest.json`, written by `scripts/corridor-frames.mjs` (`HEAD` there is the
head of the generated face in the master frames).
