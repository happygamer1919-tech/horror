// Single source of business facts. Copy lives in ro.ts / ru.ts / en.ts.
//
// Values marked TODO(owner) are NOT known yet. Keep them `null` (or empty) until the
// owner confirms them: the site hides the matching block for every one of them.
// Every TODO here is also listed in HANDOFF.md.

import type { Lang } from '../config';

// --- Feature flags -------------------------------------------------------------------

// Level selector: no electroshock / weak electroshock / hardcore. The team chooses. The site
// shows the three names only and never describes what a level contains.
export const CONTACT_LEVELS_ENABLED = true;
export const LEVELS = ['none', 'weak', 'hardcore'] as const;

// Gift voucher block (bought at the venue, in cash). Also controls the voucher FAQ answer.
export const VOUCHERS_ENABLED = true;

// The EasyWeek booking widget: the primary booking action. It collects the slot, name,
// phone and a comment. The check-in card opens it in a dialog and copies the team size,
// level, language and total for the comment field. Leave empty to hide the booking button.
// Components read it as BOOKING_URL (see index.ts). Booking always goes through the check-in card.
export const SLOTS_URL = 'https://widget.easyweek.io/horror-quest-moldova/team/34544/62497';

// The desk phones the guest on the day of the game to confirm the booking. The line shows on
// the check-in card, in the booking dialog and in the "How do I book?" answer. false hides
// the line everywhere.
export const CONFIRM_CALL_ENABLED = true;

// Telegram, the second "ask a question" channel next to WhatsApp. A phone link cannot be
// prefilled reliably, so the site copies the message to the clipboard and says so.
export const TELEGRAM_URL = 'https://t.me/+37368232596';

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

  // Opening hours, confirmed by the owner. `days` keys are labelled in the language files;
  // `schema` is the same range for search engines (JSON-LD).
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

  // Minimum age in years. null = no age limit (confirmed). Everyone signs an agreement on
  // arrival; a minor enters only if a parent signs it. The wording is in the language files.
  ageLimit: null as number | null,

  // Languages the game is played in. The "Language" field on the card offers exactly these.
  gameLanguages: ['ro', 'ru', 'en'] as Lang[],

  // Cash only, at the venue. Gift vouchers too. The wording is in the language files.
  payment: 'cash' as const,

  // TODO(owner): Instagram handle without the @. null = no link in the footer.
  instagram: null as string | null,

  // TODO(owner): real review quotes, with permission. The block stays hidden while empty.
  // Shape: { author: 'Name', text: { ru: '...', ro: '...', en: '...' } }
  reviews: [] as { author: string; text: Record<Lang, string> }[],
};

export type Site = typeof site;

// Total price for a team of `team` players, or null outside the price list.
export function priceFor(team: number): number | null {
  const row = site.prices.find((p) => team >= p.from && team <= p.to);
  return row ? row.total : null;
}

export const priceFrom = Math.min(...site.prices.map((p) => p.total));
