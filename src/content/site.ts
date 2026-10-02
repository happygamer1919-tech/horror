// Single source of business facts. Copy lives in ro.ts / ru.ts / en.ts.
//
// Values marked TODO(owner) are NOT known yet. Keep them `null` (or empty) until the
// owner confirms them: the site renders a neutral placeholder for every null.
// Every TODO here is also listed in HANDOFF.md.

export const site = {
  // Brand name. Change it here and it changes everywhere.
  brand: {
    ru: 'Проклятие Отеля',
    ro: 'Blestemul Hotelului',
    en: "The Hotel's Curse",
  },

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

  rating: {
    value: 4.8,
    count: 39,
  },

  maps: {
    // TODO(owner): replace with the exact Google Maps profile link (Share > Copy link).
    // Until then this opens a Maps search for the address.
    profileUrl:
      'https://www.google.com/maps/search/?api=1&query=Strada+Onisifor+Ghibu+10%2C+Chi%C8%99in%C4%83u+MD-2071',
    directionsUrl:
      'https://www.google.com/maps/dir/?api=1&destination=Strada+Onisifor+Ghibu+10%2C+Chi%C8%99in%C4%83u+MD-2071',
  },

  // TODO(owner): price, for example "from 1200 MDL per team". null = placeholder.
  price: null as string | null,

  // TODO(owner): team size, for example "2-6". null = placeholder.
  players: null as string | null,

  // TODO(owner): age limit, for example "16+". null = placeholder.
  ageLimit: null as string | null,

  // TODO(owner): opening hours, one short line per language. null = placeholder.
  hours: null as { ru: string; ro: string; en: string } | null,

  // TODO(owner): the real rules for each contact level (Light / Standard / Hardcore).
  // The copy in the language files describes mood only and promises nothing.
  // Flip to true once the copy has been replaced with the confirmed rules:
  // it removes the "rules are confirmed when you book" note.
  contactRulesConfirmed: false,

  // TODO(owner): real review quotes, with permission. The block stays hidden while empty.
  // Shape: { author: 'Name', text: { ru: '...', ro: '...', en: '...' } }
  reviews: [] as { author: string; text: { ru: string; ro: string; en: string } }[],

  // Used by the booking form bounds only. TODO(owner): confirm together with `players`.
  teamSizeInput: { min: 1, max: 12, default: 4 },
} as const;

export type Site = typeof site;
