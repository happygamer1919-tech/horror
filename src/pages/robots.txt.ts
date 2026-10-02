import type { APIRoute } from 'astro';
import { SITE_INDEXABLE } from '../config';

export const GET: APIRoute = () => {
  const body = SITE_INDEXABLE ? 'User-agent: *\nAllow: /\n' : 'User-agent: *\nDisallow: /\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
