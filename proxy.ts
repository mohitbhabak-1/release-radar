import { NextResponse, type NextRequest } from "next/server";

/**
 * Auth hook. Every page request passes through here.
 *
 * Prototype: if SITE_PASSWORD is set (Vercel env var), visitors must enter it via HTTP Basic auth (any username).
 * Production: replace this body with your SSO check (e.g. verify a session cookie or an identity-proxy header)
 * and redirect unauthenticated users to the login flow.
 */
export function proxy(req: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const [, supplied = ""] = atob(header.slice(6)).split(/:(.*)/s);
      if (supplied === password) return NextResponse.next();
    } catch {
      // fall through to the challenge
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Release Radar", charset="UTF-8"' },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
