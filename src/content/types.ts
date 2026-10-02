import type { Lang } from '../config';

export type Level = 'none' | 'weak' | 'hardcore';
export type DayRange = 'mon-thu' | 'fri' | 'sat-sun';

export interface FaqItem {
  q: string;
  a: string;
  // false = the answer is a placeholder for an unknown value, so it is kept out of JSON-LD.
  known: boolean;
}

export interface FaqValues {
  minutes: number;
  players: { min: number; max: number };
  priceFrom: string;
  // null = no age limit.
  minAge: number | null;
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
    languageNav: string;
    preview: string;
    whatsapp: string;
    waHello: (brand: string) => string;
    ask: string;
    telegram: string;
    toastTelegram: string;
    toastCopyFailed: string;
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
    // null = no age limit.
    age: (min: number | null) => string;
    ageNote: string;
    // Names only. The site never describes what a level contains.
    level: {
      legend: string;
      options: Record<Level, string>;
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
    where: string;
    whereValue: string;
    pay: string;
    payValue: string;
    submit: string;
    message: (brand: string) => string;
  };
  checkin: {
    title: string;
    intro: string;
    cardNo: string;
    fields: { team: string; language: string; level: string };
    languages: { ro: string; ru: string; en: string };
    total: string;
    submit: string;
    request: string;
    tel: string;
    note: string;
    signature: string;
    // Labels of the one-line summary: "Team: 4 - Level: ... - Language: ... - Total: ...".
    summary: { team: string; level: string; language: string; total: string };
    // Greeting in front of the summary in the WhatsApp and Telegram messages.
    hello: (brand: string) => string;
  };
  // The dialog around the booking widget.
  booking: {
    title: string;
    copied: string;
    notCopied: string;
    instruction: string;
    copyAgain: string;
    newTab: string;
    close: string;
    frameTitle: string;
    slow: string;
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
