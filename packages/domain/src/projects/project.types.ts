import type { MilestoneId, ProjectId, UserId } from "../core/ids";

export type ProjectStatus = "planned" | "in_progress" | "paused" | "completed" | "canceled";

export type ProjectHealth = "on_track" | "at_risk" | "off_track";

export interface Project {
  id: ProjectId;
  name: string;
  description: string;
  status: ProjectStatus;
  health: ProjectHealth | null;
  leadId: UserId | null;
  targetDate: Date | null;
  createdAt: Date;
}

export interface ProjectMilestone {
  id: MilestoneId;
  projectId: ProjectId;
  name: string;
  targetDate: Date | null;
  position: number;
}
