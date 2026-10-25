import type { Lang } from '../config';
import type { Copy } from './types';
import { site, priceFrom, durationRange, CONTACT_LEVELS_ENABLED, VOUCHERS_ENABLED, CONFIRM_CALL_ENABLED } from './site';
import { ro } from './ro';
import { ru } from './ru';
import { en } from './en';

export const copy: Record<Lang, Copy> = { ro, ru, en };
export { site, priceFor, priceFrom, durationRange, instagramUrl, CONTACT_LEVELS_ENABLED, LEVELS, VOUCHERS_ENABLED, CONFIRM_CALL_ENABLED, SLOTS_URL as BOOKING_URL, TELEGRAM_URL } from './site';


// The FAQ of one language page, with the facts filled in. The page and llms.txt both read it.
export function faqFor(lang: Lang) {
  const t = copy[lang];
  return t.faq.items({
    minutes: durationRange,
    players: site.players,
    priceFrom: t.keys.priceFrom(priceFrom, site.currency),
    minAge: site.ageLimit,
    phone: site.phone.display,
    address: `${site.address.street}, ${site.address.postalCode}, ${site.city[lang]}`,
    levels: CONTACT_LEVELS_ENABLED,
    vouchers: VOUCHERS_ENABLED,
    confirmCall: CONFIRM_CALL_ENABLED ? t.checkin.confirmCall : null,
  });
}
