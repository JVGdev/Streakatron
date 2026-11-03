import { describe, expect, it } from 'vitest';
import { ID_PREFIXES, idTime, isId, newId, parseId, ulid } from './ids';

describe('ulid', () => {
  it('is 26 Crockford base32 characters', () => {
    expect(ulid()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('sorts by time', () => {
    const a = ulid(1_700_000_000_000);
    const b = ulid(1_700_000_000_001);
    expect(a < b).toBe(true);
  });

  it('encodes known times', () => {
    expect(ulid(0).slice(0, 10)).toBe('0000000000');
    expect(ulid(2 ** 48 - 1).slice(0, 10)).toBe('7ZZZZZZZZZ');
  });

  it('rejects times out of range', () => {
    expect(() => ulid(-1)).toThrow(RangeError);
    expect(() => ulid(2 ** 48)).toThrow(RangeError);
  });

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 1000 }, () => ulid(42)));
    expect(seen.size).toBe(1000);
  });
});

describe('prefixed ids', () => {
  it('carries its kind', () => {
    const id = newId('task');
    expect(id.startsWith('tsk_')).toBe(true);
    expect(parseId(id)?.kind).toBe('task');
    expect(isId(id, 'task')).toBe(true);
    expect(isId(id, 'project')).toBe(false);
  });

  it('round-trips its time', () => {
    const t = Date.UTC(2026, 10, 3, 12, 0, 0, 123);
    expect(idTime(newId('goal', t))?.getTime()).toBe(t);
  });

  it('rejects malformed ids', () => {
    for (const bad of [
      '',
      'tsk',
      'tsk_',
      'xyz_01JC3Z0000000000000000000',
      'tsk_01jc3z00000000000000000000',
      'tsk_8ZZZZZZZZZZZZZZZZZZZZZZZZZ',
      42,
      null,
    ]) {
      expect(isId(bad)).toBe(false);
    }
  });

  it('has a unique prefix per kind', () => {
    const prefixes = Object.values(ID_PREFIXES);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});
