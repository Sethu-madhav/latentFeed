import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/db/schema";

/**
 * Teach Auth.js about the `role` we carry on the session.
 *
 * Without this every `session.user.role` read is a type error, and the
 * tempting fix — casting to any at each call site — would let a typo in a
 * role name pass the build and silently grant or deny access.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession["user"];
  }

  interface User {
    role?: UserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: UserRole;
  }
}
