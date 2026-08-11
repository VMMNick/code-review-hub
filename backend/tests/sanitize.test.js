import { describe, it, expect } from '@jest/globals';
import { sanitizePlainText } from '../src/utils/sanitize.js';
import { HttpError } from '../src/middleware/errorHandler.js';

describe('sanitizePlainText', () => {
  it('strips HTML tags but keeps their text content', () => {
    expect(sanitizePlainText('<b>hello</b> world')).toBe('hello world');
  });

  it('strips <script> tags along with their content', () => {
    const result = sanitizePlainText('<script>alert(1)</script>safe');
    expect(result).toBe('safe');
    expect(result).not.toContain('alert');
  });

  it('decodes entities so comparisons like "x < 5" render literally, not as &lt;', () => {
    expect(sanitizePlainText('x < 5 and y > 2')).toBe('x < 5 and y > 2');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizePlainText('  hi  ')).toBe('hi');
  });

  it('throws an HttpError(400) when nothing is left after stripping markup', () => {
    expect(() => sanitizePlainText('<script></script>')).toThrow(HttpError);
  });
});
