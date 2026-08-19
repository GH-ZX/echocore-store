import { createElement } from 'react';

/**
 * Turn plain text into React nodes with clickable links (target="_blank").
 * Newlines are preserved as text — callers keep `whitespace-pre-wrap`.
 */
const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/g;

function cleanUrl(raw) {
  let out = raw;
  while (/[.,;:!?)\]]$/.test(out)) out = out.slice(0, -1);
  return out;
}

export function renderRichTextLinks(text, { linkClassName = '' } = {}) {
  if (!text) return null;
  const nodes = [];
  const re = new RegExp(URL_RE.source, 'g');
  let lastIndex = 0;
  let m;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    const before = text.slice(lastIndex, m.index);
    if (before) nodes.push(before);
    const raw = cleanUrl(m[0]);
    if (raw) {
      const href = raw.startsWith('http') ? raw : `https://${raw}`;
      nodes.push(createElement(
        'a',
        {
          key: `link-${key++}`,
          href,
          target: '_blank',
          rel: 'noopener noreferrer',
          dir: 'ltr',
          className: `inline-block break-all text-[var(--accent)] underline underline-offset-2 font-semibold hover:opacity-80 ${linkClassName}`,
        },
        raw,
      ));
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}