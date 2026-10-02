import type { Lang } from '../config';
import type { Copy } from './types';
import { ro } from './ro';
import { ru } from './ru';
import { en } from './en';

export const copy: Record<Lang, Copy> = { ro, ru, en };
export { site, priceFor, priceFrom, CONTACT_LEVELS_ENABLED, LEVELS, VOUCHERS_ENABLED, SLOTS_URL as BOOKING_URL, TELEGRAM_URL } from './site';

