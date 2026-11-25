// Minimal on-screen UI: loading overlay, compass, reset, altitude readout, attribution.
import type { TileStats } from './tiles';
import { ICON } from './icons';

export interface Hud {
  setProgress(f: number): void;
  hideLoading(): void;
  setHeading(azimuthRad: number): void;
  setReadout(cameraAltM: number, distanceM: number): void;
  /** Terrain under the mouse (replaces the camera readout while set). */
  setHover(text: string | null): void;
  setAttribution(lines: string[]): void;
  setDebug(stats: TileStats): void;
}

export function createHud(root: HTMLElement, actions: { onReset(): void; onNorth(): void; onPlaces(): void }): Hud {
  const ui = document.createElement('div');
  ui.className = 'elbrus-ui';
  ui.innerHTML = `
    <div class="eu-loading" role="status">
      <div class="eu-loading-title">Загружаем Эльбрус…</div>
      <div class="eu-bar"><div class="eu-bar-fill"></div></div>
    </div>
    <div class="eu-controls">
      <button type="button" class="eu-btn eu-compass" title="Север вверх" aria-label="Север вверх">
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <path d="M20 4 L26 20 L20 17 L14 20 Z" fill="#e0453a"/>
          <path d="M20 36 L14 20 L20 23 L26 20 Z" fill="currentColor" opacity=".55"/>
          <text x="20" y="13.5" text-anchor="middle" font-size="7" font-weight="700" fill="#fff">N</text>
        </svg>
      </button>
      <button type="button" class="eu-btn eu-places" title="Все места и маршруты" aria-label="Все места и маршруты">${ICON.list}</button>
      <button type="button" class="eu-btn eu-reset" title="Исходный вид" aria-label="Исходный вид">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>
      </button>
    </div>
    <div class="eu-readout" aria-live="off"></div>
    <pre class="eu-debug" hidden></pre>
    <details class="eu-attrib"><summary>© Данные</summary><div class="eu-attrib-text"></div></details>
    <div class="eu-hint"></div>
  `;
  root.appendChild(ui);

  const $ = <T extends Element>(s: string) => ui.querySelector(s) as T;
  const fill = $<HTMLElement>('.eu-bar-fill');
  const loading = $<HTMLElement>('.eu-loading');
  const compass = $<HTMLButtonElement>('.eu-compass');
  const compassSvg = $<SVGElement>('.eu-compass svg');
  const readout = $<HTMLElement>('.eu-readout');
  const attrib = $<HTMLElement>('.eu-attrib-text');
  const hint = $<HTMLElement>('.eu-hint');
  const debug = $<HTMLElement>('.eu-debug');

  hint.textContent = window.matchMedia('(pointer: coarse)').matches
    ? 'Вращайте пальцем · двумя пальцами — сдвиг и масштаб'
    : 'Тяните — вращение · правая кнопка — сдвиг · колесо — масштаб'
  compass.addEventListener('click', actions.onNorth);
  $<HTMLButtonElement>('.eu-reset').addEventListener('click', actions.onReset);
  $<HTMLButtonElement>('.eu-places').addEventListener('click', actions.onPlaces);
  // Hide the gesture hint after the first interaction.
  root.addEventListener('pointerdown', () => hint.classList.add('is-hidden'), { once: true });
  if (window.innerWidth > 1100) $<HTMLDetailsElement>('.eu-attrib').open = true;

  const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');
  let lastReadout = '';
  let cameraText = '';
  let hoverText: string | null = null;
  const show = () => {
    const text = hoverText ?? cameraText;
    if (text !== lastReadout) readout.textContent = lastReadout = text;
  };
  return {
    setProgress: (f) => (fill.style.width = `${Math.round(f * 100)}%`),
    hideLoading: () => loading.classList.add('is-hidden'),
    setHeading: (az) => (compassSvg.style.transform = `rotate(${az}rad)`),
    setReadout: (alt, dist) => {
      cameraText = `Камера ${fmt(alt)} м · ${dist >= 1000 ? (dist / 1000).toFixed(1).replace('.', ',') + ' км' : fmt(dist) + ' м'} до цели`;
      show();
    },
    setHover: (text) => {
      hoverText = text;
      show();
    },
    setDebug: (s) => {
      debug.hidden = false;
      debug.textContent =
        `tiles drawn ${s.drawn} [${s.drawnByLevel.join(' / ')}]\n` +
        `ready ${s.ready} · loading ${s.loading} · queued ${s.queued}\n` +
        `gpu ${(s.gpuBytes / 1e6).toFixed(0)} MB · downloaded ${(s.loadedBytes / 1e6).toFixed(2)} MB`;
    },
    setAttribution: (lines) => {
      attrib.replaceChildren(...lines.map((l) => Object.assign(document.createElement('p'), { textContent: l })));
    },
  };
}
