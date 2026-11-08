import { and, asc, eq } from "drizzle-orm";
import {
  db,
  menuAvailabilityTable,
  menuItemsTable,
  stockLotsTable,
} from "@workspace/db";
import type { IngredientRequirement } from "@workspace/db";

type StockAmount = { ingredientName: string; unit: string; quantity: number };
const match = (left: string, right: string) => left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();

export function servingsFromStock(
  ingredients: IngredientRequirement[],
  lots: StockAmount[],
): number | null {
  const required = new Map<string, IngredientRequirement>();
  for (const ingredient of ingredients) {
    if (ingredient.quantityPerServing <= 0) continue;
    const key = JSON.stringify([ingredient.ingredientName.trim().toLocaleLowerCase(), ingredient.unit.trim().toLocaleLowerCase()]);
    const existing = required.get(key);
    required.set(key, {
      ...ingredient,
      quantityPerServing: (existing?.quantityPerServing ?? 0) + ingredient.quantityPerServing,
    });
  }
  if (!required.size) return null;
  return Math.min(
    ...[...required.values()].map((ingredient) => {
      const total = lots
        .filter((lot) => match(lot.ingredientName, ingredient.ingredientName) && match(lot.unit, ingredient.unit))
        .reduce((sum, lot) => sum + Number(lot.quantity), 0);
      return Math.max(0, Math.floor((total + 0.000000001) / ingredient.quantityPerServing));
    }),
    2_147_483_647,
  );
}

export async function branchStockAmounts(branchId: string): Promise<StockAmount[]> {
  return db.select({
    ingredientName: stockLotsTable.ingredientName,
    unit: stockLotsTable.unit,
    quantity: stockLotsTable.quantity,
  }).from(stockLotsTable).where(eq(stockLotsTable.branchId, branchId));
}

export async function syncMenuAvailabilityFromStock(branchId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const availability = await tx.select({
      menuItemId: menuAvailabilityTable.menuItemId,
    }).from(menuAvailabilityTable)
      .where(eq(menuAvailabilityTable.branchId, branchId))
      .orderBy(asc(menuAvailabilityTable.menuItemId))
      .for("update");
    const items = await tx.select({
      id: menuItemsTable.id,
      ingredients: menuItemsTable.ingredients,
    }).from(menuItemsTable);
    const lots = await tx.select({
      ingredientName: stockLotsTable.ingredientName,
      unit: stockLotsTable.unit,
      quantity: stockLotsTable.quantity,
    }).from(stockLotsTable).where(eq(stockLotsTable.branchId, branchId));
    const itemsById = new Map(items.map((item) => [item.id, item]));
    for (const row of availability) {
      const item = itemsById.get(row.menuItemId);
      if (!item) continue;
      const capacity = servingsFromStock(item.ingredients, lots);
      if (capacity === null) continue;
      await tx.update(menuAvailabilityTable).set({ quantity: capacity }).where(and(
        eq(menuAvailabilityTable.branchId, branchId),
        eq(menuAvailabilityTable.menuItemId, row.menuItemId),
      ));
    }
  });
}
