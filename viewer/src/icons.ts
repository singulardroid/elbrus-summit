// Small inline SVG icons (24×24, currentColor) per POI category, plus UI glyphs.
import { t } from './i18n';

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;

export const CATEGORY: Record<string, { label: string; icon: string; order: number }> = {
  summit: { get label() { return t('cat.summit'); }, order: 0, icon: svg('<path fill="currentColor" d="M12 4 21 19H3z"/><path fill="#fff" opacity=".85" d="m12 4 3.2 5.4-1.7-.9-1.5 1.3-1.6-1.3-1.6.9z"/>') },
  saddle: { get label() { return t('cat.saddle'); }, order: 1, icon: svg('<path fill="currentColor" d="M2 19 8 7l4 6 4-6 6 12z"/>') },
  hut: { get label() { return t('cat.hut'); }, order: 2, icon: svg('<path fill="currentColor" d="M12 3 2 11h3v9h5v-5h4v5h5v-9h3z"/>') },
  lift: { get label() { return t('cat.lift'); }, order: 3, icon: svg('<path fill="none" stroke="currentColor" stroke-width="2" d="M2 4l20 4M12 6v4"/><rect x="6" y="10" width="12" height="10" rx="2" fill="currentColor"/><rect x="8" y="12" width="3" height="3" fill="#fff" opacity=".85"/><rect x="13" y="12" width="3" height="3" fill="#fff" opacity=".85"/>') },
  viewpoint: { get label() { return t('cat.viewpoint'); }, order: 4, icon: svg('<path fill="currentColor" d="M12 5C6.5 5 2.7 9.4 1.5 12c1.2 2.6 5 7 10.5 7s9.3-4.4 10.5-7C21.3 9.4 17.5 5 12 5zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/>') },
  village: { get label() { return t('cat.village'); }, order: 5, icon: svg('<path fill="currentColor" d="M3 20v-8l5-4 5 4v8H9v-4H7v4zm11 0v-9.5L17.5 8 22 11v9h-3v-3h-2v3z"/>') },
};

export const DEFAULT_CATEGORY = { get label() { return t('cat.place'); }, order: 9, icon: svg('<path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/>') };

export const category = (c: string) => CATEGORY[c] ?? DEFAULT_CATEGORY;

/** Group heading for the list of places. */
export const categoryPlural = (c: string) => (CATEGORY[c] ? t(`cats.${c}`) : t('other'));

export const ICON = {
  close: svg('<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/>'),
  list: svg('<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.6" fill="currentColor"/><circle cx="4.5" cy="12" r="1.6" fill="currentColor"/><circle cx="4.5" cy="18" r="1.6" fill="currentColor"/>'),
  target: svg('<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path stroke="currentColor" stroke-width="2" d="M12 1v4M12 19v4M1 12h4M19 12h4"/>'),
  share: svg('<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>'),
  external: svg('<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  route: svg('<circle cx="5" cy="19" r="2.5" fill="currentColor"/><circle cx="19" cy="5" r="2.5" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 3" d="M5 16.5V13a3 3 0 0 1 3-3h8a3 3 0 0 0 3-3V7.5"/>'),
  walk: svg('<circle cx="13" cy="4" r="2" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9 21l2.5-6.5L14 17v4M11.5 14.5 12 9l-3 2-1 3M12 9l3 3h3"/>'),
  back: svg('<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M15 5l-7 7 7 7"/>'),
};
