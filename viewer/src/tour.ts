import { STATE_COLOR } from './stones';
import { addStrings, LANGS, lang, metres, num, onLang, setLang, t, type Lang } from './i18n';

/**
 * The first-visit guide: a welcome card over the slowly turning mountain, then one step per
 * control (a soft spotlight on it and a card next to it), a walk down to station 1 to explain
 * the climb, and a finish with "Start at station 1" / "Newest story".
 *
 * The overlay lets pointer events through, so visitors can try each control while it is
 * explained. Shown once (remembered in localStorage); `?tour` forces it; the ? button replays it.
 */

export interface TourHost {
  /** The free overview at the home view, turning slowly. */
  showMountain(): void;
  /** The climb, standing at station n (no story opens). */
  showStation(n: number): void;
  /** Leave the guide by walking to station n (its story opens when you arrive, if it is open). */
  walkTo(n: number): void;
  /** How many stories are open (the newest is this number). */
  opened(): number;
  /** The guide is on screen: the map holds back stories opening by themselves. */
  setActive(on: boolean): void;
  /** Phones: open the settings menu and/or the pill's panel, so the guide can point into them. */
  phonePanels?(menu: boolean, pill: boolean): void;
}

type Place = 'auto' | 'center' | 'bottom';
interface Step {
  id: string;
  target?: string; // CSS selector of the control to spotlight
  mode?: 'overview' | 'climb';
  place?: Place;
  gesture?: boolean; // the body has mouse / touch variants
  legend?: boolean; // show the stone colours
  /** On phones (the pill layout): what to point at, which panel to open, phone wording. */
  phone?: { target: string; panel?: 'menu' | 'pill'; text?: boolean };
}

const STEPS: Step[] = [
  { id: 'welcome', mode: 'overview', place: 'center' },
  { id: 'mountain', mode: 'overview', place: 'bottom', gesture: true },
  { id: 'places', mode: 'overview', target: '.eu-controls' },
  { id: 'modes', target: '.ch-modes .ch-seg:nth-child(1)' },
  { id: 'look', target: '.ch-modes .ch-seg:nth-child(2)', phone: { target: '.ch-menu', panel: 'menu', text: true } },
  { id: 'lang', target: '.ch-lang', phone: { target: '.ch-menu', panel: 'menu', text: true } },
  { id: 'status', mode: 'climb', target: '.ch-status', phone: { target: '.ch-pill', text: true } },
  { id: 'stones', mode: 'climb', place: 'bottom', gesture: true, legend: true },
  { id: 'nav', mode: 'climb', target: '.ch-nav', gesture: true, phone: { target: '.ch-pill' } },
  { id: 'card', mode: 'climb', target: '.ch-card', phone: { target: '.ch-pop', panel: 'pill', text: true } },
  { id: 'strip', mode: 'climb', target: '.ch-strip', phone: { target: '.ch-pop .ch-strip', panel: 'pill', text: true } },
  { id: 'final', place: 'center' },
];

const STORE_KEY = 'elbrus.tour.done';
/** Phone-width screens use the pill layout (climbHud.ts). */
const isPhone = () => window.matchMedia('(max-width: 700px)').matches;

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(STORE_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(STORE_KEY, '1');
  } catch {
    /* not remembered: the guide shows again next time */
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

export class Tour {
  readonly el: HTMLElement;
  private readonly spot: HTMLElement;
  private readonly card: HTMLElement;
  private i = -1;
  private mode?: 'overview' | 'climb';
  private raf = 0;
  private readonly touch = matchMedia('(pointer: coarse)').matches;

  constructor(private readonly root: HTMLElement, private readonly host: TourHost) {
    this.el = document.createElement('div');
    this.el.className = 'tour';
    this.el.hidden = true;
    this.el.innerHTML = `<div class="tour-spot"></div><section class="tour-card" role="dialog" aria-labelledby="tour-title"></section>`;
    this.spot = this.el.querySelector('.tour-spot')!;
    this.card = this.el.querySelector('.tour-card')!;
    root.appendChild(this.el);
    // Clicks and drags on the card stay on the card.
    for (const ev of ['pointerdown', 'wheel', 'touchstart'] as const) {
      this.card.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    }
    onLang(() => this.isOpen && this.render());
  }

  get isOpen(): boolean {
    return this.i >= 0;
  }

  start(): void {
    this.mode = undefined;
    this.host.setActive(true);
    this.el.hidden = false;
    window.addEventListener('keydown', this.onKey, true);
    this.go(0);
    const loop = () => {
      this.place();
      this.raf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(loop);
  }

  /** Close the guide. `then`: where to leave the visitor. */
  private finish(then: 'station1' | 'newest' | 'stay'): void {
    markSeen();
    this.i = -1;
    this.el.hidden = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey, true);
    this.host.setActive(false);
    this.host.phonePanels?.(false, false);
    if (then === 'station1') this.host.walkTo(1);
    else if (then === 'newest') this.host.walkTo(Math.max(1, this.host.opened()));
  }

  private go(i: number): void {
    this.i = Math.max(0, Math.min(STEPS.length - 1, i));
    const step = STEPS[this.i];
    if (step.mode && step.mode !== this.mode) {
      this.mode = step.mode;
      if (step.mode === 'overview') this.host.showMountain();
      else this.host.showStation(1);
    }
    const panel = isPhone() ? step.phone?.panel : undefined;
    this.host.phonePanels?.(panel === 'menu', panel === 'pill');
    this.render();
    this.place();
    (this.card.querySelector('.tour-primary') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  private render(): void {
    const step = STEPS[this.i];
    const id = step.id;
    const middle = STEPS.length - 2; // steps between the welcome and the finish
    const k = (s: string) => `tour.${id}.${s}`;
    const body = isPhone() && step.phone?.text ? t(k('phone'))
      : step.gesture ? t(k(this.touch ? 'touch' : 'mouse')) : t(k('body'), { lo: metres(2358), hi: metres(5642) });
    let html = `
      <div class="tour-top">
        ${id !== 'welcome' && id !== 'final' ? `<span class="tour-count">${esc(t('tour.count', { i: num(this.i), n: num(middle) }))}</span>` : '<span></span>'}
        <button type="button" class="tour-x" aria-label="${esc(t('tour.close'))}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </div>
      <h2 id="tour-title">${esc(t(k('title')))}</h2>
      <p class="tour-body">${esc(body)}</p>`;
    if (step.legend) {
      html += `<ul class="tour-legend">${(['open', 'last', 'next', 'closed'] as const)
        .map((s) => `<li><span class="tour-dot" style="--c:${hex(STATE_COLOR[s])}"></span>${esc(t(`state.${s}`))}</li>`).join('')}</ul>`;
    }
    if (id === 'welcome') {
      html += `<div class="tour-langs" role="group" aria-label="${esc(t('lang.label'))}">${LANGS
        .map((l) => `<button type="button" lang="${l.id}" data-lang="${l.id}" aria-pressed="${l.id === lang()}">${esc(l.name)}</button>`).join('')}</div>
        <div class="tour-actions">
          <button type="button" class="tour-btn tour-secondary" data-act="station1">${esc(t('tour.skip'))}</button>
          <button type="button" class="tour-btn tour-primary" data-act="next">${esc(t('tour.start'))}</button>
        </div>`;
    } else if (id === 'final') {
      html += `<div class="tour-actions">
          <button type="button" class="tour-btn tour-secondary" data-act="newest">${esc(t('tour.newest', { n: num(this.host.opened()) }))}</button>
          <button type="button" class="tour-btn tour-primary" data-act="station1">${esc(t('tour.first'))}</button>
        </div>`;
    } else {
      html += `<div class="tour-actions">
          <button type="button" class="tour-link" data-act="station1">${esc(t('tour.toStation1'))} <span class="tour-arrow" aria-hidden="true">→</span></button>
          <span class="tour-gap"></span>
          <button type="button" class="tour-btn tour-secondary" data-act="back">${esc(t('tour.back'))}</button>
          <button type="button" class="tour-btn tour-primary" data-act="next">${esc(t('tour.next'))}</button>
        </div>
        <div class="tour-dots" aria-hidden="true">${Array.from({ length: middle }, (_, j) => `<span class="${j + 1 === this.i ? 'is-on' : ''}"></span>`).join('')}</div>`;
    }
    this.card.innerHTML = html;
    this.card.dataset.step = id;
    this.el.dataset.step = id;
    this.card.querySelector('.tour-x')!.addEventListener('click', () => this.finish(this.mode === 'climb' ? 'stay' : 'station1'));
    this.card.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => b.addEventListener('click', () => {
      const act = b.dataset.act;
      if (act === 'next') this.go(this.i + 1);
      else if (act === 'back') this.go(this.i - 1);
      else this.finish(act as 'station1' | 'newest');
    }));
    this.card.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) =>
      b.addEventListener('click', () => setLang(b.dataset.lang as Lang)));
  }

  /** Spotlight the step's control and put the card next to it (every frame: things move). */
  private place(): void {
    if (!this.isOpen) return;
    const step = STEPS[this.i];
    const box = this.root.getBoundingClientRect();
    const sel = isPhone() && step.phone ? step.phone.target : step.target;
    const target = sel ? (this.root.querySelector(sel) as HTMLElement | null) : null;
    const r = target && target.offsetParent !== null ? target.getBoundingClientRect() : null;
    const W = box.width, H = box.height, M = 12;
    const cw = this.card.offsetWidth, ch = this.card.offsetHeight;
    let x: number, y: number;

    if (r) {
      const pad = 6;
      Object.assign(this.spot.style, {
        display: 'block',
        left: `${r.left - box.left - pad}px`, top: `${r.top - box.top - pad}px`,
        width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px`,
      });
      const below = r.bottom - box.top + 14, above = r.top - box.top - 14 - ch;
      y = below + ch <= H - M ? below : above >= M ? above : Math.max(M, (H - ch) / 2);
      x = r.left - box.left + r.width / 2 - cw / 2;
      // Beside the control when neither below nor above fits without covering it.
      if (y !== below && y !== above) {
        const right = r.right - box.left + 14, left = r.left - box.left - 14 - cw;
        x = right + cw <= W - M ? right : left >= M ? left : x;
      }
    } else {
      this.spot.style.display = 'none';
      x = (W - cw) / 2;
      y = step.place === 'bottom' ? H - ch - Math.max(M, H * 0.06) : (H - ch) / 2;
      // The welcome sits low on wide screens, so the summit stays in view above it.
      if (step.id === 'welcome' && W > 700) y = (H - ch) * 0.82;
      // In the climb the HUD's strip sits at the bottom: keep above it.
      if (step.place === 'bottom' && step.mode === 'climb') {
        const strip = this.root.querySelector('.ch-strip')?.getBoundingClientRect();
        if (strip && strip.height) y = Math.min(y, strip.top - box.top - ch - M);
      }
    }
    x = Math.max(M, Math.min(W - cw - M, x));
    y = Math.max(M, Math.min(H - ch - M, y));
    this.card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  private readonly onKey = (e: KeyboardEvent) => {
    if (!this.isOpen) return;
    const t = e.target as HTMLElement | null;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    const rtl = document.documentElement.dir === 'rtl';
    const fwd = rtl ? 'ArrowLeft' : 'ArrowRight', bwd = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === 'Escape') this.finish(this.mode === 'climb' ? 'stay' : 'station1');
    else if (e.key === fwd && this.i < STEPS.length - 1) this.go(this.i + 1);
    else if (e.key === bwd && this.i > 0) this.go(this.i - 1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
}

// --- text ---------------------------------------------------------------------------------

addStrings({
  ru: {
    'tour.count': '{i} из {n}',
    'tour.close': 'Закрыть гид',
    'tour.start': 'Начать обзор',
    'tour.skip': 'Пропустить, к станции 1',
    'tour.next': 'Далее',
    'tour.back': 'Назад',
    'tour.toStation1': 'К станции 1',
    'tour.first': 'Начать со станции 1',
    'tour.newest': 'Новая история: № {n}',
    'tour.help': 'Гид по сайту',
    'tour.welcome.title': 'Поднимитесь на Эльбрус — история за историей',
    'tour.welcome.body': '3D-модель самой высокой горы Европы в настоящем масштабе. 250 станций ведут от Азау ({lo}) до Западной вершины ({hi}), и на каждой — своя история: о горе, Кавказе и России. Новая станция открывается в назначенный день.',
    'tour.mountain.title': 'Вся гора',
    'tour.mountain.mouse': 'Это Эльбрус и его долины в настоящем масштабе. Тяните, чтобы повернуть, колесо — масштаб, правая кнопка — сдвиг. Попробуйте прямо сейчас.',
    'tour.mountain.touch': 'Это Эльбрус и его долины в настоящем масштабе. Тяните пальцем, чтобы повернуть, щипок — масштаб, двумя пальцами — сдвиг. Попробуйте прямо сейчас.',
    'tour.places.title': 'Места, маршруты и вид',
    'tour.places.body': 'В списке — приюты, станции канатной дороги, вершины и два классических маршрута; нажмите на подпись на карте, чтобы прочитать о месте. Компас поворачивает карту севером вверх, стрелка возвращает исходный вид.',
    'tour.modes.title': 'Подъём или вся гора',
    'tour.modes.body': '«Подъём» ведёт вверх по тропе от станции к станции. «Вся гора» — свободный обзор, в котором вы сейчас.',
    'tour.look.title': 'Цифровой или спутник',
    'tour.look.body': 'Цифровой — рельеф с горизонталями и живое небо: оно идёт по вашему местному времени, а через пару минут ускоряется, и по небу плывут солнце, луна и звёзды. Часы справа вверху ускоряют небо или возвращают «сейчас». Спутник — настоящий снимок того же рельефа.',
    'tour.lang.title': 'Язык',
    'tour.lang.body': 'Русский, English, 中文 или العربية. Переключайте в любой момент — выбор запомнится.',
    'tour.status.title': 'Где вы',
    'tour.status.body': 'Мы на станции 1, в Азау. Здесь номер станции из 250, высота, расстояние от Азау, время пешком и ближайшее место на маршруте.',
    'tour.stones.title': 'Каждая станция — камень',
    'tour.stones.mouse': 'Его свечение говорит об истории. Тяните, чтобы осмотреться вокруг камня, колесо — приблизить и отдалить.',
    'tour.stones.touch': 'Его свечение говорит об истории. Тяните пальцем, чтобы осмотреться вокруг камня, щипок — приблизить и отдалить.',
    'tour.nav.title': 'Подъём',
    'tour.nav.mouse': '«Выше» и «Ниже» — на одну станцию; удерживайте, чтобы идти дальше. Работают и клавиши ↑ ↓, а ← → поворачивают вид.',
    'tour.nav.touch': '«Выше» и «Ниже» — на одну станцию; удерживайте, чтобы идти дальше.',
    'tour.card.title': 'История',
    'tour.card.body': 'У открытых станций здесь их история: нажмите на заголовок, чтобы прочитать, или просто остановитесь на камне — она откроется сама. У закрытых указано, когда они откроются.',
    'tour.strip.title': 'Весь маршрут',
    'tour.strip.body': 'Профиль высоты от Азау до вершины со всеми 250 станциями. Нажмите в любом месте, чтобы перейти туда.',
    'tour.final.title': 'Готовы к подъёму?',
    'tour.final.body': 'Начните от подножия или сразу перейдите к самой новой истории. Кнопка «?» снова откроет этот гид.',
  },
  en: {
    'tour.count': '{i} of {n}',
    'tour.close': 'Close the guide',
    'tour.start': 'Show me around',
    'tour.skip': 'Skip, go to station 1',
    'tour.next': 'Next',
    'tour.back': 'Back',
    'tour.toStation1': 'Go to station 1',
    'tour.first': 'Start at station 1',
    'tour.newest': 'Newest story: No. {n}',
    'tour.help': 'Guide to the site',
    'tour.welcome.title': 'Climb Elbrus, one story at a time',
    'tour.welcome.body': "A true-to-scale 3D model of Europe's highest mountain. 250 stations lead from Azau ({lo}) to the West Summit ({hi}), and each holds a story: about the mountain, the Caucasus and Russia. A new station opens on a set day.",
    'tour.mountain.title': 'The whole mountain',
    'tour.mountain.mouse': 'This is Elbrus and its valleys, to scale. Drag to turn it, scroll to zoom, right-drag to move. Try it now.',
    'tour.mountain.touch': 'This is Elbrus and its valleys, to scale. Drag to turn it, pinch to zoom, two fingers to move. Try it now.',
    'tour.places.title': 'Places, routes and the view',
    'tour.places.body': 'The list has the huts, cable-car stations, summits and the two classic routes; click a label on the map to read about a place. The compass turns north up, and the arrow brings back the starting view.',
    'tour.modes.title': 'Climb or whole mountain',
    'tour.modes.body': 'Climb walks you up the trail, station by station. Whole mountain is the free view you are in now.',
    'tour.look.title': 'Digital or satellite',
    'tour.look.body': 'Digital shows contour lines and a living sky: it follows your local time, and after a couple of minutes it speeds up, so the sun, moon and stars travel across it. The clock at the top right speeds the sky up or brings back “now”. Satellite shows the real photo of the same terrain.',
    'tour.lang.title': 'Language',
    'tour.lang.body': 'Русский, English, 中文 or العربية. Switch at any time; your choice is remembered.',
    'tour.status.title': 'Where you are',
    'tour.status.body': 'We are now at station 1, at Azau. Here: the station number out of 250, the altitude, the distance from Azau, the walking time and the nearest place on the route.',
    'tour.stones.title': 'Every station is a stone',
    'tour.stones.mouse': 'Its glow tells you about its story. Drag to look around the stone, scroll to zoom in and out.',
    'tour.stones.touch': 'Its glow tells you about its story. Drag to look around the stone, pinch to zoom in and out.',
    'tour.nav.title': 'Climbing',
    'tour.nav.mouse': 'Up and Down move one station; hold to keep walking. The ↑ ↓ keys work too, and ← → turn the view.',
    'tour.nav.touch': 'Up and Down move one station; hold to keep walking.',
    'tour.card.title': 'The story',
    'tour.card.body': 'Open stations show their story here: tap the title to read it, or stop on a stone and it opens by itself. Closed stations say when they open.',
    'tour.strip.title': 'The whole route',
    'tour.strip.body': 'The altitude profile from Azau to the summit, with all 250 stations. Click or tap anywhere to walk there.',
    'tour.final.title': 'Ready to climb?',
    'tour.final.body': 'Start at the foot of the mountain, or jump straight to the newest story. The ? button brings this guide back.',
  },
  zh: {
    'tour.count': '{i} / {n}',
    'tour.close': '关闭指南',
    'tour.start': '带我看看',
    'tour.skip': '跳过，前往第 1 站',
    'tour.next': '下一步',
    'tour.back': '上一步',
    'tour.toStation1': '前往第 1 站',
    'tour.first': '从第 1 站开始',
    'tour.newest': '最新故事：{n} 号',
    'tour.help': '网站指南',
    'tour.welcome.title': '一站一个故事，登上厄尔布鲁士',
    'tour.welcome.body': '欧洲最高峰的真实比例 3D 模型。250 个站点从阿扎乌（{lo}）一路通往西峰（{hi}），每一站都有一个故事：关于这座山、高加索和俄罗斯。新站点会在预定的日子开放。',
    'tour.mountain.title': '整座山',
    'tour.mountain.mouse': '这是按真实比例呈现的厄尔布鲁士及其山谷。拖动旋转，滚轮缩放，右键拖动平移。现在就试试吧。',
    'tour.mountain.touch': '这是按真实比例呈现的厄尔布鲁士及其山谷。单指拖动旋转，双指捏合缩放，双指拖动平移。现在就试试吧。',
    'tour.places.title': '地点、路线和视角',
    'tour.places.body': '列表里有避难所、缆车站、山峰和两条经典路线；点击地图上的标签即可查看地点介绍。指南针让地图北方朝上，箭头按钮回到初始视角。',
    'tour.modes.title': '攀登或全山',
    'tour.modes.body': '“攀登”带你沿着小路一站一站向上走。“全山”是你现在所在的自由视角。',
    'tour.look.title': '数字或卫星',
    'tour.look.body': '“数字”显示等高线和一片活的天空：它跟随你的本地时间，几分钟后开始加速，太阳、月亮和星星在天上移动。右上角的时钟可以加速天空或回到“现在”。“卫星”显示同一地形的真实照片。',
    'tour.lang.title': '语言',
    'tour.lang.body': 'Русский、English、中文或 العربية，随时可以切换，选择会被记住。',
    'tour.status.title': '你在哪里',
    'tour.status.body': '我们现在在第 1 站，阿扎乌。这里显示站点编号（共 250 站）、海拔、距阿扎乌的距离、步行时间，以及路线上最近的地点。',
    'tour.stones.title': '每一站都是一块石头',
    'tour.stones.mouse': '它的光芒告诉你故事的状态。拖动可绕着石头环视，滚轮可拉近或拉远。',
    'tour.stones.touch': '它的光芒告诉你故事的状态。单指拖动可绕着石头环视，双指捏合可拉近或拉远。',
    'tour.nav.title': '攀登',
    'tour.nav.mouse': '“向上”和“向下”每次移动一站；按住可以一直走。也可以用 ↑ ↓ 键，← → 键转动视角。',
    'tour.nav.touch': '“向上”和“向下”每次移动一站；按住可以一直走。',
    'tour.card.title': '故事',
    'tour.card.body': '已开放的站点在这里显示故事：点按标题即可阅读，或在石头旁停下，故事会自动打开。未开放的站点会显示开放时间。',
    'tour.strip.title': '整条路线',
    'tour.strip.body': '从阿扎乌到顶峰的海拔剖面，标出了全部 250 个站点。点击任意位置即可走到那里。',
    'tour.final.title': '准备好攀登了吗？',
    'tour.final.body': '从山脚出发，或直接前往最新的故事。“?”按钮可以随时再次打开本指南。',
  },
  ar: {
    'tour.count': '{i} من {n}',
    'tour.close': 'إغلاق الدليل',
    'tour.start': 'خذني في جولة',
    'tour.skip': 'تخطَّ، إلى المحطة 1',
    'tour.next': 'التالي',
    'tour.back': 'السابق',
    'tour.toStation1': 'إلى المحطة 1',
    'tour.first': 'ابدأ من المحطة 1',
    'tour.newest': 'أحدث قصة: رقم {n}',
    'tour.help': 'دليل الموقع',
    'tour.welcome.title': 'اصعد إلبروس، قصةً بعد قصة',
    'tour.welcome.body': 'نموذج ثلاثي الأبعاد بمقياس حقيقي لأعلى جبل في أوروبا. تقودك 250 محطة من آزاو ({lo}) إلى القمة الغربية ({hi})، وفي كل محطة قصة: عن الجبل والقوقاز وروسيا. تُفتح محطة جديدة في يوم محدد.',
    'tour.mountain.title': 'الجبل كاملًا',
    'tour.mountain.mouse': 'هذا إلبروس ووديانه بمقياس حقيقي. اسحب للتدوير، واستخدم العجلة للتكبير، والسحب بالزر الأيمن للتحريك. جرّب الآن.',
    'tour.mountain.touch': 'هذا إلبروس ووديانه بمقياس حقيقي. اسحب بإصبع للتدوير، وقرّب بإصبعين للتكبير، وحرّك بإصبعين. جرّب الآن.',
    'tour.places.title': 'الأماكن والمسارات والعرض',
    'tour.places.body': 'تضم القائمة الملاجئ ومحطات التلفريك والقمم والمسارين الكلاسيكيين؛ انقر على أي اسم على الخريطة لتقرأ عن المكان. تُدير البوصلة الخريطة ليكون الشمال للأعلى، ويعيد السهم العرض الأصلي.',
    'tour.modes.title': 'الصعود أو الجبل كاملًا',
    'tour.modes.body': '«الصعود» يأخذك على الدرب محطةً بعد محطة. و«الجبل كاملًا» هو العرض الحر الذي أنت فيه الآن.',
    'tour.look.title': 'رقمي أو قمر صناعي',
    'tour.look.body': '«رقمي» يعرض خطوط الكنتور وسماءً حيّة: تتبع وقتك المحلي، وبعد دقيقتين تتسارع فتعبرها الشمس والقمر والنجوم. الساعة أعلى الشاشة تسرّع السماء أو تعيدها إلى «الآن». و«قمر صناعي» يعرض الصورة الحقيقية للتضاريس نفسها.',
    'tour.lang.title': 'اللغة',
    'tour.lang.body': 'Русский أو English أو 中文 أو العربية. بدّل متى شئت، وسيُحفظ اختيارك.',
    'tour.status.title': 'أين أنت',
    'tour.status.body': 'نحن الآن في المحطة 1، في آزاو. هنا رقم المحطة من 250، والارتفاع، والمسافة من آزاو، ووقت السير، وأقرب مكان على المسار.',
    'tour.stones.title': 'كل محطة حجر',
    'tour.stones.mouse': 'يدلّك توهّجه على حالة قصته. اسحب للنظر حول الحجر، واستخدم العجلة للتقريب والإبعاد.',
    'tour.stones.touch': 'يدلّك توهّجه على حالة قصته. اسحب بإصبع للنظر حول الحجر، وقرّب بإصبعين للتكبير والتصغير.',
    'tour.nav.title': 'الصعود',
    'tour.nav.mouse': '«أعلى» و«أسفل» تنقلانك محطة واحدة؛ اضغط مطوّلًا لمواصلة السير. تعمل المفاتيح ↑ ↓ أيضًا، و← → تديران العرض.',
    'tour.nav.touch': '«أعلى» و«أسفل» تنقلانك محطة واحدة؛ اضغط مطوّلًا لمواصلة السير.',
    'tour.card.title': 'القصة',
    'tour.card.body': 'تظهر هنا قصة المحطات المفتوحة: اضغط على العنوان لقراءتها، أو توقّف عند الحجر فتُفتح وحدها. أما المحطات المغلقة فتذكر موعد افتتاحها.',
    'tour.strip.title': 'المسار كاملًا',
    'tour.strip.body': 'مقطع الارتفاع من آزاو إلى القمة مع كل المحطات الـ250. انقر في أي مكان للانتقال إليه.',
    'tour.final.title': 'مستعد للصعود؟',
    'tour.final.body': 'ابدأ من سفح الجبل، أو انتقل مباشرة إلى أحدث قصة. يعيد زر «؟» فتح هذا الدليل.',
  },
});

// Phone wording for the steps whose controls live in the ⚙ menu or the pill.
addStrings({
  ru: {
    'tour.look.phone': 'Цифровой — рельеф с горизонталями и живое небо по вашему местному времени; через пару минут оно ускоряется. Спутник — настоящий снимок. Переключатель — в меню ⚙, там же время и погода.',
    'tour.lang.phone': 'Русский, English, 中文 или العربية — тоже в меню ⚙. Выбор запомнится.',
    'tour.status.phone': 'Внизу — где вы: номер станции и высота. Стрелки по бокам ведут вверх и вниз по маршруту.',
    'tour.card.phone': 'Нажмите на номер — появится история станции; нажмите на её заголовок, чтобы прочитать. Или просто остановитесь на камне — она откроется сама.',
    'tour.strip.phone': 'Там же — профиль высоты от Азау до вершины со всеми 250 станциями. Нажмите в любом месте, чтобы перейти туда.',
  },
  en: {
    'tour.look.phone': 'Digital shows contour lines and a living sky on your local time; after a couple of minutes it speeds up. Satellite is the real photo. Switch them in the ⚙ menu, which also has the time and weather.',
    'tour.lang.phone': 'Русский, English, 中文 or العربية, also in the ⚙ menu. Your choice is remembered.',
    'tour.status.phone': 'At the bottom: where you are, the station number and altitude. The arrows on either side take you up and down the route.',
    'tour.card.phone': 'Tap the number to show the station’s story, then tap its title to read it. Or simply stop on a stone and it opens by itself.',
    'tour.strip.phone': 'It also holds the altitude profile from Azau to the summit with all 250 stations. Tap anywhere on it to go there.',
  },
  zh: {
    'tour.look.phone': '“数字”显示等高线和随你本地时间变化的天空，几分钟后会加速；“卫星”是真实照片。在 ⚙ 菜单中切换，那里也有时间和天气。',
    'tour.lang.phone': 'Русский、English、中文 或 العربية，也在 ⚙ 菜单中，选择会被记住。',
    'tour.status.phone': '底部显示你的位置：站点编号和海拔。两侧的箭头带你沿路线上下移动。',
    'tour.card.phone': '点按编号即可显示该站的故事，再点按标题阅读。或者停在石头上，它会自动打开。',
    'tour.strip.phone': '这里还有从阿扎乌到峰顶的海拔剖面和全部 250 个站点。点按任意位置即可前往。',
  },
  ar: {
    'tour.look.phone': '«رقمي» يعرض خطوط الكنتور وسماءً حيّة على وقتك المحلي تتسارع بعد دقيقتين، و«قمر صناعي» صورة حقيقية. بدّل بينهما من قائمة ⚙، وفيها أيضًا الوقت والطقس.',
    'tour.lang.phone': 'Русский وEnglish و中文 والعربية من قائمة ⚙ أيضًا، ويُحفظ اختيارك.',
    'tour.status.phone': 'في الأسفل موقعك: رقم المحطة والارتفاع. السهمان على الجانبين يأخذانك صعودًا ونزولًا على المسار.',
    'tour.card.phone': 'اضغط على الرقم لتظهر قصة المحطة، ثم اضغط على عنوانها لقراءتها. أو توقّف عند حجر فتُفتح وحدها.',
    'tour.strip.phone': 'وفيها أيضًا مقطع الارتفاع من آزاو إلى القمة بكل المحطات الـ250. اضغط على أي موضع للانتقال إليه.',
  },
});
