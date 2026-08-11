import sanitizeHtml from 'sanitize-html';
import { HttpError } from '../middleware/errorHandler.js';

// sanitize-html is pinned to 2.12.1 in package.json (not caret-ranged):
// newer versions pull an ESM-only htmlparser2, which Jest's CJS module
// resolution can't require() ("Must use import to load ES Module"). `npm
// audit` flags 2.12.1 for a javascript: URI advisory in attributes like
// href/formaction — irrelevant here since allowedAttributes is {} below, so
// no attributes survive at all, malicious or not.

// Strips all HTML/script markup from user-supplied text fields before they
// reach the database. React already escapes everything on render today (no
// dangerouslySetInnerHTML anywhere in the frontend), so this isn't the only
// line of defense — it's here so a future Markdown-rendering feature for
// comments (which would very likely use dangerouslySetInnerHTML on parsed
// output) can't reintroduce stored XSS through data written before that
// feature existed.
//
// Deliberately NOT applied to review.code_snapshot — that's source code
// displayed verbatim in Monaco (a text editor, not an HTML sink), and
// stripping tags out of e.g. an HTML/JSX file under review would corrupt
// the very thing being reviewed.

// sanitize-html HTML-encodes the text it keeps (so its output is safe to
// re-insert as HTML directly) — e.g. "x < 5" comes back as "x &lt; 5". We
// store plain text and rely on React to escape it at render time, so that
// encoding would otherwise show up as a literal "&lt;" on screen. Decoding
// the handful of entities sanitize-html actually produces undoes that
// without reopening any HTML injection risk, since the tags are already gone.
const ENTITY_MAP = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
function decodeEntities(str) {
  return str.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (match) => ENTITY_MAP[match]);
}

export function sanitizePlainText(value, { fieldName = 'value' } = {}) {
  const stripped = sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} });
  const cleaned = decodeEntities(stripped).trim();
  if (cleaned.length === 0) {
    throw new HttpError(400, `${fieldName} can't be empty after removing markup`);
  }
  return cleaned;
}
