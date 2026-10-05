# Handoff: "Проклятие Отеля" preview site

Live: https://happygamer1919-tech.github.io/horror/

- Romanian (default): https://happygamer1919-tech.github.io/horror/ro/
- Russian: https://happygamer1919-tech.github.io/horror/ru/
- English: https://happygamer1919-tech.github.io/horror/en/

Status on 2026-10-05: everything below is live. The corridor is now a walk made of
AI-generated video (Higgsfield). It went live on the owner's decision although its review
score stayed just under the agreed 8 (7.7 and 7.9 in the last round). The site is a preview
and is hidden from search engines.

## What is live

Content
- Duration: 60-90 min (key tag, hero line, FAQ, descriptions).
- Players 2 to 11, price list 1000 to 3300 MDL per team, cash only.
- Age: no age limit. Everyone signs an agreement on arrival; minors enter only if a parent
  signs it. Teams with minors play without electroshock (age key tag, FAQ, next to the level
  choice).
- Levels: exactly two, No electroshock and Hardcore. No level is described.
- Game languages: Romanian, Russian, English.
- Hours: Mon-Thu 16:00-03:00, Fri 16:00-00:00, Sat-Sun 24 hours.
- Instagram: https://instagram.com/last.quest.moldova in the footer (and in JSON-LD sameAs).
- Gift vouchers: bought at the venue, in cash, no price shown, "Message us" button.

Booking
- "Book a time slot" opens the EasyWeek widget in a styled window. The check-in card keeps
  team size (starts empty), level, language and the live total, and copies one summary line
  for the widget's comment field.
- The button is disabled until the team size is a whole number from 2 to 11 and a level is
  chosen, with the prompt "Choose team size and level".
- "We call you on the day of the game to confirm the booking." on the card, in the FAQ and in
  the booking window (confirmed by the owner).
- "Ask a question": WhatsApp (prefilled) and Telegram (message copied, short notice). The
  number +373 682 32 596 is confirmed on both.
- The floating button opens a menu with WhatsApp and Telegram, also on the 404 page.

Guest book (reviews)
- Leads with the Google rating from config (4.8 from 39 reviews), "Read all reviews on Google"
  and "Leave a review".
- "Cel mai tare quest horror!" as a large pull quote, then three Google reviews (Catalina G.,
  Diana R. as an excerpt, Ruslana P.) as handwritten entries on the registry's paper, five
  stars each. RO shows the originals; RU and EN show translations labelled "translated from
  Romanian".
- The block sits right before the check-in card.

Hero
- Dark base, the headline keeps about 62 percent of its strength outside the light and while
  the page is idle; buttons are always fully lit.
- Touch: the light is on from the first paint and drifts; the first touch takes it over.
- The loose, faulty E; the route button with the street address; figure in the lit window,
  moving curtain, rain, rare lightning.

Corridor
- A torch-lit walk down the third floor, scrubbed by scroll: door 301, door 304, the scratched
  door 305, door 308, the last room 313 with the exit doors beyond.
- Scare, once per session: door 308 opens a crack at its handle edge, a face in shadow with
  one eye catching the torch and a hand on the door edge, about 0.6 s, then it shuts. No sound
  unless the visitor turned sound on. Reduced motion: one still frame, no scare.
- Only a small poster loads with the page; the frames load after the first input.

Mobile scroll
- Phones and tablets use the browser's own scroll.

## The corridor: how it was made, and its review

Made with Higgsfield through its MCP connection: keyframe stills with `nano_banana_pro` (2K;
the service reports it as `nano_banana_2`), video with `minimax_h3` (2K, first and last frame
control, 5 and 10 second clips). Every generation, with job id, prompt and status, is in
`corridor-src/SOURCES.md`; the five master clips are in `corridor-src/`.
`npm run corridor:frames` rebuilds the shipped frames from them.

Credits: 280 at the start, hard cap 140. Spent 138 (round 1: 62, round 2: 24, round 3: 52).
Of round 3, 22 credits went into material that was not used (a 10 second first segment whose
camera swung into a blown-out wall, and the keyframe made for it).

The agreed gate was: two fresh independent reviewers each score six extracted stills 8 or
higher for photographic realism and confirm no visible jump at the joins, at most three
generation rounds.

| Round | Reviewer A | Reviewer B | Joins |
|-------|-----------|-----------|-------|
| 1 | 7.9 | 7.8 | no jump, both |
| 2 | 7.8 | 8.0 | no jump, both |
| 3 | 7.7 | 7.9 | A: no jump; B: a one-frame crispness flash at door 308 |

Round 3 per still (A / B): start 8.3 / 8.3, mid walk 7.4 / 7.6, scratched door 8.0 / 8.0,
door 308 closed 8.7 / 8.6, scare 7.7 / 7.5, last door 8.2 / 8.2.

What the reviewers said: the keyframes pass as torch-lit photographs, and no frame reads as a
game or a render. What holds the walk under 8: the frames between keyframes are softer than
the keyframes, the parquet smears in motion, the hand in the scare looks matte, and door
hardware differs from door to door.

The gate failed. The owner then decided to ship the best material from the three rounds:
segments 1 to 3 from round 1, the last segment and the scare from round 3. After the last
review two changes were made that the reviewers did not see: the first two segments are
darker outside the beam, and a softening meant to remove the crispness flash at door 308
(measured afterwards: it does not change that frame, so the flash may remain).

Stills: `docs/corridor-stills/ai-round-1-sheet.jpg`, `ai-round-2-sheet.jpg`,
`ai-round-3-sheet.jpg` and the six round 3 stills. Earlier attempts (path-traced 3D, two
shoots) are there too; that scene is retired and archived under the local git tag
`corridor-pathtraced-archive`.

Asset weights as shipped:

| Set | Files | Bytes | One visitor downloads |
|-----|-------|-------|-----------------------|
| Desktop (168 frames 1600x900 AVIF, 26 scare patches) | 194 | 9,534,101 | about 8.7 MB |
| Phone (112 frames 900x1800 WebP, 26 scare patches) | 138 | 6,982,428 | about 5.5 MB |

Half of the scare patches are a faceless variant for the photo slot and are never fetched
while no photo exists.

## What you still need to send

| # | Value | Where | What is shown now |
|---|-------|-------|-------------------|
| 1 | More review quotes, if wanted | `site.reviews` in `src/content/site.ts` | The three supplied |
| 2 | A face photo for the scare, if wanted | `src/assets/scare/face.(avif|webp|png)`, see the README there | The generated clip |

Logo for EasyWeek and Google: `docs/brand/logo-1024.png` and `logo-512.png` (the wordmark with
the key, dark background, safe for a circular crop).

EasyWeek language: the widget reads `?lang=` but applies it only to languages enabled in the
account, and the account lists Russian only. Nothing is passed. If Romanian and English are
enabled there, passing the page language is a one-line change.

## Decisions for you

- The business JSON-LD already contains an aggregate rating (4.8 from 39, from config). It is
  only emitted when the site is made indexable. It was there before the reviews block and was
  not added or removed. Say if it should go.
- The hero line under the title now reads "An hour or more to find the key and learn why."
  (it said "One hour"), because it sits under "60-90 min". One string per language to revert.
- The guest book handwriting is the site's italic serif. A real script font would be a new
  self-hosted font.
- While idle, the header, the mobile book bar and the floating button stay lit.

## Flags and config

In `src/content/site.ts`:

- `CONTACT_LEVELS_ENABLED` (true), `LEVELS` (none, hardcore).
- `CONFIRM_CALL_ENABLED` (true).
- `VOUCHERS_ENABLED` (true).
- `SLOTS_URL`: the EasyWeek widget. `TELEGRAM_URL`: the Telegram link.
- `site.duration`, `site.reviews`, `site.reviewPull`, `site.instagram`, `site.rating`.

In `.github/workflows/deploy.yml`: `SITE_INDEXABLE` ('false').

After changing the wordmark or the hero: `npm run build && npm run og && npm run build`, then
commit `public/og/`. Logo: `npm run logo`.

## Acceptance results

| Check | Result |
|-------|--------|
| `npm run build` | exit 0 |
| `npm test` (Playwright, 390px and 1440px) | exit 0, 326 passed, 18 skipped (tests that apply to the other screen size only) |
| Two levels, 60-90 min, no "Weak" string in any language | tested |
| Booking button disabled while the team size is empty | tested |
| Three quotes in three languages, Google link, block before the check-in card | tested |
| Scare plays once, not on a second pass or after a reload | tested on main |
| `npm run test:perf` (phone emulation, 4x CPU throttle) | 0.1 percent dropped frames (worst 0.2), no long task |
| Lighthouse mobile, live `/ro/` | Performance 100, Accessibility 100 |
| Lighthouse mobile, live `/ru/` | Performance 99, Accessibility 100 |
| Lighthouse mobile, live `/en/` | Performance 98, Accessibility 100 |

`npm run test:perf` is separate from `npm test` and is not part of the deploy gate.

## Screenshots

In `docs/screenshots/`, at 390px (`-390.jpg`) and 1440px (`-1440.jpg`):

- `01-preloader`; `02-hero-ro`, `-ru`, `-en`; `15-hero-dark`; `12-flashlight`;
  `16-hero-touch-a`, `-b`; `17-sign-e-1` to `3`; `18-facade-*`
- `03-corridor-1` to `6`, `03-corridor-still`, `19-scare`: the new corridor
- `04-file`, `05-keys`, `05b-prices`, `06-cctv`
- `07-proof`, `07c-guestbook-ru`, `07c-guestbook-en`: the guest book
- `07b-voucher`, `08-checkin`, `09-info`, `10-footer`, `11-reduced-motion`
- `13-booking-modal`, `14-float-menu`

Share images: `public/og/ro.jpg`, `ru.jpg`, `en.jpg`.

## Deviations, with reasons

1. **The corridor shipped under the agreed score**, on the owner's decision after the gate
   failed.
2. **Higgsfield was driven through separate Claude Code processes.** Its tools did not load
   into the session that was already running, so each generation ran in a process restricted
   to the Higgsfield tools it needed, with the balance read before and after.
3. **The scare uses the generated clip, not the photo slot.** The clip was convincing; the
   slot still works if a photo is supplied.
4. **The scare face was darkened in post** so it sits in shadow with one eye catching the
   torch; the generated clip had it fully lit.
5. **The phone set is cut from the landscape video** as a portrait window that follows the
   subject, not generated separately. A separate portrait generation did not fit the credit
   cap.
6. **Door 301 keeps a two-peg handle.** The fixed keyframe belonged to the rejected segment.
7. **The corridor's end changes along the walk** (an open leaf early on, closed doors at the
   end) and door plates differ in style; both come from the video model.
8. **The legend text still mentions a child's silhouette.** Left as ruled.
9. **The corridor's image description was rewritten** (it described failing lamps, which the
   new walk does not show). The visible captions are unchanged.

## Not verified

- Real phones. Everything was checked in Chromium emulation, including the scare on the phone
  set, which decodes 13 large patches for under a second.
- The paste step inside the EasyWeek widget, end to end.
- The ambient sound and the door sound by ear.
