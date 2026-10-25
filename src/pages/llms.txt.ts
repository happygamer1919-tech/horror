import type { APIRoute } from 'astro';
import { LANGS, abs } from '../config';
import { copy, site, durationRange, faqFor, instagramUrl, BOOKING_URL, VOUCHERS_ENABLED } from '../content';

// A plain summary for AI assistants (llmstxt.org), written from the same facts as the pages,
// so it can never say something the site does not. English, with links to all three pages.
export const GET: APIRoute = () => {
  const t = copy.en;
  const names = [site.brand, ...Object.values(site.brandSubtitle).filter(Boolean)];
  const hours = site.hours.map((h) => `${t.location.days[h.days]} ${h.allDay ? t.location.allDay : `${h.open}-${h.close}`}`).join('; ');
  const prices = site.prices.map((p) => `${p.from === p.to ? p.from : `${p.from}-${p.to}`} players ${p.total} ${site.currency}`).join('; ');
  const languages = site.gameLanguages.map((l) => t.checkin.languages[l]).join(', ');
  const faq = faqFor('en').filter((i) => i.known);
  const body = [
    `# ${names[0]} (${names.slice(1).join(' / ')})`,
    '',
    `> ${t.meta.description(durationRange)}`,
    '',
    '## Facts',
    '',
    `- Address: ${site.address.street}, ${site.address.postalCode}, ${site.city.en}, ${site.country.en}`,
    `- Google Maps: ${site.maps.profileUrl}`,
    `- Phone, WhatsApp and Telegram: ${site.phone.display}`,
    `- Hours: ${hours}`,
    `- Game length: ${durationRange} minutes`,
    `- Team size: ${site.players.min}-${site.players.max} players`,
    `- Price for the whole team: ${prices}`,
    `- Payment: cash at the venue${VOUCHERS_ENABLED ? '; gift vouchers are sold at the venue' : ''}`,
    `- Game languages: ${languages}`,
    ...(BOOKING_URL ? [`- Online booking: ${BOOKING_URL}`] : []),
    ...(instagramUrl ? [`- Instagram: ${instagramUrl}`] : []),
    '',
    '## Pages',
    '',
    ...LANGS.map((l) => `- [${t.checkin.languages[l]}](${abs(`/${l}/`)})`),
    '',
    '## Questions',
    '',
    ...faq.flatMap((i) => [`### ${i.q}`, '', i.a, '']),
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
