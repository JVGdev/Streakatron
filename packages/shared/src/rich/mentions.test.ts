import { describe, expect, it } from 'vitest';
import { newId } from '../ids';
import {
  linkableKind,
  mentionsOf,
  replaceMentionId,
  snippetAround,
  type RichDoc,
  type RichNode,
} from '.';

const mention = (id: string, label = 'X'): RichNode => ({ type: 'mention', attrs: { id, label } });
const text = (t: string): RichNode => ({ type: 'text', text: t });
const p = (...content: RichNode[]): RichNode => ({ type: 'paragraph', content });
const doc = (...content: RichNode[]): RichDoc => ({ type: 'doc', content });

describe('mentions', () => {
  const goal = newId('goal');
  const task = newId('task');
  const project = newId('project');

  it('knows which ids can be mentioned', () => {
    expect(linkableKind(goal)).toBe('goal');
    expect(linkableKind(newId('area'))).toBe('area');
    expect(linkableKind(newId('snapshot'))).toBeNull();
    expect(linkableKind('gol_nope')).toBeNull();
    expect(linkableKind(42)).toBeNull();
  });

  it('finds each target once, in order, with the line it is in', () => {
    const d = doc(
      p(text('Before '), mention(goal, 'Pass the exam'), text(' after')),
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [p(mention(task, 'Read ch. 3'), text(' first'))] }],
      },
      p(text('Again '), mention(goal, 'Pass the exam')),
      { type: 'heading', attrs: { level: 2 }, content: [mention(project, 'Calculus')] },
    );
    expect(mentionsOf(d)).toEqual([
      { targetId: goal, snippet: 'Before @Pass the exam after' },
      { targetId: task, snippet: '@Read ch. 3 first' },
      { targetId: project, snippet: '@Calculus' },
    ]);
  });

  it('reads mentions with their current titles when given', () => {
    const d = doc(p(text('See '), mention(goal, 'Old name'), text(' and '), mention(task, 'T')));
    const titles = new Map([[goal, 'New name']]);
    expect(mentionsOf(d, (id) => titles.get(id))).toEqual([
      { targetId: goal, snippet: 'See @New name and @T' },
      { targetId: task, snippet: 'See @New name and @T' },
    ]);
  });

  it('skips mentions without a usable id', () => {
    const d = doc(
      p(mention('gol_bad'), { type: 'mention', attrs: {} }, mention(newId('snapshot'))),
    );
    expect(mentionsOf(d)).toEqual([]);
    expect(mentionsOf(null)).toEqual([]);
    expect(mentionsOf(doc())).toEqual([]);
  });

  it('cuts long lines around the mention, at word boundaries', () => {
    const words = (n: number, w: string) => Array.from({ length: n }, () => w).join(' ');
    const line = `${words(60, 'before')} @Goal ${words(60, 'after')}`;
    const s = snippetAround(line, line.indexOf('@Goal'));
    expect(s.length).toBeLessThanOrEqual(162);
    expect(s).toMatch(/^…before/);
    expect(s).toMatch(/after…$/);
    expect(s).toContain('@Goal');
    expect(snippetAround('  short\n text ', 0)).toBe('short text');
  });
});

describe('replaceMentionId', () => {
  it('points every mention of one id at another', () => {
    const [a, b, c] = [newId('task'), newId('goal'), newId('commitment')];
    const before = doc(p(mention(a), text(' and '), mention(b)), p(mention(a)));
    const out = replaceMentionId(before, a, c);
    expect(mentionsOf(out).map((m) => m.targetId)).toEqual([c, b]);
    // The original is untouched.
    expect(mentionsOf(before).map((m) => m.targetId)).toEqual([a, b]);
  });
});
