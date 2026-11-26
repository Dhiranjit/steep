/**
 * Markdown parser module with marked.js integration and offline fallback
 */

// Configure marked if loaded via CDN
if (window.marked && typeof window.marked.setOptions === 'function') {
  window.marked.setOptions({
    gfm: true,
    breaks: true,
  });
}

/**
 * Escapes unsafe HTML characters to prevent XSS.
 */
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

/**
 * Parses markdown into HTML using marked.js, falling back to a built-in parser if offline.
 */
function renderMarkdownToHtml(markdown) {
  if (!markdown) return '';

  if (window.marked && typeof window.marked.parse === 'function') {
    try {
      return window.marked.parse(markdown);
    } catch (e) {
      console.warn('marked.js parsing failed, using fallback parser', e);
    }
  }

  return fallbackMarkdownParse(markdown);
}

/**
 * Built-in fallback parser for headings, lists, blockquotes, code, and bold/italic.
 */
function fallbackMarkdownParse(text) {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks ```code```
  html = html.replace(/```([a-z0-9_-]*)\n([\s\S]*?)```/gim, (match, lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Inline code `code`
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Bold & Italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/gim, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');

  // Blockquotes
  html = html.replace(/^\> (.*$)/gim, '<blockquote><p>$1</p></blockquote>');

  // Unordered lists
  html = html.replace(/^\s*[\-\*]\s+(.*$)/gim, '<ul><li>$1</li></ul>');
  html = html.replace(/<\/ul>\s*<ul>/gim, '');

  // Paragraphs
  html = html.split(/\n{2,}/).map(chunk => {
    const trimmed = chunk.trim();
    if (!trimmed) return '';
    if (/^<(h[1-6]|ul|ol|blockquote|pre)/.test(trimmed)) return chunk;
    return `<p>${chunk.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');

  return html;
}

function timestampToSeconds(ts) {
  const parts = ts.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

/**
 * Replaces [MM:SS] / [H:MM:SS] (and [MM:SS - MM:SS]) timestamps in rendered text nodes
 * with clickable YouTube links jumping directly to that timestamp.
 */
function linkifyTimestampsInElement(container, videoUrl) {
  if (!container || !videoUrl) return;

  let baseUrl;
  try {
    baseUrl = new URL(videoUrl);
  } catch (_) {
    return;
  }

  const tsRegex = /\[(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*[-–—]\s*(\d{1,2}:\d{2}(?::\d{2})?))?\]/g;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes = [];

  let node;
  while ((node = walker.nextNode())) {
    if (!node.nodeValue || !node.nodeValue.includes(':')) continue;
    if (node.parentElement && node.parentElement.closest('a, code, pre')) continue;
    textNodes.push(node);
  }

  textNodes.forEach((textNode) => {
    const text = textNode.nodeValue;
    tsRegex.lastIndex = 0;
    if (!tsRegex.test(text)) return;

    tsRegex.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;

    while ((match = tsRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      const startTs = match[1];
      const endTs = match[2];
      const seconds = timestampToSeconds(startTs);
      const linkUrl = new URL(baseUrl.href);
      linkUrl.searchParams.set('t', `${seconds}s`);

      const link = document.createElement('a');
      link.className = 'timestamp-link';
      link.href = linkUrl.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = `Watch from ${startTs} on YouTube`;
      link.textContent = endTs ? `${startTs}–${endTs}` : startTs;
      frag.appendChild(link);

      lastIndex = tsRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    textNode.parentNode.replaceChild(frag, textNode);
  });
}

window.SteepMarkdown = {
  renderMarkdownToHtml,
  escapeHtml,
  linkifyTimestampsInElement,
};

