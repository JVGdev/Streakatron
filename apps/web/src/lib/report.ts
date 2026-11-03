// Errors from actions run outside TanStack mutations (see actions.ts) end up where every failed
// request does: main.tsx sets the handler (toast, or sign-in on a 401).

import { toast } from 'sonner';
import { errorMessage } from './api';

let handler: (err: unknown) => void = (err) => toast.error(errorMessage(err));

export const setErrorHandler = (fn: (err: unknown) => void) => {
  handler = fn;
};

export const report = (err: unknown) => handler(err);

/** Run an action; a failure is reported (and resolves to undefined) instead of thrown. */
export async function attempt<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    report(err);
    return undefined;
  }
}
