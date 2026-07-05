import { describe, it, expect } from 'vitest';
import { buildCsp, buildSecurityHeaders } from '@/lib/security-headers';

describe('buildSecurityHeaders', () => {
  it('emits the enforcing Content-Security-Policy header, never Report-Only', () => {
    const headers = buildSecurityHeaders('test-nonce-123', false);

    expect(headers['Content-Security-Policy']).toBeDefined();
    expect(headers['Content-Security-Policy-Report-Only']).toBeUndefined();
  });

  it('binds the request nonce into script-src', () => {
    const csp = buildSecurityHeaders('test-nonce-123', false)['Content-Security-Policy'];

    expect(csp).toContain("script-src 'self' 'nonce-test-nonce-123'");
  });

  it('allows unsafe-eval only in development', () => {
    const dev = buildSecurityHeaders('n', true)['Content-Security-Policy'];
    const prod = buildSecurityHeaders('n', false)['Content-Security-Policy'];

    expect(dev).toContain("'unsafe-eval'");
    expect(prod).not.toContain("'unsafe-eval'");
  });

  it('allows blob: and data: images so inline cid: attachments render', () => {
    const csp = buildSecurityHeaders('n', false)['Content-Security-Policy'];

    expect(csp).toContain("img-src 'self' data: blob: https:");
  });

  it('keeps the hardening directives (object-src none, frame-ancestors none)', () => {
    const csp = buildSecurityHeaders('n', false)['Content-Security-Policy'];

    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('buildCsp is identical to the CSP inside buildSecurityHeaders (same nonce goes to request + response)', () => {
    expect(buildCsp('abc', false)).toBe(
      buildSecurityHeaders('abc', false)['Content-Security-Policy']
    );
  });
});
