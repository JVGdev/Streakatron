import { describe, expect, it } from 'vitest';
import { ApiError, call, errorMessage } from './api';
import { onGame, type GameBlock } from './game-bus';

const respond = (status: number, body?: unknown) =>
  Promise.resolve(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  ) as never;

describe('call', () => {
  it('returns the JSON body of a success', async () => {
    expect(await call(respond(200, { ok: true }))).toEqual({ ok: true });
  });

  it('takes the game block off a write and hands it to the listeners', async () => {
    const seen: GameBlock[] = [];
    const stop = onGame((g) => seen.push(g));
    const game = { events: [{ type: 'xp', amount: 10 }], state: {} };
    expect(await call(respond(200, { id: 'tsk_1', game }))).toEqual({ id: 'tsk_1' });
    expect(await call(respond(200, { id: 'tsk_2', game: null }))).toEqual({ id: 'tsk_2' });
    stop();
    expect(seen).toEqual([game]);
  });

  it('throws our error shape with the server’s message', async () => {
    const err = await call(
      respond(400, {
        error: { code: 'invalid_request', message: 'Enter a valid email', details: [] },
      }),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 400,
      code: 'invalid_request',
      message: 'Enter a valid email',
    });
  });

  it('understands Better Auth’s error shape', async () => {
    const err = await call(
      respond(401, { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }),
    ).catch((e: unknown) => e);
    expect(err).toMatchObject({
      status: 401,
      code: 'invalid_email_or_password',
      isUnauthorized: true,
    });
  });

  it('falls back to a clear message for bodies it can’t read', async () => {
    const err = await call(
      Promise.resolve(new Response('<html>Bad gateway</html>', { status: 502 })) as never,
    ).catch((e: unknown) => e);
    expect(errorMessage(err)).toBe('The server ran into a problem. Try again.');
  });

  it('turns a network failure into an ApiError', async () => {
    const err = await call(Promise.reject(new TypeError('fetch failed'))).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 0, code: 'network' });
    expect(errorMessage(err)).toMatch(/can’t reach the server/i);
  });
});
