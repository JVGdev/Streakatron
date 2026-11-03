import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { ZodType } from 'zod';
import { errorBody } from './errors';

/** Validate a part of the request; failures answer 400 with each field's problem. */
export const validate = <T extends ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const fields = result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      return c.json(
        errorBody('invalid_request', fields[0]?.message ?? 'Invalid request.', fields),
        400,
      );
    }
  });
