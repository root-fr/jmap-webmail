import DOMPurify from 'dompurify';

/**
 * Unified DOMPurify configuration for email content
 * Blocks all script execution vectors while preserving formatting
 * NOTE: <style> tags are forbidden to prevent global CSS injection
 * Inline style attributes are still allowed for element-specific styling
 */
export const EMAIL_SANITIZE_CONFIG = {
  ADD_TAGS: [],
  ADD_ATTR: ['target', 'rel', 'style', 'class', 'width', 'height', 'align', 'valign', 'bgcolor', 'color'],
  ALLOW_DATA_ATTR: false,
  FORCE_BODY: true,
  FORBID_TAGS: [
    'script', 'iframe', 'object', 'embed', 'form',
    'input', 'button', 'meta', 'link', 'base',
    'svg', 'math', 'style'
  ],
  FORBID_ATTR: [
    'onerror', 'onload', 'onclick', 'onmouseover',
    'onfocus', 'onblur', 'onchange', 'onsubmit',
    'onkeydown', 'onkeyup', 'onmousedown', 'onmouseup'
  ],
};

/**
 * Build a per-render DOMPurify config with FRESH FORBID_TAGS/FORBID_ATTR arrays.
 * Callers that block external content append to these arrays; copying by value
 * here prevents mutation of the shared module-level EMAIL_SANITIZE_CONFIG (which
 * would leak the untrusted-sender policy into all other sanitize calls and grow
 * the arrays without bound).
 */
export function buildEmailSanitizeConfig(blockExternal: boolean) {
  return {
    ...EMAIL_SANITIZE_CONFIG,
    FORBID_TAGS: blockExternal
      ? [...EMAIL_SANITIZE_CONFIG.FORBID_TAGS, 'link']
      : [...EMAIL_SANITIZE_CONFIG.FORBID_TAGS],
    FORBID_ATTR: blockExternal
      ? [...EMAIL_SANITIZE_CONFIG.FORBID_ATTR, 'background']
      : [...EMAIL_SANITIZE_CONFIG.FORBID_ATTR],
  };
}

/**
 * Sanitize email HTML content
 * @param html - Raw HTML content from email
 * @returns Sanitized HTML safe for rendering
 */
export function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, EMAIL_SANITIZE_CONFIG);
}

/**
 * Sanitize HTML signature with stricter rules
 * Only allows basic formatting, no external resources
 */
export const SIGNATURE_SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'a', 'span', 'div'],
  ALLOWED_ATTR: ['href', 'style', 'class'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'img', 'video', 'audio'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
};

/**
 * Sanitize HTML signature for storage and display
 * @param html - User-provided HTML signature
 * @returns Sanitized signature (no scripts, no external resources)
 */
export function sanitizeSignatureHtml(html: string): string {
  if (!html?.trim()) return '';
  return DOMPurify.sanitize(html, SIGNATURE_SANITIZE_CONFIG);
}

/**
 * Safe HTML parsing without execution
 * Use instead of innerHTML for detection/parsing
 */
export function parseHtmlSafely(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

/**
 * Detect if HTML content has rich formatting
 * Safe alternative to innerHTML parsing
 */
export function hasRichFormatting(html: string): boolean {
  const doc = parseHtmlSafely(html);
  return !!doc.querySelector(
    'table, img, style, b, strong, i, em, u, font, ' +
    'div[style], span[style], p[style], ' +
    'h1, h2, h3, h4, h5, h6, ul, ol, blockquote'
  );
}

/**
 * Detect if HTML content needs iframe rendering for CSS isolation.
 * More narrow than hasRichFormatting() — only triggers on patterns
 * that can cause CSS bleed into the host app:
 * - table layouts (newsletter-style)
 * - style blocks (global CSS rules)
 * - link tags (external stylesheets)
 * - background/background-image in inline styles (complex rendering)
 */
export function needsIframeRendering(html: string): boolean {
  if (!html) return false;
  const doc = parseHtmlSafely(html);
  if (doc.querySelector('table, style, link[rel="stylesheet"]')) return true;
  const allElements = doc.querySelectorAll('[style]');
  for (const el of allElements) {
    const styleAttr = el.getAttribute('style') || '';
    if (/background(?:-image)?\s*:.*url\s*\(/i.test(styleAttr)) return true;
  }
  return false;
}

/**
 * Escape all five HTML-significant characters so the result is safe to
 * interpolate into both element text and attribute values. `&` MUST run
 * first, otherwise later substitutions get double-escaped.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Convert a plain-text email body to HTML safe for direct rendering.
 * Escapes HTML-significant chars (including quotes, to prevent attribute
 * escape in the linkifier), preserves line breaks and tabs, and linkifies
 * http(s) URLs. Quotes inside URLs stay as entities — the browser decodes
 * them as part of the href value, never as attribute delimiters.
 */
export function plainTextToSafeHtml(
  text: string,
  options?: { linkClassName?: string }
): string {
  const linkClass = options?.linkClassName
    ? ` class="${escapeHtml(options.linkClassName)}"`
    : '';
  return escapeHtml(text)
    .replace(/\r\n/g, '<br>')
    .replace(/\r/g, '<br>')
    .replace(/\n/g, '<br>')
    .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;')
    .replace(
      /(https?:\/\/[^\s<]+)/g,
      `<a href="$1" target="_blank" rel="noopener noreferrer"${linkClass}>$1</a>`
    );
}

/**
 * Collapse empty containers left behind when external images are blocked.
 * Walks up from each blocked img to find the nearest table cell or wrapper div
 * and hides it if it contains no meaningful visible content.
 */
export function collapseBlockedImageContainers(html: string): string {
  const doc = parseHtmlSafely(html);
  const blockedImages = doc.querySelectorAll('img[data-blocked-src]');

  blockedImages.forEach((img) => {
    let el: HTMLElement | null = img.parentElement;
    while (el && el !== doc.body) {
      if (el.tagName === 'TD' || el.tagName === 'TH' || (el.tagName === 'DIV' && el.parentElement?.tagName === 'TD')) {
        const hasVisibleText = el.textContent?.replace(/[\s\u00A0]+/g, '').trim();
        const hasVisibleMedia = el.querySelector('img:not([data-blocked-src]), video, canvas');
        const hasLinks = el.querySelector('a[href]');
        if (!hasVisibleText && !hasVisibleMedia && !hasLinks) {
          el.style.display = 'none';
          el.style.height = '0';
          el.style.padding = '0';
          el.style.overflow = 'hidden';
        }
        break;
      }
      if (el.tagName === 'TABLE' || el.tagName === 'TR') break;
      el = el.parentElement;
    }
  });

  return doc.body.innerHTML;
}
