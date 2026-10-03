# The face behind door 308

Put one photograph here, named exactly:

```
src/assets/scare/face.avif   (or face.webp, or face.png)
```

Nothing else is needed. On the next build the site uses it: the door opens a hand's width, and
the photograph is drawn into the gap, darkened and tinted to the corridor's lamp, lit on one
side only, with film grain added. While no file is here, the frames rendered with the 3D
stand-in are used instead. The fingers on the door edge are part of the rendered frames either way.

## The photograph to supply

- **Framing:** one face, front on or turned slightly to its left, filling the picture from
  hairline to chin. Portrait, about 3 : 4 (for example 600 x 810 px). Smaller is fine: on screen
  the picture is drawn about 120 px wide on a desktop screen and 60 px on a phone, mostly in
  shadow, and is seen for about half a second.
- **Background:** black, or as dark as possible. The picture is added to the darkness of the gap,
  so everything black in it disappears and everything bright in it shows.
- **Light:** lit from the front and a little from above, soft, no flash glare. She leans out
  past the edge of the door, which covers the right of the picture: the site keeps the left half
  in the light and lets the right half fall away into the dark. **The eye that should catch the
  light is the one on the left of the picture.** Keep that eye open and looking into the lens.
- **Expression and styling:** still, pale, no smile. Long dark hair hanging beside the face is
  ideal: it frames the lit side against the dark of the room.
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
