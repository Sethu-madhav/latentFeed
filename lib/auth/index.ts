import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq, sql } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/db/client";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
  type UserRole,
} from "@/db/schema";
import { authConfig } from "./config";
import { normalizeEmail, verifyPassword } from "./password";

/**
 * The full auth setup: database adapter plus email/password.
 *
 * Node runtime only. `middleware.ts` must import `./config` instead — see the
 * note there.
 */

/**
 * Decide a user's role, promoting where warranted. Idempotent.
 *
 * This runs on sign-in rather than at account creation because the two
 * creation paths differ: the OAuth flow builds its token from the row the
 * adapter just inserted, so a promotion applied afterwards in an event handler
 * would not appear in that session's token and the first Google sign-in would
 * silently come back as a reader. Resolving here means the token always agrees
 * with the database, whatever created the row.
 */
async function resolveRole(userId: string, email: string): Promise<UserRole> {
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => normalizeEmail(e))
    .filter(Boolean);

  if (admins.includes(normalizeEmail(email))) {
    const [row] = await db
      .update(users)
      .set({ role: "admin" })
      .where(eq(users.id, userId))
      .returning({ role: users.role });
    return row?.role ?? "admin";
  }

  /*
   * Bootstrap: with no ADMIN_EMAILS configured, whoever arrives first owns the
   * instance, so a fresh deploy is never left with nobody able to manage
   * sources.
   *
   * Gated on the list being *empty* on purpose. Sign-up is open, so if the
   * list names an owner who simply hasn't signed in yet, promoting the first
   * arrival would hand source management — and the cascading delete behind it
   * — to whichever stranger found the URL first.
   *
   * The `not exists` runs inside the UPDATE rather than as a separate SELECT
   * so two simultaneous first sign-ups cannot both read "no admin yet".
   */
  if (admins.length > 0) {
    const [row] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row?.role ?? "reader";
  }

  const [promoted] = await db
    .update(users)
    .set({ role: "admin" })
    .where(
      sql`${users.id} = ${userId} and not exists (
        select 1 from ${users} u where u.role = 'admin'
      )`,
    )
    .returning({ role: users.role });
  if (promoted) return promoted.role;

  const [existing] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return existing?.role ?? "reader";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    ...authConfig.providers,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const email = normalizeEmail(String(raw?.email ?? ""));
        const password = String(raw?.password ?? "");
        if (!email || !password) return null;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        // `verifyPassword` handles the null hash — a Google-only account has
        // no password, and must not be treated as having an empty one.
        const ok = await verifyPassword(password, user?.passwordHash ?? null);
        if (!ok || !user) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger, session }) {
      const next = authConfig.callbacks.jwt({ token, user, trigger, session });
      if (user?.id && user.email) {
        next.role = await resolveRole(user.id, user.email);
      }
      return next;
    },
  },
});

/** The signed-in user, or null. Use in server components and actions. */
export async function currentUser() {
  const session = await auth();
  return session?.user?.id ? session.user : null;
}

/**
 * The signed-in user's id, for scoping reader state.
 *
 * Throws rather than returning null: every caller is behind the middleware
 * gate, so a missing session here means the gate was bypassed, and returning
 * null would quietly read or write another user's rows.
 */
export async function requireUserId(): Promise<string> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in");
  return user.id;
}

/**
 * Is the caller an admin *according to the session token*?
 *
 * Cheap — no query — so this is the one to use for rendering: hiding controls,
 * showing the admin marker. It reads the role that was resolved at sign-in.
 */
export async function isAdmin(): Promise<boolean> {
  return (await currentUser())?.role === "admin";
}

/**
 * Is the caller an admin *right now*, according to the database?
 *
 * Sessions are JWTs with a 90-day life, and the role is stamped into the token
 * at sign-in. Demoting someone in the database therefore does not touch the
 * token they are already holding — a revoked admin would keep full source
 * management, including the cascading delete, until that token expired.
 *
 * Mutations are rare and destructive, so they pay for one indexed lookup and
 * get an answer that revocation actually affects. Rendering keeps using the
 * token; being a few minutes stale about whether to draw a button is fine.
 */
export async function isAdminNow(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;

  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  return row?.role === "admin";
}

/** Throws unless the caller is an admin. For non-ActionResult callers. */
export async function requireAdmin(): Promise<string> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in");
  if (!(await isAdminNow())) throw new Error("Admins only");
  return user.id;
}
