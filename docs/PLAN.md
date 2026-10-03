# Plan: "Проклятие Отеля" preview site

Live target: https://happygamer1919-tech.github.io/horror/ (base path `/horror`).

## Concept

The website is the hotel. The visitor is a guest checking in. There are no
photos, so every visual is procedural: type, SVG, canvas, CSS, one shader,
light and darkness, film grain. Tone: dread and curiosity, never gore.
1980s hotel identity: letterhead, brass key fobs, carpet, registry book, CCTV.

One recurring device ties the page together: the hotel directory. The
preloader is the lift, and every section is a place in the building
(lobby, floor 3, archive, reception, security room, guest book, registration).

## Stack

- Astro (static output), TypeScript, base `/horror`, trailing slashes.
- GSAP + ScrollTrigger for scroll-driven work, Lenis for smooth scroll.
- OGL for the single WebGL scene (hero fog around the neon sign), rendered at
  low internal resolution, lazy loaded, with a CSS glow fallback.
- Corridor is a pre-rendered walk (authored in 3D, path traced offline, see `corridor3d/`),
  shipped as an image sequence and scrubbed on a 2D canvas by scroll progress. No WebGL at run time.
- Fonts self-hosted through Fontsource: Playfair Display (display serif) and
  IBM Plex Mono (monospace). Both cover Latin Extended and Cyrillic.
- No trackers, no cookies, no external CDNs.

## Content model

- `src/content/site.ts`: brand, phone, address, rating, map links, and every
  unknown value as a clearly marked TODO (`null` renders a neutral placeholder).
- `src/content/ro.ts`, `ru.ts`, `en.ts`: all copy, typed by `src/content/types.ts`.
- `src/config.ts`: `SITE_INDEXABLE` flag (env, default `false`).

## Routes

- `/ro/` (default), `/ru/`, `/en/`: one long page each, full parity.
- `/`: redirect to `/ro/`.
- `/robots.txt`: disallow all while `SITE_INDEXABLE=false`.
- `404`: "no such room".
- hreflang alternates plus `x-default` on every language page.
- LocalBusiness and FAQPage JSON-LD are emitted only when `SITE_INDEXABLE=true`.

## Design system

- Colors: ink `#070606` base, bone text, one neon red accent, aged brass
  secondary, aged paper for registry, clipping and the registration card.
- Type: large display serif, mono for body, labels and metadata.
- Grid: 4 columns on phones, 12 on desktop, hairline rules, generous darkness.
- Banned: gradient blobs, glass cards, stock icon grids, emoji.

## Sections and build order

Each step is one or more small commits to `main`, followed by Playwright
screenshots at 390px and 1440px, a critique against the concept, and fixes.

0. Scaffold: Astro, content files, base layout, fonts, tokens, deploy workflow.
1. Preloader: lift floor indicator descending, doors open, under 1.5s,
   skippable, shown once per session.
2. Arrival hero: night facade (SVG), neon HOTEL sign with one dying letter,
   headline, "Check in" CTA, flashlight overlay (pointer on desktop, slow
   drift plus scroll on touch), WebGL fog with CSS fallback.
3. Corridor: sticky pinned canvas, a walk down a rendered hotel corridor, numbered
   doors, lamps failing in sequence. Once per session, on the first pass, one door
   opens a hand's width for about 600ms (a face in the dark, fingers on the door edge),
   then it is a closed door.
4. The file: guest registry with crossed-out names, 1989 clipping, legend
   revealed on scroll.
5. Key tags: brass fobs (players, duration, age, price) and the contact-level
   selector (Light / Standard / Hardcore) that changes tint and copy.
6. CCTV strip: four procedural feeds, live timestamp, REC, one brief movement.
7. Proof: Google rating with Maps link; quotes block hidden while empty.
8. Check-in card: registration form, WhatsApp deep link, tel button,
   sticky "Book" bar on mobile.
9. FAQ accordion, address, hours, directions link.
10. Footer: "Do not disturb" hanger, language switch.
11. Extras: opt-in WebAudio ambience, 20s idle dimming, hidden-tab title.
12. Tests, Lighthouse, full self-review pass, HANDOFF.md.

## Safety and accessibility rules

- `prefers-reduced-motion`: static and fully readable. No preloader, no
  flashlight overlay, no pin, no flicker, no canvas animation.
- Nothing flashes faster than 3 times per second. Flicker scheduling enforces
  a minimum of 400ms between state changes.
- All text meets WCAG AA contrast against its own background.
- Form controls have labels, the accordion is native `details`, focus is visible.
- Sound is off by default and starts only from an explicit click.

## Acceptance

- `npm run build` exits 0.
- `npm test` (Playwright) exits 0: sections render in 3 languages, the form
  builds a correct `wa.me` URL, no console errors, no horizontal overflow at 390px,
  internal links resolve under `/horror`.
- Lighthouse mobile on the deployed URL: Performance >= 85, Accessibility >= 95.
- `curl https://happygamer1919-tech.github.io/horror/ro/` returns 200 and
  contains the brand name.

## Update 2: content and parity

- Wordmark "Проклятие Отеля" on every page, translated names as subtitles on RO and EN.
- Confirmed values: players 2 to 11, price list, hours, Maps and review links.
- New sections: price list, gift voucher. Floating WhatsApp button on every page.
- Check-in card: live total, comment field, booking-request wording.
- Flags in `src/content/site.ts`: `CONTACT_LEVELS_ENABLED` (false), `VOUCHERS_ENABLED` (true), `SLOTS_URL` (empty).
- Share images 1200 x 630 per language (`scripts/og.mjs`), `og:image` and `twitter:card`.
- Live checks (`tests/live.spec.ts`) run as a `verify` job after each deploy.
