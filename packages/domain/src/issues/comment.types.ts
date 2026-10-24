import type { CommentId, IssueId, UserId } from "../core/ids";

export interface Comment {
  id: CommentId;
  issueId: IssueId;
  authorId: UserId;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}
