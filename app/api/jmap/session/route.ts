import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { cookies } from 'next/headers';

import { sessions } from '../../auth/login/route';

const JMAP_SERVER_URL =
  process.env.JMAP_SERVER_URL || process.env.NEXT_PUBLIC_JMAP_SERVER_URL;

const FETCH_TIMEOUT_MS = 5000;

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function GET(request: NextRequest) {
  if (!JMAP_SERVER_URL) {
    logger.error('JMAP_SERVER_URL not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (origin && host && !origin.includes(host)) {
    logger.warn('Blocked cross-origin JMAP session request', { origin, host });
    return forbidden();
  }

  const cookieStore = await cookies();
  const sessionId = cookieStore.get('jmap-session')?.value;
  let authHeader: string | undefined;

  if (sessionId) {
    const session = sessions.get(sessionId);
    if (session && session.expires > Date.now()) {
      authHeader = session.client.getAuthHeader();
    } else {
      sessions.delete(sessionId);
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }
  } else {
    authHeader = request.headers.get('authorization') || undefined;
    if (!authHeader || (!authHeader.startsWith('Basic ') && !authHeader.startsWith('Bearer '))) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    logger.info('Fetching JMAP session from upstream', {
      url: `${JMAP_SERVER_URL}/.well-known/jmap`,
      hasAuth: !!authHeader,
      authType: authHeader?.split(' ')[0],
    });

    const response = await fetch(
      `${JMAP_SERVER_URL}/.well-known/jmap`,
      {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
        },
        signal: controller.signal,
        redirect: 'follow', // Follow 307 redirects from .well-known/jmap to /jmap/session
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      const responseText = await response.text();
      logger.warn('Upstream JMAP auth failed', {
        status: response.status,
        statusText: response.statusText,
        responseBody: responseText.substring(0, 500),
        url: `${JMAP_SERVER_URL}/.well-known/jmap`,
      });

      return NextResponse.json(
        { error: `Authentication failed: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const json = await response.json();

    // Fix mixed content issues - rewrite HTTP URLs to HTTPS
    // This is necessary when the JMAP server returns HTTP URLs but the webmail uses HTTPS
    // Security: Only rewrite URLs from the configured JMAP server to prevent URL injection
    const serverHostname = new URL(JMAP_SERVER_URL).hostname;

    const rewriteUrl = (url: string): string => {
      if (!url || !url.startsWith('http://')) return url;

      try {
        const urlObj = new URL(url);
        // Only rewrite if the hostname matches our configured JMAP server
        if (urlObj.hostname === serverHostname || urlObj.hostname.endsWith(`.${serverHostname}`)) {
          urlObj.protocol = 'https:';
          // Remove non-standard ports when switching to HTTPS
          if (urlObj.port === '8080' || urlObj.port === '80') {
            urlObj.port = '';
          }
          return urlObj.toString();
        }
        logger.warn('Refusing to rewrite URL from different hostname', {
          url,
          serverHostname,
          urlHostname: urlObj.hostname
        });
        return url;
      } catch (err) {
        logger.error('Failed to parse URL for rewriting', { url, error: err });
        return url;
      }
    };

    if (json.apiUrl) {
      const rewritten = rewriteUrl(json.apiUrl);
      if (rewritten !== json.apiUrl) {
        logger.info('Rewrote apiUrl to HTTPS', { original: json.apiUrl, rewritten });
        json.apiUrl = rewritten;
      }
    }
    if (json.downloadUrl) {
      const rewritten = rewriteUrl(json.downloadUrl);
      if (rewritten !== json.downloadUrl) {
        logger.info('Rewrote downloadUrl to HTTPS', { original: json.downloadUrl, rewritten });
        json.downloadUrl = rewritten;
      }
    }
    if (json.uploadUrl) {
      const rewritten = rewriteUrl(json.uploadUrl);
      if (rewritten !== json.uploadUrl) {
        logger.info('Rewrote uploadUrl to HTTPS', { original: json.uploadUrl, rewritten });
        json.uploadUrl = rewritten;
      }
    }
    if (json.eventSourceUrl) {
      const rewritten = rewriteUrl(json.eventSourceUrl);
      if (rewritten !== json.eventSourceUrl) {
        logger.info('Rewrote eventSourceUrl to HTTPS', { original: json.eventSourceUrl, rewritten });
        json.eventSourceUrl = rewritten;
      }
    }

    logger.info('JMAP session fetched successfully');
    return NextResponse.json(json);

  } catch (err) {
    clearTimeout(timeout);

    logger.error('JMAP session proxy error', {
      error: err instanceof Error ? err.message : err,
      stack: err instanceof Error ? err.stack : undefined,
      url: `${JMAP_SERVER_URL}/.well-known/jmap`,
    });

    return NextResponse.json(
      { error: 'Upstream unavailable' },
      { status: 502 }
    );
  }
}

export function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
export function PUT() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
export function DELETE() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}