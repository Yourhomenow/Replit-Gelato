import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type IngredientRequirement = {
  ingredientName: string;
  quantityPerServing: number;
  unit: string;
};

export type StockDeduction = { lotId: string; quantity: number };

export const userRoleEnum = pgEnum("user_role", ["staff", "manager"]);
export const orderStatusEnum = pgEnum("gelato_order_status", [
  "blending",
  "resting",
  "ready_to_serve",
]);
export const paymentMethodEnum = pgEnum("payment_method", [
  "qr",
  "card",
  "transfer",
]);

export const branchesTable = pgTable("branches", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
});

export const usersTable = pgTable(
  "gelato_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branchesTable.id),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("gelato_users_branch_idx").on(table.branchId)],
);

export const otpChallengesTable = pgTable(
  "gelato_otp_challenges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("gelato_otp_expiry_idx").on(table.expiresAt)],
);

export const menuItemsTable = pgTable(
  "gelato_menu_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull(),
    priceCents: integer("price_cents").notNull(),
    recipe: text("recipe").notNull().default(""),
    ingredients: jsonb("ingredients")
      .$type<IngredientRequirement[]>()
      .notNull()
      .default([]),
    storageGuidelines: text("storage_guidelines").notNull().default(""),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("gelato_menu_name_idx").on(table.name)],
);

export const promotionsTable = pgTable("gelato_promotions", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  discountPercent: integer("discount_percent").notNull(),
  menuItemIds: uuid("menu_item_ids").array().notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const menuAvailabilityTable = pgTable(
  "gelato_menu_availability",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branchesTable.id, { onDelete: "cascade" }),
    menuItemId: uuid("menu_item_id")
      .notNull()
      .references(() => menuItemsTable.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(0),
  },
  (table) => [
    uniqueIndex("gelato_menu_availability_branch_item_uq").on(
      table.branchId,
      table.menuItemId,
    ),
    index("gelato_menu_availability_branch_idx").on(table.branchId),
  ],
);

export const stockLotsTable = pgTable(
  "gelato_stock_lots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branchesTable.id, { onDelete: "cascade" }),
    ingredientName: text("ingredient_name").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3, mode: "number" })
      .notNull(),
    unit: text("unit").notNull(),
    importDate: date("import_date", { mode: "string" }).notNull(),
    supplier: text("supplier").notNull(),
    shelfLife: date("shelf_life", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("gelato_stock_branch_ingredient_idx").on(
      table.branchId,
      table.ingredientName,
    ),
  ],
);

export const ordersTable = pgTable(
  "gelato_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branchesTable.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => usersTable.id),
    status: orderStatusEnum("status").notNull().default("blending"),
    stockDeductions: jsonb("stock_deductions").$type<StockDeduction[]>(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    totalCents: integer("total_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("gelato_orders_branch_created_idx").on(table.branchId, table.createdAt),
    index("gelato_orders_status_idx").on(table.status),
  ],
);

export const orderLinesTable = pgTable(
  "gelato_order_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    menuItemId: uuid("menu_item_id").notNull(),
    menuItemName: text("menu_item_name").notNull(),
    quantity: integer("quantity").notNull(),
    size: text("size").notNull(),
    flavor: text("flavor").notNull(),
    toppings: text("toppings").array().notNull().default([]),
    unitPriceCents: integer("unit_price_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    promotionName: text("promotion_name"),
    totalCents: integer("total_cents").notNull(),
  },
  (table) => [index("gelato_order_lines_order_idx").on(table.orderId)],
);

export const paymentsTable = pgTable("gelato_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .unique()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  method: paymentMethodEnum("method").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull().default("paid"),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStockLotSchema = createInsertSchema(stockLotsTable, {
  quantity: z.number().positive(),
}).omit({ id: true, createdAt: true });
export type InsertStockLot = z.infer<typeof insertStockLotSchema>;
export type Branch = typeof branchesTable.$inferSelect;
export type GelatoUser = typeof usersTable.$inferSelect;
export type MenuItem = typeof menuItemsTable.$inferSelect;
export type Promotion = typeof promotionsTable.$inferSelect;
export type StockLot = typeof stockLotsTable.$inferSelect;
export type GelatoOrder = typeof ordersTable.$inferSelect;
export type GelatoOrderLine = typeof orderLinesTable.$inferSelect;
export type GelatoPayment = typeof paymentsTable.$inferSelect;
