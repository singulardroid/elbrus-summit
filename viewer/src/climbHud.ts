import type { Journey } from './data';
import type { DoorState } from './doors';
import { addStrings, applyI18n, duration, km, LANGS, lang, num, onLang, plural, setLang, stationName, t, type Lang } from './i18n';

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

const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm9 4.6v-2.2l-2.4-.5a7 7 0 0 0-.7-1.7l1.4-2-1.6-1.6-2 1.4a7 7 0 0 0-1.7-.7L13.5 3h-2.2l-.5 2.4a7 7 0 0 0-1.7.7l-2-1.4-1.6 1.6 1.4 2a7 7 0 0 0-.7 1.7L3 10.9v2.2l2.4.5c.2.6.4 1.2.7 1.7l-1.4 2 1.6 1.6 2-1.4c.5.3 1.1.5 1.7.7l.5 2.4h2.2l.5-2.4c.6-.2 1.2-.4 1.7-.7l2 1.4 1.6-1.6-1.4-2c.3-.5.5-1.1.7-1.7z"/></svg>';

addStrings({
  ru: { 'menu.settings': 'Настройки: вид, язык, время и погода, справка', 'pill.aria': 'Станция и история: открыть или скрыть' },
  en: { 'menu.settings': 'Settings: look, language, time and weather, help', 'pill.aria': 'Station and story: show or hide' },
  zh: { 'menu.settings': '设置：外观、语言、时间与天气、帮助', 'pill.aria': '站点与故事：展开或收起' },
  ar: { 'menu.settings': 'الإعدادات: المظهر واللغة والوقت والطقس والمساعدة', 'pill.aria': 'المحطة والقصة: إظهار أو إخفاء' },
});

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
          <button type="button" class="ch-card-title"></button>
          <div class="ch-card-text"></div>
          <button type="button" class="ch-card-cta"></button>
        </div>
      </article>
      <figure class="ch-strip" dir="ltr" data-i18n-aria="strip.aria"></figure>
      <div class="ch-menu" role="group"></div>
      <div class="ch-pop"></div>
      <div class="ch-pill"><button type="button" class="ch-pill-mid" aria-expanded="false" data-i18n-aria="pill.aria"></button></div>`;
    // Phones: one settings button (⚙) at the right of the top row.
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'ch-more';
    more.setAttribute('aria-expanded', 'false');
    more.dataset.i18nAria = 'menu.settings';
    more.dataset.i18nTitle = 'menu.settings';
    more.innerHTML = GEAR;
    this.$('.ch-modes').append(more);
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
    // The story's title is the way in (no separate Read button for open stations).
    this.$('.ch-card-title').addEventListener('click', () => {
      if (this.el.dataset.state === 'open' || this.el.dataset.state === 'last') a.onRead();
    });
    this.$('.ch-help button').addEventListener('click', () => a.onHelp());
    this.holdButton(this.$('.ch-up'), +1);
    this.holdButton(this.$('.ch-down'), -1);
    const select = this.$<HTMLSelectElement>('.ch-lang select');
    select.addEventListener('change', () => setLang(select.value as Lang));
    this.buildStrip();
    onLang(() => this.relabel(), true);

    more.addEventListener('click', () => this.setMenu(!this.el.classList.contains('menu-open')));
    this.$('.ch-pill-mid').addEventListener('click', () => this.setPill(!this.el.classList.contains('pill-open')));
    // A tap anywhere else closes the menu (on the map, or on another HUD control: the HUD stops
    // taps from reaching the page, hence the capture listener on it too).
    const closeMenu = (e: Event) => {
      const tg = e.target as Node;
      if (this.el.classList.contains('menu-open') && !this.$('.ch-menu').contains(tg) && !more.contains(tg)) this.setMenu(false);
    };
    document.addEventListener('pointerdown', closeMenu);
    this.el.addEventListener('pointerdown', closeMenu, true);
    this.phone.addEventListener('change', () => this.layout());
    this.layout();
  }

  // --- phones: the pill and the settings menu ---------------------------------------------------
  // On narrow screens the station card, the story card and the up/down buttons merge into a pill at
  // the bottom (↓ № · altitude ↑); tapping it opens the stage, the story and the route strip above
  // it. Look, language, time/weather and help move behind one ⚙ button. The same live elements are
  // moved between the desktop and the phone places (never copied), so everything stays in sync.
  private readonly phone = window.matchMedia('(max-width: 700px)');
  private readonly homes = new Map<Element, Comment>();

  /** Put each element in its phone or desktop place. Called on mode and screen-size changes. */
  private layout(): void {
    const phone = this.phone.matches, climb = this.el.dataset.mode !== 'overview';
    const menu = this.$('.ch-menu'), pill = this.$('.ch-pill'), pop = this.$('.ch-pop'), mid = this.$('.ch-pill-mid');
    const sky = this.el.parentElement?.querySelector('.sky-clock');
    const lookSeg = this.$('[data-look]')?.parentElement ?? null;
    this.place([lookSeg, this.$('.ch-lang'), sky ?? null, this.$('.ch-help')], phone ? menu : null);
    this.place([this.$('.ch-down')], phone && climb ? pill : null, pill.firstChild);
    this.place([this.$('.ch-card-n'), this.$('.ch-alt')], phone && climb ? mid : null);
    this.place([this.$('.ch-up')], phone && climb ? pill : null);
    this.place([this.$('.ch-stage'), this.$('.ch-card-body'), this.$('.ch-strip')], phone && climb ? pop : null);
    if (!phone) { this.setMenu(false); this.setPill(false); }
  }

  /** Move elements into `parent` (before `before`), or back to where they came from (parent null). */
  private place(els: (Element | null)[], parent: Element | null, before: Node | null = null): void {
    for (const e of els) {
      if (!e) continue;
      if (parent) {
        if (!this.homes.has(e)) {
          const mark = document.createComment('home');
          e.before(mark);
          this.homes.set(e, mark);
        }
        if (e.parentElement !== parent) parent.insertBefore(e, before);
      } else {
        const mark = this.homes.get(e);
        if (mark) { mark.replaceWith(e); this.homes.delete(e); }
      }
    }
  }

  /** Open or close the phone settings menu. */
  setMenu(open: boolean): void {
    this.el.classList.toggle('menu-open', open);
    this.$('.ch-more').setAttribute('aria-expanded', String(open));
  }

  /** Open or close the pill's panel (stage, story, strip). */
  setPill(open: boolean): void {
    this.el.classList.toggle('pill-open', open);
    this.$('.ch-pill-mid').setAttribute('aria-expanded', String(open));
  }

  /** True on phone-width screens (the pill layout). */
  get isPhone(): boolean {
    return this.phone.matches;
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
    this.layout();
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
    this.el.dataset.state = s.state; // the pill and its panel (phones) show it too
    this.$('.ch-card-n').textContent = t('num', { n: num(s.door) });
    this.$('.ch-card-state').textContent = t(`state.${s.state}`);
    const isOpen = s.state === 'open' || s.state === 'last';
    const title = this.$<HTMLButtonElement>('.ch-card-title');
    title.textContent = isOpen ? t('ph.title') : t('closed.title');
    title.classList.toggle('is-link', isOpen);
    title.tabIndex = isOpen ? 0 : -1;
    title.title = isOpen ? t('cta.read') : '';
    if (isOpen) title.setAttribute('aria-label', `${title.textContent}. ${t('cta.read')}`);
    else title.removeAttribute('aria-label');
    title.setAttribute('aria-disabled', String(!isOpen));
    this.$('.ch-card-text').textContent = isOpen
      ? t('ph.teaser')
      : s.state === 'next'
        ? t('next.teaser', { time: t('ph.time') })
        : t('closed.teaser', { date: t('ph.date'), ahead: plural('ahead', s.door - s.opened - 1) });
    // Only closed stations keep a button (the reminder); open ones are read from the title.
    const cta = this.$<HTMLButtonElement>('.ch-card-cta');
    cta.textContent = t('cta.remind');
    cta.hidden = isOpen;
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
