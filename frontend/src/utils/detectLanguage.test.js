import { describe, it, expect } from 'vitest';
import { detectLanguage } from './detectLanguage.js';

describe('detectLanguage', () => {
  it('maps known extensions to Monaco language ids', () => {
    expect(detectLanguage('utils.py')).toBe('python');
    expect(detectLanguage('index.ts')).toBe('typescript');
    expect(detectLanguage('Component.tsx')).toBe('typescript');
    expect(detectLanguage('main.go')).toBe('go');
  });

  it('falls back to plaintext for titles without a recognizable extension', () => {
    expect(detectLanguage('Fix the login bug')).toBe('plaintext');
    expect(detectLanguage('')).toBe('plaintext');
    expect(detectLanguage(undefined)).toBe('plaintext');
  });

  it('falls back to plaintext for unknown extensions', () => {
    expect(detectLanguage('notes.xyz')).toBe('plaintext');
  });

  it('is case-insensitive on the extension', () => {
    expect(detectLanguage('Script.PY')).toBe('python');
  });
});
