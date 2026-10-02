// Checks against the deployed site. Run after a deploy: npm run test:live
import { test, expect } from '@playwright/test';

const LIVE = 'https://happygamer1919-tech.github.io/horror';
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
