// A component's value saved as you go (saver.ts says how).
//
//   const save = useAutosave(draft, (v) => call(api.tasks[':id'].$patch({ param: { id }, json: v })));
//   save.status → 'saved' | 'pending' | 'saving' | 'error'

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from './api';
import { live, Saver, type SaveStatus } from './saver';

export interface AutosaveOptions {
  delay?: number;
  /** What is being saved, for the message when a save fails (“the task”). */
  what?: string;
}

export function useAutosave<T>(
  value: T,
  send: (v: T) => Promise<unknown>,
  { delay = 700, what }: AutosaveOptions = {},
) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const valueRef = useRef(value);
  const sendRef = useRef(send);
  const saverRef = useRef<Saver<T> | null>(null);

  // Latest value and send, for the saver to read when it sends.
  useLayoutEffect(() => {
    valueRef.current = value;
    sendRef.current = send;
  });

  // The saver starts from the value at mount (what the server has); unmounting sends what waits.
  useEffect(() => {
    const saver = new Saver<T>(
      () => valueRef.current,
      (v) => sendRef.current(v),
      delay,
      {
        status: setStatus,
        error: (e, first) => {
          if (first) {
            toast.error(`Couldn’t save${what ? ` ${what}` : ''}`, { description: errorMessage(e) });
          }
        },
      },
    );
    saverRef.current = saver;
    live.add(saver);
    return () => {
      void saver.flush();
      live.delete(saver);
      saverRef.current = null;
    };
  }, [delay, what]);

  useEffect(() => {
    saverRef.current?.changed();
  }, [value]);

  return {
    status,
    flush: () => saverRef.current?.flush() ?? Promise.resolve(),
    /** The value now is what the server has (e.g. after a refetch). */
    accept: (v?: T) => saverRef.current?.accept(v),
    dirty: () => saverRef.current?.dirty() ?? false,
  };
}
