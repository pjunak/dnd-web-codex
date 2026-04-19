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

/**
 * Render Markdown to sanitized HTML for long-description fields.
 * Uses vendored marked + DOMPurify (loaded globally from index.html).
 * Falls back to escaped + <br>-joined text if libs aren't loaded yet.
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
  return purify.sanitize(html, {
    ADD_ATTR: ['target', 'rel'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
  });
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
