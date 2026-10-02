# Handoff: "Проклятие Отеля" preview site

Live: https://happygamer1919-tech.github.io/horror/

- Romanian (default): https://happygamer1919-tech.github.io/horror/ro/
- Russian: https://happygamer1919-tech.github.io/horror/ru/
- English: https://happygamer1919-tech.github.io/horror/en/

Status on 2026-10-02: all acceptance checks pass. The site is a preview and is hidden from search engines.

## What you need to send (TODO values)

Everything below lives in `src/content/site.ts`, marked `TODO(owner)`. Until a value is
filled in, the site shows a neutral placeholder ("Ask the desk") and states nothing as fact.

| # | Value | Where it shows | What is shown now |
|---|-------|----------------|-------------------|
| 1 | Price | Key fob 04, FAQ "How much does it cost?" | "Ask the desk" / "ask when you book" |
| 2 | Team size (min and max players) | Key fob 01, FAQ, upper limit of the "Guests" field | "Ask the desk". The form accepts 1 to 12 as a technical bound only |
| 3 | Age limit | Key fob 03, FAQ | "Ask the desk" |
| 4 | Opening hours | "How to find us" block | "Ask the desk by phone or on WhatsApp" |
| 5 | Contact-level rules (Light / Standard / Hardcore) | Level selector copy, FAQ | Mood-only copy plus the note "exact rules are confirmed when you book" |
| 6 | Review quotes (with permission) | Hidden "From the guest book" block | Block is not rendered while the list is empty |
| 7 | Exact Google Maps profile link | "Read the reviews" button | A Maps search for the address |

Questions that also need an answer before launch:

- Is +373 682 32 596 registered on WhatsApp? The booking form depends on it.
- Is the game really offered in all three languages? The form lets the guest pick Romanian, Russian or English.
- Should the Romanian or the Russian name be the main one? Now each language shows its own, the footer shows all three.
- The level copy for Light / Standard / Hardcore is my wording of mood, not your rules. Please read all three (in three languages) and correct them.

## How to change things

- Business facts: `src/content/site.ts` (brand name is one value there).
- Text: `src/content/ro.ts`, `ru.ts`, `en.ts`.
- Go public for search engines: set `SITE_INDEXABLE: 'true'` in `.github/workflows/deploy.yml`.
  That one flag switches meta robots to index, robots.txt to allow, and turns on the
  LocalBusiness and FAQPage JSON-LD. FAQ answers that are still placeholders are left out of JSON-LD.
- Custom domain: change `site` and `base` in `astro.config.mjs` and `SITE_ORIGIN` / `BASE` in `src/config.ts`.
- Every push to `main` runs the tests and deploys. A failing test blocks the deploy.

## Acceptance results

| Check | Result |
|-------|--------|
| `npm run build` | exit 0 |
| `npm test` (Playwright, 390px and 1440px) | exit 0, 70 of 70 passed |
| Lighthouse mobile, live `/ro/` | Performance 94, Accessibility 100 |
| Lighthouse mobile, live `/ru/` | Performance 95, Accessibility 100 |
| Lighthouse mobile, live `/en/` | Performance 97, Accessibility 100 |
| `curl` live `/ro/` | 200, contains "Blestemul Hotelului" and "Проклятие Отеля" |
| Internal links under `/horror` | checked by the test suite for all three languages |

What the test suite proves, in all three languages and at both widths:
every section renders, no console errors, no failed requests, no request leaves the site
(no CDNs, no trackers), no horizontal overflow, the form builds the right `wa.me` link and
refuses an empty submit, the level selector changes tint and copy, the quotes block stays
hidden, the reduced-motion version is static and readable, the preloader clears in under
1.5 seconds and can be skipped, the neon sign stays under the flash limit, the lights dim
after 20 idle seconds, the tab title changes when hidden, root redirects to `/ro/`,
robots.txt blocks crawlers, unknown paths get a 404 page.

Lighthouse SEO shows 63. That is expected: the preview is deliberately `noindex`.

## Screenshots

In `docs/screenshots/`, each at 390px (`-390.jpg`) and 1440px (`-1440.jpg`):

- `01-preloader`: lift dial
- `02-hero-ro`, `02-hero-ru`, `02-hero-en`: arrival, three languages
- `03-corridor-a-start`, `03-corridor-b-lamps-failing`, `03-corridor-c-silhouette`, `03-corridor-d-last-door`
- `04-file`: legend, registry, 1989 clipping
- `05-keys`: brass fobs and contact level
- `06-cctv`: camera strip
- `07-proof`: Google rating
- `08-checkin`: registration card (Russian)
- `09-info`: FAQ and location (English)
- `10-footer`: door hanger and language switch (Russian)
- `11-reduced-motion`: static corridor with all captions
- `12-flashlight`: the beam over the CCTV section

## Deviations from the brief, with reasons

1. **Commits went straight to `main`.** The brief asks for it, and Pages deploys from `main`.
   This is against your global rule (feature branches only), so I am flagging it: the brief was
   treated as the specific instruction for this new repo.
2. **Corridor is a 2D canvas, not WebGL.** The brief allows at most one WebGL scene and
   demands a CSS fallback. The corridor must work for everyone, so it is drawn on a plain
   canvas. The one WebGL scene (OGL) is the fog around the neon sign in the hero.
3. **WebGL fog starts on first input or after 6 seconds, and only on a real GPU.** Starting
   it at load cost 2.8 seconds of blocked main thread in Lighthouse (Performance 52). Until
   it starts, the CSS halo is in place, so nothing looks missing.
4. **Corridor pin uses CSS `position: sticky`, with ScrollTrigger reading progress.** GSAP's own
   pinning jumps when the mobile address bar resizes. Sticky does not.
5. **Flashlight is softer outside the hero.** Full darkness everywhere made the legend and the
   form hard to read on phones. Each section sets its own darkness; the hero is darkest.
6. **Lamps fade, they never strobe.** The dying letter changes state at most every 400ms
   (about 1.25 flashes per second, limit is 3). A test enforces it.
7. **Mono weight 500 was dropped.** One mono weight saves three font files on first load.
8. **The sign reads HOTEL in every language.** It is a physical sign on the building.
9. **Fictional details added for atmosphere only:** room numbers, registry entries with
   initials, "p. 47", "Card No. 0313", camera names. No real person or fact is implied.
   Remove any of them in the language files if you prefer.
10. **Extra pages:** a 404 page ("There is no such room") and a root page that redirects to `/ro/`.
11. **Tests run in CI before deploy.** Not requested, added because you do not read code.
12. **No social share image.** Open Graph title and description are set, but there is no
    `og:image` yet because no artwork exists. Say the word and I will generate one from the hero.

## Not verified

- Real phones. Everything was checked in Chromium at 390px, 360px and 1440px. iOS Safari and
  Android Chrome on real devices were not tested.
- The ambient sound by ear. The toggle and audio graph are tested, the mix is not.
- WhatsApp delivery. The link format is tested; whether the number receives it is yours to confirm.
