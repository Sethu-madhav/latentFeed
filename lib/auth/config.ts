import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import type { UserRole } from "@/db/schema";

/**
 * The half of the auth config that must run on the edge.
 *
 * `middleware.ts` runs in the edge runtime, where neither postgres.js nor
 * bcrypt can be loaded. Importing the full config there pulls the database
 * client into the middleware bundle and the build fails with a module error
 * that names a transitive dependency rather than the real cause. So the
 * database adapter and the credentials provider live in `./index.ts`, and only
 * this file — providers that are pure HTTP, plus the callbacks — is shared.
 *
 * Keep this file free of any Node-only import.
 */

export const SESSION_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

/** Routes reachable without a session. Everything else redirects to /login. */
export const PUBLIC_ROUTES = ["/login", "/signup"];

/**
 * Whether Google sign-in is usable on this deployment.
 *
 * Auth.js reads these two names automatically, so the provider needs no
 * explicit clientId. When they are absent the provider is left out entirely
 * and the UI hides the button — offering a button that can only produce a
 * configuration error is worse than not offering it. Email and password keep
 * working either way, which is what makes local development possible without
 * registering an OAuth client.
 */
export const googleConfigured = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  pages: { signIn: "/login", error: "/login" },
  providers: googleConfigured
    ? [
        Google({
          /**
           * Adopt an existing account with the same address instead of failing.
           *
           * Auth.js refuses this by default because a provider that does not
           * verify email addresses would let anyone claim an account by
           * asserting its address. Google does verify, so the attack it guards
           * against doesn't exist here — whereas the default behaviour does
           * produce a real dead end: sign up with a password, come back later,
           * click the Google button, and get `OAuthAccountNotLinked` with no
           * way forward.
           */
          allowDangerousEmailAccountLinking: true,
        }),
      ]
    : [],
  callbacks: {
    /**
     * The session is a JWT, so anything the app needs must be copied into the
     * token at sign-in — there is no row to read it from on later requests.
     */
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: UserRole }).role ?? "reader";
      }
      // `useSession().update()` after a profile change.
      if (trigger === "update" && session?.name) token.name = session.name;
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as UserRole) ?? "reader";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
