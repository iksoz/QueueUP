import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: ["admin", "player"] }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_users_role").on(table.role)],
);

export const courts = sqliteTable(
  "courts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("idx_courts_name").on(table.name)],
);

export const memberships = sqliteTable(
  "memberships",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    courtId: integer("court_id")
      .notNull()
      .references(() => courts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["queued", "playing"] }).notNull(),
    joinedAt: integer("joined_at").notNull(),
    hoppedOnAt: integer("hopped_on_at"),
  },
  (table) => [
    uniqueIndex("idx_memberships_user").on(table.userId),
    index("idx_memberships_court_status_joined").on(
      table.courtId,
      table.status,
      table.joinedAt,
    ),
  ],
);
