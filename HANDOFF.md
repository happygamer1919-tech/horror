# Handoff: "Проклятие Отеля" preview site

Live: https://happygamer1919-tech.github.io/horror/

- Romanian (default): https://happygamer1919-tech.github.io/horror/ro/
- Russian: https://happygamer1919-tech.github.io/horror/ru/
- English: https://happygamer1919-tech.github.io/horror/en/

Status on 2026-10-06: everything below is live. The corridor is one continuous clip: when the
section reaches the top of the screen the page is held, the walk plays full screen (about ten
seconds), and the page then goes on to the next section. The chapter design of 2026-10-05
failed the owner's test on a real iPhone and is retired. The site is a preview and is hidden
from search engines.

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
- Everywhere else the page scrolls freely. The corridor is the one place it takes over: when
  the section's top reaches the top of the screen on the way down, even on a hard flick, the
  page is held and one clip plays full screen, a torch-lit walk from door 301 to the last
  room, 313. 9.8 seconds on the first play, at 60 pictures a second. Then the page lets go
  and glides to the next section.
- The four captions come up over the clip in order, each fully readable for 1.7 seconds or
  more; the last one stays.
- A Skip button is there from the first frame. Escape and a second strong swipe (or a new
  turn of the wheel) also skip, and glide on. A strong swipe the other way lets go in place.
- Once per session. After it has played or been skipped the corridor is an ordinary
  one-screen section: the last door, the last caption and a Replay button. It is never
  held again, in either direction. Replay plays the walk without the scare (9.2 seconds)
  and ends on the last door.
- A visitor who comes up from below is never held. If they have not seen the clip and later
  come down from above, it plays then.
- Scare, on the first play only: door 308 opens a crack at its handle edge, a face in shadow
  and a hand on the door edge, 0.6 s at natural speed, then it shuts. A visitor who skips
  before it does not get it later.
- The clip is fetched while the visitor is still on the hero (after the first touch, or after
  8 seconds of idling) and made ready to start at once. If it is not ready when the visitor
  arrives, the page is not held: it has one second to get ready while the corridor is still
  in front of them, otherwise the last door and Replay are shown.
- If the phone refuses to play (iPhone Low Power Mode), the flick is still stopped at the
  corridor and a "Tap to enter" button is shown over the first frame. A tap plays the clip;
  scrolling on leaves it.
- The hold can never last longer than the clip plus one second, whatever happens.
- Phone picture: a wider 4:5 window of the landscape footage, so the corridor's depth and far
  end are in view for most of the walk, with a dark band below for the captions.
- Reduced motion: three stills with all captions, no hold, no video, no scare.

Scrolling
- Native scrolling on every device, no scroll snap anywhere. The hold uses no blocking
  listener: no touch or wheel listener on the page is non-passive (tested).

## The corridor: how it was made, and its review

Made with Higgsfield through its MCP connection: keyframe stills with `nano_banana_pro` (2K;
the service reports it as `nano_banana_2`), video with `minimax_h3` (2K, first and last frame
control, 5 and 10 second clips). Every generation, with job id, prompt and status, is in
`corridor-src/SOURCES.md`; the five master clips are in `corridor-src/`.
`npm run corridor:video` (`scripts/corridor-video.mjs`) rebuilds the clip (with and without the
scare) and the stills from them, through the same grading, darkening and sharpness steps as
before. The walk is sped up 2.5 times by showing the generated frames at 60 a second (none
blended or invented) and slows to a near stop at each numbered door: 301, 304, 305, 308, 313.

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

Asset weights as shipped. A visitor fetches one clip in one codec (H.264 first on both sets,
AV1 for a browser without it), a small poster and two stills:

| Set | First play (with the scare) | Replay (without) |
|-----|-----------------------------|------------------|
| Phone, 896x1120, H.264 | 2,891,715 bytes | 2,743,572 bytes |
| Phone, AV1 | 2,942,248 bytes | 2,809,762 bytes |
| Desktop, 1600x900, H.264 | 3,954,896 bytes | 3,773,332 bytes |
| Desktop, AV1 | 3,492,001 bytes | 3,315,681 bytes |

The Replay clip is only fetched once its button has been on screen.

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
- While idle, the header, the mobile book bar and the floating button stay lit.
- **Slow connections get the last door, not the clip.** The clip needs about 2.3 Mbit/s and
  is fetched after the first touch. Options: (a) leave it; (b) a lighter phone clip (about
  half the bitrate, visibly softer); (c) start fetching at page load, which costs first-paint
  speed. Recommended: (a) until the real-phone test says otherwise.
- **A visitor who skips before door 308 never sees the scare**, as the brief has it. Say if
  Replay should carry the scare in that one case.

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
| `npm test` on macOS (Chromium phone, Chromium desktop, WebKit phone) | exit 0, 411 passed, 32 skipped (tests that apply to another project only), no retries |
| CI gate on GitHub's Linux runner (Chromium phone and desktop) | 372 passed, 24 skipped, no retries |
| CI WebKit job (macOS runner, report only) | all corridor tests passed there |
| A fast fling from the page top stops at the corridor and the clip plays | tested: touch fling (Chromium phone), wheel and key (desktop, WebKit) |
| After the clip the page goes on to the next section by itself | tested |
| Skip at any moment (first frame, middle, the door, the last second) | tested by button, by Escape, by a second strong swipe or wheel turn |
| Second visit in the session (scroll back, and a reload) is not held and shows Replay | tested |
| Scrolling up from below passes the corridor in one gesture | tested before and after the first play |
| Scare on the first play only; Replay plays the version without it | tested |
| play() refused: the tap button is shown, the tap plays, scrolling on leaves | tested |
| Slow line (clip not ready within 1 second): no hold, last door and Replay | tested |
| The hold never exceeds clip + 1 second, a stalled video included | tested |
| Reduced motion: stills only, no video request | tested |
| No non-passive touch or wheel listener | tested in all three projects |
| Corridor top reaching the screen top to the first clip frame on screen (clip preloaded, real touch fling, 5 runs) | 31.6 ms median, 32 ms worst; at 4x CPU throttle 30.2 ms median, 31 ms worst (limit 300) |
| Hold length for the 9.825 s clip | 9,833 to 9,837 ms |
| Frames presented over the clip at 4x CPU throttle | 526 of 527 (99.8 percent) in H.264 and in AV1 |
| Phone download, first play | 2.89 MB (H.264) or 2.94 MB (AV1): clip, poster, two stills |
| `npm run test:perf`, page scroll at 4x throttle | corridor already seen: 0.1 percent dropped frames; first visit (held, played, let go): 0 percent; no long task in either |

`npm run test:perf` is separate from `npm test` and is not part of the deploy gate. The live
checks (Lighthouse and the walk on the deployed pages) are in the report for this update.

## Screenshots

In `docs/screenshots/`, at 390px (`-390.jpg`) and 1440px (`-1440.jpg`):

- `01-preloader`; `02-hero-ro`, `-ru`, `-en`; `15-hero-dark`; `12-flashlight`;
  `16-hero-touch-a`, `-b`; `17-sign-e-1` to `3`; `18-facade-*`
- `21-clip`: the clip as a strip of twelve frames with its captions (390 and 1440)
- `22-framing-a`, `-b`, `-c` (390 only): the three phone framings tried; b is the one shipped
- `03-corridor-start`: the section before the first play; `03-corridor-rest`: after it, with
  Replay; `03-corridor-tap`: the "Tap to enter" state; `03-corridor-still`: reduced motion;
  `19-scare`: the door
- `04-file`, `05-keys`, `05b-prices`, `06-cctv`
- `07-proof`, `07c-guestbook-ru`, `07c-guestbook-en`: the guest book
- `07b-voucher`, `08-checkin`, `09-info`, `10-footer`, `11-reduced-motion`
- `13-booking-modal`, `14-float-menu`

Share images: `public/og/ro.jpg`, `ru.jpg`, `en.jpg`.

## Deviations, with reasons

From the single-clip brief:

1. **The catch is done in script, not with scroll snap.** A passive scroll listener and an
   observer see the corridor's top arrive; the stage goes full screen, the page is fixed in
   place and the clip plays. Scroll snap is gone from the site: it is what failed on the
   real iPhone. Nothing blocks touch or wheel input.
2. **Only a scroll the visitor is making is caught** (a finger, a wheel, a key). A link that
   glides past (the hero's Check in button) and a scripted jump are not.
3. **A late catch brings the page back.** If the phone is busy and notices up to three
   screens late, the page is put back on the corridor under the full-screen stage.
4. **Coming up from below never holds the page**, also before the first play.
5. **Not ready on arrival means no hold at all**, with one second's grace while the corridor
   is still in front of the visitor. On a slow connection (about 1.6 Mbit/s, below the clip's
   2.3 Mbit/s) the visitor therefore gets the last door and Replay, not the clip.
6. **play() refused: the flick is stopped, the page is not held.** It is released about a
   third of a second after the catch and shows "Tap to enter".
7. **Skip before the scare loses the scare.** The brief keeps it to the first play.
8. **Added: a strong swipe the other way lets go in place**, without the glide.
9. **Replay ends on the last door without gliding on.** Skip glides in either play.
10. **A hidden tab ends the hold at once.**
11. **60 pictures a second, every generated frame of the first three stretches.** At 24 a
    second the file is 11 percent smaller but the picture jumps more than twice as far per
    frame. The walk is 2.5 times the generated speed; the scare is at its own speed.
12. **Phone video is 896x1120 (4:5)**, cut 1152 px wide from the 2560 px frames, panning
    slowly and standing still where the walk does. 3:4 cut door 304 and the exit doors at the
    edge; 1:1 made the door numbers too small.
13. **H.264 is listed first on both sets.** AV1 would save an eighth on desktop and be
    decoded in software on older laptops.
14. **Caption fade is 0.2 s (was 0.6 s)**, to fit four captions at 1.5 s fully readable.
15. **Skip and Replay are bordered buttons**, where Skip used to be a small text link.
16. **The roaming hero light ignores a scroll jump of more than 0.8 of a screen**, because the
    hold reads as a jump.
17. **The test server answers byte ranges**, as the real host does (WebKit needs them to play).
18. **The corridor tests run one at a time within a project.** Five videos at once starved a
    clip in headless rendering.
19. **The WebKit report job in CI moved to a macOS runner** (still report only). On WebKit's
    Linux build the clip never became ready and twelve tests failed for that reason alone.

Still standing from earlier briefs: native scrolling with no smooth-scroll library; no baked
film grain in the corridor video (the page's grain layer covers it); the smoothness tests live
in `npm run test:perf`; the corridor shipped under the agreed review score on the owner's
decision; door 301 keeps a two-peg handle; the corridor's far end and the door plates vary
along the walk (the video model); the legend still mentions a child's silhouette, as ruled.

## Not verified

- **A real iPhone or Android phone.** Everything was checked in Chromium phone emulation
  (real touch flings) and in Playwright WebKit (wheel and keys). What to try by hand on an
  iPhone, in this order:
  1. A hard flick from the hero: it must stop on the corridor and the clip must start at
     once. If the page flies past, or stops and shows only the last door, say which.
  2. Whether the page stays put during the clip (no bounce, no drift when dragging).
  3. Skip, then scroll back up: the last door with Replay, not held.
  4. Low Power Mode on, new tab: the flick stops, "Tap to enter" appears, the tap plays.
     If the button disappears by itself right away, say so.
  5. Whether Safari's toolbar moves when the clip starts and whether the captions are clear
     of it.
- Firefox.
- A slow connection in WebKit (throttling was done in Chromium only).

- The paste step inside the EasyWeek widget, end to end.
- The ambient sound and the door sound by ear.
