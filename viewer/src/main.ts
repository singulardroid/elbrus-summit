import './style.css';
import { ElbrusMap } from './ElbrusMap';
import { applyDocument, t } from './i18n';

applyDocument();

const container = document.getElementById('app')!;
const map = new ElbrusMap(container, { dataUrl: './elbrus/' });
map.load().catch((err) => {
  console.error(err);
  container.insertAdjacentHTML('beforeend', `<div class="eu-error">${t('loadError')}</div>`);
});

// Handy for debugging in the browser console.
(window as unknown as { elbrus: ElbrusMap }).elbrus = map;
