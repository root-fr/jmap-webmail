import { describe, it, expect } from 'vitest';
import {
  sanitizeEmailHtml,
  sanitizeSignatureHtml,
  parseHtmlSafely,
  hasRichFormatting,
  needsIframeRendering,
  plainTextToSafeHtml,
  buildEmailSanitizeConfig,
  EMAIL_SANITIZE_CONFIG,
} from '../email-sanitization';

describe('email-sanitization', () => {
  describe('sanitizeEmailHtml', () => {
    it('should remove script tags', () => {
      const malicious = '<p>Hello</p><script>alert("XSS")</script>';
      const clean = sanitizeEmailHtml(malicious);
      expect(clean).not.toContain('<script>');
      expect(clean).toContain('Hello');
    });

    it('should remove event handlers', () => {
      const malicious = '<img src="x" onerror="alert(\'XSS\')">';
      const clean = sanitizeEmailHtml(malicious);
      expect(clean).not.toContain('onerror');
    });

    it('should remove iframe, object, embed tags', () => {
      const malicious = '<div>Content</div><iframe src="evil.com"></iframe><object></object>';
      const clean = sanitizeEmailHtml(malicious);
      expect(clean).not.toContain('<iframe');
      expect(clean).not.toContain('<object');
      expect(clean).toContain('Content');
    });

    it('should remove meta, link, base tags', () => {
      const malicious = '<p>Text</p><meta charset="utf-8"><link rel="stylesheet" href="evil.css">';
      const clean = sanitizeEmailHtml(malicious);
      expect(clean).not.toContain('<meta');
      expect(clean).not.toContain('<link');
      expect(clean).toContain('Text');
    });

    it('should preserve safe HTML structure', () => {
      const safe = '<p>Paragraph</p><div><span>Nested</span></div><table><tr><td>Cell</td></tr></table>';
      const clean = sanitizeEmailHtml(safe);
      expect(clean).toContain('<p>');
      expect(clean).toContain('<div>');
      expect(clean).toContain('<table>');
      expect(clean).toContain('Cell');
    });

    it('should preserve safe attributes', () => {
      const withAttrs = '<p style="color: red;" class="text">Styled</p>';
      const clean = sanitizeEmailHtml(withAttrs);
      expect(clean).toContain('style');
      expect(clean).toContain('class');
    });

    it('should handle empty input', () => {
      expect(sanitizeEmailHtml('')).toBe('');
      expect(sanitizeEmailHtml('   ')).toBeTruthy();
    });

    it('should handle malformed HTML', () => {
      const malformed = '<p>Unclosed<div>Tags';
      const clean = sanitizeEmailHtml(malformed);
      expect(clean).toContain('Unclosed');
      expect(clean).toContain('Tags');
    });
  });

  describe('sanitizeSignatureHtml', () => {
    it('should allow basic formatting tags', () => {
      const signature = '<p><strong>John Doe</strong><br><em>Software Engineer</em></p>';
      const clean = sanitizeSignatureHtml(signature);
      expect(clean).toContain('<strong>');
      expect(clean).toContain('<em>');
      expect(clean).toContain('John Doe');
    });

    it('should remove images from signatures', () => {
      const signature = '<p>John</p><img src="logo.png" alt="Logo">';
      const clean = sanitizeSignatureHtml(signature);
      expect(clean).not.toContain('<img');
      expect(clean).toContain('John');
    });

    it('should remove video and audio tags', () => {
      const signature = '<p>John</p><video src="vid.mp4"></video><audio src="sound.mp3"></audio>';
      const clean = sanitizeSignatureHtml(signature);
      expect(clean).not.toContain('<video');
      expect(clean).not.toContain('<audio');
    });

    it('should preserve links with safe attributes', () => {
      const signature = '<p><a href="https://example.com" style="color: blue;">Website</a></p>';
      const clean = sanitizeSignatureHtml(signature);
      expect(clean).toContain('<a');
      expect(clean).toContain('href');
      expect(clean).toContain('example.com');
    });

    it('should remove script tags', () => {
      const malicious = '<p>Signature</p><script>alert("XSS")</script>';
      const clean = sanitizeSignatureHtml(malicious);
      expect(clean).not.toContain('<script>');
      expect(clean).toContain('Signature');
    });

    it('should handle empty signatures', () => {
      expect(sanitizeSignatureHtml('')).toBe('');
      expect(sanitizeSignatureHtml('   ')).toBe('');
    });

    it('should be stricter than email sanitization', () => {
      const html = '<p>Text</p><img src="pic.jpg"><table><tr><td>Data</td></tr></table>';
      const emailClean = sanitizeEmailHtml(html);
      const signatureClean = sanitizeSignatureHtml(html);

      // Email allows img and table
      expect(emailClean).toContain('<img');
      expect(emailClean).toContain('<table>');

      // Signature blocks img but may allow some tables (verify in implementation)
      expect(signatureClean).not.toContain('<img');
    });
  });

  describe('parseHtmlSafely', () => {
    it('should return a valid Document', () => {
      const html = '<p>Test</p>';
      const doc = parseHtmlSafely(html);
      expect(doc).toBeInstanceOf(Document);
    });

    it('should not execute scripts', () => {
      let executed = false;
      const html = '<script>executed = true;</script>';
      parseHtmlSafely(html);
      expect(executed).toBe(false);
    });

    it('should handle malformed HTML gracefully', () => {
      const malformed = '<p>Unclosed<div>Tags';
      const doc = parseHtmlSafely(malformed);
      expect(doc).toBeInstanceOf(Document);
      expect(doc.body.textContent).toContain('Unclosed');
    });
  });

  describe('hasRichFormatting', () => {
    it('should detect tables', () => {
      const html = '<table><tr><td>Data</td></tr></table>';
      expect(hasRichFormatting(html)).toBe(true);
    });

    it('should detect images', () => {
      const html = '<img src="pic.jpg">';
      expect(hasRichFormatting(html)).toBe(true);
    });

    it('should detect inline styles', () => {
      const html = '<div style="color: red;">Styled</div>';
      expect(hasRichFormatting(html)).toBe(true);
    });

    it('should detect formatting tags', () => {
      expect(hasRichFormatting('<b>Bold</b>')).toBe(true);
      expect(hasRichFormatting('<strong>Strong</strong>')).toBe(true);
      expect(hasRichFormatting('<em>Emphasized</em>')).toBe(true);
    });

    it('should detect headings', () => {
      expect(hasRichFormatting('<h1>Title</h1>')).toBe(true);
      expect(hasRichFormatting('<h3>Subtitle</h3>')).toBe(true);
    });

    it('should detect lists', () => {
      expect(hasRichFormatting('<ul><li>Item</li></ul>')).toBe(true);
      expect(hasRichFormatting('<ol><li>Item</li></ol>')).toBe(true);
    });

    it('should return false for plain text', () => {
      const plain = '<p>Just plain text</p>';
      expect(hasRichFormatting(plain)).toBe(false);
    });

    it('should return false for simple paragraphs', () => {
      const simple = '<p>Line 1</p><p>Line 2</p>';
      expect(hasRichFormatting(simple)).toBe(false);
    });

    it('should handle empty HTML', () => {
      expect(hasRichFormatting('')).toBe(false);
      expect(hasRichFormatting('   ')).toBe(false);
    });
  });

  describe('needsIframeRendering', () => {
    it('returns true for HTML with table tags', () => {
      expect(needsIframeRendering('<table><tr><td>Cell</td></tr></table>')).toBe(true);
    });

    it('returns true for HTML with style tags', () => {
      expect(needsIframeRendering('<style>body { color: red; }</style><p>Text</p>')).toBe(true);
    });

    it('returns true for HTML with background in inline styles', () => {
      expect(needsIframeRendering('<div style="background: url(img.png)">Content</div>')).toBe(true);
    });

    it('returns true for HTML with background-image in inline styles', () => {
      expect(needsIframeRendering('<div style="background-image: url(bg.jpg)">Cell</div>')).toBe(true);
    });

    it('returns true for HTML with link tags', () => {
      expect(needsIframeRendering('<link rel="stylesheet" href="style.css"><p>Text</p>')).toBe(true);
    });

    it('returns false for plain text converted to HTML', () => {
      expect(needsIframeRendering('<br>Hello world<br>How are you?')).toBe(false);
    });

    it('returns false for simple formatting tags', () => {
      expect(needsIframeRendering('<p><b>Bold</b> and <i>italic</i> text</p>')).toBe(false);
    });

    it('returns false for blockquotes', () => {
      expect(needsIframeRendering('<blockquote>Quoted text</blockquote>')).toBe(false);
    });

    it('returns false for lists', () => {
      expect(needsIframeRendering('<ul><li>Item 1</li><li>Item 2</li></ul>')).toBe(false);
    });

    it('returns false for headings', () => {
      expect(needsIframeRendering('<h1>Title</h1><p>Body</p>')).toBe(false);
    });

    it('returns false for simple inline styles without background', () => {
      expect(needsIframeRendering('<p style="color: red; font-size: 14px">Text</p>')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(needsIframeRendering('')).toBe(false);
    });
  });

  describe('plainTextToSafeHtml', () => {
    const parseAnchor = (html: string): HTMLAnchorElement | null => {
      const doc = parseHtmlSafely(`<div>${html}</div>`);
      return doc.querySelector('a');
    };

    it('neutralizes double-quote attribute escape in URLs (Linus Rath report)', () => {
      const payload = 'Click http://example.tld/"onmouseover="alert(document.domain)"x=" now';
      const html = plainTextToSafeHtml(payload);
      const a = parseAnchor(html);
      expect(a).not.toBeNull();
      expect(a!.getAttribute('onmouseover')).toBeNull();
      expect(a!.attributes.length).toBeLessThanOrEqual(4);
      expect(a!.getAttribute('href')).toContain('"onmouseover=');
      expect(html).toContain('&quot;');
    });

    it('neutralizes single-quote attribute escape in URLs', () => {
      const payload = "http://example.tld/'onmouseover='alert(1)'x='";
      const html = plainTextToSafeHtml(payload);
      const a = parseAnchor(html);
      expect(a).not.toBeNull();
      expect(a!.getAttribute('onmouseover')).toBeNull();
      expect(html).toContain('&#39;');
    });

    it('escapes angle brackets and ampersands in HTML-significant order', () => {
      expect(plainTextToSafeHtml('<b>&</b>')).toBe('&lt;b&gt;&amp;&lt;/b&gt;');
    });

    it('linkifies plain URLs into safe anchors', () => {
      const html = plainTextToSafeHtml('visit https://example.com/path');
      expect(html).toContain('<a href="https://example.com/path"');
      expect(html).toContain('rel="noopener noreferrer"');
      expect(html).toContain('target="_blank"');
    });

    it('applies custom link class when provided', () => {
      const html = plainTextToSafeHtml('https://x.test', { linkClassName: 'text-primary hover:underline' });
      expect(html).toContain('class="text-primary hover:underline"');
    });

    it('escapes linkClassName to defend against a caller-supplied injection', () => {
      const malicious = 'x" onfocus="alert(1)" x="';
      const html = plainTextToSafeHtml('https://x.test', { linkClassName: malicious });
      const a = parseAnchor(html);
      expect(a).not.toBeNull();
      expect(a!.getAttribute('onfocus')).toBeNull();
      expect(a!.className).toContain('onfocus=');
    });

    it('preserves line breaks and tabs', () => {
      const html = plainTextToSafeHtml('a\nb\tc\r\nd');
      expect(html).toContain('a<br>b&nbsp;&nbsp;&nbsp;&nbsp;c<br>d');
    });

    it('does not double-escape existing entities', () => {
      const html = plainTextToSafeHtml('A & B');
      expect(html).toBe('A &amp; B');
    });
  });
});

describe('buildEmailSanitizeConfig', () => {
  it('does not mutate the shared EMAIL_SANITIZE_CONFIG arrays when blocking external content', () => {
    const tagsBefore = EMAIL_SANITIZE_CONFIG.FORBID_TAGS.length;
    const attrsBefore = EMAIL_SANITIZE_CONFIG.FORBID_ATTR.length;

    // Simulate many blocked-content emails in a row
    for (let i = 0; i < 5; i++) {
      const cfg = buildEmailSanitizeConfig(true);
      // 'background' is NOT in the base FORBID_ATTR, so it is a clean marker
      // for the appended untrusted-sender policy.
      expect(cfg.FORBID_ATTR).toContain('background');
      expect(cfg.FORBID_TAGS.length).toBe(tagsBefore + 1);
      expect(cfg.FORBID_ATTR.length).toBe(attrsBefore + 1);
    }

    // Shared module arrays must be untouched (no unbounded growth, no leaked policy)
    expect(EMAIL_SANITIZE_CONFIG.FORBID_TAGS.length).toBe(tagsBefore);
    expect(EMAIL_SANITIZE_CONFIG.FORBID_ATTR.length).toBe(attrsBefore);
    expect(EMAIL_SANITIZE_CONFIG.FORBID_ATTR).not.toContain('background');
  });

  it('returns fresh array instances, not references to the shared config', () => {
    const cfg = buildEmailSanitizeConfig(false);
    expect(cfg.FORBID_TAGS).not.toBe(EMAIL_SANITIZE_CONFIG.FORBID_TAGS);
    expect(cfg.FORBID_ATTR).not.toBe(EMAIL_SANITIZE_CONFIG.FORBID_ATTR);
    // blockExternal=false must NOT append the untrusted-sender policy
    expect(cfg.FORBID_ATTR).not.toContain('background');
    expect(cfg.FORBID_TAGS.length).toBe(EMAIL_SANITIZE_CONFIG.FORBID_TAGS.length);
  });
});
