import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';
import { discoverOAuth } from '@/lib/oauth/discovery';
import { ID_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@/lib/oauth/tokens';

const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || '';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 30 * 24 * 60 * 60,
};

function getRequiredConfig() {
  const clientId = process.env.OAUTH_CLIENT_ID;
  const serverUrl = process.env.JMAP_SERVER_URL || process.env.NEXT_PUBLIC_JMAP_SERVER_URL;
  const issuerUrl = process.env.OAUTH_ISSUER_URL;
  if (!clientId || !serverUrl) {
    throw new Error(`OAuth misconfigured: ${[!clientId && 'OAUTH_CLIENT_ID', !serverUrl && 'JMAP_SERVER_URL'].filter(Boolean).join(', ')} not set`);
  }
  const discoveryUrl = issuerUrl?.trim() || serverUrl;
  if (issuerUrl !== undefined && !issuerUrl.trim()) {
    logger.warn('OAUTH_ISSUER_URL is set but empty, falling back to JMAP_SERVER_URL for discovery');
  }
  return { clientId, serverUrl, discoveryUrl };
}

async function getTokenEndpoint(): Promise<string> {
  const { discoveryUrl } = getRequiredConfig();
  const metadata = await discoverOAuth(discoveryUrl);
  if (!metadata?.token_endpoint) {
    throw new Error('OAuth token endpoint not found');
  }
  return metadata.token_endpoint;
}

async function getMetadata(): Promise<import('@/lib/oauth/discovery').OAuthMetadata | null> {
  const { discoveryUrl } = getRequiredConfig();
  return discoverOAuth(discoveryUrl);
}

function buildOAuthParams(base: Record<string, string>): URLSearchParams {
  const { clientId } = getRequiredConfig();
  const params = new URLSearchParams({ ...base, client_id: clientId });
  if (CLIENT_SECRET) {
    params.set('client_secret', CLIENT_SECRET);
  }
  return params;
}

export async function POST(request: NextRequest) {
  try {
    const { code, code_verifier, redirect_uri } = await request.json();

    if (!code || !code_verifier || !redirect_uri) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const tokenEndpoint = await getTokenEndpoint();

    const params = buildOAuthParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri,
      code_verifier,
    });

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error('Token exchange failed', { status: tokenResponse.status, error: errorText });
      return NextResponse.json({ error: 'Token exchange failed' }, { status: 401 });
    }

    const tokens = await tokenResponse.json();

    if (!tokens.access_token) {
      logger.error('Token response missing access_token', { response: JSON.stringify(tokens).substring(0, 500) });
      return NextResponse.json({ error: 'Invalid token response' }, { status: 502 });
    }

    const response = NextResponse.json({
      access_token: tokens.access_token,
      expires_in: tokens.expires_in || 3600,
    });

    if (tokens.refresh_token || tokens.id_token) {
      const cookieStore = await cookies();
      if (tokens.refresh_token) {
        cookieStore.set(REFRESH_TOKEN_COOKIE, tokens.refresh_token, COOKIE_OPTIONS);
      }
      if (tokens.id_token) {
        cookieStore.set(ID_TOKEN_COOKIE, tokens.id_token, COOKIE_OPTIONS);
      }
    }

    return response;
  } catch (error) {
    logger.error('Token exchange error', { error: error instanceof Error ? error.message : 'Unknown error' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT() {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

    if (!refreshToken) {
      return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
    }

    const tokenEndpoint = await getTokenEndpoint();

    const params = buildOAuthParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error('Token refresh failed', { status: tokenResponse.status, error: errorText });
      cookieStore.delete(REFRESH_TOKEN_COOKIE);
      return NextResponse.json({ error: 'Refresh failed' }, { status: 401 });
    }

    const tokens = await tokenResponse.json();

    if (!tokens.access_token) {
      logger.error('Refresh response missing access_token', { response: JSON.stringify(tokens).substring(0, 500) });
      return NextResponse.json({ error: 'Invalid token response' }, { status: 502 });
    }

    if (tokens.refresh_token) {
      cookieStore.set(REFRESH_TOKEN_COOKIE, tokens.refresh_token, COOKIE_OPTIONS);
    }

    if (tokens.id_token) {
      cookieStore.set(ID_TOKEN_COOKIE, tokens.id_token, COOKIE_OPTIONS);
    }

    return NextResponse.json({
      access_token: tokens.access_token,
      expires_in: tokens.expires_in || 3600,
    });
  } catch (error) {
    logger.error('Token refresh error', { error: error instanceof Error ? error.message : 'Unknown error' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
    const metadata = await getMetadata().catch((err) => {
      logger.warn('Failed to discover OAuth metadata during logout', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      return null;
    });

    if (refreshToken) {
      if (metadata?.revocation_endpoint) {
        const params = buildOAuthParams({
          token: refreshToken,
          token_type_hint: 'refresh_token',
        });

        try {
          const revocationResponse = await fetch(metadata.revocation_endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
          });
          if (!revocationResponse.ok) {
            logger.warn('Token revocation returned error', { status: revocationResponse.status });
          }
        } catch (err) {
          logger.error('Token revocation network error', { error: err instanceof Error ? err.message : 'Unknown error' });
        }
      }

      cookieStore.delete(REFRESH_TOKEN_COOKIE);
    }

    const idToken = cookieStore.get(ID_TOKEN_COOKIE)?.value;
    if (idToken) {
      cookieStore.delete(ID_TOKEN_COOKIE);
    }

    let end_session_url: string | undefined;
    if (metadata?.end_session_endpoint) {
      try {
        const parsed = new URL(metadata.end_session_endpoint);
        if (parsed.protocol === 'https:') {
          // RP-initiated logout: the OP requires id_token_hint or client_id
          // whenever post_logout_redirect_uri is sent (Keycloak enforces this).
          parsed.searchParams.set('client_id', getRequiredConfig().clientId);
          if (idToken) {
            parsed.searchParams.set('id_token_hint', idToken);
          }
          end_session_url = parsed.toString();
        } else {
          logger.warn('Ignoring non-HTTPS end_session_endpoint', { url: metadata.end_session_endpoint });
        }
      } catch {
        logger.warn('Invalid end_session_endpoint URL', { url: metadata.end_session_endpoint });
      }
    }

    return NextResponse.json({ ok: true, ...(end_session_url && { end_session_url }) });
  } catch (error) {
    logger.error('Token revocation error', { error: error instanceof Error ? error.message : 'Unknown error' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
