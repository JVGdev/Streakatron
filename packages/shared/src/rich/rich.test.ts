import { describe, expect, it } from 'vitest';
import { docFromText, textFromDoc, type RichDoc } from '.';

describe('rich text', () => {
  it('makes one paragraph per line, keeping blank lines', () => {
    expect(docFromText('First\n\nThird')).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'Third' }] },
      ],
    });
  });

  it('has no document for empty text', () => {
    expect(docFromText('')).toBeNull();
    expect(docFromText('  \n \n')).toBeNull();
  });

  it('round-trips plain text', () => {
    for (const text of ['One line', 'a\nb', 'a\n\nb', 'a\n\n\nb', '  indented', 'crlf\r\nline']) {
      expect(textFromDoc(docFromText(text))).toBe(text.replace(/\r\n/g, '\n'));
    }
  });

  it('flattens editor documents: headings, lists, breaks and mentions', () => {
    const doc: RichDoc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Plan' }] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }],
            },
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'see ' },
                    { type: 'mention', attrs: { id: 'gol_x', label: 'Pass the exam' } },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'line', marks: [{ type: 'bold' }] },
            { type: 'hardBreak' },
            { type: 'text', text: 'break' },
          ],
        },
      ],
    };
    expect(textFromDoc(doc)).toBe('Plan\none\nsee @Pass the exam\nline\nbreak');
  });

  it('is empty for no document', () => {
    expect(textFromDoc(null)).toBe('');
    expect(textFromDoc({ type: 'doc' })).toBe('');
  });
});
