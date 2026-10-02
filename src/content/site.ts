// Single source of business facts. Copy lives in ro.ts / ru.ts / en.ts.
//
// Values marked TODO(owner) are NOT known yet. Keep them `null` (or empty) until the
// owner confirms them: the site renders a neutral placeholder for every null.
// Every TODO here is also listed in HANDOFF.md.

import type { Lang } from '../config';

// --- Feature flags -------------------------------------------------------------------

// Light / Standard / Hardcore selector. The levels are NOT confirmed by the owner, so the
// selector, its copy and the form field stay off. While false the site shows one line
// instead: live actors, tell us your limits when you book.
export const CONTACT_LEVELS_ENABLED = false;

// Gift voucher block (WhatsApp request). Also controls the voucher FAQ answer.
export const VOUCHERS_ENABLED = true;

// Optional link to a live schedule. When set, a secondary "See free slots" link appears
// next to the booking buttons. Leave empty to hide it.
export const SLOTS_URL = '';

// --- Facts ---------------------------------------------------------------------------

const PLACE_ID = 'ChIJ8UbS8b3Xy0ARaOu6EZ-iXhU';

export const site = {
  // The wordmark. It is the same on all three language pages.
  brand: 'Проклятие Отеля',
  brandLang: 'ru',
  // Shown only as a subtitle under the wordmark, on the RO and EN pages.
  brandSubtitle: { ro: 'Blestemul Hotelului', en: "The Hotel's Curse", ru: null } as Record<Lang, string | null>,

  city: { ru: 'Кишинёв', ro: 'Chișinău', en: 'Chisinau' },
  country: { ru: 'Молдова', ro: 'Moldova', en: 'Moldova' },
  countryCode: 'MD',

  address: {
    street: 'Strada Onisifor Ghibu 10',
    postalCode: 'MD-2071',
  },

  phone: {
    display: '+373 682 32 596',
    e164: '+37368232596',
    // wa.me wants digits only, no plus sign.
    whatsapp: '37368232596',
  },

  durationMinutes: 60,

  // Team size. Also the bounds of the "Guests" field and of the voucher block.
  players: { min: 2, max: 11 },

  // Price for the whole team, by team size.
  currency: 'MDL',
  prices: [
    { from: 2, to: 3, total: 1000 },
    { from: 4, to: 4, total: 1200 },
    { from: 5, to: 5, total: 1500 },
    { from: 6, to: 6, total: 1800 },
    { from: 7, to: 7, total: 2100 },
    { from: 8, to: 8, total: 2400 },
    { from: 9, to: 9, total: 2700 },
    { from: 10, to: 10, total: 3000 },
    { from: 11, to: 11, total: 3300 },
  ],

  // Opening hours. The owner may correct these. `days` keys are labelled in the language
  // files; `schema` is the same range for search engines (JSON-LD).
  hours: [
    { days: 'mon-thu', open: '16:00', close: '03:00', allDay: false, schema: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'] },
    { days: 'fri', open: '16:00', close: '00:00', allDay: false, schema: ['Friday'] },
    { days: 'sat-sun', open: '00:00', close: '23:59', allDay: true, schema: ['Saturday', 'Sunday'] },
  ] as { days: 'mon-thu' | 'fri' | 'sat-sun'; open: string; close: string; allDay: boolean; schema: string[] }[],

  rating: {
    value: 4.8,
    count: 39,
  },

  maps: {
    profileUrl: `https://www.google.com/maps/place/?q=place_id:${PLACE_ID}`,
    reviewUrl: `https://search.google.com/local/writereview?placeid=${PLACE_ID}`,
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=Strada+Onisifor+Ghibu+10%2C+Chi%C8%99in%C4%83u+MD-2071&destination_place_id=${PLACE_ID}`,
  },

  // TODO(owner): age limit, for example "16+". null = placeholder.
  ageLimit: null as string | null,

  // TODO(owner): languages the game is actually played in, for example ['ro', 'ru'].
  // null = the form offers all three as a preference and promises nothing.
  gameLanguages: null as Lang[] | null,

  // TODO(owner): payment methods, one short line per language. null = placeholder in the FAQ.
  paymentMethods: null as Record<Lang, string> | null,

  // TODO(owner): Instagram handle without the @. null = no link in the footer.
  instagram: null as string | null,

  // TODO(owner): real review quotes, with permission. The block stays hidden while empty.
  // Shape: { author: 'Name', text: { ru: '...', ro: '...', en: '...' } }
  reviews: [] as { author: string; text: Record<Lang, string> }[],

  // TODO(owner): the real rules for each contact level. Only used when
  // CONTACT_LEVELS_ENABLED is true.
  contactRulesConfirmed: false,
};

export type Site = typeof site;

// Total price for a team of `team` players, or null outside the price list.
export function priceFor(team: number): number | null {
  const row = site.prices.find((p) => team >= p.from && team <= p.to);
  return row ? row.total : null;
}

export const priceFrom = Math.min(...site.prices.map((p) => p.total));
