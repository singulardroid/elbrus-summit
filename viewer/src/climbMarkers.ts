import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Journey } from './data';
import { addStrings, num, onLang, t } from './i18n';

/**
 * Two markers in the whole-mountain view: where the climb starts (station 1, Azau) and where you
 * are (the station you last stood at). Click either to go back into the climb there. At station 1
 * they merge into one.
 */

addStrings({
  ru: { 'mk.start': 'Старт', 'mk.here': 'Вы здесь', 'mk.go': 'Вернуться к подъёму: станция {n}' },
  en: { 'mk.start': 'Start', 'mk.here': 'You are here', 'mk.go': 'Back to the climb: station {n}' },
  zh: { 'mk.start': '起点', 'mk.here': '你在这里', 'mk.go': '回到攀登：第 {n} 站' },
  ar: { 'mk.start': 'البداية', 'mk.here': 'أنت هنا', 'mk.go': 'العودة إلى الصعود: المحطة {n}' },
});

export class ClimbMarkers {
  readonly group = new THREE.Group();
  private readonly start: CSS2DObject;
  private readonly here: CSS2DObject;
  private door = 1;
  private shown = false;

  constructor(private readonly j: Journey, private readonly onGo: (n: number) => void) {
    this.group.name = 'climb-markers';
    this.start = this.make('start', () => this.onGo(1));
    this.here = this.make('here', () => this.onGo(this.door));
    this.place(this.start, 1);
    onLang(() => this.relabel(), true);
  }

  private make(kind: 'start' | 'here', go: () => void): CSS2DObject {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `cm cm--${kind}`;
    el.innerHTML = '<span class="cm-box"><span class="cm-name"></span><span class="cm-n"></span></span><span class="cm-stem"></span>';
    el.addEventListener('click', go);
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    const obj = new CSS2DObject(el);
    obj.center.set(0.5, 1);
    obj.visible = false;
    this.group.add(obj);
    return obj;
  }

  private place(obj: CSS2DObject, n: number): void {
    const p = this.j.doors[Math.min(Math.max(n, 1), this.j.doors.length) - 1].p;
    obj.position.set(p[0], p[1], p[2]);
  }

  /** Screen boxes of the visible markers (place labels that overlap them step aside). */
  boxes(): DOMRect[] {
    return [this.start, this.here]
      .filter((o) => o.visible && o.element.style.display !== 'none')
      .map((o) => (o.element.querySelector('.cm-box') as HTMLElement).getBoundingClientRect());
  }

  /** Show them (whole-mountain view) or not, and put "you are here" on station `door`. */
  update(show: boolean, door: number): void {
    if (show === this.shown && door === this.door) return;
    this.shown = show;
    this.door = door;
    this.place(this.here, door);
    this.start.visible = show;
    this.here.visible = show && door > 1;
    this.relabel();
  }

  private relabel(): void {
    const set = (obj: CSS2DObject, name: string, n: number) => {
      const el = obj.element;
      el.querySelector('.cm-name')!.textContent = name;
      el.querySelector('.cm-n')!.textContent = t('stationN', { n: num(n) });
      el.title = t('mk.go', { n: num(n) });
      el.setAttribute('aria-label', `${name}. ${t('mk.go', { n: num(n) })}`);
    };
    // At station 1 the start marker also says "you are here".
    set(this.start, this.door > 1 ? t('mk.start') : `${t('mk.start')} · ${t('mk.here')}`, 1);
    set(this.here, t('mk.here'), this.door);
  }
}
