import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { buildCsp, buildSecurityHeaders } from "@/lib/security-headers";

const intlMiddleware = createIntlMiddleware(routing);

export function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID();
  const isDev = process.env.NODE_ENV === "development";

  const csp = buildCsp(nonce, isDev);

  let intlResponse: ReturnType<typeof intlMiddleware> | null = null;
  try {
    intlResponse = intlMiddleware(request);
  } catch {
    intlResponse = null;
  }
  const response = intlResponse ?? NextResponse.next();

  // Propagate x-nonce AND the CSP onto the request headers via the middleware
  // override mechanism. Next reads `content-security-policy` off the request to
  // nonce its own inline framework scripts (self.__next_f); without this an
  // enforcing script-src 'nonce-…' would block those scripts and break hydration.
  const existing = response.headers.get("x-middleware-override-headers");
  response.headers.set(
    "x-middleware-override-headers",
    existing
      ? `${existing},x-nonce,content-security-policy`
      : "x-nonce,content-security-policy"
  );
  response.headers.set("x-middleware-request-x-nonce", nonce);
  response.headers.set("x-middleware-request-content-security-policy", csp);

  for (const [name, value] of Object.entries(
    buildSecurityHeaders(nonce, isDev)
  )) {
    response.headers.set(name, value);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
