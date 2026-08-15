import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { PUBLIC_ROUTES, authConfig } from "@/lib/auth/config";

/**
 * Gate everything behind a session.
 *
 * This builds its own NextAuth instance from the *edge-safe* config rather
 * than importing `@/lib/auth` — that module pulls in postgres.js and bcrypt,
 * neither of which can be bundled for the edge runtime. All this needs is to
 * read and verify the JWT cookie, which the config half can do alone.
 */
const { auth } = NextAuth(authConfig);

export default auth((request) => {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
    // Already signed in and heading for the login page: send them to the feed.
    if (request.auth) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (request.auth) return NextResponse.next();

  const login = new URL("/login", request.url);
  // Come back to where they were headed after signing in.
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
});

export const config = {
  matcher: [
    /*
     * Everything except Next's own assets, the favicon, and the auth
     * endpoints — gating /api/auth would break the very callback that
     * establishes the session, leaving Google sign-in in a redirect loop.
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
