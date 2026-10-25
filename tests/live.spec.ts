// Checks against the deployed site. Run after a deploy: npm run test:live
import { test, expect } from '@playwright/test';

const LIVE = 'https://lastquestmd.com';
const BRAND = 'Проклятие Отеля';

for (const lang of ['ro', 'ru', 'en']) {
  test(`live ${lang}: page is up, carries the wordmark, and og:image returns 200`, async ({ request }) => {
    const res = await request.get(`${LIVE}/${lang}/`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain(BRAND);
    const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    expect(og).toBe(`${LIVE}/og/${lang}.jpg`);
    const img = await request.get(og!);
    expect(img.status()).toBe(200);
    expect(img.headers()['content-type']).toContain('image/jpeg');
    expect((await img.body()).length).toBeGreaterThan(20000);
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('1000 MDL');
  });
}

// The site is public (deploy.yml SITE_INDEXABLE): search engines and AI assistants may read it.
test('live: open to crawlers, sitemap and llms.txt are served', async ({ request }) => {
  const robots = await request.get(`${LIVE}/robots.txt`);
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain(`Allow: /\n\nSitemap: ${LIVE}/sitemap.xml`);
  const sitemap = await request.get(`${LIVE}/sitemap.xml`);
  expect(sitemap.status()).toBe(200);
  for (const lang of ['ro', 'ru', 'en']) expect(await sitemap.text()).toContain(`<loc>${LIVE}/${lang}/</loc>`);
  const llms = await request.get(`${LIVE}/llms.txt`);
  expect(llms.status()).toBe(200);
  expect(await llms.text()).toContain(`# ${BRAND}`);
  const logo = await request.get(`${LIVE}/logo.png`);
  expect(logo.status()).toBe(200);
  const page = await (await request.get(`${LIVE}/ro/`)).text();
  expect(page).toContain('<meta name="robots" content="index, follow">');
  expect(page).toContain('"@type":"EntertainmentBusiness"');
});
