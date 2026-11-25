import './style.css';
import { ElbrusMap } from './ElbrusMap';

const container = document.getElementById('app')!;
const map = new ElbrusMap(container, { dataUrl: './elbrus/' });
map.load().catch((err) => {
  console.error(err);
  container.insertAdjacentHTML('beforeend', `<div class="eu-error">Could not load the 3D model.</div>`);
});

// Handy for debugging in the browser console.
(window as unknown as { elbrus: ElbrusMap }).elbrus = map;
