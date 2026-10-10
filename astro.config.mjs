import { defineConfig } from 'astro/config';

// Deployed to GitHub Pages on the custom domain lastquestmd.com, served from the root.
export default defineConfig({
  site: 'https://lastquestmd.com',
  base: '/',
  trailingSlash: 'always',
  output: 'static',
  build: { inlineStylesheets: 'always' },
  devToolbar: { enabled: false },
});
