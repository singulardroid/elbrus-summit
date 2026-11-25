import type { DoorState } from './doors';
import { STATION_RU } from './climb';

/**
 * The story view: when you step onto a stone, its story takes over the frame (the 3D stays
 * behind it, dimmed, slowly circling the stone). Layout from the "Открытая история" artboard of
 * the "Вершина России — 250 историй" design: the article, and "Вы здесь" with the mountain of
 * 250 cells, your position and the next opening.
 */

export interface Story {
  n: number;
  title?: string;
  date?: string;
  rubric?: string;
  lead?: string;
  body?: string[];
  media?: { type: 'image' | 'video'; src: string; alt?: string; credit?: string };
}

export interface StoriesFile {
  opened?: number;
  nextOpensAt?: string | null;
  stories?: Story[];
}

export interface StoryContext {
  n: number;
  total: number;
  state: DoorState;
  opened: number;
  elevation: number;
  distance: number;
  stage: { at?: string; from?: string; to?: string };
  stateOf: (n: number) => DoorState;
}

export interface StoryActions {
  onClose(): void;
  onGo(n: number): void;
  shareUrl(n: number): string;
}

// The design's mountain: 29 columns, filled bottom-up, 250 cells.
const H = [2, 3, 4, 6, 7, 9, 11, 13, 14, 15, 15, 14, 12, 12, 13, 14, 14, 12, 11, 9, 8, 7, 6, 5, 4, 3, 3, 2, 2];

const nf = (n: number) => Math.round(n).toLocaleString('ru-RU');
const km = (m: number) => (m / 1000).toFixed(1).replace('.', ',');
function plural(n: number): string {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return 'историй';
  if (b === 1) return 'история';
  if (b >= 2 && b <= 4) return 'истории';
  return 'историй';
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class StoryView {
  readonly el: HTMLElement;
  private readonly stories = new Map<number, Story>();
  private nextOpensAt?: number;
  private ctx?: StoryContext;
  private cells: HTMLButtonElement[] = [];
  private timer?: number;
  private returnFocus?: Element | null;

  constructor(root: HTMLElement, data: StoriesFile, private readonly a: StoryActions) {
    for (const s of data.stories ?? []) this.stories.set(s.n, s);
    if (data.nextOpensAt) this.nextOpensAt = Date.parse(data.nextOpensAt);

    this.el = document.createElement('div');
    this.el.className = 'sv';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.setAttribute('aria-labelledby', 'sv-title');
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="sv-frame">
        <header class="sv-head">
          <button type="button" class="sv-btn sv-back">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M19 12H5M11 6l-6 6 6 6"/></svg>
            <span>Назад к горе</span>
          </button>
          <div class="sv-brand">Вершина России</div>
          <nav class="sv-nav" aria-label="Истории">
            <button type="button" class="sv-btn sv-prev"></button>
            <button type="button" class="sv-btn sv-next"></button>
          </nav>
        </header>
        <div class="sv-body">
          <article class="sv-article"></article>
          <aside class="sv-where" aria-label="Вы здесь">
            <div class="sv-label">Вы здесь</div>
            <div class="sv-grid" role="group" aria-label="Гора из 250 историй"></div>
            <div class="sv-scale"><span>2350 м</span><span class="sv-scale-n"></span><span>5642 м</span></div>
            <div class="sv-pos"></div>
            <div class="sv-next-box">
              <div class="sv-next-label"></div>
              <div class="sv-countdown"></div>
              <button type="button" class="sv-cta sv-remind">Напомнить об открытии</button>
            </div>
          </aside>
        </div>
      </div>`;
    root.appendChild(this.el);
    for (const ev of ['pointerdown', 'wheel', 'touchstart'] as const) {
      this.el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    }

    const grid = this.q('.sv-grid');
    let n = 0;
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < H.length; c++) {
        if (H[c] <= r) continue;
        n++;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sv-cell';
        b.style.gridColumn = String(c + 1);
        b.style.gridRow = String(15 - r);
        const k = n;
        b.addEventListener('click', () => this.a.onGo(k));
        grid.appendChild(b);
        this.cells[k - 1] = b;
      }
    }
    this.q('.sv-back').addEventListener('click', () => this.a.onClose());
    this.q('.sv-prev').addEventListener('click', () => this.ctx && this.ctx.n > 1 && this.a.onGo(this.ctx.n - 1));
    this.q('.sv-next').addEventListener('click', () => this.ctx && this.ctx.n < this.ctx.total && this.a.onGo(this.ctx.n + 1));
    this.q('.sv-remind').addEventListener('click', (e) => this.flash(e.currentTarget as HTMLButtonElement, 'Скоро: напоминания'));
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.a.onClose();
      else if (e.key === 'ArrowLeft' && this.ctx && this.ctx.n > 1) this.a.onGo(this.ctx.n - 1);
      else if (e.key === 'ArrowRight' && this.ctx && this.ctx.n < this.ctx.total) this.a.onGo(this.ctx.n + 1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  get current(): number | undefined {
    return this.isOpen ? this.ctx?.n : undefined;
  }

  open(ctx: StoryContext): void {
    const wasOpen = this.isOpen;
    const same = wasOpen && this.ctx?.n === ctx.n && this.ctx?.state === ctx.state;
    this.ctx = ctx;
    if (!wasOpen) {
      this.returnFocus = document.activeElement;
      this.el.hidden = false;
      this.el.classList.remove('is-in');
      void this.el.offsetWidth; // restart the entrance transition
      this.el.classList.add('is-in');
    }
    if (!same) this.render();
    this.updatePosition(ctx);
    if (!wasOpen) (this.q('.sv-back') as HTMLButtonElement).focus({ preventScroll: true });
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), 1000);
    this.tick();
  }

  close(): void {
    if (!this.isOpen) return;
    this.el.hidden = true;
    window.clearInterval(this.timer);
    (this.returnFocus as HTMLElement | null)?.focus?.({ preventScroll: true });
  }

  /** Keep "Вы здесь" current while the camera walks to another stone in the background. */
  updatePosition(ctx: Pick<StoryContext, 'elevation' | 'distance' | 'stage'>): void {
    const st = ctx.stage;
    const stage = st.at ? `Станция «${STATION_RU[st.at] ?? st.at}»`
      : `Участок ${STATION_RU[st.from ?? ''] ?? '…'} → ${STATION_RU[st.to ?? ''] ?? 'вершина'}`;
    this.q('.sv-pos').innerHTML = `<div class="sv-alt">${nf(ctx.elevation)}<span> м</span></div>
      <div class="sv-pos-meta">${km(ctx.distance)} км от Азау</div><div class="sv-pos-stage">${esc(stage)}</div>`;
  }

  private render(): void {
    const c = this.ctx!;
    const open = c.state === 'open' || c.state === 'last';
    const s = this.stories.get(c.n);
    this.el.dataset.state = c.state;
    const art = this.q('.sv-article');
    if (open) {
      const date = s?.date ? new Date(s.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '[ДАТА]';
      const media = s?.media
        ? s.media.type === 'video'
          ? `<video src="${esc(s.media.src)}" controls playsinline preload="metadata"></video>`
          : `<img src="${esc(s.media.src)}" alt="${esc(s.media.alt ?? '')}" loading="lazy">`
        : '<div class="sv-media-ph">[ФОТО ИЛИ ВИДЕО ИСТОРИИ]</div>';
      const body = (s?.body?.length ? s.body : ['[Основной текст истории. Достижение, человек, дата, высота, обстоятельства. Объём — на один экран чтения, чтобы историю хотелось дочитать и переслать.]'])
        .map((p) => `<p>${esc(p)}</p>`).join('');
      art.innerHTML = `
        <div class="sv-meta">
          <span class="sv-badge">№ ${c.n}</span>
          <span class="sv-sub">${c.state === 'last' ? 'Открыта последней' : 'Открыта'} ${esc(date)} · ${esc(s?.rubric ?? '[РУБРИКА]')}</span>
        </div>
        <h1 id="sv-title">${esc(s?.title ?? '[ЗАГОЛОВОК ИСТОРИИ]')}</h1>
        <figure class="sv-media">${media}${s?.media?.credit ? `<figcaption>${esc(s.media.credit)}</figcaption>` : ''}</figure>
        <p class="sv-lead">${esc(s?.lead ?? '[Лид: о чём эта история в двух предложениях.]')}</p>
        <div class="sv-text">${body}</div>
        <div class="sv-actions">
          <button type="button" class="sv-btn sv-share">Поделиться</button>
          <button type="button" class="sv-btn sv-copy">Скопировать ссылку</button>
        </div>`;
      art.querySelector('.sv-share')!.addEventListener('click', (e) => this.share(e.currentTarget as HTMLButtonElement, true));
      art.querySelector('.sv-copy')!.addEventListener('click', (e) => this.share(e.currentTarget as HTMLButtonElement, false));
    } else {
      const ahead = c.n - c.opened - 1;
      art.innerHTML = `
        <div class="sv-meta"><span class="sv-badge sv-badge--closed">№ ${c.n}</span>
          <span class="sv-sub">${c.state === 'next' ? 'Открывается следующей' : 'Закрыта'}</span></div>
        <div class="sv-locked">
          <svg class="sv-lock" viewBox="0 0 64 64" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"
            d="M20 54 14 30 26 14h12l12 16-6 24z M26 14l6 16 6-16 M14 30h36 M32 30v24"/></svg>
          <h1 id="sv-title">Эта дверца пока закрыта</h1>
          <p class="sv-lead">${c.state === 'next'
            ? 'Это следующая история на пути к вершине. Она откроется совсем скоро.'
            : `Откроется [ДАТА] в [ВРЕМЯ]. До неё ещё ${ahead} ${plural(ahead)}.`}</p>
          <div class="sv-countdown sv-countdown--big" ${c.state === 'next' ? '' : 'hidden'}></div>
          <button type="button" class="sv-cta sv-remind2">Напомнить об открытии</button>
        </div>`;
      art.querySelector('.sv-remind2')!.addEventListener('click', (e) => this.flash(e.currentTarget as HTMLButtonElement, 'Скоро: напоминания'));
    }
    (this.q('.sv-prev') as HTMLButtonElement).disabled = c.n <= 1;
    (this.q('.sv-next') as HTMLButtonElement).disabled = c.n >= c.total;
    this.q('.sv-prev').innerHTML = `<span aria-hidden="true">‹</span> № ${Math.max(1, c.n - 1)}`;
    this.q('.sv-next').innerHTML = `№ ${Math.min(c.total, c.n + 1)} <span aria-hidden="true">›</span>`;
    this.q('.sv-prev').setAttribute('aria-label', `Предыдущая история, № ${c.n - 1}`);
    this.q('.sv-next').setAttribute('aria-label', `Следующая история, № ${c.n + 1}`);
    this.q('.sv-scale-n').textContent = `история № ${c.n}`;
    this.q('.sv-next-label').textContent = `Следующая дверца, № ${Math.min(c.total, c.opened + 1)}`;
    this.cells.forEach((cell, i) => {
      const n = i + 1;
      cell.dataset.state = c.stateOf(n);
      cell.classList.toggle('is-here', n === c.n);
      cell.setAttribute('aria-label', `История ${n}`);
      cell.toggleAttribute('aria-current', n === c.n);
    });
    (this.q('.sv-frame') as HTMLElement).scrollTop = 0;
    this.q('.sv-article').classList.remove('is-swap');
    void (this.q('.sv-article') as HTMLElement).offsetWidth;
    this.q('.sv-article').classList.add('is-swap');
  }

  private tick(): void {
    const text = this.nextOpensAt ? countdown(this.nextOpensAt - Date.now()) : '[ВРЕМЯ]';
    this.el.querySelectorAll('.sv-countdown').forEach((e) => (e.textContent = text));
  }

  private async share(btn: HTMLButtonElement, native: boolean): Promise<void> {
    const url = this.a.shareUrl(this.ctx!.n);
    const label = btn.textContent;
    try {
      if (native && navigator.share) {
        await navigator.share({ title: `Вершина России · история № ${this.ctx!.n}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      this.flash(btn, 'Ссылка скопирована', label ?? '');
    } catch {
      /* cancelled */
    }
  }

  private flash(btn: HTMLButtonElement, text: string, back = btn.textContent ?? ''): void {
    btn.textContent = text;
    setTimeout(() => (btn.textContent = back), 1800);
  }

  private q(sel: string): Element {
    return this.el.querySelector(sel)!;
  }
}

function countdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
