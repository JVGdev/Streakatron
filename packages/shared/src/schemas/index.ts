// Zod schemas shared by the server (validation) and the web app (forms, types).

import { z } from 'zod';
import { isId, type IdKind } from '../ids';
import { isDateString, isValidTimeZone } from '../time';

export const dateString = z.string().refine(isDateString, 'Expected a YYYY-MM-DD day');

export const timeZone = z.string().refine(isValidTimeZone, 'Unknown time zone');

/** An id of one kind, e.g. `idOf('task')` accepts `tsk_…` only. */
export const idOf = (kind: IdKind) =>
  z.string().refine((s) => isId(s, kind), `Expected a ${kind} id`);

// --- Errors ----------------------------------------------------------------------------------

/** Every failed API response has this body, so the client can show one clear message. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

// --- Setup (the first account) ---------------------------------------------------------------

export const setupSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100),
  email: z.email('Enter a valid email').max(254),
  password: z.string().min(8, 'Use at least 8 characters').max(128),
  timezone: timeZone,
});
export type SetupInput = z.infer<typeof setupSchema>;

// --- User settings ---------------------------------------------------------------------------

export const focusPresetSchema = z.object({
  focusMinutes: z.int().min(1).max(240),
  breakMinutes: z.int().min(0).max(60),
});

export const questSettingsSchema = z.object({
  /** Quest types turned off by the user (every type but comeback can rest). */
  restingTypes: z.array(z.string()).max(20),
  timeQuestMinMinutes: z.int().min(5).max(600),
  timeQuestMaxMinutes: z.int().min(5).max(600),
});

export const userSettingsSchema = z.object({
  timezone: timeZone,
  dayStartHour: z.int().min(0).max(23),
  /** 0 = Sunday … 6 = Saturday. */
  weekStart: z.int().min(0).max(6),
  activeProjectLimit: z.int().min(1).max(20),
  weeklyActiveDayTarget: z.int().min(1).max(7),
  focusPresets: z.array(focusPresetSchema).min(1).max(6),
  questSettings: questSettingsSchema,
});
export type UserSettings = z.infer<typeof userSettingsSchema>;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  timezone: 'UTC',
  dayStartHour: 4,
  weekStart: 1,
  activeProjectLimit: 3,
  weeklyActiveDayTarget: 4,
  focusPresets: [
    { focusMinutes: 25, breakMinutes: 5 },
    { focusMinutes: 50, breakMinutes: 10 },
  ],
  questSettings: { restingTypes: [], timeQuestMinMinutes: 15, timeQuestMaxMinutes: 180 },
};
