import { AuthenticationResults } from './jmap/types';
import { parseUnsubscribeUrls } from './validation';

/**
 * Parse Authentication-Results header to extract SPF, DKIM, DMARC results
 */
export function parseAuthenticationResults(header: string): AuthenticationResults {
  const results: AuthenticationResults = {};

  type SpfResult = 'pass' | 'fail' | 'softfail' | 'neutral' | 'none' | 'temperror' | 'permerror';
  type DkimResult = 'pass' | 'fail' | 'policy' | 'neutral' | 'temperror' | 'permerror';
  type DmarcResult = 'pass' | 'fail' | 'none';
  type DmarcPolicy = 'reject' | 'quarantine' | 'none';

  // Parse SPF
  const spfMatch = header.match(/spf=(\w+)(?:\s+\([^)]*\))?\s+(?:smtp\.(?:mailfrom|helo)=([^\s;]+))?/);
  if (spfMatch) {
    results.spf = {
      result: spfMatch[1] as SpfResult,
      domain: spfMatch[2]
    };
  }

  // Parse DKIM
  const dkimMatch = header.match(/dkim=(\w+)(?:\s+header\.d=([^\s]+))?(?:\s+header\.s=([^\s]+))?/);
  if (dkimMatch) {
    results.dkim = {
      result: dkimMatch[1] as DkimResult,
      domain: dkimMatch[2],
      selector: dkimMatch[3]
    };
  }

  // Parse DMARC
  const dmarcMatch = header.match(/dmarc=(\w+)(?:\s+header\.from=([^\s]+))?(?:\s+policy\.dmarc=(\w+))?/);
  if (dmarcMatch) {
    results.dmarc = {
      result: dmarcMatch[1] as DmarcResult,
      domain: dmarcMatch[2],
      policy: dmarcMatch[3] as DmarcPolicy | undefined
    };
  }

  // Parse IP reverse lookup
  const iprevMatch = header.match(/iprev=(\w+)(?:\s+policy\.iprev=([\d.]+))?/);
  if (iprevMatch) {
    results.iprev = {
      result: iprevMatch[1] as 'pass' | 'fail',
      ip: iprevMatch[2]
    };
  }

  return results;
}

/**
 * Parse spam score from X-Spam-Result or X-Spam-Status headers
 */
export function parseSpamScore(header: string): { score: number; status: string } | null {
  // Try X-Spam-Status format: "No, score=-0.25"
  const statusMatch = header.match(/^(Yes|No),?\s+score=([-\d.]+)/i);
  if (statusMatch) {
    return {
      status: statusMatch[1].toLowerCase(),
      score: parseFloat(statusMatch[2])
    };
  }

  // Try to extract just the score
  const scoreMatch = header.match(/score[=:]?\s*([-\d.]+)/i);
  if (scoreMatch) {
    const score = parseFloat(scoreMatch[1]);
    return {
      score,
      status: score > 5 ? 'spam' : 'ham'
    };
  }

  return null;
}

/**
 * Get security status color and icon based on result
 */
export function getSecurityStatus(result?: string): {
  color: string;
  icon: 'check' | 'x' | 'alert' | 'minus';
  bgColor: string;
  borderColor: string;
} {
  switch (result) {
    case 'pass':
      return {
        color: 'text-green-700 dark:text-green-400',
        icon: 'check',
        bgColor: 'bg-gray-50 dark:bg-gray-800',
        borderColor: 'border-l-4 border-green-600 dark:border-green-500'
      };
    case 'fail':
    case 'permerror':
      return {
        color: 'text-red-700 dark:text-red-400',
        icon: 'x',
        bgColor: 'bg-gray-50 dark:bg-gray-800',
        borderColor: 'border-l-4 border-red-600 dark:border-red-500'
      };
    case 'softfail':
    case 'neutral':
    case 'temperror':
      return {
        color: 'text-amber-700 dark:text-amber-400',
        icon: 'alert',
        bgColor: 'bg-gray-50 dark:bg-gray-800',
        borderColor: 'border-l-4 border-amber-600 dark:border-amber-500'
      };
    default:
      return {
        color: 'text-gray-700 dark:text-gray-400',
        icon: 'minus',
        bgColor: 'bg-gray-50 dark:bg-gray-800',
        borderColor: 'border-l-4 border-gray-400 dark:border-gray-600'
      };
  }
}

/**
 * Parse X-Spam-LLM header to extract verdict and explanation
 */
export function parseSpamLLM(header: string): { verdict: string; explanation: string } | null {
  // Format: "LEGITIMATE (explanation)" or "SPAM (explanation)"
  // Trim the header first to remove any leading/trailing whitespace
  const trimmed = header.trim();
  const match = trimmed.match(/^(LEGITIMATE|SPAM|SUSPICIOUS)\s*\((.+)\)\s*$/i);

  if (match) {
    return {
      verdict: match[1].toUpperCase(),
      explanation: match[2].trim()
    };
  }
  return null;
}

/**
 * Extract list headers (List-Unsubscribe, List-Id, etc.)
 */
interface ListHeaders {
  listId?: string;
  listUnsubscribe?: {
    http?: string;
    mailto?: string;
    preferred?: 'http' | 'mailto';
  };
  listHelp?: string;
  listPost?: string;
}

export function extractListHeaders(headers: Record<string, string | string[]>): ListHeaders {
  const result: ListHeaders = {};

  if (headers['List-Id']) {
    result.listId = Array.isArray(headers['List-Id'])
      ? headers['List-Id'][0]
      : headers['List-Id'];
  }

  if (headers['List-Unsubscribe']) {
    const unsub = Array.isArray(headers['List-Unsubscribe'])
      ? headers['List-Unsubscribe'][0]
      : headers['List-Unsubscribe'];

    const parsed = parseUnsubscribeUrls(unsub);
    if (parsed.preferred) {
      result.listUnsubscribe = parsed;
    }
  }

  if (headers['List-Help']) {
    result.listHelp = Array.isArray(headers['List-Help'])
      ? headers['List-Help'][0]
      : headers['List-Help'];
  }

  if (headers['List-Post']) {
    result.listPost = Array.isArray(headers['List-Post'])
      ? headers['List-Post'][0]
      : headers['List-Post'];
  }

  return result;
}