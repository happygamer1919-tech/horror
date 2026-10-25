import type { APIRoute } from 'astro';
import { LANGS, DEFAULT_LANG, abs } from '../config';

// The three language pages, each listing its translations (the same set as the hreflang
// links in Base.astro). The root only redirects and the 404 page is not a page to index.
export const GET: APIRoute = () => {
  const alternates = [
    ...LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${abs(`/${l}/`)}"/>`),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${abs(`/${DEFAULT_LANG}/`)}"/>`,
  ].join('\n');
  const urls = LANGS.map((l) => `  <url>\n    <loc>${abs(`/${l}/`)}</loc>\n${alternates}\n  </url>`).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
