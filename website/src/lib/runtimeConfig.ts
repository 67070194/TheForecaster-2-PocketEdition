// Runtime configuration for API and firmware base URLs
// Simplified for domain-based deployment - uses build-time environment variables only
//
// Previous versions supported query params (?api=...) and localStorage for dynamic config.
// This is no longer needed since API URL is now hardcoded at build time to api.hcn.in.net

function fromEnv(key: 'api' | 'fw'): string {
  const mapKey = `VITE_${key.toUpperCase()}_BASE` as const;
  const v = (import.meta as any)?.env?.[mapKey];
  return v ? String(v).replace(/\/$/, '') : '';
}

export function getApiBase(): string {
  return fromEnv('api');
}

export function getFwBase(): string {
  // If fw not set, fall back to api base
  const fw = fromEnv('fw');
  return fw || getApiBase();
}
