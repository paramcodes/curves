import { accounts } from "@curves/db/schema/accounts";
import { sessions } from "@curves/db/schema/sessions";
import { users } from "@curves/db/schema/users";
import { verifications } from "@curves/db/schema/verifications";
import type { DbInstance } from "@curves/db/test-db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

/**
 * better-auth over the Phase 1 `users` table (verified against better-auth
 * 1.7.12). One file, minimal surface: the future tRPC context calls
 * `auth.api.*` directly or goes through `getSession`.
 *
 * - drizzle adapter, pg provider, singular model names mapped to our tables.
 * - `avatarUrl` is better-auth's `image`: the adapter resolves fields through
 *   `user.fields` and indexes the drizzle table by the mapped name, so the
 *   domain keeps its `avatarUrl` name (verified in the adapter source).
 * - Column shapes live in packages/db/src/schema/{users,sessions,accounts,
 *   verifications}.ts — property names match better-auth's model fields.
 * - Secrets: the dev fallbacks exist ONLY for local development/tests —
 *   production fails fast at construction (S2, phase-2 review) instead of
 *   silently booting with a known secret or an unset base URL.
 */
export const createAuth = (db: DbInstance) => {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (process.env.NODE_ENV === "production" && (secret === undefined || baseURL === undefined)) {
    throw new Error(
      "BETTER_AUTH_SECRET and BETTER_AUTH_URL must both be set when NODE_ENV=production — " +
        "the dev fallbacks (known secret, localhost base URL) are unsafe beyond local development",
    );
  }
  const auth = betterAuth({
    baseURL: baseURL ?? "http://localhost:3000",
    secret: secret ?? "dev-only-secret-do-not-ship",
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
      },
    }),
    emailAndPassword: { enabled: true },
    user: {
      fields: {
        image: "avatarUrl",
      },
    },
  });

  return {
    /** The full better-auth api/handler object (auth.api, auth.handler). */
    auth,
    /**
     * Resolve the session from request headers (cookie). Thin helper so the
     * tRPC context stays one call away — returns null when unauthenticated.
     */
    getSession: (headers: Headers) => auth.api.getSession({ headers }),
  };
};

export type CurvesAuth = ReturnType<typeof createAuth>;
