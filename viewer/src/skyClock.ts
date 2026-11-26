/**
 * The time the sky shows.
 *
 * It starts at the visitor's own local time: their morning is morning on Elbrus, their night is
 * night there (the instant is chosen so that Elbrus clocks, UTC+3, read what the visitor's clock
 * reads). For the first minutes it runs in real time, so the sky looks as it should right now;
 * then it speeds up, and the sun, moon and stars start to travel.
 *
 * URL: `?time=21:30` starts at that local time, `?speed=600` runs that fast from the start.
 */

import { addStrings, metres, num, onLang, t } from './i18n';
import { condition, type Weather } from './weather';

const ELBRUS_UTC_OFFSET_MIN = 180;
/** Seconds of real time before the sky starts to speed up. */
export const HOLD_S = 150;
/** Seconds the speed-up takes. */
const RAMP_S = 45;
/** Showcase speed: one sky hour every 15 seconds, a whole day in six minutes. */
export const FAST = 240;

export class SkyClock {
  private ms: number;
  private elapsed = 0;
  private fixedSpeed: number | null = null;
  /** True after the visitor asked for real time: the clock stays at 1×. */
  private realOnly = false;
  /**
   * How far the weather runs ahead of the real time (ms): the sky time gained by speeding up.
   * The sky itself is shifted to the visitor's wall clock, but the weather is not, so at 1× it is
   * Elbrus's real weather right now, whatever the visitor's time zone.
   */
  private ahead = 0;

  constructor() {
    const q = new URLSearchParams(location.search);
    const now = new Date();
    const m = /^(\d{1,2}):(\d{2})$/.exec(q.get('time') ?? '');
    if (m) now.setHours(+m[1], +m[2], 0, 0);
    this.ms = SkyClock.instantFor(now);
    if (m) this.ahead = this.ms - Date.now(); // a chosen time shows that time's forecast
    const sp = Number(q.get('speed'));
    if (sp > 0) this.fixedSpeed = sp;
  }

  /** The instant at which Elbrus wall clocks read the visitor's local wall time `d`. */
  private static instantFor(d: Date): number {
    return d.getTime() - (d.getTimezoneOffset() + ELBRUS_UTC_OFFSET_MIN) * 60000;
  }

  /** Current speed (sky seconds per real second). */
  get speed(): number {
    if (this.fixedSpeed !== null) return this.fixedSpeed;
    if (this.realOnly) return 1;
    const k = Math.min(Math.max((this.elapsed - HOLD_S) / RAMP_S, 0), 1);
    return 1 + (FAST - 1) * k * k * (3 - 2 * k);
  }

  get fast(): boolean {
    return this.speed > 1.5;
  }

  /** The sky instant (Unix ms). */
  get instant(): number {
    return this.ms;
  }

  /** The instant whose weather to show (Unix ms): real now, plus whatever the speed-up gained. */
  get weatherInstant(): number {
    return Date.now() + this.ahead;
  }

  /** Hours and minutes the sky shows, on the visitor's (= Elbrus) wall clock. */
  get wallTime(): { h: number; m: number } {
    const d = new Date(this.ms + ELBRUS_UTC_OFFSET_MIN * 60000);
    return { h: d.getUTCHours(), m: d.getUTCMinutes() };
  }

  /** Advance by `dt` real seconds. */
  tick(dt: number): void {
    this.elapsed += dt;
    const speed = this.speed;
    this.ms += dt * 1000 * speed;
    this.ahead += dt * 1000 * (speed - 1);
  }

  /** Back to the visitor's real time, and stay there. */
  toNow(): void {
    this.ms = SkyClock.instantFor(new Date());
    this.ahead = 0;
    this.fixedSpeed = null;
    this.realOnly = true;
  }

  /** Speed up right away. */
  speedUp(): void {
    this.realOnly = false;
    this.fixedSpeed = FAST;
  }
}

addStrings({
  ru: {
    'sky.label': 'Время на небе',
    'sky.now': 'сейчас',
    'sky.speedUp': 'Ускорить небо: сутки за шесть минут',
    'sky.toNow': 'Вернуть настоящее время',
    'wx.at': 'Погода на высоте {alt}: {cond}, {temp}, ветер {wind} км/ч, порывы до {gust}. Данные Open-Meteo.',
    'wx.clear': 'ясно', 'wx.partly': 'переменная облачность', 'wx.overcast': 'пасмурно', 'wx.fog': 'туман',
    'wx.drizzle': 'морось', 'wx.rain': 'дождь', 'wx.snow': 'снег', 'wx.showers': 'ливень', 'wx.storm': 'гроза',
  },
  en: {
    'sky.label': 'Time in the sky',
    'sky.now': 'now',
    'sky.speedUp': 'Speed up the sky: a whole day in six minutes',
    'sky.toNow': 'Back to the real time',
    'wx.at': 'Weather at {alt}: {cond}, {temp}, wind {wind} km/h, gusts up to {gust}. Data: Open-Meteo.',
    'wx.clear': 'clear', 'wx.partly': 'partly cloudy', 'wx.overcast': 'overcast', 'wx.fog': 'fog',
    'wx.drizzle': 'drizzle', 'wx.rain': 'rain', 'wx.snow': 'snow', 'wx.showers': 'showers', 'wx.storm': 'thunderstorm',
  },
  zh: {
    'sky.label': '天空时间',
    'sky.now': '现在',
    'sky.speedUp': '加速天空：六分钟走完一整天',
    'sky.toNow': '回到真实时间',
    'wx.at': '海拔 {alt} 处的天气：{cond}，{temp}，风速 {wind} 公里/小时，阵风可达 {gust}。数据来自 Open-Meteo。',
    'wx.clear': '晴', 'wx.partly': '多云', 'wx.overcast': '阴', 'wx.fog': '雾',
    'wx.drizzle': '毛毛雨', 'wx.rain': '雨', 'wx.snow': '雪', 'wx.showers': '阵雨', 'wx.storm': '雷暴',
  },
  ar: {
    'sky.label': 'الوقت في السماء',
    'sky.now': 'الآن',
    'sky.speedUp': 'تسريع السماء: يوم كامل في ست دقائق',
    'sky.toNow': 'العودة إلى الوقت الحقيقي',
    'wx.at': 'الطقس على ارتفاع {alt}: {cond}، {temp}، رياح {wind} كم/س، وهبّات حتى {gust}. البيانات من Open-Meteo.',
    'wx.clear': 'صافٍ', 'wx.partly': 'غائم جزئيًا', 'wx.overcast': 'غائم', 'wx.fog': 'ضباب',
    'wx.drizzle': 'رذاذ', 'wx.rain': 'مطر', 'wx.snow': 'ثلج', 'wx.showers': 'زخات مطر', 'wx.storm': 'عاصفة رعدية',
  },
});

const SUN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor"/><g stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7 7 17M17 7l1.7-1.7"/></g></svg>';
const MOON_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.5 3.2a8.8 8.8 0 1 0 5.3 13.4A7.4 7.4 0 0 1 15.5 3.2z"/></svg>';

const CLOUD = '<path fill="currentColor" d="M7 18.5a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18 9.8a4.4 4.4 0 0 1-.6 8.7z"/>';
const WX_ICON: Record<string, string> = {
  partly: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3.4" fill="currentColor" opacity=".7"/><path fill="currentColor" d="M9 19.5a3.8 3.8 0 0 1-.3-7.6A5 5 0 0 1 18.2 12a3.8 3.8 0 0 1-.5 7.5z"/></svg>',
  overcast: `<svg viewBox="0 0 24 24" aria-hidden="true">${CLOUD}</svg>`,
  fog: '<svg viewBox="0 0 24 24" aria-hidden="true"><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8h16M6 12h12M4 16h16M8 20h8"/></g></svg>',
  rain: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 14a4.2 4.2 0 0 1-.4-8.4A5.6 5.6 0 0 1 17.4 6a4 4 0 0 1-.5 8z"/><g stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 17l-1 3M12.5 17l-1 3M17 17l-1 3"/></g></svg>',
  snow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 14a4.2 4.2 0 0 1-.4-8.4A5.6 5.6 0 0 1 17.4 6a4 4 0 0 1-.5 8z"/><g fill="currentColor"><circle cx="8" cy="18" r="1.3"/><circle cx="12.5" cy="20" r="1.3"/><circle cx="17" cy="18" r="1.3"/></g></svg>',
  storm: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 14a4.2 4.2 0 0 1-.4-8.4A5.6 5.6 0 0 1 17.4 6a4 4 0 0 1-.5 8z"/><path fill="currentColor" d="M12.5 13l-3 5h2.4l-1.2 4 4.3-6h-2.5l1.5-3z"/></svg>',
};
WX_ICON.drizzle = WX_ICON.rain;
WX_ICON.showers = WX_ICON.rain;

/** The little clock chip: sky time, the weather, and a button to speed up or go back to now. */
export class SkyChip {
  readonly el: HTMLButtonElement;
  private key = '';
  private wx: Weather | null = null;
  private alt = 0;

  constructor(root: HTMLElement, private readonly clock: SkyClock, onChange: () => void) {
    this.el = document.createElement('button');
    this.el.type = 'button';
    this.el.className = 'sky-clock';
    this.el.dir = 'ltr';
    this.el.addEventListener('click', () => {
      if (clock.fast) clock.toNow();
      else clock.speedUp();
      this.key = '';
      onChange();
    });
    root.appendChild(this.el);
    onLang(() => { this.key = ''; }, true);
  }

  /** The weather now shown (null: none, the clear default) at altitude `alt` (m). */
  setWeather(w: Weather | null, alt: number): void {
    this.wx = w;
    this.alt = alt;
  }

  update(sunUp: boolean): void {
    const { h, m } = this.clock.wallTime;
    const fast = this.clock.fast;
    const speed = Math.round(this.clock.speed);
    const w = this.wx;
    const cond = w ? condition(w) : null;
    const temp = w ? `${num(Math.round(w.temp)).replace('-', '−')}°` : '';
    const key = `${h}:${m}|${sunUp}|${fast ? speed : 0}|${cond}|${temp}|${Math.round(this.alt / 50)}`;
    if (key === this.key) return;
    this.key = key;
    const hhmm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    this.el.classList.toggle('is-fast', fast);
    const sky = cond && WX_ICON[cond] ? WX_ICON[cond] : sunUp ? SUN_ICON : MOON_ICON;
    const wx = w ? `<i class="sky-wx">${temp}</i>` : '';
    this.el.innerHTML = `${sky}<b>${hhmm}</b>${wx}<span>${fast ? `▸▸ ×${speed}` : t('sky.now')}</span>`;
    const wxTip = w && cond
      ? ' ' + t('wx.at', {
        alt: metres(this.alt), cond: t(`wx.${cond}`), temp: `${temp}C`,
        wind: num(Math.round(w.wind)), gust: num(Math.round(w.gust)),
      })
      : '';
    const tip = `${t('sky.label')} ${hhmm}.${wxTip} ${t(fast ? 'sky.toNow' : 'sky.speedUp')}`;
    this.el.title = tip;
    this.el.setAttribute('aria-label', tip);
  }
}
