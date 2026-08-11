// Best-effort guess of a Monaco language id from a review title that looks
// like a filename (e.g. "utils.py", "Fix auth.middleware.ts"). Falls back to
// plaintext when nothing matches — there's no language field in the schema.
const EXTENSION_TO_LANGUAGE = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
  json: 'json',
  html: 'html',
  css: 'css',
  scss: 'scss',
  md: 'markdown'
};

export function detectLanguage(title) {
  if (!title) return 'plaintext';
  const match = title.trim().match(/\.([a-zA-Z0-9]+)$/);
  if (!match) return 'plaintext';
  const ext = match[1].toLowerCase();
  return EXTENSION_TO_LANGUAGE[ext] ?? 'plaintext';
}
