import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const assignments = sqliteTable("assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  course: text("course").notNull(),
  title: text("title").notNull(),
  dueAt: integer("due_at", { mode: "timestamp" }),
  estimateMinutes: integer("estimate_minutes").notNull().default(30),
  status: text("status").notNull().default("not_started"),
  requiresStudent: integer("requires_student", { mode: "boolean" }).notNull().default(false),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(new Date()),
}, (table) => [index("idx_assignments_completed_due").on(table.completed, table.dueAt)]);
