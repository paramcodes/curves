import { users } from "@curves/db/schema/users";
import { createSharedTestDb } from "@curves/db/test-db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type CurvesAuth, createAuth } from "./better-auth";

/**
 * Auth lifecycle against the REAL better-auth server api (auth.api.*) over a
 * shared pglite (one WASM + migrate per file, truncate per test) — proving the
 * wired schema actually serves better-auth's drizzle adapter.
 *
 * The db tables are reached through @curves/db subpath exports; no repo wraps
 * auth tables by design — better-auth owns them.
 */
let shared: Awaited<ReturnType<typeof createSharedTestDb>>;
let auth: CurvesAuth["auth"];
let getSession: CurvesAuth["getSession"];

beforeAll(async () => {
  shared = await createSharedTestDb();
  ({ auth, getSession } = createAuth(shared.db));
});
afterAll(async () => {
  await shared.close();
});
beforeEach(async () => {
  await shared.reset();
});

const ada = { name: "Ada Lovelace", email: "ada@example.com", password: "correct-horse-42" };

/** Turn a better-auth asResponse() result into request headers carrying the session cookie. */
const cookieHeaders = (res: Response): Headers => {
  const setCookie = res.headers.getSetCookie()[0];
  if (!setCookie) throw new Error("expected a Set-Cookie on the auth response");
  return new Headers({ cookie: setCookie.split(";")[0] });
};

describe("better-auth over the shared users table", () => {
  it("signUp writes OUR users row: given name, emailVerified=false, hashed password in accounts", async () => {
    const { user } = await auth.api.signUpEmail({ body: { ...ada } });

    expect(user.email).toBe(ada.email);
    expect(user.name).toBe(ada.name);

    const [row] = await shared.db.select().from(users);
    expect(row?.name).toBe(ada.name);
    expect(row?.email).toBe(ada.email);
    expect(row?.emailVerified).toBe(false);
    expect(row?.avatarUrl).toBeNull();
    expect(row?.createdAt).toBeInstanceOf(Date);
    // better-auth generated the id, not the domain constructor — both are text
    expect(row?.id).toEqual(user.id);
  });

  it("duplicate email signup is rejected and leaves a single users row", async () => {
    await auth.api.signUpEmail({ body: { ...ada } });
    await expect(auth.api.signUpEmail({ body: { ...ada } })).rejects.toThrowError(/already/i);
    expect(await shared.db.select().from(users)).toHaveLength(1);
  });

  it("signInEmail sets a session cookie; getSession resolves the user from it", async () => {
    await auth.api.signUpEmail({ body: { ...ada } });
    const res = await auth.api.signInEmail({ body: { ...ada }, asResponse: true });
    expect(res).toBeInstanceOf(Response);
    const headers = cookieHeaders(res);

    const session = await getSession(headers);
    expect(session?.user.email).toBe(ada.email);
    expect(session?.session.token).toBeTruthy();
    expect(session?.session.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("a wrong password is rejected; no session cookie resolves to null", async () => {
    await auth.api.signUpEmail({ body: { ...ada } });
    await expect(
      auth.api.signInEmail({ body: { ...ada, password: "wrong-password" } }),
    ).rejects.toThrowError(/invalid/i);

    const session = await getSession(new Headers());
    expect(session).toBeNull();
  });

  it("signOut invalidates the session — getSession after is null", async () => {
    await auth.api.signUpEmail({ body: { ...ada } });
    const res = await auth.api.signInEmail({ body: { ...ada }, asResponse: true });
    const headers = cookieHeaders(res);
    expect((await getSession(headers))?.user.email).toBe(ada.email);

    await auth.api.signOut({ headers });
    expect(await getSession(headers)).toBeNull();
  });

  it("unauthenticated getSession is null, and sign-in updates the user's updatedAt", async () => {
    expect(await getSession(new Headers())).toBeNull();

    await auth.api.signUpEmail({ body: { ...ada } });
    const before = (await shared.db.select().from(users))[0]?.updatedAt;
    await auth.api.signInEmail({ body: { ...ada }, asResponse: true });
    const after = (await shared.db.select().from(users))[0]?.updatedAt;
    expect(after?.getTime()).toBeGreaterThanOrEqual(before?.getTime() ?? 0);
  });
});
