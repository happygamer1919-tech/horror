# horror

Preview website for the horror quest "Проклятие Отеля" (Chisinau).

Live: https://happygamer1919-tech.github.io/horror/

- Owner summary, TODO values and deviations: [HANDOFF.md](HANDOFF.md)
- Build plan: [docs/PLAN.md](docs/PLAN.md)

## Commands

```
npm install
npm run dev          # local development
npm run build        # static build into dist/
npm test             # Playwright suite (builds and serves the site itself)
npm run test:live    # checks against the deployed site (share images return 200)
npm run test:perf    # phone scroll performance at 4x CPU throttle (run on an idle machine, not in CI)
npm run og           # regenerate the share images in public/og/ (build first)
npm run lighthouse   # Lighthouse mobile against the live URL
npm run corridor:video    # rebuild the corridor clip and stills in public/corridor/ from the masters in corridor-src/ (needs ffmpeg; see corridor-src/SOURCES.md)
```

Content lives in `src/content/`. Business facts and all TODO values are in `src/content/site.ts`.
Every push to `main` runs the tests and deploys to GitHub Pages.
