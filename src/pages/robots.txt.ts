import type { APIRoute } from 'astro';
import { SITE_INDEXABLE, abs } from '../config';

// Public: every crawler, AI assistants' crawlers included, may read the site, and the sitemap
// is named. Preview: nobody may.
export const GET: APIRoute = () => {
  const body = SITE_INDEXABLE ? `User-agent: *\nAllow: /\n\nSitemap: ${abs('/sitemap.xml')}\n` : 'User-agent: *\nDisallow: /\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
