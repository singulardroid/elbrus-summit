// Deep links in the URL hash.
//   #poi=<id>                                  a selected place
//   #route=<id>                                a selected route
//   #station=<n>                               the guided climb, standing at station n (#door=<n> still works)
//   #story=<n>                                 the same, with story n open
//   #view=<lat>,<lon>,<dist m>,<heading°>,<tilt°>   a camera view (target on the ground)
// heading: compass direction the camera looks toward (0 = north); tilt: 0 = straight down, 90 = horizon.

export type UrlState =
  | { kind: 'poi'; id: string }
  | { kind: 'route'; id: string }
  | { kind: 'station'; n: number }
  | { kind: 'story'; n: number }
  | { kind: 'view'; lat: number; lon: number; dist: number; heading: number; tilt: number }
  | { kind: 'none' };

export function parseHash(hash: string): UrlState {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const poi = params.get('poi');
  if (poi) return { kind: 'poi', id: poi };
  const story = Number(params.get('story'));
  if (params.has('story') && Number.isFinite(story)) return { kind: 'story', n: story };
  const stationKey = params.has('station') ? 'station' : params.has('door') ? 'door' : undefined; // door: links from before the rename
  const station = Number(stationKey && params.get(stationKey));
  if (stationKey && Number.isFinite(station)) return { kind: 'station', n: station };
  const route = params.get('route');
  if (route) return { kind: 'route', id: route };
  const view = params.get('view');
  if (view) {
    const [lat, lon, dist, heading, tilt] = view.split(',').map(Number);
    if ([lat, lon, dist, heading, tilt].every(Number.isFinite)) return { kind: 'view', lat, lon, dist, heading, tilt };
  }
  return { kind: 'none' };
}

export function formatHash(s: UrlState): string {
  if (s.kind === 'poi') return `#poi=${encodeURIComponent(s.id)}`;
  if (s.kind === 'route') return `#route=${encodeURIComponent(s.id)}`;
  if (s.kind === 'station') return `#station=${s.n}`;
  if (s.kind === 'story') return `#story=${s.n}`;
  if (s.kind === 'view') {
    const h = ((s.heading % 360) + 360) % 360;
    return `#view=${s.lat.toFixed(5)},${s.lon.toFixed(5)},${Math.round(s.dist)},${Math.round(h)},${Math.round(s.tilt)}`;
  }
  return '';
}

/** Replace the hash without adding history entries or firing hashchange. */
export function writeHash(hash: string): void {
  if (location.hash === hash || (!hash && !location.hash)) return;
  const url = location.pathname + location.search + hash;
  history.replaceState(history.state, '', url);
}
