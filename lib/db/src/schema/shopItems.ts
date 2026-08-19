import { pgTable, text, boolean, timestamp, unique } from "drizzle-orm/pg-core";

export const ownedShopItemsTable = pgTable(
  "owned_shop_items",
  {
    id: text("id").primaryKey(), // uuid
    userId: text("user_id").notNull(), // Clerk user id
    itemId: text("item_id").notNull(), // logical item identifier
    itemType: text("item_type").notNull(), // e.g. "tema", "distintivo"
    equipped: boolean("equipped").notNull().default(false),
    purchasedAt: timestamp("purchased_at").notNull().defaultNow(),
  },
  (t) => [unique("owned_shop_items_user_item_unique").on(t.userId, t.itemId)],
);

export type InsertOwnedShopItem = typeof ownedShopItemsTable.$inferInsert;
export type OwnedShopItem = typeof ownedShopItemsTable.$inferSelect;
