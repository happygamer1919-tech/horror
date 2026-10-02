import type { Lang } from '../config';
import type { Copy } from './types';
import { ro } from './ro';
import { ru } from './ru';
import { en } from './en';

export const copy: Record<Lang, Copy> = { ro, ru, en };
export { site, priceFor, priceFrom, CONTACT_LEVELS_ENABLED, LEVELS, VOUCHERS_ENABLED, SLOTS_URL as BOOKING_URL, TELEGRAM_URL } from './site';

// The booking widget address is exported as BOOKING_URL. The name SLOTS_URL is kept here
// empty on purpose: the hero (another stream's file) still renders a direct "See free
// slots" link whenever it is non-empty, and that link would open the widget without the
// summary line. Booking goes through the check-in card only. Delete this export once the
// hero no longer imports it.
export const SLOTS_URL = '';
