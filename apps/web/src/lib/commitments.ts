// Small reads of a commitment's state shared by Today, the page, the sheet and the palette.

import type { Commitment } from './queries';

/** Whether today's part is done: met, or (a weekly check) ticked today. */
export const doneToday = (c: Pick<Commitment, 'day' | 'measure'>) =>
  c.day.met || (c.measure === 'check' && c.day.today > 0);
