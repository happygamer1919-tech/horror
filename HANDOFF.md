# Handoff: "Проклятие Отеля" preview site

Live: https://happygamer1919-tech.github.io/horror/

- Romanian (default): https://happygamer1919-tech.github.io/horror/ro/
- Russian: https://happygamer1919-tech.github.io/horror/ru/
- English: https://happygamer1919-tech.github.io/horror/en/

Status on 2026-10-05: **the video-chapter corridor is on `main` but NOT live.** The live site
still shows the previous corridor (the same walk, scrubbed by scroll). The deploy is blocked:
the WebKit tests fail on GitHub's Linux runner (three pushes, see "Decisions for you"), while
the whole suite passes on macOS and the Chromium tests pass on the runner. Everything else
below is live. The new corridor is three chapters of real video (the approved AI-generated
walk, same look, captions, scare and torch): one swipe, wheel turn or key press plays one
chapter and it stops on its caption. The site is a preview and is hidden from search engines.

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
- A torch-lit walk down the third floor in three chapters of real video. One scroll gesture
  (a swipe, a wheel gesture, a key press) advances one chapter; the chapter plays by itself
  at natural speed and stops on its caption.
  - Chapter 1: door 301 to door 304, ends on "Third floor. The carpet swallows your steps."
  - Chapter 2: to the scratched door 305, ends on "Someone is whispering behind the doors.
    Keep walking."
  - Chapter 3: to door 308 and on to the last room 313; the third and fourth captions show
    in sequence.
- A fourth gesture leaves the corridor. Scrolling back crossfades to the previous chapter's
  end pose; nothing plays in reverse. A hard fling passes the section. A small "Skip" link
  leaves it at once.
- Scare, once per session, on the first forward pass through chapter 3: door 308 opens a crack
  at its handle edge, a face in shadow with one eye catching the torch and a hand on the door
  edge, about 0.6 s, then it shuts. No sound unless the visitor turned sound on.
- Reduced motion: three still frames with all captions, no playback, no scare.
- Only a small poster loads with the page; chapter 1 loads after the first input, each next
  chapter while the current one plays. If a video cannot play, the stage crossfades between
  the end poses, so the section always works.

Scrolling
- Native scrolling on every device. The smooth-scroll library is removed: its wheel and touch
  listeners were not passive, and it fights the corridor's scroll snap. No touch or wheel
  listener on the page is non-passive (tested).

## The corridor: how it was made, and its review

Made with Higgsfield through its MCP connection: keyframe stills with `nano_banana_pro` (2K;
the service reports it as `nano_banana_2`), video with `minimax_h3` (2K, first and last frame
control, 5 and 10 second clips). Every generation, with job id, prompt and status, is in
`corridor-src/SOURCES.md`; the five master clips are in `corridor-src/`.
`npm run corridor:video` (`scripts/corridor-video.mjs`) rebuilds the chapter videos and end poses
from them, through the same grading, darkening and sharpness steps as before.

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

Asset weights as shipped (each chapter in H.264 and in AV1; a visitor fetches one codec and
one variant of chapter 3):

| Set | One visitor downloads, H.264 | One visitor downloads, AV1 |
|-----|------------------------------|----------------------------|
| Phone (portrait 720x1440 video, 900x1800 end poses) | 2,919,915 bytes | 2,983,429 bytes |
| Desktop (landscape 1600x900) | 6,296,936 bytes | 4,069,906 bytes |

Chapter files, phone H.264 / AV1 and desktop H.264 / AV1, in bytes: chapter 1 (5.2 s)
499,337 / 536,880 and 1,069,118 / 624,324; chapter 2 (5.2 s) 569,220 / 568,827 and
1,287,306 / 729,129; chapter 3 with the scare (12.5 s) 1,525,398 / 1,551,762 and 3,753,158 /
2,529,099; chapter 3 without it (11.9 s) 1,431,828 / 1,453,772 and 3,583,926 / 2,376,526.
A visitor who walks chapter 3 a second time also fetches the other variant.

Playback at 4x CPU throttle in phone emulation: every chapter presented 100 percent of its
frames (124 of 124, 124 of 124, 381 of 381, 366 of 366), no dropped video frames.

## What you still need to send

| # | Value | Where | What is shown now |
|---|-------|-------|-------------------|
| 1 | More review quotes, if wanted | `site.reviews` in `src/content/site.ts` | The three supplied |
| 2 | A face photo for the scare, if wanted | `src/assets/scare/face.(avif|webp|png)`, then `npm run corridor:video` and commit (see the README there) | The generated clip |

Logo for EasyWeek and Google: `docs/brand/logo-1024.png` and `logo-512.png` (the wordmark with
the key, dark background, safe for a circular crop).

EasyWeek language: the widget reads `?lang=` but applies it only to languages enabled in the
account, and the account lists Russian only. Nothing is passed. If Romanian and English are
enabled there, passing the page language is a one-line change.

## Decisions for you

- The hero line under the title now reads "An hour or more to find the key and learn why."
  (it said "One hour"), because it sits under "60-90 min". One string per language to revert.
- **WebKit in the deploy gate: this blocks the deploy of the video chapters.** The WebKit
  tests are part of the gate and CI runs them on WebKit's Linux build, which draws this page
  about ten times a second on a runner. Three pushes went red there. The first two had real
  causes that are fixed (one small fragility in the corridor script, the rest test tooling
  that behaves differently on Linux). The third (run 37367570164) failed on four WebKit-only
  tests that are about timing: a chapter still playing after 30 seconds, too few screenshots
  taken in 4.5 seconds, a brightness reading taken mid-fade. All Chromium tests passed in
  that run (phone and desktop), and the full suite passes on macOS including WebKit.
  Options: (a) keep Chromium phone and desktop as the gate and let the WebKit job report
  without blocking, with `npm test` on a Mac (WebKit as Safari builds it) before every push,
  as now; (b) keep WebKit blocking and spend more work making those tests tolerate the slow
  runner, outcome uncertain; (c) re-run the build on a day GitHub Actions is healthy (it was
  degraded during all three runs) and see. Recommended: (a). It was not done because it
  loosens the gate, which is the owner's call. A macOS runner would be the better home for
  the WebKit job; one was tried and GitHub never supplied it.

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
| `npm test` on macOS (Chromium phone, Chromium desktop, WebKit phone) | exit 0, 375 passed, 29 skipped (tests that apply to another project only), no retries |
| The same suite on GitHub's Linux runner | **failed**: 370 passed, 2 failed, 2 passed on retry; all four are WebKit tests, all Chromium tests passed |
| One gesture advances exactly one chapter; three reach the last door; a fourth leaves | tested: touch swipe and key (Chromium phone), wheel and key (Chromium desktop, WebKit) |
| Scare plays once, not on a second pass or after a reload | tested in all three projects |
| Fast flings from the top of the page reach the check-in card | tested: touch flings (Chromium phone), wheel (desktop, WebKit) |
| Reduced motion: three stills, no video requested, no scare | tested |
| No non-passive touch or wheel listener, nothing prevents a scroll | tested in all three projects |
| Playback at 4x CPU throttle, phone emulation (`npm run test:perf`) | every chapter, both codecs: 100 percent of frames presented, 0 dropped (124 of 124, 124 of 124, 366 of 366, and 381 of 381 with the door) |
| Corridor download on a phone | 2.92 MB (H.264) or 2.98 MB (AV1) for the three chapters, four stills and the poster |
| Corridor download on a desktop | 6.30 MB (H.264) or 4.07 MB (AV1) |
| `npm run test:perf`, page scroll | 0.1 percent dropped frames (worst run 0.2), no long task at all |
| Lighthouse mobile, live | not run: the video chapters are not deployed yet |

Notes on the numbers:

- "Frames presented" is the browser's own count (`presentedFrames` from
  requestVideoFrameCallback). The callback itself runs on the throttled main thread and fired
  for 81 to 95 percent of chapter 3's frames; the frames it missed were still on screen.
- The phone total is one walk through. A visitor who goes back up and walks chapter 3 a second
  time in the same session also fetches the version without the door (1.43 MB).
- `npm run test:perf` is separate from `npm test` and is not part of the deploy gate.

## Screenshots

In `docs/screenshots/`, at 390px (`-390.jpg`) and 1440px (`-1440.jpg`):

- `01-preloader`; `02-hero-ro`, `-ru`, `-en`; `15-hero-dark`; `12-flashlight`;
  `16-hero-touch-a`, `-b`; `17-sign-e-1` to `3`; `18-facade-*`
- `20-chapter-1`, `20-chapter-2`, `20-chapter-3`, `20-chapter-3-scare`: a frame strip of each
  chapter as it plays (chapter 3 with and without the door)
- `03-corridor-1` to `3`: the three stops at rest, each with its caption; `03-corridor-still`:
  the reduced-motion version; `19-scare`: the door
- `04-file`, `05-keys`, `05b-prices`, `06-cctv`
- `07-proof`, `07c-guestbook-ru`, `07c-guestbook-en`: the guest book
- `07b-voucher`, `08-checkin`, `09-info`, `10-footer`, `11-reduced-motion`
- `13-booking-modal`, `14-float-menu`

Share images: `public/og/ro.jpg`, `ru.jpg`, `en.jpg`.

## Deviations, with reasons

From the video-chapter brief:

1. **The smooth-scroll library is gone on desktop too**, not only on touch. It registered
   wheel and touch listeners that make the browser wait for the page; with it the listener
   test cannot pass and it fights scroll snap. In-page links still glide (the browser's own
   smooth scroll).
2. **The film grain is no longer baked into the corridor pictures.** Grain is what costs the
   most bytes in video; the page's own grain layer still lies over the stage, so the look on
   screen is the approved one. Without this the phone set does not fit in 3 MB.
3. **Phone video is 720x1440**, and the still each chapter rests on is 900x1800. The stage
   always rests on a still, so the resting picture is as sharp as before.
4. **The last stretch (door 308 to door 313) plays at 1.5 times the shot speed**: all of its
   frames are shown, at 36 a second instead of 24. At shot speed chapter 3 ran 15 seconds;
   it now runs 12. Chapters 1 and 2 run 5 seconds each.
5. **Frame interpolation was tried and rejected.** It ghosted the door numbers; the videos keep
   the source frames.
6. **The smoothness measurement is in `npm run test:perf`**, not in the deploy gate. It needs
   CPU throttling on a quiet machine, and a CI runner cannot give a stable reading.
7. **The page picks the codec in script and fetches each chapter whole before playing it**, so
   a chapter never stalls half way. AV1 is used where the device decodes it in hardware,
   H.264 otherwise.
8. **The skip control is a link** to the next section, so it also works from the keyboard
   and without script.
9. **The scare's photo slot is now a build-time option** (the door is part of the video).
10. **With no input at all, loading starts after 8 seconds** (it was 4), so it does not
    compete with the first paint.
11. **WebKit is driven by keyboard and wheel.** Playwright cannot make a finger swipe in
    WebKit; touch swipes are tested in Chromium phone emulation.
12. **Four WebKit checks are looser on WebKit's Linux build, which is what CI runs**: one
    wheel notch per gesture instead of three; the link glide is checked by its mechanism
    instead of by counting positions; the fog timing test is skipped; and "the page stays
    where it is put" allows 24 px (that build comes to rest up to 18 px short of a jump when
    it is short of CPU; a snap would be hundreds of pixels). That build draws this page about
    ten times a second on a runner and its wheel snaps per notch. macOS WebKit (`npm test` on
    a Mac, run before every push) and Chromium run all four in full.
13. **The corridor folder in the repository grew from 16.5 MB to 24.6 MB** (two sets, two
    codecs, two variants of chapter 3). A visitor downloads one set in one codec.

Still standing from earlier briefs: the corridor shipped under the agreed review score on the
owner's decision; the phone set is a portrait window cut from the landscape video; door 301
keeps a two-peg handle; the corridor's far end and the door plates vary along the walk (the
video model); the legend still mentions a child's silhouette, as ruled.

## Not verified

- Real phones. The chapters were checked in Chromium phone emulation (touch swipes) and in
  Playwright WebKit (keyboard and wheel), not on an iPhone or an Android phone. A real finger
  on a real iPhone is the one thing no test here does. Firefox was not tested.
- The paste step inside the EasyWeek widget, end to end.
- The ambient sound and the door sound by ear.
