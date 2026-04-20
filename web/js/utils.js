// ═══════════════════════════════════════════════════════════════
//  UTILS — shared helpers used across modules.
//  Replaces the per-module copies of _esc / _toast and adds
//  diacritic-insensitive normalization for search.
// ═══════════════════════════════════════════════════════════════

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escapeRe(s) {
  return String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Lowercase + strip diacritics. Used for search matching ("kresava" → "Křesava"). */
export function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function debounce(fn, ms = 120) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

/** Diacritic-insensitive slug. Used to build stable heading IDs for
 *  the article outline (TOC) so anchor links survive small edits
 *  as long as the human-readable heading text is unchanged.        */
export function slugify(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

/** Scan raw markdown for ATX headings (# .. ###) and return an
 *  array of { level, text, slug } entries. Heading IDs in the
 *  rendered HTML match these slugs, so anchors link up cleanly. */
export function extractOutline(src) {
  const text = String(src ?? '');
  if (!text) return [];
  const out = [];
  for (const line of text.split('\n')) {
    const m = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    out.push({
      level: m[1].length,
      text:  m[2].trim(),
      slug:  slugify(m[2].trim()),
    });
  }
  return out;
}

/**
 * Render Markdown to sanitized HTML for long-description fields.
 * Uses vendored marked + DOMPurify (loaded globally from index.html).
 * Falls back to escaped + <br>-joined text if libs aren't loaded yet.
 *
 * Post-processes the output to add `id` attributes onto h1..h6
 * elements (matching `slugify(heading)`), so the sidebar outline
 * links can jump to sections.
 */
export function renderMarkdown(src) {
  const text = String(src ?? '');
  if (!text.trim()) return '';
  const marked  = window.marked;
  const purify  = window.DOMPurify;
  if (!marked || !purify) {
    return esc(text).replace(/\n/g, '<br>');
  }
  const html = typeof marked.parse === 'function'
    ? marked.parse(text, { breaks: true, gfm: true })
    : marked(text, { breaks: true, gfm: true });
  const sanitized = purify.sanitize(html, {
    ADD_ATTR: ['target', 'rel', 'id'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
  });
  if (typeof document === 'undefined') return sanitized;
  const tmp = document.createElement('div');
  tmp.innerHTML = sanitized;
  tmp.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
    if (!h.id) h.id = slugify(h.textContent || '');
  });
  return tmp.innerHTML;
}

/** Toast notification — reuses #app-toast singleton across all callers. */
export function toast(msg, ok = true) {
  let t = document.getElementById('app-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'app-toast';
    t.className = 'app-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = 'app-toast show ' + (ok ? 'ok' : 'err');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), 2500);
}
