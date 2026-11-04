// Write responses carry a `game` block (XP, level ups, streak days) next to what they wrote.
// `call()` takes it off the body and hands it here, so every write celebrates the same way
// without each action knowing about the game. The listener lives in `GameMoments`.

import type { GameEvent, GameState } from '@streakatron/shared/game';

export interface GameBlock {
  events: GameEvent[];
  state: GameState;
}

type Listener = (block: GameBlock) => void;
const listeners = new Set<Listener>();

export function onGame(listener: Listener) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function emitGame(block: GameBlock) {
  for (const l of listeners) l(block);
}

/** A response body without its game block (what callers and caches see). */
export type WithoutGame<T> = T extends { game: unknown } ? Omit<T, 'game'> : T;

/** Take the game block off a response body, emitting it when there is one. */
export function takeGame<T>(body: T): WithoutGame<T> {
  if (body && typeof body === 'object' && !Array.isArray(body) && 'game' in body) {
    const { game, ...rest } = body as { game: GameBlock | null };
    if (game) emitGame(game);
    return rest as WithoutGame<T>;
  }
  return body as WithoutGame<T>;
}
