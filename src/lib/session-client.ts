/**
 * Client-side session renewal.
 *
 * Access tokens last 15 minutes. Instead of every page handling that, this
 * wraps window.fetch once: when a same-origin /api request comes back 401,
 * it renews the session through /api/auth/refresh and retries the request
 * one time. Concurrent 401s share a single refresh call.
 */

let refreshInFlight: Promise<boolean> | null = null;
let installed = false;

export function refreshSessionOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = originalFetch()('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        // Allow a new refresh attempt shortly after this one settles
        setTimeout(() => {
          refreshInFlight = null;
        }, 1000);
      });
  }
  return refreshInFlight;
}

let nativeFetch: typeof fetch | null = null;
function originalFetch(): typeof fetch {
  return nativeFetch ?? window.fetch.bind(window);
}

function requestPath(input: RequestInfo | URL): string | null {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

export function installSessionRefresh(onSessionEnded: () => void) {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    // Clone Request objects up front so the body can be sent again on retry
    const retryInput = input instanceof Request ? input.clone() : input;
    const res = await nativeFetch!(input, init);

    const path = requestPath(input);
    if (res.status !== 401 || !path || !path.startsWith('/api/') || path.startsWith('/api/auth/')) {
      return res;
    }

    const renewed = await refreshSessionOnce();
    if (!renewed) {
      onSessionEnded();
      return res;
    }
    return nativeFetch!(retryInput, init);
  };
}
