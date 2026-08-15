import { handlers } from "@/lib/auth";

/**
 * Auth.js endpoints: sign-in, the Google callback, sign-out, session.
 *
 * The Google redirect URI registered in the Cloud Console points here —
 * /api/auth/callback/google — so this path is part of the external contract
 * and cannot be renamed without updating the console entry too.
 */
export const { GET, POST } = handlers;
