import type { Journey } from './data';
import type { DoorState } from './doors';
import { applyI18n, duration, km, LANGS, lang, num, onLang, plural, setLang, stationName, t, type Lang } from './i18n';

/**
 * Climb HUD (in the "250 stories" style): where you are, up/down, the story card for the
 * current station, a strip with the whole route's profile, every station and the named stops,
 * and the mode / look / language switches.
 */

export interface ClimbHudActions {
  onStep(delta: number): void;
  onJump(n: number): void;
  onMode(mode: 'climb' | 'overview'): void;
  onLook(look: 'digital' | 'satellite'): void;
  onRead(): void;
  onHelp(): void;
}

export interface ClimbStatus {
  door: number;
  total: number;
  state: DoorState;
  opened: number;
  elevation: number;
  distance: number;
  walkMinutes: number;
  stage: { at?: string; from?: string; to?: string };
}

/** "Place: Garabashi" or "Mir → Garabashi" for the stops around the current station. */
export function stageText(st: { at?: string; from?: string; to?: string }): string {
  return st.at
    ? t('place.at', { name: stationName(st.at) })
    : t('place.between', { from: st.from ? stationName(st.from) : '…', to: st.to ? stationName(st.to) : t('summit') });
}

const ARROW_UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M6 15l6-6 6 6"/></svg>';
const ARROW_DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6"/></svg>';

export class ClimbHud {
  readonly el: HTMLElement;
  private readonly $ = <T extends Element>(s: string) => this.el.querySelector(s) as T;
  private marker!: SVGGElement;
  private doorTicks: SVGLineElement[] = [];
  private stripX!: (d: number) => number;
  private lastKey = '';
  private last?: ClimbStatus;
  private stripLabels: { b: HTMLButtonElement; id: string }[] = [];

  constructor(root: HTMLElement, private readonly j: Journey, private readonly a: ClimbHudActions) {
    this.el = document.createElement('div');
    this.el.className = 'ch';
    this.el.innerHTML = `
      <div class="ch-modes" role="group" data-i18n-aria="mode">
        <div class="ch-seg">
          <button type="button" data-mode="climb" data-i18n="mode.climb"></button>
          <button type="button" data-mode="overview" data-i18n="mode.overview"></button>
        </div>
        <div class="ch-seg">
          <button type="button" data-look="digital" data-i18n="look.digital"></button>
          <button type="button" data-look="satellite" data-i18n="look.satellite"></button>
        </div>
        <label class="ch-seg ch-lang">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="none" stroke="currentColor" stroke-width="1.8" d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/></svg>
          <span class="ch-lang-v"></span>
          <select data-i18n-aria="lang.label">${LANGS.map((l) => `<option value="${l.id}" lang="${l.id}">${l.name}</option>`).join('')}</select>
        </label>
        <div class="ch-seg ch-help"><button type="button" data-i18n-aria="tour.help" data-i18n-title="tour.help">?</button></div>
      </div>
      <section class="ch-status" aria-live="polite">
        <div class="ch-door"><span data-i18n="station"></span> <b class="ch-num"></b><span class="ch-of"></span></div>
        <div class="ch-alt"><span class="ch-alt-v"></span><span class="ch-alt-u"></span></div>
        <div class="ch-meta"></div>
        <div class="ch-stage"></div>
      </section>
      <div class="ch-nav">
        <button type="button" class="ch-up" data-i18n-aria="up.aria">${ARROW_UP}<span data-i18n="up"></span></button>
        <button type="button" class="ch-down" data-i18n-aria="down.aria">${ARROW_DOWN}<span data-i18n="down"></span></button>
      </div>
      <article class="ch-card">
        <div class="ch-card-n"></div>
        <div class="ch-card-body">
          <div class="ch-card-state"></div>
          <div class="ch-card-title"></div>
          <div class="ch-card-text"></div>
          <button type="button" class="ch-card-cta"></button>
        </div>
      </article>
      <figure class="ch-strip" dir="ltr" data-i18n-aria="strip.aria"></figure>`;
    applyI18n(this.el);
    root.appendChild(this.el);
    for (const ev of ['pointerdown', 'wheel', 'touchstart'] as const) {
      this.el.addEventListener(ev, (e) => { if (e.target !== this.el) e.stopPropagation(); }, { passive: true });
    }

    this.el.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => a.onMode(b.dataset.mode as 'climb' | 'overview')));
    this.el.querySelectorAll<HTMLButtonElement>('[data-look]').forEach((b) =>
      b.addEventListener('click', () => a.onLook(b.dataset.look as 'digital' | 'satellite')));
    this.$('.ch-card-cta').addEventListener('click', () => a.onRead());
    this.$('.ch-help button').addEventListener('click', () => a.onHelp());
    this.holdButton(this.$('.ch-up'), +1);
    this.holdButton(this.$('.ch-down'), -1);
    const select = this.$<HTMLSelectElement>('.ch-lang select');
    select.addEventListener('change', () => setLang(select.value as Lang));
    this.buildStrip();
    onLang(() => this.relabel(), true);
  }

  /** Re-apply the current language to everything this HUD shows. */
  private relabel(): void {
    applyI18n(this.el);
    const info = LANGS.find((l) => l.id === lang())!;
    this.$('.ch-lang-v').textContent = info.short;
    this.$<HTMLSelectElement>('.ch-lang select').value = info.id;
    for (const { b, id } of this.stripLabels) {
      b.textContent = stationName(id, true);
      b.title = stationName(id);
    }
    this.lastKey = '';
    if (this.last) this.update(this.last);
  }

  setMode(mode: 'climb' | 'overview'): void {
    this.el.dataset.mode = mode;
    this.el.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  }

  setLook(look: 'digital' | 'satellite'): void {
    this.el.querySelectorAll<HTMLButtonElement>('[data-look]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.look === look)));
  }

  /** Recolour the door ticks (after the opened count changes). */
  setStates(stateOf: (n: number) => DoorState): void {
    this.doorTicks.forEach((t, i) => t.setAttribute('class', `tick tick--${stateOf(i + 1)}`));
  }

  update(s: ClimbStatus): void {
    this.last = s;
    this.$('.ch-num').textContent = num(s.door);
    this.$('.ch-of').textContent = ` / ${num(s.total)}`;
    const [altV, altU] = splitUnit(t('unit.m', { v: num(s.elevation) }));
    this.$('.ch-alt-v').textContent = altV;
    this.$('.ch-alt-u').textContent = altU;
    this.$('.ch-meta').textContent = `${t('fromAzau', { km: km(s.distance) })} · ${t('walk', { t: duration(s.walkMinutes) })}`;
    this.$('.ch-stage').textContent = stageText(s.stage);
    this.marker.setAttribute('transform', `translate(${this.stripX(s.distance).toFixed(1)},0)`);

    const key = `${s.door}|${s.state}|${s.opened}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const card = this.$<HTMLElement>('.ch-card');
    card.dataset.state = s.state;
    this.$('.ch-card-n').textContent = t('num', { n: num(s.door) });
    this.$('.ch-card-state').textContent = t(`state.${s.state}`);
    const isOpen = s.state === 'open' || s.state === 'last';
    this.$('.ch-card-title').textContent = isOpen ? t('ph.title') : t('closed.title');
    this.$('.ch-card-text').textContent = isOpen
      ? t('ph.teaser')
      : s.state === 'next'
        ? t('next.teaser', { time: t('ph.time') })
        : t('closed.teaser', { date: t('ph.date'), ahead: plural('ahead', s.door - s.opened - 1) });
    this.$('.ch-card-cta').textContent = isOpen ? t('cta.read') : t('cta.remind');
  }

  private holdButton(btn: HTMLButtonElement, delta: number): void {
    let timer: number | undefined;
    const stop = () => {
      window.clearInterval(timer);
      timer = undefined;
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.a.onStep(delta);
      stop();
      // Hold to keep climbing: one station every 0.28 s after a short delay.
      timer = window.setTimeout(() => (timer = window.setInterval(() => this.a.onStep(delta), 280)), 380);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel'] as const) btn.addEventListener(ev, stop);
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.a.onStep(delta);
      }
    });
  }

  private buildStrip(): void {
    const W = 1000, H = 92, PT = 8, PB = 22;
    const D = this.j.pathD, P = this.j.path;
    const total = D[D.length - 1];
    const ys = P.map((p) => p[1]);
    const lo = Math.min(...ys), hi = Math.max(...ys);
    const X = (d: number) => (d / total) * W;
    const Y = (e: number) => PT + (1 - (e - lo) / (hi - lo)) * (H - PT - PB);
    this.stripX = X;
    const step = Math.max(1, Math.floor(P.length / 300));
    let line = '';
    for (let i = 0; i < P.length; i += step) line += `${X(D[i]).toFixed(1)},${Y(P[i][1]).toFixed(1)} `;
    line += `${X(total).toFixed(1)},${Y(P[P.length - 1][1]).toFixed(1)}`;

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.innerHTML = `<polygon class="area" points="0,${H - PB} ${line} ${W},${H - PB}"/><polyline class="edge" points="${line}"/>`;
    for (const door of this.j.doors) {
      const t = document.createElementNS(ns, 'line');
      const x = X(door.d), y = Y(door.elevation_m);
      t.setAttribute('x1', x.toFixed(1));
      t.setAttribute('x2', x.toFixed(1));
      t.setAttribute('y1', (y - 5).toFixed(1));
      t.setAttribute('y2', (y + 1).toFixed(1));
      svg.appendChild(t);
      this.doorTicks.push(t);
    }
    this.marker = document.createElementNS(ns, 'g');
    this.marker.setAttribute('class', 'marker');
    this.marker.innerHTML = `<line x1="0" x2="0" y1="${PT - 4}" y2="${H - PB}"/>`;
    svg.appendChild(this.marker);
    const fig = this.$('.ch-strip');
    fig.appendChild(svg);

    const labels = document.createElement('div');
    labels.className = 'ch-strip-labels';
    // Drop a station label that would collide with the next kept one (the summit wins).
    const kept: typeof this.j.stations = [];
    for (const [i, st] of this.j.stations.entries()) {
      const next = this.j.stations[i + 1];
      if (next && i + 1 === this.j.stations.length - 1 && (next.d - st.d) / total < 0.12) continue;
      if (kept.length && (st.d - kept[kept.length - 1].d) / total < 0.1) continue;
      kept.push(st);
    }
    for (const s of kept) {
      const b = document.createElement('button');
      b.type = 'button';
      this.stripLabels.push({ b, id: s.id });
      b.style.left = `${(X(s.d) / W) * 100}%`;
      b.addEventListener('click', () => {
        let best = 1, bd = Infinity;
        for (const door of this.j.doors) if (Math.abs(door.d - s.d) < bd) [best, bd] = [door.n, Math.abs(door.d - s.d)];
        this.a.onJump(best);
      });
      labels.appendChild(b);
    }
    fig.appendChild(labels);

    const pick = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const d = ((e.clientX - r.left) / r.width) * total;
      let best = 1, bd = Infinity;
      for (const door of this.j.doors) if (Math.abs(door.d - d) < bd) [best, bd] = [door.n, Math.abs(door.d - d)];
      this.a.onJump(best);
    };
    svg.addEventListener('click', pick);
  }
}

/** Split "3 516 м" into the number and the unit, so the unit can be set smaller. */
function splitUnit(s: string): [string, string] {
  const m = s.match(/^(.*\d)(\s*\D+)$/);
  return m ? [m[1], m[2]] : [s, ''];
}
