import { randomUUID } from "node:crypto";
import { NotFoundError } from "@curves/domain/core/errors";
import {
  type TeamId,
  type UserId,
  type ViewId,
  viewId as viewIdCtor,
} from "@curves/domain/core/ids";
import type { View } from "@curves/domain/filters/view.types";
import { and, asc, eq, ne } from "drizzle-orm";
import { views } from "../schema/views";
import type { Db } from "./issue.repo";

export type ViewRow = typeof views.$inferSelect;

export interface CreateViewInput {
  /** Deterministic id for seed/tests; a random UUID otherwise. */
  id?: ViewId;
  ownerId: UserId;
  /** null → a personal view, not scoped to a team. */
  teamId?: TeamId | null;
  name: string;
  filter: View["filter"];
  display: View["display"];
  isTeamDefault?: boolean;
}

export interface ViewPatch {
  name?: string;
  teamId?: TeamId | null;
  filter?: View["filter"];
  display?: View["display"];
  isTeamDefault?: boolean;
}

export interface ViewRepo {
  byId(id: ViewId): Promise<View | null>;
  /** The owner's views (personal + team-scoped) ordered by name. */
  byOwner(ownerId: UserId): Promise<View[]>;
  /** The team's shared views ordered by name; personal views are not team-scoped. */
  byTeam(teamId: TeamId): Promise<View[]>;
  create(input: CreateViewInput): Promise<View>;
  /**
   * When the patch sets isTeamDefault=true, the previous team default is
   * cleared first — one default per team, enforced inside a transaction so a
   * concurrent reader never sees zero or two defaults. Personal views (teamId
   * null) carry no team default, so the invariant does not reach them.
   * Throws NotFoundError when the view does not exist.
   */
  update(id: ViewId, patch: ViewPatch): Promise<View>;
  delete(id: ViewId): Promise<void>;
}

export const createViewRepo = (db: Db): ViewRepo => {
  const toDomain = (row: ViewRow): View => row;

  const byId = async (id: ViewId): Promise<View | null> => {
    const rows = await db.select().from(views).where(eq(views.id, id)).limit(1);
    const row = rows[0];
    return row === undefined ? null : toDomain(row);
  };

  return {
    byId,

    byOwner: async (ownerId) => {
      const rows = await db
        .select()
        .from(views)
        .where(eq(views.ownerId, ownerId))
        .orderBy(asc(views.name));
      return rows.map(toDomain);
    },

    byTeam: async (teamId) => {
      const rows = await db
        .select()
        .from(views)
        .where(eq(views.teamId, teamId))
        .orderBy(asc(views.name));
      return rows.map(toDomain);
    },

    create: async (input) => {
      const values = {
        id: input.id ?? viewIdCtor(randomUUID()),
        ownerId: input.ownerId,
        teamId: input.teamId ?? null,
        name: input.name,
        filter: input.filter,
        display: input.display,
        isTeamDefault: input.isTeamDefault ?? false,
      };
      await db.insert(views).values(values);
      return toDomain(values);
    },

    update: async (id, patch) => {
      return db.transaction(async (tx) => {
        const rows = await tx.select().from(views).where(eq(views.id, id)).limit(1);
        const current = rows[0];
        if (current === undefined) {
          throw new NotFoundError(`view ${id} does not exist`);
        }
        if (patch.isTeamDefault === true && current.teamId !== null) {
          // demote any other default of the same team before promoting this one;
          // demotion is keyed on the STORED team, not the patch's
          await tx
            .update(views)
            .set({ isTeamDefault: false })
            .where(
              and(
                eq(views.teamId, current.teamId),
                eq(views.isTeamDefault, true),
                ne(views.id, id),
              ),
            );
        }
        const updated = await tx.update(views).set(patch).where(eq(views.id, id)).returning();
        const row = updated[0];
        if (row === undefined) {
          throw new NotFoundError(`view ${id} does not exist`);
        }
        return toDomain(row);
      });
    },

    delete: async (id) => {
      await db.delete(views).where(eq(views.id, id));
    },
  };
};
