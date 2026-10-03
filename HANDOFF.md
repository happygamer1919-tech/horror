# Handoff: "Проклятие Отеля" preview site

Live: https://happygamer1919-tech.github.io/horror/

- Romanian (default): https://happygamer1919-tech.github.io/horror/ro/
- Russian: https://happygamer1919-tech.github.io/horror/ru/
- English: https://happygamer1919-tech.github.io/horror/en/

Status on 2026-10-02 (update 2, content and parity): all acceptance checks pass.
The site is a preview and is hidden from search engines.

## What changed in update 2

- Wordmark "Проклятие Отеля" on all three pages. "Blestemul Hotelului" and "The Hotel's Curse"
  appear only as a subtitle under it on RO and EN. The footer shows the wordmark once.
- Filled in: players 2 to 11, duration 60 min, price list (1000 to 3300 MDL), opening hours,
  Google Maps profile link, "Leave a review" link.
- New price list section. The key tag shows "from 1000 MDL".
- The check-in card shows the live total for the chosen team size and puts it in the WhatsApp message.
  Team size is limited to 2 to 11.
- The card now says it is a booking request, confirmed by a phone call. A free-text comment
  field ("Comment, your limits") was added.
- Contact levels (Light / Standard / Hardcore) are off behind `CONTACT_LEVELS_ENABLED`. One line
  replaces them: live actors, tell us your limits when you book. No copy promises levels.
- Gift voucher block (team size, recipient name, WhatsApp request) behind `VOUCHERS_ENABLED`.
- FAQ now answers: minimum age (TODO), minimum players (2), gift voucher, what to wear,
  where the rules are explained, payment methods (TODO).
- Floating WhatsApp button on every page, including the 404 page.
- `SLOTS_URL`: empty. When set, a "See free slots" link appears next to both booking buttons.
- Share image 1200 x 630 per language, rendered from the hero. `og:image` and `twitter:card` wired.

## What you still need to send (TODO values)

All in `src/content/site.ts`, marked `TODO(owner)`.

| # | Value | Where it shows | What is shown now |
|---|-------|----------------|-------------------|
| 1 | Age limit | Key tag 03, FAQ "Is there a minimum age?" | "Ask the desk" / "we are confirming this detail" |
| 2 | Review quotes (with permission) | Hidden "From the guest book" block | Block is not rendered while the list is empty |
| 3 | Game languages | "Language" field on the card | All three offered as a preference, nothing promised |
| 4 | Payment methods | FAQ "How can I pay?" | "We are confirming this detail. Ask when you book." |
| 5 | Instagram handle | Footer link | No link |
| 6 | Contact-level rules | Selector, off behind the flag | One line about limits |

Optional: a photograph for the face behind door 308 in the corridor. Until one is supplied, a 3D
stand-in is shown. What to send and where it goes: `src/assets/scare/README.md`.

Please also confirm:

- +373 682 32 596 is registered on WhatsApp. The card, the voucher and the floating button all depend on it.
- The opening hours as I read them: Mon-Thu 16:00-03:00, Fri 16:00-00:00, Sat-Sun 24 hours.
  The Friday closing time (midnight) before a 24-hour Saturday looks unusual. It is shown as given.
- Whether a gift voucher costs the same as the price list. The voucher block shows no price.

## Flags and config

In `src/content/site.ts`:

- `CONTACT_LEVELS_ENABLED` (false): the level selector, its copy and the form field.
- `VOUCHERS_ENABLED` (true): the gift voucher block and its FAQ answer.
- `SLOTS_URL` (empty): the "See free slots" link.
- `site.prices`, `site.players`, `site.hours`, `site.maps`: the values from this update.

In `.github/workflows/deploy.yml`:

- `SITE_INDEXABLE` ('false'): one switch for meta robots, robots.txt and JSON-LD. The JSON-LD now
  also carries the price range, the opening hours and the share image.

After changing the wordmark, the hero or the subtitles, regenerate the share images:
`npm run build && npm run og && npm run build`, then commit `public/og/`.

## Acceptance results

| Check | Result |
|-------|--------|
| `npm run build` | exit 0 |
| `npm test` (Playwright, 390px and 1440px) | exit 0, 100 of 100 passed |
| `npm run test:live` (deployed site) | exit 0, 3 of 3 passed: `og:image` returns 200 for ro, ru, en |
| Lighthouse mobile, live `/ro/` | Performance 100, Accessibility 100 |
| Lighthouse mobile, live `/ru/` | Performance 98, Accessibility 100 |
| Lighthouse mobile, live `/en/` | Performance 98, Accessibility 100 |
| CI on the last site commit | build, deploy and verify jobs all green |

New tests in this update, in all three languages and at both widths:

- The total is correct for every team size from 2 to 11, on the card and in the price list.
- The `wa.me` message contains the team size and the total for each of those sizes.
- Team sizes 0, 1 and 12 are refused.
- The gift voucher opens WhatsApp with team size and recipient, and refuses an empty recipient.
- No "Ask the desk" placeholder remains for players, duration, price or hours. Age keeps it.
- `og:image` points at a real 1200 x 630 picture and `twitter:card` is set.
- Contact levels are off: no selector, no "Hardcore" or "Standard" anywhere on the page.
- The floating WhatsApp button is present, also on the 404 page. No slots link while `SLOTS_URL` is empty.
- The footer shows the wordmark once and none of the translated names.

Lighthouse SEO shows 63. That is expected: the preview is deliberately `noindex`.

## Screenshots

In `docs/screenshots/`, each at 390px (`-390.jpg`) and 1440px (`-1440.jpg`):

- `01-preloader`
- `02-hero-ro`, `02-hero-ru`, `02-hero-en`: wordmark and subtitles
- `03-corridor-1` to `03-corridor-6`: six points of the walk. `03-corridor-still`: the reduced-motion still
- `19-scare`: the door of room 308, open (plays once per session)
- `04-file`
- `05-keys`: filled key tags and the limits line
- `05b-prices`: price list (Russian)
- `06-cctv`
- `07-proof`: rating, reviews link, "Leave a review" (English)
- `07b-voucher`: gift voucher
- `08-checkin`: registration card with comment field and live total (Russian)
- `09-info`: FAQ and opening hours (English)
- `10-footer`
- `11-reduced-motion`
- `12-flashlight`

Share images: `public/og/ro.jpg`, `ru.jpg`, `en.jpg`.

## Deviations in update 2, with reasons

1. **The live `og:image` check is a separate suite (`npm run test:live`), not part of `npm test`.**
   CI runs `npm test` before deploying. A test that needs the new image to be live already would
   block the very deploy that publishes it. The live suite runs as a `verify` job after each
   deploy, and I ran it by hand as well.
2. **Share images are committed files, generated by a script from the real hero.** GitHub Pages
   is static, so they cannot be rendered on request. They must be regenerated after a hero change.
3. **The voucher block shows no price.** You did not say a voucher costs the same as a game.
4. **Game languages are a TODO, so the "Language" field stays as a preference** with all three
   options. Removing it would drop a field the first brief asked for.
5. **Price list wording says "for the whole team".** This is my reading of "price by team size".
   Correct me if the numbers are per person.
6. **Voucher FAQ answer appears only while `VOUCHERS_ENABLED` is true.** One flag, no dead answer.
7. **The WhatsApp button hides on phones while a form is on screen** (check-in card, voucher),
   so it never covers a field. On desktop it is always visible.

Ratified earlier and unchanged: commits to `main`, corridor on a 2D canvas, WebGL fog gated on
first input and a real GPU, sticky pin, softer flashlight outside the hero, fade-only lamps,
one mono weight, HOTEL sign in every language, fictional atmosphere details. Registry entries
are initials only and nothing in them reads as a fact about the business.

## Not verified

- Real phones. Everything was checked in Chromium at 390px, 360px and 1440px. iOS Safari and
  Android Chrome on real devices were not tested.
- How the share image looks inside WhatsApp, Telegram or Facebook previews. The tags and the
  picture are tested; the apps' own rendering is not. The preview is `noindex`, which does not stop previews.
- The ambient sound by ear.
- WhatsApp delivery to the number.
