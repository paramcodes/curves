import { teamMembers } from "@curves/db/schema/team_members";
import { teams } from "@curves/db/schema/teams";
import { createSharedTestDb, type DbInstance } from "@curves/db/test-db";
import { NotFoundError, ValidationError } from "@curves/domain/core/errors";
import { teamId, type UserId } from "@curves/domain/core/ids";
import { TRPCError } from "@trpc/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { type CurvesAuth, createAuth } from "../auth/better-auth";
import { assertCanAct } from "../authz";
import { createContext, createTestContext } from "./context";
import { mutation, protectedProcedure, publicProcedure, router } from "./trpc";

/**
 * tRPC foundation over the REAL auth server and shared pglite: context
 * resolution, the error-mapping middleware, protectedProcedure, and the
 * assertCanAct seam — all driven through a caller, the same way routers
 * will be tested next slice.
 */

let shared: Awaited<ReturnType<typeof createSharedTestDb>>;
let curves: CurvesAuth;

beforeAll(async () => {
  shared = await createSharedTestDb();
  curves = createAuth(shared.db);
});
afterAll(async () => {
  await shared.close();
});
beforeEach(async () => {
  await shared.reset();
});

const testRouter = router({
  me: protectedProcedure.query(({ ctx }) => ctx.user),
  boom: publicProcedure.query(() => {
    throw new NotFoundError("the thing does not exist");
  }),
  invalid: publicProcedure.query(() => {
    throw new ValidationError("that input is not acceptable");
  }),
  createTeamThing: mutation(
    protectedProcedure.input(z.object({ teamId: z.string() })).mutation(async ({ ctx, input }) => {
      await assertCanAct(ctx, "read", { teamId: teamId(input.teamId) });
      return { ok: true as const, by: ctx.user.id };
    }),
  ),
  adminOnly: mutation(
    protectedProcedure.input(z.object({ teamId: z.string() })).mutation(async ({ ctx, input }) => {
      await assertCanAct(ctx, "manage_workflow", { teamId: teamId(input.teamId) });
      return { ok: true as const };
    }),
  ),
});

const seedTeam = async (
  db: DbInstance,
  id: string,
  members: Array<{ userId: UserId; role: "admin" | "member" }>,
) => {
  await db.insert(teams).values({ id: teamId(id), key: "ENG", name: "Engineering" });
  await db
    .insert(teamMembers)
    .values(members.map((m) => ({ teamId: teamId(id), userId: m.userId, role: m.role })));
};

describe("context resolution", () => {
  it("anonymous headers resolve to session=null, user=null", async () => {
    const ctx = await createContext({ db: shared.db, auth: curves, headers: new Headers() });
    expect(ctx.session).toBeNull();
    expect(ctx.user).toBeNull();
  });

  it("createTestContext signs a user up+in; the context carries the SafeUser projection", async () => {
    const { context, user, credentials } = await createTestContext(shared.db, curves, {
      signedInAs: { name: "Ada Lovelace", email: "ada@example.com", password: "correct-horse-42" },
    });
    expect(context.session?.session.token).toBeTruthy();
    expect(user.email).toBe("ada@example.com");
    expect(user.name).toBe("Ada Lovelace");
    expect(user.id).toBe(context.session?.user.id);
    expect(user.avatarUrl).toBeNull();
    expect(credentials.email).toBe("ada@example.com");
  });

  it("unique emails per call when signedInAs is omitted", async () => {
    const a = await createTestContext(shared.db, curves);
    const b = await createTestContext(shared.db, curves);
    expect(a.user.id).not.toBe(b.user.id);
  });
});

describe("procedure gates through a caller", () => {
  it("protectedProcedure serves the signed-in user and rejects anonymous callers with UNAUTHORIZED", async () => {
    const { context, user } = await createTestContext(shared.db, curves);
    const caller = testRouter.createCaller(context);
    await expect(caller.me()).resolves.toEqual(user);

    const anonymous = await createContext({ db: shared.db, auth: curves, headers: new Headers() });
    const anonCaller = testRouter.createCaller(anonymous);
    const err = await anonCaller.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("UNAUTHORIZED");
  });

  it("the middleware maps DomainErrors at the single site: not_found→NOT_FOUND, invalid→BAD_REQUEST, cause preserved", async () => {
    const { context } = await createTestContext(shared.db, curves);
    const caller = testRouter.createCaller(context);

    const boom = await caller.boom().catch((e: unknown) => e);
    expect(boom).toBeInstanceOf(TRPCError);
    expect((boom as TRPCError).code).toBe("NOT_FOUND");
    expect((boom as TRPCError).cause).toBeInstanceOf(NotFoundError);

    const invalid = await caller.invalid().catch((e: unknown) => e);
    expect((invalid as TRPCError).code).toBe("BAD_REQUEST");
    expect((invalid as TRPCError).cause).toBeInstanceOf(ValidationError);
  });
});

describe("assertCanAct (the authz seam)", () => {
  it("a team member may act; a non-member gets BAD_REQUEST with a ValidationError cause", async () => {
    const member = await createTestContext(shared.db, curves);
    const outsider = await createTestContext(shared.db, curves);
    await seedTeam(shared.db, "team-1", [{ userId: member.user.id, role: "member" }]);

    const caller = testRouter.createCaller(member.context);
    await expect(caller.createTeamThing({ teamId: "team-1" })).resolves.toEqual({
      ok: true,
      by: member.user.id,
    });

    const outsideCaller = testRouter.createCaller(outsider.context);
    const err = await outsideCaller.createTeamThing({ teamId: "team-1" }).catch((e: unknown) => e);
    expect((err as TRPCError).code).toBe("BAD_REQUEST");
    expect((err as TRPCError).cause).toBeInstanceOf(ValidationError);
  });

  it("manage_workflow/manage_views require the admin role even for members", async () => {
    const member = await createTestContext(shared.db, curves);
    const admin = await createTestContext(shared.db, curves);
    await seedTeam(shared.db, "team-1", [
      { userId: member.user.id, role: "member" },
      { userId: admin.user.id, role: "admin" },
    ]);

    const memberCaller = testRouter.createCaller(member.context);
    const err = await memberCaller.adminOnly({ teamId: "team-1" }).catch((e: unknown) => e);
    expect((err as TRPCError).code).toBe("BAD_REQUEST");

    const adminCaller = testRouter.createCaller(admin.context);
    await expect(adminCaller.adminOnly({ teamId: "team-1" })).resolves.toEqual({ ok: true });
  });

  it("workspace scope allows any signed-in user without a DB round-trip", async () => {
    const { context } = await createTestContext(shared.db, curves);
    await expect(assertCanAct(context, "read", { workspace: true })).resolves.toBeUndefined();
  });
});
