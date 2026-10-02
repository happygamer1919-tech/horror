// Build-time flags. Import only from .astro frontmatter or endpoints, never from client scripts.

// One switch for search engines. While false: meta robots noindex, robots.txt disallow all,
// and no JSON-LD. Set SITE_INDEXABLE=true in the build environment to go public.
export const SITE_INDEXABLE = (process.env.SITE_INDEXABLE ?? 'false') === 'true';

export const SITE_ORIGIN = 'https://happygamer1919-tech.github.io';
export const BASE = '/horror';

export const LANGS = ['ro', 'ru', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'ro';

export const href = (path: string) => `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
export const abs = (path: string) => `${SITE_ORIGIN}${href(path)}`;
