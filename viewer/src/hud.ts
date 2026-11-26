// Minimal on-screen UI: compass, reset, altitude readout, attribution.
import type { TileStats } from './tiles';
import { ICON } from './icons';
import { applyI18n, distance, metres, onLang, t } from './i18n';

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
    <div class="eu-controls">
      <button type="button" class="eu-btn eu-compass" data-i18n-title="northUp" data-i18n-aria="northUp">
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <path d="M20 4 L26 20 L20 17 L14 20 Z" fill="#e0453a"/>
          <path d="M20 36 L14 20 L20 23 L26 20 Z" fill="currentColor" opacity=".55"/>
          <text x="20" y="13.5" text-anchor="middle" font-size="7" font-weight="700" fill="#fff">N</text>
        </svg>
      </button>
      <button type="button" class="eu-btn eu-places" data-i18n-title="allPlaces" data-i18n-aria="allPlaces">${ICON.list}</button>
      <button type="button" class="eu-btn eu-reset" data-i18n-title="resetView" data-i18n-aria="resetView">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>
      </button>
    </div>
    <div class="eu-readout" aria-live="off"></div>
    <pre class="eu-debug" hidden></pre>
    <details class="eu-attrib"><summary data-i18n="data"></summary><div class="eu-attrib-text"></div></details>
    <div class="eu-hint"></div>
  `;
  root.appendChild(ui);

  const $ = <T extends Element>(s: string) => ui.querySelector(s) as T;
  const compass = $<HTMLButtonElement>('.eu-compass');
  const compassSvg = $<SVGElement>('.eu-compass svg');
  const readout = $<HTMLElement>('.eu-readout');
  const attrib = $<HTMLElement>('.eu-attrib-text');
  const hint = $<HTMLElement>('.eu-hint');
  const debug = $<HTMLElement>('.eu-debug');

  let lastReadout = '';
  let cameraText = '';
  let hoverText: string | null = null;
  const show = () => {
    const text = hoverText ?? cameraText;
    if (text !== lastReadout) readout.textContent = lastReadout = text;
  };
  onLang(() => {
    applyI18n(ui);
    hint.textContent = t(window.matchMedia('(pointer: coarse)').matches ? 'hint.touch' : 'hint.mouse');
    lastReadout = '';
    show();
  }, true);
  compass.addEventListener('click', actions.onNorth);
  $<HTMLButtonElement>('.eu-reset').addEventListener('click', actions.onReset);
  $<HTMLButtonElement>('.eu-places').addEventListener('click', actions.onPlaces);
  // Hide the gesture hint after the first interaction.
  root.addEventListener('pointerdown', () => hint.classList.add('is-hidden'), { once: true });
  if (window.innerWidth > 1100) $<HTMLDetailsElement>('.eu-attrib').open = true;

  return {
    // The loading screen (the altimeter) lives in index.html, so it shows before the code arrives.
    setProgress: (f) => window.elbrusBoot?.set(f),
    hideLoading: () => window.elbrusBoot?.done(),
    setHeading: (az) => (compassSvg.style.transform = `rotate(${az}rad)`),
    setReadout: (alt, dist) => {
      cameraText = t('readout.camera', { alt: metres(alt), dist: distance(dist) });
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
      // Weather in the digital sky (CC BY 4.0).
      const wx = document.createElement('p');
      wx.innerHTML = '<a href="https://open-meteo.com/" target="_blank" rel="noopener">Weather data by Open-Meteo.com</a>, CC BY 4.0';
      attrib.append(wx);
    },
  };
}

declare global {
  interface Window {
    /** The loading screen in index.html: progress 0…1, done (fade out), error (remove at once). */
    elbrusBoot?: { set(f: number): void; done(): void; error(): void };
  }
}
