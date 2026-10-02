import { defineConfig } from 'astro/config';

// Deployed to GitHub Pages under /horror. Change both values when a custom domain is attached.
export default defineConfig({
  site: 'https://happygamer1919-tech.github.io',
  base: '/horror',
  trailingSlash: 'always',
  output: 'static',
  build: { inlineStylesheets: 'auto' },
  devToolbar: { enabled: false },
});
