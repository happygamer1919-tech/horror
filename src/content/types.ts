import type { Lang } from '../config';

export type Level = 'light' | 'standard' | 'hardcore';

export interface BookingData {
  brand: string;
  date: string;
  time: string;
  team: string;
  language: string;
  level: string;
  name: string;
  phone: string;
}

export interface FaqItem {
  q: string;
  a: string;
  // false = the answer is a placeholder for a TODO value, so it is kept out of JSON-LD.
  known: boolean;
}

export interface Copy {
  lang: Lang;
  locale: string;
  langName: string;
  meta: {
    title: (brand: string) => string;
    description: string;
    hiddenTitle: string;
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
  };
  places: {
    lobby: string;
    corridor: string;
    archive: string;
    reception: string;
    security: string;
    guestbook: string;
    registration: string;
    info: string;
  };
  preloader: { label: string; floor: string };
  hero: {
    kicker: string[];
    line: string;
    sub: string;
    cta: string;
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
    level: {
      legend: string;
      options: Record<Level, { name: string; text: string }>;
      note: string;
    };
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
    quotesTitle: string;
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
    };
    languages: { ro: string; ru: string; en: string };
    submit: string;
    tel: string;
    note: string;
    signature: string;
    message: (d: BookingData) => string;
  };
  faq: {
    title: string;
    items: (v: { players: string | null; age: string | null; price: string | null; phone: string; address: string; minutes: number }) => FaqItem[];
  };
  location: {
    title: string;
    address: string;
    hours: string;
    hoursPlaceholder: string;
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
