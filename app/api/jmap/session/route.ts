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
    if (json.apiUrl && json.apiUrl.startsWith('http://')) {
      json.apiUrl = json.apiUrl.replace('http://', 'https://').replace(':8080', '');
      logger.info('Rewrote apiUrl to HTTPS', { apiUrl: json.apiUrl });
    }
    if (json.downloadUrl && json.downloadUrl.startsWith('http://')) {
      json.downloadUrl = json.downloadUrl.replace('http://', 'https://').replace(':8080', '');
      logger.info('Rewrote downloadUrl to HTTPS', { downloadUrl: json.downloadUrl });
    }
    if (json.uploadUrl && json.uploadUrl.startsWith('http://')) {
      json.uploadUrl = json.uploadUrl.replace('http://', 'https://').replace(':8080', '');
      logger.info('Rewrote uploadUrl to HTTPS', { uploadUrl: json.uploadUrl });
    }
    if (json.eventSourceUrl && json.eventSourceUrl.startsWith('http://')) {
      json.eventSourceUrl = json.eventSourceUrl.replace('http://', 'https://').replace(':8080', '');
      logger.info('Rewrote eventSourceUrl to HTTPS', { eventSourceUrl: json.eventSourceUrl });
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