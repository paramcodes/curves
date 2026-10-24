import type { TeamId, UserId } from "../core/ids";

export interface User {
  id: UserId;
  name: string;
  email: string;
  avatarUrl: string | null;
}

/** Team key is the short human-facing code ("ENG") used in issue identifiers. */
export interface Team {
  id: TeamId;
  key: string;
  name: string;
}

export type TeamRole = "admin" | "member";

export interface TeamMember {
  teamId: TeamId;
  userId: UserId;
  role: TeamRole;
}
