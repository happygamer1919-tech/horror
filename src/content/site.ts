// Single source of business facts. Copy lives in ro.ts / ru.ts / en.ts.
//
// Every value here is confirmed by the owner. A block whose list is empty (for example
// `site.reviews`) is not rendered.

import type { Lang } from '../config';

// --- Feature flags -------------------------------------------------------------------

// Level selector: exactly two levels, no electroshock and hardcore. The team chooses. The
// site shows the two names only and never describes what a level contains. One rule goes
// with them: teams with minors play without electroshock (the wording is in the language files).
export const CONTACT_LEVELS_ENABLED = true;
export const LEVELS = ['none', 'hardcore'] as const;

// Gift voucher block (bought at the venue, in cash). Also controls the voucher FAQ answer.
export const VOUCHERS_ENABLED = true;

// The EasyWeek booking widget: the primary booking action. It collects the slot, name,
// phone and a comment. The check-in card opens it in a dialog and copies the team size,
// level, language and total for the comment field. Leave empty to hide the booking button.
// Components read it as BOOKING_URL (see index.ts). Booking always goes through the check-in card.
export const SLOTS_URL = 'https://widget.easyweek.io/horror-quest-moldova/team/34544/62497';

// The desk phones the guest on the day of the game to confirm the booking. Confirmed by the
// owner: it stays on. The line shows on the check-in card, in the booking dialog and in the
// "How do I book?" answer. false hides the line everywhere.
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

  // Confirmed by the owner: this number is on WhatsApp and on Telegram.
  phone: {
    display: '+373 682 32 596',
    e164: '+37368232596',
    // wa.me wants digits only, no plus sign.
    whatsapp: '37368232596',
  },

  // Length of a game in minutes: a range. Shown as "60-90 min" (see durationRange below).
  duration: { min: 60, max: 90 },

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

  // Instagram handle without the @. null = no link in the footer and no sameAs in JSON-LD.
  instagram: 'last.quest.moldova' as string | null,

  // Review quotes for the guest book, published with the owner's permission. Google reviews,
  // five stars each, written in Romanian: `text.ro` is the original, character for character;
  // `text.ru` and `text.en` are faithful translations (nothing added, nothing dropped), shown
  // with a "translated from Romanian" label. `author` is the first name and the initial of
  // the last name. `excerpt: true` means the review goes on: the page adds "..." after it.
  // An empty list hides the guest book.
  reviews: [
    {
      author: 'Catalina G.',
      stars: 5,
      lang: 'ro',
      excerpt: false,
      text: {
        ro: 'Cel mai tare quest horror! Foarte înfricoșător, plin de adrenalină și extrem de captivant. Ne-am speriat serios și ne-a plăcut enorm. Recomand 100%!',
        ru: 'Самый крутой хоррор-квест! Очень страшный, полный адреналина и крайне захватывающий. Мы серьёзно испугались, и нам невероятно понравилось. Рекомендую на 100%!',
        en: 'The coolest horror quest! Very scary, full of adrenaline and extremely captivating. We got seriously scared and we enjoyed it enormously. I recommend it 100%!',
      },
    },
    {
      author: 'Diana R.',
      stars: 5,
      lang: 'ro',
      excerpt: true,
      text: {
        ro: 'O experiență de neuitat! Am fost la acest horror quest cu prietenii și pot spune că a fost absolut genial! Atmosfera este incredibil de bine realizată, decorurile sunt detaliate și te fac să simți că ești într-un film de groază.',
        ru: 'Незабываемые впечатления! Я была на этом хоррор-квесте с друзьями и могу сказать, что это было абсолютно гениально! Атмосфера создана невероятно хорошо, декорации детальные и заставляют почувствовать, что ты в фильме ужасов.',
        en: 'An unforgettable experience! I went to this horror quest with friends and I can say it was absolutely brilliant! The atmosphere is incredibly well done, the sets are detailed and make you feel like you are in a horror film.',
      },
    },
    {
      author: 'Ruslana P.',
      stars: 5,
      lang: 'ro',
      excerpt: false,
      text: {
        ro: 'Quest, pușca, racheta, bomba, țunami!!! Emoții de neuitat, încăperea e amenajată perfect, actorii fenomenali 10/10. Nu e ultima dată când voi mai vizita acest Quest!!!',
        ru: 'Квест, пушка, ракета, бомба, цунами!!! Незабываемые эмоции, помещение оформлено идеально, актёры феноменальные 10/10. Это не последний раз, когда я посещу этот Квест!!!',
        en: 'Quest, gun, rocket, bomb, tsunami!!! Unforgettable emotions, the room is set up perfectly, the actors phenomenal 10/10. This is not the last time I will visit this Quest!!!',
      },
    },
  ] as { author: string; stars: number; lang: Lang; excerpt: boolean; text: Record<Lang, string> }[],

  // One short line from the reviews, set large above the guest book. `review` is the index
  // of the review it is taken from (for the name under it); the text is its first sentence.
  reviewPull: {
    review: 0,
    text: {
      ro: 'Cel mai tare quest horror!',
      ru: 'Самый крутой хоррор-квест!',
      en: 'The coolest horror quest!',
    } as Record<Lang, string>,
  },
};

export type Site = typeof site;

// Total price for a team of `team` players, or null outside the price list.
export function priceFor(team: number): number | null {
  const row = site.prices.find((p) => team >= p.from && team <= p.to);
  return row ? row.total : null;
}

export const priceFrom = Math.min(...site.prices.map((p) => p.total));

// "60-90": the length of a game, with a plain hyphen. The language files add the unit.
export const durationRange = site.duration.min === site.duration.max ? `${site.duration.min}` : `${site.duration.min}-${site.duration.max}`;

// The Instagram profile, for the footer link and for sameAs in JSON-LD.
export const instagramUrl = site.instagram ? `https://instagram.com/${site.instagram}` : null;
