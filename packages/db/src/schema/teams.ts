import type { TeamId } from "@curves/domain/core/ids";
import { pgTable, text } from "drizzle-orm/pg-core";

export const teams = pgTable("teams", {
  id: text().$type<TeamId>().primaryKey(),
  key: text().notNull().unique(),
  name: text().notNull(),
});
