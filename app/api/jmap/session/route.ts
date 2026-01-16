import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

type SessionResponse = {
  apiUrl?: string;
  downloadUrl?: string;
  uploadUrl?: string;
  eventSourceUrl?: string;
  [key: string]: unknown;
};

export async function GET(request: NextRequest) {
  const jmapServerUrl = process.env.JMAP_SERVER_URL || process.env.NEXT_PUBLIC_JMAP_SERVER_URL;

  if (!jmapServerUrl) {
    logger.error('JMAP_SERVER_URL not configured');
    return NextResponse.json({ error: 'JMAP server not configured' }, { status: 500 });
  }

  const sessionUrl = `${jmapServerUrl}/.well-known/jmap`;

  try {
    // Get authorization header from the request
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      logger.warn('Authorization header missing in JMAP session request');
      return NextResponse.json({ error: 'Authorization header required' }, { status: 401 });
    }

    logger.debug('Proxying JMAP session request', {
      sessionUrl,
      hasAuth: !!authHeader,
    });

    let responseObj;
    try {
      responseObj = await fetch(sessionUrl, {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      });
    } catch (fetchError) {
      logger.error('Network error during fetch', {
        fetchError: fetchError instanceof Error ? fetchError.message : fetchError,
        stack: fetchError instanceof Error ? fetchError.stack : undefined,
        sessionUrl,
        authHeaderPresent: !!authHeader,
      });
      return NextResponse.json({ error: 'Network error', details: String(fetchError) }, { status: 502 });
    }

    if (!responseObj.ok) {
      let text = '[unreadable]';
      try {
        text = await responseObj.text();
      } catch (e) {
        logger.error('Failed to read error response body', { error: e });
      }
      logger.warn('JMAP session request failed', {
        status: responseObj.status,
        statusText: responseObj.statusText,
        body: text,
        headers: Object.fromEntries(responseObj.headers.entries()),
        sessionUrl,
        authHeaderPresent: !!authHeader,
      });
      return NextResponse.json({ error: `Failed to fetch session: ${responseObj.status}`, body: text }, { status: responseObj.status });
    }

    let sessionData;
    try {
      sessionData = (await responseObj.json()) as SessionResponse;
    } catch (jsonError) {
      let rawBody = '[unreadable]';
      try {
        rawBody = await responseObj.text();
      } catch (e) {
        logger.error('Failed to read raw body after JSON parse error', { error: e });
      }
      logger.error('Failed to parse session JSON', {
        jsonError: jsonError instanceof Error ? jsonError.message : jsonError,
        stack: jsonError instanceof Error ? jsonError.stack : undefined,
        rawBody,
        sessionUrl,
      });
      return NextResponse.json({ error: 'Invalid JSON from JMAP server', rawBody }, { status: 502 });
    }

    logger.info('JMAP session fetch succeeded', { apiUrl: sessionData.apiUrl });
    return NextResponse.json(sessionData);
  } catch (error) {
    logger.error('Error proxying JMAP session request', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: 'Failed to fetch session', details: String(error) }, { status: 500 });
  }
}