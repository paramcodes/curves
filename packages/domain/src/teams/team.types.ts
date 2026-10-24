import type { TeamId, UserId } from "../core/ids";

export interface User {
  id: UserId;
  name: string;
  email: string;
  /** Auth state — better-auth owns this column; the domain only reads it. */
  emailVerified: boolean;
  avatarUrl: string | null;
  createdAt: Date;
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
