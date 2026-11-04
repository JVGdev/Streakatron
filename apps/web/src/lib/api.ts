// The one way to talk to the API: a typed Hono RPC client, and `call()` that turns any failure
// into an `ApiError` with a message fit to show (the server's own, or a clear fallback).
//
//   const me = await call(api.me.$get());

import type { AppType } from '@streakatron/server';
import { apiErrorSchema } from '@streakatron/shared/schemas';
import { hc, type ClientResponse } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { takeGame, type WithoutGame } from './game-bus';

export const api = hc<AppType>('/api');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthorized() {
    return this.status === 401;
  }
}

const FALLBACK: Record<number, string> = {
  401: 'Sign in to continue.',
  403: 'You can’t do that.',
  404: 'Not found.',
  409: 'That conflicts with something that changed.',
  429: 'Too many requests. Try again in a moment.',
};

/** An error body from the server (ours, or Better Auth's `{ message, code }`). */
async function errorFrom(res: Response): Promise<ApiError> {
  const text = await res.text().catch(() => '');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  const ours = apiErrorSchema.safeParse(json);
  if (ours.success) {
    const { code, message, details } = ours.data.error;
    return new ApiError(res.status, code, message, details);
  }
  const theirs = json as { message?: unknown; code?: unknown } | undefined;
  const message =
    typeof theirs?.message === 'string' && theirs.message
      ? theirs.message
      : (FALLBACK[res.status] ??
        (res.status >= 500
          ? 'The server ran into a problem. Try again.'
          : `Request failed (${res.status}).`));
  const code = typeof theirs?.code === 'string' ? theirs.code.toLowerCase() : `http_${res.status}`;
  return new ApiError(res.status, code, message);
}

type Ok<R> =
  R extends ClientResponse<infer T, infer S, infer _F>
    ? S extends SuccessStatusCode
      ? T
      : never
    : never;

/**
 * Await a request; resolve to its JSON body, or throw an `ApiError`. A write's `game` block is
 * taken off the body and celebrated (game-bus.ts).
 */
export async function call<R extends ClientResponse<unknown, number, string>>(
  request: Promise<R>,
): Promise<WithoutGame<Ok<R>>> {
  let res: R;
  try {
    res = await request;
  } catch (err) {
    throw new ApiError(0, 'network', 'Can’t reach the server. Check your connection.', err);
  }
  if (!res.ok) throw await errorFrom(res as unknown as Response);
  if (res.status === 204) return undefined as WithoutGame<Ok<R>>;
  return takeGame((await res.json()) as Ok<R>);
}

/** A message fit to show for any error. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong.';
}
