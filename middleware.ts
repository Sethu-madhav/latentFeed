import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authDisabled, isValidSession } from "@/lib/auth";

/**
 * Gate everything behind the shared password once one is configured.
 *
 * With `APP_PASSWORD` unset the app is wide open, which is what you want
 * locally — the check only engages when deployed.
 */
export async function middleware(request: NextRequest) {
  if (authDisabled()) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await isValidSession(token)) return NextResponse.next();

  const login = new URL("/login", request.url);
  // Come back to where they were headed after signing in.
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    /*
     * Everything except the login route itself, Next's own assets and the
     * favicon — gating those would break the login page it redirects to.
     */
    "/((?!login|_next/static|_next/image|favicon.ico).*)",
  ],
};
