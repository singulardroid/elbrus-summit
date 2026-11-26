/**
 * Weather on Elbrus, from Open-Meteo (free, no key, callable from the browser; CC BY 4.0:
 * credit "Weather data by Open-Meteo.com"). The free API is for non-commercial sites only: a site
 * with ads or subscriptions needs their paid plan (or a self-hosted copy; change WEATHER_URL).
 *
 * One call gets 72 hours (yesterday, today, tomorrow) of hourly data for two points: Azau
 * (2350 m) and the summit (5642 m). The sky clock's time picks the hour, the visitor's altitude
 * blends the two points. When the sky runs past the data it loops back to the start.
 *
 * Anything going wrong (offline, blocked, bad answer) means no weather: the clear sky as before.
 * A good answer is kept in the browser for an hour, and reused for up to two days if a later
 * call fails. `?weather=clear|cloudy|rain|snow|fog|haze|wind|storm|off` replaces the real data.
 */

const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=43.26,43.35&longitude=42.47,42.44&elevation=2350,5642' +
  '&hourly=temperature_2m,precipitation,snowfall,weather_code,cloud_cover,cloud_cover_low,visibility,' +
  'wind_speed_10m,wind_gusts_10m,wind_direction_10m&past_days=1&forecast_days=2&timezone=GMT&timeformat=unixtime';
const CACHE_KEY = 'elbrus.weather.v1';
const FRESH_MS = 60 * 60 * 1000;
const STALE_MS = 48 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;
export const ALT_LOW = 2350;
export const ALT_HIGH = 5642;

const FIELDS = [
  'temperature_2m', 'precipitation', 'snowfall', 'weather_code', 'cloud_cover', 'cloud_cover_low',
  'visibility', 'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m',
] as const;
type Field = (typeof FIELDS)[number];
interface Series { time: number[]; v: Record<Field, number[]> }
/** Two series (Azau, summit), same hours. */
type Data = [Series, Series];

/** The weather at one moment and altitude. */
export interface Weather {
  temp: number; // °C
  precip: number; // mm/h
  snow: boolean; // falls as snow
  code: number; // WMO weather code
  cloud: number; // 0 … 1
  cloudLow: number; // 0 … 1
  visibility: number; // m
  wind: number; // km/h
  gust: number; // km/h
  windFrom: number; // degrees, where the wind comes from
}

export type Condition = 'clear' | 'partly' | 'overcast' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'showers' | 'storm';

export function condition(w: Weather): Condition {
  const c = w.code;
  if (c >= 95) return 'storm';
  if (c === 45 || c === 48) return 'fog';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86 || (w.precip > 0.05 && w.snow)) return 'snow';
  if (c >= 80 && c <= 82) return 'showers';
  if ((c >= 61 && c <= 67) || w.precip > 0.3) return 'rain';
  if (c >= 51 && c <= 57) return 'drizzle';
  if (w.cloud > 0.85) return 'overcast';
  if (w.cloud > 0.3) return 'partly';
  return 'clear';
}

const PRESETS: Record<string, Partial<Weather>> = {
  clear: {},
  cloudy: { cloud: 0.7, cloudLow: 0.3, code: 2 },
  rain: { cloud: 1, cloudLow: 0.8, precip: 3, code: 63, temp: 6, visibility: 6000, wind: 18 },
  snow: { cloud: 1, cloudLow: 0.9, precip: 2, snow: true, code: 73, temp: -8, visibility: 3000, wind: 20 },
  fog: { cloud: 1, cloudLow: 1, code: 45, visibility: 400, wind: 5 },
  haze: { cloud: 0.2, visibility: 9000, code: 1 },
  wind: { cloud: 0.55, cloudLow: 0.2, code: 2, wind: 65, gust: 110, temp: -15 },
  storm: { cloud: 1, cloudLow: 0.9, precip: 6, code: 95, temp: 4, visibility: 5000, wind: 45, gust: 85 },
};
const CLEAR: Weather = { temp: -5, precip: 0, snow: false, code: 0, cloud: 0, cloudLow: 0, visibility: 40000, wind: 10, gust: 15, windFrom: 250 };

export class WeatherFeed {
  private data: Data | null = null;
  private preset: Weather | null = null;
  private off = false;
  /** Where the data came from, for the UI: live, cached, preset, or none (clear sky). */
  source: 'live' | 'cache' | 'preset' | 'none' = 'none';

  constructor() {
    const q = new URLSearchParams(location.search).get('weather');
    if (q === 'off') this.off = true;
    else if (q && q in PRESETS) {
      this.preset = { ...CLEAR, ...PRESETS[q] };
      this.source = 'preset';
    }
  }

  /** Load (from the cache if fresh) and refresh every hour. Never throws. */
  start(onData: () => void): void {
    if (this.off || this.preset) return;
    const run = async () => {
      const got = await this.load();
      if (got) onData();
    };
    void run();
    window.setInterval(() => void run(), FRESH_MS);
  }

  private async load(): Promise<boolean> {
    const cached = readCache();
    if (cached && Date.now() - cached.at < FRESH_MS) {
      this.data = cached.data;
      this.source = 'cache';
      return true;
    }
    const fresh = await fetchData(WEATHER_URL);
    if (fresh) {
      this.data = fresh;
      this.source = 'live';
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: fresh })); } catch { /* private mode */ }
      return true;
    }
    if (cached && Date.now() - cached.at < STALE_MS) {
      this.data = cached.data;
      this.source = 'cache';
      return true;
    }
    return false;
  }

  /** True when there is weather to show (live, cached or a preset). */
  get active(): boolean {
    return !!this.preset || !!this.data;
  }

  /** The weather at instant `ms` (Unix ms) and altitude `alt` (m); the clear sky if there is none. */
  at(ms: number, alt: number): Weather {
    if (this.preset) return this.preset;
    if (!this.data) return CLEAR;
    const [lo, hi] = this.data;
    const t = lo.time, n = t.length;
    const start = t[0], step = t[1] - t[0], span = step * n;
    let s = (ms / 1000 - start) % span;
    if (s < 0) s += span;
    const f = s / step;
    const i = Math.floor(f) % n, j = (i + 1) % n, k = f - Math.floor(f);
    const a = Math.min(Math.max((alt - ALT_LOW) / (ALT_HIGH - ALT_LOW), 0), 1);
    const val = (field: Field) => {
      const at = (ser: Series) => ser.v[field][i] + (ser.v[field][j] - ser.v[field][i]) * k;
      return at(lo) + (at(hi) - at(lo)) * a;
    };
    const near = (field: Field) => (k < 0.5 ? (a < 0.5 ? lo : hi).v[field][i] : (a < 0.5 ? lo : hi).v[field][j]);
    // Wind direction: blend as vectors, so 350° and 10° average to 0°, not 180°.
    const dir = (ser: Series, idx: number) => (ser.v.wind_direction_10m[idx] * Math.PI) / 180;
    let wx = 0, wz = 0;
    for (const [ser, w] of [[lo, 1 - a], [hi, a]] as [Series, number][]) {
      for (const [idx, wk] of [[i, 1 - k], [j, k]] as [number, number][]) {
        wx += Math.sin(dir(ser, idx)) * w * wk;
        wz += Math.cos(dir(ser, idx)) * w * wk;
      }
    }
    const temp = val('temperature_2m');
    const precip = val('precipitation');
    return {
      temp,
      precip,
      snow: val('snowfall') > 0.02 || temp < 1,
      code: near('weather_code'),
      cloud: val('cloud_cover') / 100,
      cloudLow: val('cloud_cover_low') / 100,
      visibility: val('visibility'),
      wind: val('wind_speed_10m'),
      gust: val('wind_gusts_10m'),
      windFrom: ((Math.atan2(wx, wz) * 180) / Math.PI + 360) % 360,
    };
  }
}

function readCache(): { at: number; data: Data } | null {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    return c && typeof c.at === 'number' && valid(c.data) ? c : null;
  } catch {
    return null;
  }
}

function valid(d: unknown): d is Data {
  if (!Array.isArray(d) || d.length !== 2) return false;
  return d.every((s: Series) => {
    const n = s?.time?.length ?? 0;
    return n >= 2 && FIELDS.every((f) => Array.isArray(s.v?.[f]) && s.v[f].length === n && s.v[f].every((x) => typeof x === 'number'));
  });
}

/** Fetch and check the answer. Null on any failure (network, block, timeout, odd data). */
export async function fetchData(url: string): Promise<Data | null> {
  try {
    const ctl = new AbortController();
    const timer = window.setTimeout(() => ctl.abort(), TIMEOUT_MS);
    const res = await fetch(url, { signal: ctl.signal });
    window.clearTimeout(timer);
    if (!res.ok) return null;
    const raw = await res.json();
    if (!Array.isArray(raw) || raw.length !== 2) return null;
    const data = raw.map((loc: { hourly?: Record<string, (number | null)[]> }) => {
      const h = loc.hourly ?? {};
      const time = (h.time ?? []) as number[];
      const v = {} as Record<Field, number[]>;
      for (const f of FIELDS) v[f] = fillGaps((h[f] ?? new Array(time.length).fill(null)) as (number | null)[], f);
      return { time, v };
    });
    return valid(data) ? (data as Data) : null;
  } catch {
    return null;
  }
}

/** Missing hours (null) take the nearest known value; a field with none gets a neutral default. */
function fillGaps(a: (number | null)[], f: Field): number[] {
  const def = f === 'visibility' ? 40000 : f === 'temperature_2m' ? -5 : 0;
  let last: number | null = a.find((x) => x !== null) ?? def;
  return a.map((x) => (x === null ? last! : (last = x)));
}
