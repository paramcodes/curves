import { teamRoleFor } from "@curves/db/repos/team.repo";
import { ValidationError } from "@curves/domain/core/errors";
import type { TeamId } from "@curves/domain/core/ids";
import type { CurvesContext } from "./trpc/context";

/**
 * THE authz seam — every procedure's permission check goes through
 * assertCanAct, nowhere else. Failures throw ValidationError (code
 * "invalid"), which the trpc.ts middleware maps to BAD_REQUEST; see
 * ERRORS.md for why authz failures deliberately do not use FORBIDDEN.
 * SQL stays in db (teamRoleFor) — api never builds queries itself.
 */

export type Action = "read" | "create" | "update" | "delete" | "manage_workflow" | "manage_views";

/** Team-scoped (membership required) or workspace-wide (any signed-in user). */
export type Scope = { teamId: TeamId } | { workspace: true };

/** Actions reserved for team admins on top of plain membership. */
const ADMIN_ONLY_ACTIONS: ReadonlySet<Action> = new Set(["manage_workflow", "manage_views"]);

export const assertCanAct = async (
  ctx: CurvesContext,
  action: Action,
  scope: Scope,
): Promise<void> => {
  const user = ctx.user;
  if (!user) {
    // Unreachable behind protectedProcedure, but the seam must be safe alone.
    throw new ValidationError("Sign in before performing this action");
  }

  if ("workspace" in scope) {
    // v1: every signed-in user is a workspace member (single-tenant workspace,
    // no workspace_users table exists). Member/admin tiers arrive with the
    // workspace domain — extend HERE, the only authz site.
    return;
  }

  const role = await teamRoleFor(ctx.db, scope.teamId, user.id);

  if (role === null) {
    throw new ValidationError("You are not a member of this team");
  }
  if (ADMIN_ONLY_ACTIONS.has(action) && role !== "admin") {
    throw new ValidationError("This action requires the team admin role");
  }
};
