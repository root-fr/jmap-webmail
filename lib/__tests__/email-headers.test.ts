import { describe, it, expect } from 'vitest';
import {
  parseAuthenticationResults,
  parseSpamScore,
  getSecurityStatus,
  parseSpamLLM,
  extractListHeaders,
} from '../email-headers';

describe('parseAuthenticationResults', () => {
  it('parses SPF pass with domain', () => {
    const result = parseAuthenticationResults('spf=pass smtp.mailfrom=example.com');
    expect(result.spf).toEqual({ result: 'pass', domain: 'example.com' });
  });

  it('parses DKIM pass with domain and selector', () => {
    const result = parseAuthenticationResults('dkim=pass header.d=example.com header.s=selector1');
    expect(result.dkim).toEqual({ result: 'pass', domain: 'example.com', selector: 'selector1' });
  });

  it('parses DMARC pass with domain', () => {
    const result = parseAuthenticationResults('dmarc=pass header.from=example.com');
    expect(result.dmarc).toEqual({ result: 'pass', domain: 'example.com', policy: undefined });
  });

  it('parses all three together separated by semicolons', () => {
    const header = 'spf=pass smtp.mailfrom=example.com; dkim=pass header.d=example.com; dmarc=pass header.from=example.com';
    const result = parseAuthenticationResults(header);
    expect(result.spf?.result).toBe('pass');
    expect(result.dkim?.result).toBe('pass');
    expect(result.dmarc?.result).toBe('pass');
  });

  it('parses failure results', () => {
    expect(parseAuthenticationResults('spf=fail smtp.mailfrom=bad.com').spf?.result).toBe('fail');
    expect(parseAuthenticationResults('dkim=fail header.d=bad.com').dkim?.result).toBe('fail');
    expect(parseAuthenticationResults('dmarc=fail header.from=bad.com').dmarc?.result).toBe('fail');
  });

  it('returns empty object for unrecognized header', () => {
    expect(parseAuthenticationResults('garbage header value')).toEqual({});
  });

  it('parses iprev with IP address', () => {
    const result = parseAuthenticationResults('iprev=pass policy.iprev=192.168.1.1');
    expect(result.iprev).toEqual({ result: 'pass', ip: '192.168.1.1' });
  });

  it('parses SPF softfail', () => {
    const result = parseAuthenticationResults('spf=softfail smtp.mailfrom=example.com');
    expect(result.spf?.result).toBe('softfail');
  });
});

describe('parseSpamScore', () => {
  it('parses X-Spam-Status "No" format', () => {
    expect(parseSpamScore('No, score=-0.25')).toEqual({ status: 'no', score: -0.25 });
  });

  it('parses X-Spam-Status "Yes" format', () => {
    expect(parseSpamScore('Yes, score=8.5')).toEqual({ status: 'yes', score: 8.5 });
  });

  it('extracts plain score and classifies as ham', () => {
    expect(parseSpamScore('score=3.2')).toEqual({ score: 3.2, status: 'ham' });
  });

  it('extracts plain score and classifies as spam when above threshold', () => {
    expect(parseSpamScore('score=6.0')).toEqual({ score: 6.0, status: 'spam' });
  });

  it('returns null for unrecognized format', () => {
    expect(parseSpamScore('nothing useful here')).toBeNull();
  });
});

describe('getSecurityStatus', () => {
  it('returns green for pass', () => {
    const status = getSecurityStatus('pass');
    expect(status.icon).toBe('check');
    expect(status.color).toContain('green');
    expect(status.borderColor).toContain('green');
  });

  it('returns red for fail', () => {
    const status = getSecurityStatus('fail');
    expect(status.icon).toBe('x');
    expect(status.color).toContain('red');
  });

  it('returns red for permerror', () => {
    const status = getSecurityStatus('permerror');
    expect(status.icon).toBe('x');
    expect(status.color).toContain('red');
  });

  it('returns amber for softfail', () => {
    const status = getSecurityStatus('softfail');
    expect(status.icon).toBe('alert');
    expect(status.color).toContain('amber');
  });

  it('returns amber for neutral and temperror', () => {
    expect(getSecurityStatus('neutral').icon).toBe('alert');
    expect(getSecurityStatus('temperror').icon).toBe('alert');
  });

  it('returns gray for undefined', () => {
    const status = getSecurityStatus(undefined);
    expect(status.icon).toBe('minus');
    expect(status.color).toContain('gray');
  });
});

describe('parseSpamLLM', () => {
  it('parses LEGITIMATE verdict', () => {
    expect(parseSpamLLM('LEGITIMATE (This is a normal email)')).toEqual({
      verdict: 'LEGITIMATE',
      explanation: 'This is a normal email',
    });
  });

  it('parses SPAM verdict', () => {
    expect(parseSpamLLM('SPAM (Unsolicited bulk message)')).toEqual({
      verdict: 'SPAM',
      explanation: 'Unsolicited bulk message',
    });
  });

  it('parses SUSPICIOUS verdict', () => {
    expect(parseSpamLLM('SUSPICIOUS (Possible phishing attempt)')).toEqual({
      verdict: 'SUSPICIOUS',
      explanation: 'Possible phishing attempt',
    });
  });

  it('is case-insensitive for verdict keyword', () => {
    expect(parseSpamLLM('legitimate (test)')).toEqual({
      verdict: 'LEGITIMATE',
      explanation: 'test',
    });
  });

  it('returns null for unrecognized format', () => {
    expect(parseSpamLLM('some random header')).toBeNull();
    expect(parseSpamLLM('')).toBeNull();
  });
});

describe('extractListHeaders', () => {
  it('extracts List-Id', () => {
    const result = extractListHeaders({ 'List-Id': 'My Newsletter <list.example.com>' });
    expect(result.listId).toBe('My Newsletter <list.example.com>');
  });

  it('extracts List-Unsubscribe with HTTP URL', () => {
    const result = extractListHeaders({
      'List-Unsubscribe': '<https://example.com/unsubscribe?id=123>',
    });
    expect(result.listUnsubscribe?.http).toBe('https://example.com/unsubscribe?id=123');
    expect(result.listUnsubscribe?.preferred).toBe('http');
  });

  it('extracts List-Unsubscribe with both HTTP and mailto', () => {
    const result = extractListHeaders({
      'List-Unsubscribe': '<https://example.com/unsub>, <mailto:unsub@example.com>',
    });
    expect(result.listUnsubscribe?.http).toBe('https://example.com/unsub');
    expect(result.listUnsubscribe?.mailto).toBe('mailto:unsub@example.com');
    expect(result.listUnsubscribe?.preferred).toBe('http');
  });

  it('handles array header values', () => {
    const result = extractListHeaders({
      'List-Id': ['Newsletter <list.example.com>', 'fallback'],
    });
    expect(result.listId).toBe('Newsletter <list.example.com>');
  });

  it('returns empty object when no list headers present', () => {
    expect(extractListHeaders({})).toEqual({});
    expect(extractListHeaders({ 'Subject': 'hello' })).toEqual({});
  });

  it('extracts List-Help and List-Post', () => {
    const result = extractListHeaders({
      'List-Help': '<mailto:help@example.com>',
      'List-Post': '<mailto:post@example.com>',
    });
    expect(result.listHelp).toBe('<mailto:help@example.com>');
    expect(result.listPost).toBe('<mailto:post@example.com>');
  });
});
