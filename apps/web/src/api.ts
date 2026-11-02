import { useRef } from 'react';
import type { ApiError } from '@ros/contracts';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const csrf = () =>
  document.cookie
    .split('; ')
    .find((c) => c.startsWith('ros_csrf='))
    ?.split('=')[1] ?? '';

const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/**
 * One Idempotency-Key per form submission: the same key is reused until the write succeeds, so resending after
 * a lost response returns the first result instead of posting twice. Call `renew()` after success.
 */
export function useIdempotencyKey() {
  const ref = useRef(newKey());
  return { key: () => ref.current, renew: () => (ref.current = newKey()) };
}

/**
 * JSON API client for the same-origin /api proxy. Writes echo the CSRF cookie (double-submit) and carry an
 * Idempotency-Key (the caller's, for financial forms, or a fresh one).
 */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const method = init.method ?? 'GET';
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(method !== 'GET'
          ? { 'x-csrf-token': decodeURIComponent(csrf()), 'idempotency-key': init.idempotencyKey ?? newKey() }
          : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiRequestError(0, 'network', 'Network error');
  }
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const err = (body ?? {}) as Partial<ApiError>;
    throw new ApiRequestError(res.status, err.code ?? 'unknown', err.message ?? res.statusText, err.details);
  }
  return body as T;
}

export const errorCode = (err: unknown) => (err instanceof ApiRequestError ? err.code : 'unknown');
export const fieldErrors = (err: unknown): Record<string, string> =>
  err instanceof ApiRequestError && err.code === 'validation' && Array.isArray(err.details)
    ? Object.fromEntries((err.details as { path: string; message: string }[]).map((d) => [d.path, d.message]))
    : {};
