import { formatLatLon, type Poi, type Route } from './data';
import { category, CATEGORY, categoryPlural, ICON } from './icons';
import { applyI18n, distance, lang, loc, metres, num, onLang, t } from './i18n';

/**
 * Place and route details, and the list of all routes and places.
 * Wide screens: a panel on the left. Narrow screens: a bottom sheet (tap the handle to expand,
 * drag it down to close).
 */

export interface PanelActions {
  onSelect(poi: Poi): void;
  onSelectRoute(route: Route): void;
  onFlyTo(poi: Poi): void;
  onClose(): void;
  shareUrl(item: { kind: 'poi' | 'route'; id: string }): string;
  /** Pointer over the elevation profile at this distance along the route (undefined: left it). */
  onProfileHover(route: Route, distanceM?: number): void;
  /** The panel's size or visibility changed (the 3D view re-centres around it). */
  onLayout(): void;
}

export type PanelMode = 'closed' | 'place' | 'route' | 'list';

const fmtM = metres;
const fmtKm = distance;
/** The other name shown under the title: the Russian original for other languages, else English. */
const altName = (n: Record<string, string | undefined>) => {
  const other = lang() === 'ru' ? n.en : n.ru;
  return other && other !== loc(n) ? other : undefined;
};

export class Panel {
  readonly el: HTMLElement;
  private readonly body: HTMLElement;
  private readonly title: HTMLElement;
  private readonly backBtn: HTMLButtonElement;
  private mode: PanelMode = 'closed';
  private expanded = false;
  private shown?: { kind: 'place'; poi: Poi } | { kind: 'route'; route: Route };

  constructor(
    root: HTMLElement,
    private readonly pois: Poi[],
    private readonly routes: Route[],
    private readonly actions: PanelActions,
  ) {
    this.el = document.createElement('aside');
    this.el.className = 'eu-panel';
    this.el.setAttribute('data-i18n-aria', 'details');
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="eu-panel-handle" role="button" tabindex="-1" data-i18n-aria="toggleSheet"><span></span></div>
      <header class="eu-panel-head">
        <button type="button" class="eu-icon-btn eu-panel-back" data-i18n-aria="allPlacesBack" hidden>${ICON.back}</button>
        <h2 class="eu-panel-title"></h2>
        <button type="button" class="eu-icon-btn eu-panel-close" data-i18n-aria="close">${ICON.close}</button>
      </header>
      <div class="eu-panel-body"></div>`;
    root.appendChild(this.el);
    this.body = this.el.querySelector('.eu-panel-body')!;
    this.title = this.el.querySelector('.eu-panel-title')!;
    this.backBtn = this.el.querySelector('.eu-panel-back')!;

    this.el.querySelector('.eu-panel-close')!.addEventListener('click', () => this.actions.onClose());
    this.backBtn.addEventListener('click', () => this.showList());
    // Panel interactions must not reach the 3D controls underneath.
    for (const ev of ['pointerdown', 'wheel', 'touchstart'] as const) {
      this.el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    }
    this.setupSheetGestures();
    onLang(() => {
      applyI18n(this.el);
      if (this.mode === 'list') this.showList();
      else if (this.mode === 'place' && this.shown?.kind === 'place') this.showPlace(this.shown.poi);
      else if (this.mode === 'route' && this.shown?.kind === 'route') this.showRoute(this.shown.route);
    }, true);
    new ResizeObserver(() => this.actions.onLayout()).observe(this.el);
  }

  get state(): PanelMode {
    return this.mode;
  }

  /** Is the panel laid out as a bottom sheet (narrow screens)? */
  get isSheet(): boolean {
    return this.el.offsetParent !== null && getComputedStyle(this.el).getPropertyValue('--eu-sheet').trim() === '1';
  }

  showPlace(poi: Poi): void {
    this.setMode('place');
    this.shown = { kind: 'place', poi };
    const cat = category(poi.category);
    const alt = altName(poi.name);
    this.title.textContent = loc(poi.name, poi.id);
    this.backBtn.hidden = false;

    const nearby = this.pois
      .filter((p) => p !== poi)
      .map((p) => ({ p, d: Math.hypot(p.position[0] - poi.position[0], p.position[2] - poi.position[2]) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 4);

    const desc = loc(poi.description) || undefined;
    const onRoutes = this.routes.filter((r) => r.stops.includes(poi.id));
    const osm = poi.source?.startsWith('osm:') ? poi.source.slice(4) : undefined;
    this.body.innerHTML = `
      <div class="eu-chip">${cat.icon}<span></span></div>
      ${alt ? `<p class="eu-alt-name" lang="${lang() === 'ru' ? 'en' : 'ru'}"></p>` : ''}
      <dl class="eu-facts">
        <div><dt>${t('elevation')}${poi.approximate ? ' (≈)' : ''}</dt><dd class="eu-f-ele"></dd></div>
        <div><dt>${t('coords')}</dt><dd class="eu-f-coord" dir="ltr"></dd></div>
      </dl>
      ${poi.image ? '<img class="eu-photo" alt="" loading="lazy">' : ''}
      ${desc ? '<p class="eu-desc"></p>' : ''}
      <div class="eu-actions">
        <button type="button" class="eu-btn-text eu-a-fly">${ICON.target}<span>${t('show')}</span></button>
        <button type="button" class="eu-btn-text eu-a-share">${ICON.share}<span>${t('share')}</span></button>
        ${osm ? `<a class="eu-btn-text eu-a-osm" target="_blank" rel="noopener noreferrer">${ICON.external}<span>OpenStreetMap</span></a>` : ''}
      </div>
      ${onRoutes.length ? `<h3 class="eu-sub">${t('routes')}</h3><ul class="eu-list eu-routes"></ul>` : ''}
      <h3 class="eu-sub">${t('nearby')}</h3>
      <ul class="eu-list eu-nearby"></ul>`;

    this.q('.eu-chip span').textContent = cat.label;
    if (alt) this.q('.eu-alt-name').textContent = alt;
    this.q('.eu-f-ele').textContent = fmtM(poi.elevation_m);
    this.q('.eu-f-coord').textContent = formatLatLon(poi.lonlat[0], poi.lonlat[1]).replace(', ', '\n');
    if (poi.image) (this.q('.eu-photo') as HTMLImageElement).src = poi.image;
    if (desc) this.q('.eu-desc').textContent = desc;
    if (osm) (this.q('.eu-a-osm') as HTMLAnchorElement).href = `https://www.openstreetmap.org/${osm}`;
    this.q('.eu-a-fly').addEventListener('click', () => this.actions.onFlyTo(poi));
    this.q('.eu-a-share').addEventListener('click', (e) =>
      this.share(loc(poi.name, poi.id), this.actions.shareUrl({ kind: 'poi', id: poi.id }), e.currentTarget as HTMLButtonElement));
    if (onRoutes.length) {
      const rl = this.q('.eu-routes');
      for (const r of onRoutes) rl.appendChild(this.routeItem(r));
    }

    const list = this.q('.eu-nearby');
    for (const { p, d } of nearby) list.appendChild(this.placeItem(p, fmtKm(d)));
    this.body.scrollTop = 0;
  }

  showRoute(route: Route): void {
    this.setMode('route');
    this.shown = { kind: 'route', route };
    const alt = altName(route.name);
    this.title.textContent = loc(route.name, route.id);
    this.backBtn.hidden = false;
    const desc = loc(route.description) || undefined;
    this.body.innerHTML = `
      <div class="eu-chip eu-chip--route">${ICON.route}<span>${t('route')}</span></div>
      ${alt ? `<p class="eu-alt-name" lang="${lang() === 'ru' ? 'en' : 'ru'}"></p>` : ''}
      <dl class="eu-facts">
        <div><dt>${t('length')}</dt><dd class="eu-r-len"></dd></div>
        <div><dt>${t('onFoot')}</dt><dd class="eu-r-foot"></dd></div>
        <div><dt>${t('ascentFoot')}</dt><dd class="eu-r-asc"></dd></div>
        <div><dt>${t('highPoint')}</dt><dd class="eu-r-high"></dd></div>
      </dl>
      <figure class="eu-profile" dir="ltr" aria-label="${t('profile')}"></figure>
      ${desc ? '<p class="eu-desc"></p>' : ''}
      <p class="eu-note">${t('routeNote')}</p>
      <div class="eu-actions">
        <button type="button" class="eu-btn-text eu-a-share">${ICON.share}<span>${t('share')}</span></button>
      </div>
      <h3 class="eu-sub">${t('stages')}</h3>
      <ol class="eu-stages"></ol>
      <h3 class="eu-sub">${t('stops')}</h3>
      <ul class="eu-list eu-stops"></ul>`;

    if (alt) this.q('.eu-alt-name').textContent = alt;
    this.q('.eu-r-len').textContent = fmtKm(route.lengthM);
    this.q('.eu-r-foot').textContent = fmtKm(route.footLengthM);
    this.q('.eu-r-asc').textContent = fmtM(route.footAscentM);
    this.q('.eu-r-high').textContent = fmtM(route.highM);
    if (desc) this.q('.eu-desc').textContent = desc;
    this.q('.eu-profile').appendChild(this.profile(route));
    this.q('.eu-a-share').addEventListener('click', (e) =>
      this.share(loc(route.name, route.id), this.actions.shareUrl({ kind: 'route', id: route.id }), e.currentTarget as HTMLButtonElement));

    const stages = this.q('.eu-stages');
    for (const seg of route.segments) {
      const li = document.createElement('li');
      li.className = `eu-stage eu-stage--${seg.mode}`;
      li.innerHTML = `<span class="eu-li-icon">${seg.mode === 'lift' ? CATEGORY.lift.icon : ICON.walk}</span>
        <span class="eu-stage-text"><span class="eu-stage-name"></span><span class="eu-stage-meta"></span></span>`;
      (li.querySelector('.eu-stage-name') as HTMLElement).textContent = loc(seg.name);
      (li.querySelector('.eu-stage-meta') as HTMLElement).textContent =
        `${fmtKm(seg.lengthM)} · ${t('range', { a: fmtM(seg.fromM), b: fmtM(seg.toM) })}`;
      stages.appendChild(li);
    }
    const stops = this.q('.eu-stops');
    for (const id of route.stops) {
      const p = this.pois.find((x) => x.id === id);
      if (p) stops.appendChild(this.placeItem(p, fmtM(p.elevation_m)));
    }
    this.body.scrollTop = 0;
  }

  /** Elevation profile: foot sections in red, cable cars in grey; hover/drag shows a marker on the map. */
  private profile(route: Route): SVGSVGElement {
    const W = 320, H = 120, PL = 34, PR = 6, PT = 8, PB = 18;
    const pts = route.profile;
    const maxD = pts[pts.length - 1][0];
    const lo = Math.floor(Math.min(...pts.map((p) => p[1])) / 500) * 500;
    const hi = Math.ceil(Math.max(...pts.map((p) => p[1])) / 500) * 500;
    const X = (d: number) => PL + (d / maxD) * (W - PL - PR);
    const Y = (e: number) => PT + (1 - (e - lo) / (hi - lo)) * (H - PT - PB);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.classList.add('eu-profile-svg');

    let html = '';
    for (let e = lo; e <= hi; e += 500) {
      html += `<line class="grid" x1="${PL}" x2="${W - PR}" y1="${Y(e)}" y2="${Y(e)}"/>`;
      if ((e - lo) % 1000 === 0 || hi - lo <= 2000) html += `<text class="ylab" x="${PL - 4}" y="${Y(e) + 3}">${num(e)}</text>`;
    }
    // One filled area per run of the same mode.
    let start = 0;
    for (let i = 1; i <= pts.length; i++) {
      const mode = route.segments[pts[start][2]].mode;
      if (i < pts.length && route.segments[pts[i][2]].mode === mode) continue;
      const run = pts.slice(start, Math.min(i + 1, pts.length));
      const line = run.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
      html += `<polygon class="area area--${mode}" points="${X(run[0][0]).toFixed(1)},${H - PB} ${line} ${X(run[run.length - 1][0]).toFixed(1)},${H - PB}"/>`;
      html += `<polyline class="edge edge--${mode}" points="${line}"/>`;
      start = i;
    }
    html += `<text class="xlab" x="${PL}" y="${H - 4}">0</text><text class="xlab end" x="${W - PR}" y="${H - 4}">${fmtKm(maxD)}</text>`;
    html += `<g class="cursor" visibility="hidden"><line y1="${PT}" y2="${H - PB}"/><circle r="3.5"/><text class="clab" y="${PT + 9}"></text></g>`;
    svg.innerHTML = html;

    const cursor = svg.querySelector('.cursor') as SVGGElement;
    const move = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * W;
      const d = clamp(((x - PL) / (W - PL - PR)) * maxD, 0, maxD);
      let k = 0;
      while (k < pts.length - 1 && pts[k + 1][0] < d) k++;
      const p = pts[k];
      cursor.setAttribute('visibility', 'visible');
      cursor.querySelector('line')!.setAttribute('x1', String(X(p[0])));
      cursor.querySelector('line')!.setAttribute('x2', String(X(p[0])));
      cursor.querySelector('circle')!.setAttribute('cx', String(X(p[0])));
      cursor.querySelector('circle')!.setAttribute('cy', String(Y(p[1])));
      const t = cursor.querySelector('text')!;
      t.textContent = `${fmtKm(p[0])} · ${fmtM(p[1])}`;
      const tx = X(p[0]);
      t.setAttribute('x', String(tx > W / 2 ? tx - 6 : tx + 6));
      t.setAttribute('text-anchor', tx > W / 2 ? 'end' : 'start');
      this.actions.onProfileHover(route, p[0]);
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointerleave', () => {
      cursor.setAttribute('visibility', 'hidden');
      this.actions.onProfileHover(route, undefined);
    });
    return svg;
  }

  showList(): void {
    this.setMode('list');
    this.title.textContent = t('listTitle');
    this.backBtn.hidden = true;
    this.body.innerHTML = '';
    if (this.routes.length) {
      const h = document.createElement('h3');
      h.className = 'eu-sub';
      h.textContent = t('routes');
      const ul = document.createElement('ul');
      ul.className = 'eu-list';
      this.routes.forEach((r) => ul.appendChild(this.routeItem(r)));
      this.body.append(h, ul);
    }
    const groups = new Map<string, Poi[]>();
    for (const p of this.pois) groups.set(p.category, [...(groups.get(p.category) ?? []), p]);
    const order = [...groups.keys()].sort((a, b) => category(a).order - category(b).order);
    for (const c of order) {
      const h = document.createElement('h3');
      h.className = 'eu-sub';
      h.textContent = categoryPlural(c);
      const ul = document.createElement('ul');
      ul.className = 'eu-list';
      groups.get(c)!
        .sort((a, b) => b.elevation_m - a.elevation_m)
        .forEach((p) => ul.appendChild(this.placeItem(p, fmtM(p.elevation_m))));
      this.body.append(h, ul);
    }
    this.body.scrollTop = 0;
  }

  close(): void {
    this.setMode('closed');
  }

  // --- internals -------------------------------------------------------------------------

  private q(sel: string): HTMLElement {
    return this.body.querySelector(sel) as HTMLElement;
  }

  private setMode(mode: PanelMode): void {
    const was = this.mode;
    this.mode = mode;
    this.el.hidden = mode === 'closed';
    this.el.dataset.mode = mode;
    if (mode === 'closed') this.setExpanded(false);
    if (was !== mode) this.actions.onLayout();
  }

  private placeItem(p: Poi, meta: string): HTMLLIElement {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'eu-list-item';
    b.innerHTML = `<span class="eu-li-icon">${category(p.category).icon}</span><span class="eu-li-name"></span><span class="eu-li-meta"></span>`;
    (b.querySelector('.eu-li-name') as HTMLElement).textContent = loc(p.name, p.id);
    (b.querySelector('.eu-li-meta') as HTMLElement).textContent = meta;
    b.addEventListener('click', () => this.actions.onSelect(p));
    li.appendChild(b);
    return li;
  }

  private routeItem(r: Route): HTMLLIElement {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'eu-list-item';
    b.innerHTML = `<span class="eu-li-icon eu-li-icon--route">${ICON.route}</span><span class="eu-li-name"></span><span class="eu-li-meta"></span>`;
    (b.querySelector('.eu-li-name') as HTMLElement).textContent = loc(r.name, r.id);
    (b.querySelector('.eu-li-meta') as HTMLElement).textContent = fmtKm(r.lengthM);
    b.addEventListener('click', () => this.actions.onSelectRoute(r));
    li.appendChild(b);
    return li;
  }

  private async share(title: string, url: string, btn: HTMLButtonElement): Promise<void> {
    const label = btn.querySelector('span')!;
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      label.textContent = t('copied');
    } catch {
      label.textContent = t('copyFailed');
    }
    setTimeout(() => (label.textContent = t('share')), 1800);
  }

  private setExpanded(on: boolean): void {
    this.expanded = on;
    this.el.classList.toggle('is-expanded', on);
  }

  /** Bottom sheet: tap the handle to expand/collapse, drag down to close. */
  private setupSheetGestures(): void {
    const handle = this.el.querySelector('.eu-panel-handle') as HTMLElement;
    let startY = 0, dy = 0, dragging = false;
    handle.addEventListener('pointerdown', (e) => {
      dragging = true;
      startY = e.clientY;
      dy = 0;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety; the gesture still works without it */
      }
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      dy = e.clientY - startY;
      if (dy > 0) this.el.style.transform = `translateY(${dy}px)`;
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      this.el.style.transform = '';
      if (dy > 70) {
        if (this.expanded) this.setExpanded(false);
        else this.actions.onClose();
      } else if (dy < -40) this.setExpanded(true);
      else if (Math.abs(dy) < 6) this.setExpanded(!this.expanded);
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
}

function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}
