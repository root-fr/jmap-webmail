import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { JMAPClient } from '@/lib/jmap/client';
import { cookies } from 'next/headers';

const JMAP_SERVER_URL =
  process.env.JMAP_SERVER_URL || process.env.NEXT_PUBLIC_JMAP_SERVER_URL;

const sessions = new Map<string, { client: JMAPClient; expires: number }>();

export { sessions };

const SESSION_TIMEOUT = parseInt(process.env.SESSION_TIMEOUT_MS || '86400000'); // 24 hours default

function generateSessionId(): string {
  return crypto.randomUUID();
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expires < now) {
      sessions.delete(id);
    }
  }
}

export async function POST(request: NextRequest) {
  if (!JMAP_SERVER_URL) {
    logger.error('JMAP_SERVER_URL not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { serverUrl, username, password } = body;

    if (!serverUrl || !username || !password) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }

    // Create JMAP client
    const client = new JMAPClient(serverUrl, username, password);

    // Try to connect
    await client.connect();

    // Create session
    const sessionId = generateSessionId();
    const expires = Date.now() + SESSION_TIMEOUT;

    sessions.set(sessionId, { client, expires });

    // Cleanup old sessions
    cleanupExpiredSessions();

    logger.info('User logged in', { username, sessionId });

    // Set httpOnly cookie
    const response = NextResponse.json({ success: true });
    response.cookies.set('jmap-session', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: SESSION_TIMEOUT / 1000,
    });

    return response;
  } catch (error) {
    logger.error('Login failed', { error: error instanceof Error ? error.message : error });
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('jmap-session')?.value;

  if (sessionId) {
    const session = sessions.get(sessionId);
    if (session) {
      session.client.disconnect();
      sessions.delete(sessionId);
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set('jmap-session', '', { maxAge: 0 });
  return response;
}