import type { DbInstance } from "@curves/db/test-db";
import { type UserId, userId } from "@curves/domain/core/ids";
import type { CurvesAuth } from "../auth/better-auth";

/** The better-auth session shape as OUR auth instance resolves it. */
export type AuthSession = NonNullable<Awaited<ReturnType<CurvesAuth["getSession"]>>>;

/**
 * The user projection procedures may rely on: stable identity fields only,
 * never the raw auth record (better-auth may grow credential-adjacent
 * internals; the API contract must not). `id` is re-branded to the domain's
 * `UserId` — better-auth generated the string, but downstream
 * domain/repo code expects the branded type.
 */
export interface SafeUser {
  id: UserId;
  name: string;
  email: string;
  avatarUrl: string | null;
}

/**
 * Per-request tRPC context: the db handle, the auth instance, and the
 * resolved session. `session`/`user` are null for anonymous requests —
 * `protectedProcedure` (trpc.ts) is the single gate that rejects those.
 */
export interface CurvesContext {
  db: DbInstance;
  auth: CurvesAuth;
  session: AuthSession | null;
  user: SafeUser | null;
}

const toSafeUser = (user: AuthSession["user"]): SafeUser => ({
  id: userId(user.id),
  name: user.name,
  email: user.email,
  avatarUrl: user.image ?? null,
});

/**
 * Resolve a request's context from its headers. Session resolution is one
 * `getSession` call (cookie-based via better-auth); no caching layer yet.
 */
export const createContext = async (args: {
  db: DbInstance;
  auth: CurvesAuth;
  headers: Headers;
}): Promise<CurvesContext> => {
  const session = await args.auth.getSession(args.headers);
  return {
    db: args.db,
    auth: args.auth,
    session,
    user: session ? toSafeUser(session.user) : null,
  };
};

export interface TestUserCredentials {
  name: string;
  email: string;
  password: string;
}

/**
 * Integration-tier helper: create a signed-in user through the REAL
 * better-auth api (sign-up, then sign-in for the session cookie) and return
 * the populated context — plus the headers and credentials so tests can
 * drive further auth calls or assert on the created identity. Unique email
 * per call unless `signedInAs` pins the credentials.
 */
export const createTestContext = async (
  db: DbInstance,
  auth: CurvesAuth,
  opts: { signedInAs?: TestUserCredentials } = {},
): Promise<{
  context: CurvesContext & { user: SafeUser };
  user: SafeUser;
  headers: Headers;
  credentials: TestUserCredentials;
}> => {
  const credentials: TestUserCredentials = opts.signedInAs ?? {
    name: "Test User",
    email: `test-${crypto.randomUUID()}@example.com`,
    password: "correct-horse-42",
  };

  await auth.auth.api.signUpEmail({ body: credentials });
  const res = await auth.auth.api.signInEmail({ body: credentials, asResponse: true });
  const setCookie = res.headers.getSetCookie()[0];
  if (!setCookie)
    throw new Error("createTestContext: expected a Set-Cookie on the sign-in response");

  const cookie = setCookie.split(";")[0];
  if (cookie === undefined || cookie === "") {
    throw new Error("createTestContext: Set-Cookie had an empty cookie pair");
  }
  const headers = new Headers({ cookie });
  const context = await createContext({ db, auth, headers });
  if (!context.user)
    throw new Error("createTestContext: session did not resolve after sign-up/sign-in");

  return {
    context: context as CurvesContext & { user: SafeUser },
    user: context.user,
    headers,
    credentials,
  };
};
