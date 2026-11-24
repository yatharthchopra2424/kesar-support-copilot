import { useEffect, useState } from 'react';

// Tiny hash router. Static hosting needs no rewrite rules, and the URL always reflects the view
// (#/inbox?f=human, #/trace/E04), so a reviewer can paste a link to exactly what they are looking at.
export interface Route {
  path: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const raw = location.hash.replace(/^#\/?/, '');
  const [p, q] = raw.split('?');
  return { path: p.split('/').filter(Boolean), query: new URLSearchParams(q ?? '') };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

/** Update the query string without adding a history entry for every keystroke. */
export function setQuery(route: Route, patch: Record<string, string | undefined>) {
  const q = new URLSearchParams(route.query);
  for (const [k, v] of Object.entries(patch)) {
    if (v) q.set(k, v);
    else q.delete(k);
  }
  const s = q.toString();
  history.replaceState(null, '', '#/' + route.path.join('/') + (s ? '?' + s : ''));
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

let lastTrace = 'E01';
export const rememberTrace = (id: string) => {
  lastTrace = id;
};
export const lastTraceId = () => lastTrace;
