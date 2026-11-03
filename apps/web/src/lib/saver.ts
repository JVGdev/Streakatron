// Saving as you go, the one way every page does it (Quire's DES-4, ported). Framework-free so it
// can be unit-tested; `useAutosave` (autosave.ts) ties a Saver to a component.
//
// - What is saved is a value, compared as JSON with the last one the server took: a change is
//   never missed for being the second in a row, and a change undone before it goes isn't sent.
// - One save at a time: what changes while one is on its way goes next, as it is then.
// - Every live saver is in `live`, so everything waiting can be sent at once when the page is
//   hidden or closed (`flushAll`).

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

export interface Flushable {
  flush(): Promise<void>;
  busy(): boolean;
}

/** Every saver that may hold something not on the server yet. */
export const live = new Set<Flushable>();

/** Send everything that waits, now. */
export function flushAll(): Promise<void> {
  return Promise.allSettled([...live].map((s) => s.flush())).then(() => undefined);
}

/** Whether anything still waits or is on its way (warn before the page closes). */
export const anyBusy = () => [...live].some((s) => s.busy());

const json = (v: unknown) => JSON.stringify(v) ?? 'undefined';

export interface SaverEvents {
  status?: (s: SaveStatus) => void;
  /** A save failed; `first` is true for the first failure in a run (show one message, not many). */
  error?: (e: unknown, first: boolean) => void;
}

export class Saver<T> implements Flushable {
  status: SaveStatus = 'saved';
  private saved: string;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private chain: Promise<void> = Promise.resolve();
  private sending = false;
  private failing = false;

  constructor(
    private read: () => T,
    private send: (v: T) => Promise<unknown>,
    private delay = 700,
    private on: SaverEvents = {},
  ) {
    this.saved = json(read());
  }

  private set(s: SaveStatus) {
    if (s === this.status) return;
    this.status = s;
    this.on.status?.(s);
  }

  /** The value has (or may have) changed: saved a moment after the changes stop. */
  changed() {
    if (this.dirty()) {
      this.set('pending');
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.flush(), this.delay);
    } else if (!this.sending) {
      // changed back to what the server has
      clearTimeout(this.timer);
      this.timer = undefined;
      this.set(this.failing ? 'error' : 'saved');
    }
  }

  /** Not what the server last took. */
  dirty() {
    return json(this.read()) !== this.saved;
  }

  /** Waiting to be sent, or on its way. */
  busy() {
    return !!this.timer || this.sending;
  }

  /** The value now is what the server has (it came from there). */
  accept(v: T = this.read()) {
    this.saved = json(v);
    if (!this.sending && !this.dirty()) {
      clearTimeout(this.timer);
      this.timer = undefined;
      this.failing = false;
      this.set('saved');
    }
  }

  /** Send now (after the save on its way, if any). Resolves once the value as it is now is saved. */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    const p = this.chain.then(() => this.once());
    this.chain = p.catch(() => {});
    return p;
  }

  private async once() {
    const now = json(this.read());
    if (now === this.saved) {
      if (!this.timer) this.set(this.failing ? 'error' : 'saved');
      return;
    }
    this.set('saving');
    this.sending = true;
    try {
      await this.send(JSON.parse(now) as T);
      this.saved = now;
      this.failing = false;
    } catch (e) {
      // Kept as not saved: it goes with the next change, or when everything is flushed.
      this.on.error?.(e, !this.failing);
      this.failing = true;
    } finally {
      this.sending = false;
    }
    if (this.failing) this.set('error');
    else if (this.timer || this.dirty()) this.set('pending');
    else this.set('saved');
  }
}
