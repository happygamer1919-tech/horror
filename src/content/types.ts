import type { Lang } from '../config';

export type Level = 'light' | 'standard' | 'hardcore';
export type DayRange = 'mon-thu' | 'fri' | 'sat-sun';

// Tokens are filled in by the browser, see scripts/checkin.ts.
export interface BookingData {
  brand: string;
  date: string;
  time: string;
  team: string;
  total: string;
  language: string;
  // Only present when CONTACT_LEVELS_ENABLED is true.
  level: string | null;
  name: string;
  phone: string;
  comment: string;
}

export interface VoucherData {
  brand: string;
  team: string;
  recipient: string;
}

export interface FaqItem {
  q: string;
  a: string;
  // false = the answer is a placeholder for a TODO value, so it is kept out of JSON-LD.
  known: boolean;
}

export interface FaqValues {
  minutes: number;
  players: { min: number; max: number };
  priceFrom: string;
  age: string | null;
  payment: string | null;
  phone: string;
  address: string;
  levels: boolean;
  vouchers: boolean;
}

export interface Copy {
  lang: Lang;
  locale: string;
  langName: string;
  meta: {
    title: (brand: string, subtitle: string | null) => string;
    description: string;
    hiddenTitle: string;
    ogAlt: string;
  };
  ui: {
    skipToContent: string;
    skip: string;
    sound: string;
    soundOn: string;
    soundOff: string;
    book: string;
    call: string;
    askDesk: string;
    languageNav: string;
    preview: string;
    whatsapp: string;
    waHello: (brand: string) => string;
    slots: string;
  };
  places: {
    lobby: string;
    corridor: string;
    archive: string;
    reception: string;
    cashier: string;
    security: string;
    guestbook: string;
    gift: string;
    registration: string;
    info: string;
  };
  preloader: { label: string; floor: string };
  hero: {
    kicker: string[];
    line: string;
    sub: string;
    cta: string;
    // Second hero button: route in Google Maps. `routeNote` is read by screen readers only.
    route: string;
    routeNote: string;
    tel: string;
    hint: string;
    facadeAlt: string;
  };
  corridor: {
    title: string;
    captions: string[];
    alt: string;
  };
  file: {
    title: string;
    legend: string[];
    registry: {
      caption: string;
      cols: { date: string; guest: string; room: string; out: string };
      rows: { date: string; guest: string; room: string }[];
      you: string;
      note: string;
    };
    clipping: {
      rubric: string;
      year: string;
      headline: string;
      body: string[];
      caption: string;
    };
  };
  keys: {
    title: string;
    intro: string;
    labels: { players: string; duration: string; age: string; price: string };
    duration: (minutes: number) => string;
    priceFrom: (amount: number, currency: string) => string;
    // Shown instead of the level selector while CONTACT_LEVELS_ENABLED is false.
    limits: string;
    level: {
      legend: string;
      options: Record<Level, { name: string; text: string }>;
      note: string;
    };
  };
  prices: {
    title: string;
    colTeam: string;
    colPrice: string;
    players: (from: number, to: number) => string;
    note: string;
  };
  cctv: {
    title: string;
    sub: string;
    cams: string[];
    rec: string;
    alt: string;
  };
  proof: {
    title: string;
    outOf: string;
    reviews: (count: number) => string;
    source: string;
    link: string;
    review: string;
    quotesTitle: string;
  };
  voucher: {
    title: string;
    text: string;
    team: string;
    recipient: string;
    submit: string;
    message: (d: VoucherData) => string;
  };
  checkin: {
    title: string;
    intro: string;
    cardNo: string;
    fields: {
      date: string;
      time: string;
      team: string;
      language: string;
      level: string;
      name: string;
      phone: string;
      comment: string;
    };
    languages: { ro: string; ru: string; en: string };
    total: string;
    submit: string;
    request: string;
    tel: string;
    note: string;
    signature: string;
    message: (d: BookingData) => string;
  };
  faq: {
    title: string;
    items: (v: FaqValues) => FaqItem[];
  };
  location: {
    title: string;
    address: string;
    hours: string;
    days: Record<DayRange, string>;
    allDay: string;
    phone: string;
    directions: string;
  };
  footer: {
    hangerFront: string;
    hangerBack: string;
    hangerHint: string;
    rights: string;
    top: string;
  };
  notFound: { title: string; text: string; back: string };
}
