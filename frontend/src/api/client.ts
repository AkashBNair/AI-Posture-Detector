import { getApiBaseUrl } from './baseUrl';

export function getOrCreateClientId(): string {
  const existing = window.localStorage.getItem('wellness_client_id');
  if (existing) return existing;

  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `client_${Math.random().toString(36).slice(2)}`;

  window.localStorage.setItem('wellness_client_id', id);
  return id;
}

// ✅ simple retry helper (VERY IMPORTANT for real backend)
async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  try {
    const res = await fetch(url, options);
    if (!res.ok && retries > 0) {
      return fetchWithRetry(url, options, retries - 1);
    }
    return res;
  } catch (err) {
    if (retries > 0) {
      return fetchWithRetry(url, options, retries - 1);
    }
    throw err;
  }
}

export async function startSession(type: string): Promise<number | null> {
  const clientId = getOrCreateClientId();
  const baseUrl = getApiBaseUrl();

  try {
    const res = await fetchWithRetry(`${baseUrl}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': clientId,
      },
      body: JSON.stringify({
        type,
        startedAt: new Date().toISOString(), // ✅ added timestamp
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.id ?? null;
  } catch {
    return null;
  }
}

export async function postEvent(
  event_type: string,
  payload: Record<string, unknown>,
  session_id?: number | null
): Promise<void> {
  const clientId = getOrCreateClientId();
  const baseUrl = getApiBaseUrl();

  const eventBody = {
    event_type,
    session_id: session_id ?? null,
    payload: {
      ...payload,
      timestamp: new Date().toISOString(), // ✅ ensure every event has time
    },
  };

  try {
    await fetchWithRetry(`${baseUrl}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': clientId,
      },
      body: JSON.stringify(eventBody),
    });
  } catch {
    // ✅ fallback: store failed events locally (VERY IMPORTANT)
    const failed = JSON.parse(
      window.localStorage.getItem('failed_events') || '[]'
    );
    failed.push(eventBody);
    window.localStorage.setItem('failed_events', JSON.stringify(failed));
  }
}

// ✅ retry sending failed events (call this on app start if needed)
export async function flushFailedEvents() {
  const baseUrl = getApiBaseUrl();
  const clientId = getOrCreateClientId();

  const failed = JSON.parse(
    window.localStorage.getItem('failed_events') || '[]'
  );

  if (!failed.length) return;

  const remaining: any[] = [];

  for (const event of failed) {
    try {
      const res = await fetch(`${baseUrl}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': clientId,
        },
        body: JSON.stringify(event),
      });

      if (!res.ok) remaining.push(event);
    } catch {
      remaining.push(event);
    }
  }

  window.localStorage.setItem('failed_events', JSON.stringify(remaining));
}