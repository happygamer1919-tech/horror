# Decisions

Append-only. Newest last.

## 2026-10-25: SEO-01, the site goes public

- Owner: "fix everything about the code", self-merge allowed, the owner does Google Search
  Console. Taken as the go-ahead to make the site public: `SITE_INDEXABLE: 'true'` in
  `deploy.yml`. One line to undo.
- Sitemap and `llms.txt` are Astro endpoints built from `src/content`, not a new dependency
  (`@astrojs/sitemap` not added).
- One business entity for the three languages (`https://lastquestmd.com/#business`), type
  `EntertainmentBusiness` (schema.org has no escape-room type; this is its closest parent).
  Coordinates from the OpenStreetMap building, rounded to about 10 m; the Google Maps profile
  stays the authority.
- The H1 stays the wordmark only: the keyword line ("Quest horror cu actori / Chișinău") is
  printed right above it and is in every title and description, so changing the hero's look
  buys nothing.
- No rating or review markup (owner's ruling of 2026-10-05 stands).
- The tests read `SITE_INDEXABLE`, so CI checks the public build and `npm test` on a Mac the
  preview unless the variable is set.
