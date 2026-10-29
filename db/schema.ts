import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  name: text("name").notNull(),
  contactName: text("contact_name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  pickupDate: text("pickup_date").notNull().default(""),
  notes: text("notes").notNull().default(""),
  itemsJson: text("items_json").notNull(),
  totalTamales: integer("total_tamales").notNull(),
  totalCents: integer("total_cents").notNull(),
  status: text("status").notNull().default("draft"),
  adminNote: text("admin_note").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  submittedAt: text("submitted_at"),
}, (table) => [
  index("orders_user_idx").on(table.userId, table.updatedAt),
  index("orders_status_idx").on(table.status, table.createdAt),
  uniqueIndex("orders_idempotency_idx").on(table.userId, table.idempotencyKey),
]);

export type OrderRow = typeof orders.$inferSelect;

export const menuItems = sqliteTable("menu_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  kind: text("kind").notNull(),
  unit: text("unit").notNull(),
  dozenCents: integer("dozen_cents").notNull().default(0),
  singleCents: integer("single_cents").notNull(),
  active: integer("active", {mode:"boolean"}).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("customer"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("users_email_idx").on(table.email),
  uniqueIndex("users_identity_idx").on(table.userId),
]);

export type UserRow = typeof users.$inferSelect;
export type MenuRow = typeof menuItems.$inferSelect;
