import { useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';

/** Open a task in the detail sheet (the `task` search param, so it survives a reload). */
export function useOpenTask() {
  const navigate = useNavigate();
  return useCallback(
    (id: string | undefined) =>
      void navigate({
        to: '.',
        search: (prev: Record<string, unknown>) => ({ ...prev, task: id }),
        replace: !id,
      } as never),
    [navigate],
  );
}
