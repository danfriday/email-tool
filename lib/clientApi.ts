'use client';

// Thin client-side fetch wrapper. Centralises JSON handling + errors so
// every tab talks to the API the same way.

async function request<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok || (data && data.success === false)) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  get: <T = any>(url: string) => request<T>(url),
  post: <T = any>(url: string, body?: unknown) =>
    request<T>(url, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T = any>(url: string, body?: unknown) =>
    request<T>(url, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: <T = any>(url: string, body?: unknown) =>
    request<T>(url, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
};

export function debounce<A extends any[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout>;
  return (...args: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
