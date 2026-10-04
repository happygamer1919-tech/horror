# Handoff: "Проклятие Отеля" preview site

Live: https://happygamer1919-tech.github.io/horror/

- Romanian (default): https://happygamer1919-tech.github.io/horror/ro/
- Russian: https://happygamer1919-tech.github.io/horror/ru/
- English: https://happygamer1919-tech.github.io/horror/en/

Status on 2026-10-03 (update 3): content, booking, hero, the owner's rulings and the mobile
scroll fix are live. The new 3D corridor is NOT live: its stills did not reach the agreed
review score in the first shoot (four rounds) or in the torch-lit re-shoot (two rounds), so
the site still shows the earlier 2D corridor. The site is a preview and is
hidden from search engines.

## What is live from update 3

Content
- Age: no age limit. Key tag 03 and the FAQ say: everyone signs an agreement on arrival,
  minors enter only if a parent signs it.
- Game languages: Romanian, Russian, English (check-in card and FAQ).
- Payment: cash only. Gift vouchers are bought at the venue, in cash; the voucher block shows
  no price and keeps a "Message us" button (WhatsApp and Telegram).
- Hours: Mon-Thu 16:00-03:00, Fri 16:00-00:00, Sat-Sun 24 hours.
- Levels: No electroshock / Weak electroshock / Hardcore. No level is described anywhere.
- Instagram stays hidden.

Booking
- "Book a time slot" opens the EasyWeek widget in a styled window. The check-in card keeps
  team size, level, language and the live total, and copies one summary line for the widget's
  comment field ("Team: 4 - Level: Weak electroshock - Language: English - Total: 1200 MDL").
- The team size starts empty (hint "2-11", the total shows three dots). The button is disabled
  until the team size is a whole number from 2 to 11 and a level is chosen, with the prompt
  "Choose team size and level" next to it.
- "We call you on the day of the game to confirm the booking." is shown on the card, in the
  "How do I book?" answer and in the booking window.
- "Ask a question": WhatsApp (prefilled) and Telegram (message copied, short notice).
- The floating button opens a menu with WhatsApp and Telegram, also on the 404 page.

Hero
- Darker base: the wall outside the light is near black. The headline keeps about 62 percent
  of its strength outside the light. Buttons are always fully lit.
- Idle dimming (after 20 seconds without input) goes under the hero copy and buttons: the
  headline stays at about 62 percent and the buttons stay fully lit. The header, the mobile
  book bar and the floating button also stay lit; the rest of the page dims as before.
- Touch: the light is on from the first paint and drifts slowly across the hero; the first
  touch takes it over and it follows the finger, also through a scroll drag.
- The E of the sign hangs from one bolt, sways, and is electrically faulty all the time.
- Route button with the street address under it (Google Maps directions).
- Facade: a guest in the lit window who is gone the next time the light passes, a curtain
  that moves, rain, a rare single lightning flash.

Mobile scroll
- Phones and tablets use the browser's own scroll. Desktop keeps the smooth scroll.

## Corridor: not shipped

The 3D corridor is built (path traced in three.js, pre-rendered, scrubbed by scroll, with the
new door scare and the face photo slot) on the branch `wt/corridor`, not merged.

The owner's rule for it: six fixed stills must be scored 8 or higher for photographic realism
by two independent reviewers, in at most four rounds, before any full render. Result:

| Round | Reviewer A | Reviewer B |
|-------|-----------|-----------|
| 1 | 6.9 | 6.9 |
| 2 | 7.2 | 7.3 |
| 3 | 7.3 | 7.4 |
| 4 | 7.4 | 7.5 |

Round 4 per still (A / B): start 7.0 / 7.3, mid walk 7.3 / 7.0, scratched door 7.8 / 8.0,
scare door closed 8.0 / 7.9, scare 7.8 / 7.7, last door 6.9 / 7.1.

The close, shallow-focus frames passed as film stills. The wide frames and the last door
read as a high-end render, mainly because of the carpet runner, the lamp shades and door 313.

The owner then ruled a re-shoot of the whole walk as a handheld torch point of view (one
narrow beam, everything else near black, lamps dead, camera low and close), same gate, at
most two rounds. Result:

| Torch round | Reviewer A | Reviewer B |
|-------------|-----------|-----------|
| 1 | 7.2 | 7.4 |
| 2 | 7.1 | 7.1 |

Torch round 2 per still (A / B): start 7.0 / 6.7, shoe 7.6 / 7.7, scratched door 6.3 / 6.8,
scare door closed 8.0 / 8.0, scare 7.6 / 7.7, last door 6.7 / 6.4.

Both reviewers judged the torch light, the exposure, the grain and the handheld camera as
photographic in both rounds. What fails is what the beam lands on: brass that reads as cream
plastic, a number plate that reads as a flat decal, scratches that look ruler-drawn, wood
without lacquer response. The frames that show little pass; the frames that present an
object do not.

Stills are in `docs/corridor-stills/`: one sheet per round of the first shoot, the six
round 4 stills and the two best round 3 stills; for the re-shoot `torch-round-1-sheet.jpg`,
`torch-round-2-sheet.jpg`, the six torch round 2 stills and the two best torch round 1 stills.

No full render was run in either shoot, so the frames on `wt/corridor` are from an older,
lower scoring scene. The scene, the torch, the camera path and the stills command
(`node corridor3d/render.mjs stills`) are on that branch.

## What you still need to send

In `src/content/site.ts`, marked `TODO(owner)`:

| # | Value | Where it shows | What is shown now |
|---|-------|----------------|-------------------|
| 1 | Instagram handle | Footer link | No link |
| 2 | Review quotes (with permission) | "From the guest book" block | Block hidden while empty |
| 3 | Face photo for the corridor scare | `src/assets/scare/face.(avif|webp|png)` | Not used until the corridor ships |

In the EasyWeek account (not site code): the widget shows a Russian interface on all three
language pages and a broken avatar image. Enable RO and EN there and upload a logo.

## Decisions needed

- Corridor: both shoots stopped under the bar of 8. Options: commission or buy real assets
  for what the beam lands on (door hardware, number plate, a child's shoe, a scanned door),
  shoot the corridor as real photographs or video in the venue, or keep the 2D corridor.
- While idle the header, the mobile book bar and the floating button now stay lit. Say if
  the header should dim with the page.

## Flags and config

In `src/content/site.ts`:

- `CONTACT_LEVELS_ENABLED` (true): the three levels on the card and in the key section.
- `CONFIRM_CALL_ENABLED` (true): the confirmation call line on the card, in the FAQ and in
  the booking window.
- `VOUCHERS_ENABLED` (true): the gift voucher block and its FAQ answer.
- `SLOTS_URL`: the EasyWeek widget address. Empty hides the booking button.
- `TELEGRAM_URL`: the Telegram link.

In `.github/workflows/deploy.yml`:

- `SITE_INDEXABLE` ('false'): one switch for meta robots, robots.txt and JSON-LD.

After changing the wordmark, the hero or the subtitles, regenerate the share images:
`npm run build && npm run og && npm run build`, then commit `public/og/`.

## Acceptance results

| Check | Result |
|-------|--------|
| `npm run build` | exit 0 |
| `npm test` (Playwright, 390px and 1440px) | exit 0, 232 passed, 14 skipped (tests that apply to the other screen size only) |
| Booking button disabled while the team size is empty, and until a level is chosen | tested, all three languages |
| Idle dimming: headline at 62 percent, hero buttons unchanged | tested in pixels, both widths |
| Light on the hero before any touch, moving over 3 seconds | tested (about 98 px in 3 s) |
| Scare plays once | tested on `wt/corridor` only, not on main |
| `npm run test:perf` (phone emulation, 4x CPU throttle) | 0.2 percent dropped frames (worst 0.3), no long task; a scroll that starts during an 800 ms script hang waits 24 ms (was about 650 ms) |
| Lighthouse mobile, live `/ro/` | Performance 93, Accessibility 100 |
| Lighthouse mobile, live `/ru/` | Performance 95, Accessibility 100 |
| Lighthouse mobile, live `/en/` | Performance 97, Accessibility 100 |

`npm run test:perf` is separate from `npm test` and is not part of the deploy gate. It was
run on main after the scroll fix, not after a corridor merge, because the corridor is not merged.

## Screenshots

In `docs/screenshots/`, at 390px (`-390.jpg`) and 1440px (`-1440.jpg`):

- `01-preloader`
- `02-hero-ro`, `02-hero-ru`, `02-hero-en`, `15-hero-dark`, `12-flashlight`
- `16-hero-touch-a`, `16-hero-touch-b`: the light at a touched point
- `17-sign-e-1` to `3`: the E in three states
- `18-facade-*`: figure, curtain, rain, lightning
- `03-corridor-*`: the 2D corridor that is live
- `04-file`, `05-keys`, `05b-prices`, `06-cctv`, `07-proof`, `07b-voucher`
- `08-checkin`: the card with the booking button and the confirmation line
- `09-info`, `10-footer`, `11-reduced-motion`
- `13-booking-modal`: the EasyWeek window
- `14-float-menu`: WhatsApp and Telegram

Share images: `public/og/ro.jpg`, `ru.jpg`, `en.jpg` (regenerated for the new hero).

## Deviations in update 3, with reasons

Ratified by the owner: the card dropped date, time, name, phone and comment; the hero slots
link is gone; one FAQ item about game languages; no level tint; the lit window sits in the
top row on phones; four facade effects (the door ajar was removed); the scroll performance
test runs outside the deploy gate; build-only render packages (`three`, `three-gpu-pathtracer`,
`three-mesh-bvh`).

Open:

1. **While idle, the header, the mobile book bar and the floating button stay lit.** The idle
   layer was moved under the hero copy; these three sit above it as well.
2. **The confirmation line is hidden in the booking window on short phones** (under 700 px
   high), so the widget keeps its height. It stays on the card and in the FAQ.
3. **True volumetric fog is not in the corridor.** The path tracer loses the direct light on
   the walls when the camera is inside a fog volume. The thin haze pass stays.
4. **Corridor textures are 2K, not 4K.** The tracer's texture memory holds about 80 layers at
   2K; the scene needs about 75.
5. **The legend text still mentions a child's silhouette** in the corridor. Left as ruled.
6. **In torch round 2 one still was corrected before review.** The sharper focus had turned
   the stand-in figure in the scare frame into a clearly drawn shape; it was put back into
   deep shadow and that one frame re-rendered. The other five went to review as first rendered.
7. **No CC0 scanned child's shoe exists** in the sources checked (521 Poly Haven models), so
   in the re-shoot the shoe sits at the edge of the beam, dark and soft.

## Not verified

- Real phones. Everything was checked in Chromium emulation. iOS Safari and Android Chrome on
  real devices were not tested, including the clipboard step before Telegram opens.
- The paste step inside the EasyWeek widget, end to end.
- The ambient sound by ear.
