// Runtime-configurable API and firmware base URLs
// Priority (highest → lowest):
// 1) Query params: ?api=..., ?fw=... (persist to localStorage)
//    - Use 'clear' to remove stored value: ?api=clear
// 2) localStorage keys: tfct.apiBase, tfct.fwBase
// 3) window.__APP_CONFIG__ overrides (if injected)
// 4) Vite env at build: import.meta.env.VITE_API_BASE / VITE_FW_BASE

function fromQueryAndPersist(key: 'api' | 'fw') {
  if (typeof window === 'undefined') return undefined as string | undefined;
  try {
    const u = new URL(window.location.href);
    const q = u.searchParams.get(key) || u.searchParams.get(`${key}Base`) || u.searchParams.get(`${key.toUpperCase()}_BASE`);
    if (!q) return undefined;
    if (q.toLowerCase() === 'clear') {
      localStorage.removeItem(`tfct.${key}Base`);
      return '';
    }
    const v = q.replace(/\/$/, '');
    localStorage.setItem(`tfct.${key}Base`, v);
    return v;
  } catch {
    return undefined;
  }
}

function fromLocalStorage(key: 'api' | 'fw') {
  if (typeof window === 'undefined') return undefined as string | undefined;
  try {
    const v = localStorage.getItem(`tfct.${key}Base`);
    return v ? v.replace(/\/$/, '') : undefined;
  } catch {
    return undefined;
  }
}

function fromWindowConfig(key: 'api' | 'fw') {
  if (typeof window === 'undefined') return undefined as string | undefined;
  const mapKey = `${key.toUpperCase()}_BASE`;
  const v = (window as any)?.__APP_CONFIG__?.[mapKey];
  return v ? String(v).replace(/\/$/, '') : undefined;
}

function fromEnv(key: 'api' | 'fw') {
  const mapKey = `VITE_${key.toUpperCase()}_BASE` as const;
  const v = (import.meta as any)?.env?.[mapKey];
  return v ? String(v).replace(/\/$/, '') : '';
}

export function getApiBase(): string {
  return (
    fromQueryAndPersist('api') ??
    fromLocalStorage('api') ??
    fromWindowConfig('api') ??
    fromEnv('api')
  );
}

export function getFwBase(): string {
  // If fw not set, fall back to api base
  const fw = (
    fromQueryAndPersist('fw') ??
    fromLocalStorage('fw') ??
    fromWindowConfig('fw') ??
    fromEnv('fw')
  );
  return fw || getApiBase();
}

