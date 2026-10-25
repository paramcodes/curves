import { afterEach, describe, expect, it } from "vitest";
import { createAuth } from "./better-auth";

/**
 * S2 (phase-2 review): the dev fallbacks in better-auth config must be
 * unreachable in production — a known secret or a localhost base URL booting
 * silently is exactly the failure the fallbacks exist to avoid. Fail fast at
 * construction instead.
 */
describe("createAuth production guard", () => {
  const original: { env: NodeJS.ProcessEnv; nodeEnv: string | undefined } = {
    env: { ...process.env },
    nodeEnv: process.env.NODE_ENV,
  };

  afterEach(() => {
    process.env = { ...original.env };
    if (original.nodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = original.nodeEnv;
    }
  });

  it("throws in production when BETTER_AUTH_SECRET is unset (dev fallback unreachable)", () => {
    process.env.NODE_ENV = "production";
    delete process.env.BETTER_AUTH_SECRET;
    process.env.BETTER_AUTH_URL = "https://curves.example.com";
    expect(() => createAuth({} as never)).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("throws in production when BETTER_AUTH_URL is unset", () => {
    process.env.NODE_ENV = "production";
    process.env.BETTER_AUTH_SECRET = "real-secret";
    delete process.env.BETTER_AUTH_URL;
    expect(() => createAuth({} as never)).toThrow(/BETTER_AUTH_URL/);
  });

  it("both set in production constructs fine; dev (non-production) needs nothing", () => {
    process.env.NODE_ENV = "production";
    process.env.BETTER_AUTH_SECRET = "real-secret";
    process.env.BETTER_AUTH_URL = "https://curves.example.com";
    expect(() => createAuth({} as never)).not.toThrow();
    process.env.NODE_ENV = "test";
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.BETTER_AUTH_URL;
    expect(() => createAuth({} as never)).not.toThrow();
  });
});
