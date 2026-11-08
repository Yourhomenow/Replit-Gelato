import { and, asc, eq, ilike, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateMenuItemBody,
  CreateMenuItemResponse,
  CreateStockLotBody,
  CreateStockLotResponse,
  ListMenuQueryParams,
  ListMenuResponse,
  ListStockLotsQueryParams,
  ListStockLotsResponse,
  UpdateMenuAvailabilityBody,
  UpdateMenuAvailabilityParams,
  UpdateMenuAvailabilityResponse,
  UpdateMenuItemBody,
  UpdateMenuItemParams,
  UpdateMenuItemResponse,
} from "@workspace/api-zod";
import {
  branchesTable,
  db,
  menuAvailabilityTable,
  menuItemsTable,
  stockLotsTable,
} from "@workspace/db";
import {
  canAccessBranch,
  requireGelatoAuth,
  requireManager,
} from "../middlewares/gelato-auth";

const router: IRouter = Router();

async function menuItemForBranch(menuItemId: string, branchId: string) {
  const [row] = await db
    .select({
      id: menuItemsTable.id,
      name: menuItemsTable.name,
      description: menuItemsTable.description,
      category: menuItemsTable.category,
      priceCents: menuItemsTable.priceCents,
      recipe: menuItemsTable.recipe,
      ingredients: menuItemsTable.ingredients,
      storageGuidelines: menuItemsTable.storageGuidelines,
      isActive: menuItemsTable.isActive,
      availability: menuAvailabilityTable.quantity,
      branchId: menuAvailabilityTable.branchId,
    })
    .from(menuItemsTable)
    .leftJoin(
      menuAvailabilityTable,
      and(
        eq(menuAvailabilityTable.menuItemId, menuItemsTable.id),
        eq(menuAvailabilityTable.branchId, branchId),
      ),
    )
    .where(eq(menuItemsTable.id, menuItemId))
    .limit(1);
  return row ? { ...row, availability: row.availability ?? 0, branchId } : null;
}

router.get("/menu", requireGelatoAuth, async (req, res): Promise<void> => {
  const parsed = ListMenuQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid menu search" });
    return;
  }
  const user = req.gelatoUser!;
  const branchId = parsed.data.branchId ?? user.branchId;
  if (!canAccessBranch(user, branchId)) {
    res.status(403).json({ error: "You can only view your branch menu" });
    return;
  }
  const filters = [eq(menuAvailabilityTable.branchId, branchId)];
  if (user.role !== "manager") filters.push(eq(menuItemsTable.isActive, true));
  if (parsed.data.search?.trim()) {
    const term = `%${parsed.data.search.trim()}%`;
    const searchFilter = or(
      ilike(menuItemsTable.name, term),
      ilike(menuItemsTable.category, term),
      ilike(menuItemsTable.description, term),
    );
    if (searchFilter) filters.push(searchFilter);
  }
  const rows = await db
    .select({
      id: menuItemsTable.id,
      name: menuItemsTable.name,
      description: menuItemsTable.description,
      category: menuItemsTable.category,
      priceCents: menuItemsTable.priceCents,
      recipe: menuItemsTable.recipe,
      ingredients: menuItemsTable.ingredients,
      storageGuidelines: menuItemsTable.storageGuidelines,
      isActive: menuItemsTable.isActive,
      availability: menuAvailabilityTable.quantity,
      branchId: menuAvailabilityTable.branchId,
    })
    .from(menuItemsTable)
    .innerJoin(
      menuAvailabilityTable,
      and(
        eq(menuAvailabilityTable.menuItemId, menuItemsTable.id),
        eq(menuAvailabilityTable.branchId, branchId),
      ),
    )
    .where(and(...filters))
    .orderBy(asc(menuItemsTable.category), asc(menuItemsTable.name));
  res.json(
    ListMenuResponse.parse(
      rows.map((row) => ({ ...row, availability: row.availability ?? 0, branchId })),
    ),
  );
});

router.post(
  "/menu",
  requireGelatoAuth,
  requireManager,
  async (req, res): Promise<void> => {
    const parsed = CreateMenuItemBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Check the menu item details and ingredients" });
      return;
    }
    const [item] = await db
      .insert(menuItemsTable)
      .values(parsed.data)
      .returning();
    const branches = await db.select({ id: branchesTable.id }).from(branchesTable);
    if (branches.length) {
      await db.insert(menuAvailabilityTable).values(
        branches.map((branch) => ({ branchId: branch.id, menuItemId: item.id })),
      );
    }
    const result = await menuItemForBranch(item.id, req.gelatoUser!.branchId);
    res.status(201).json(CreateMenuItemResponse.parse(result));
  },
);

router.patch(
  "/menu/:id",
  requireGelatoAuth,
  requireManager,
  async (req, res): Promise<void> => {
    const params = UpdateMenuItemParams.safeParse(req.params);
    const parsed = UpdateMenuItemBody.safeParse(req.body);
    if (!params.success || !parsed.success || !Object.keys(parsed.data ?? {}).length) {
      res.status(400).json({ error: "Provide valid menu item updates" });
      return;
    }
    const [updated] = await db
      .update(menuItemsTable)
      .set(parsed.data)
      .where(eq(menuItemsTable.id, params.data.id))
      .returning({ id: menuItemsTable.id });
    if (!updated) {
      res.status(404).json({ error: "Menu item not found" });
      return;
    }
    const result = await menuItemForBranch(updated.id, req.gelatoUser!.branchId);
    res.json(UpdateMenuItemResponse.parse(result));
  },
);

router.patch(
  "/menu/:id/availability",
  requireGelatoAuth,
  async (req, res): Promise<void> => {
    const params = UpdateMenuAvailabilityParams.safeParse(req.params);
    const parsed = UpdateMenuAvailabilityBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Provide a valid availability quantity" });
      return;
    }
    if (!canAccessBranch(req.gelatoUser!, parsed.data.branchId)) {
      res.status(403).json({ error: "You can only adjust your branch availability" });
      return;
    }
    const [item] = await db
      .select({ id: menuItemsTable.id })
      .from(menuItemsTable)
      .where(eq(menuItemsTable.id, params.data.id))
      .limit(1);
    if (!item) {
      res.status(404).json({ error: "Menu item not found" });
      return;
    }
    await db
      .insert(menuAvailabilityTable)
      .values({
        branchId: parsed.data.branchId,
        menuItemId: params.data.id,
        quantity: parsed.data.quantity,
      })
      .onConflictDoUpdate({
        target: [menuAvailabilityTable.branchId, menuAvailabilityTable.menuItemId],
        set: { quantity: parsed.data.quantity },
      });
    const result = await menuItemForBranch(params.data.id, parsed.data.branchId);
    res.json(UpdateMenuAvailabilityResponse.parse(result));
  },
);

router.get("/stock", requireGelatoAuth, async (req, res): Promise<void> => {
  const parsed = ListStockLotsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid stock search" });
    return;
  }
  const user = req.gelatoUser!;
  const branchId = parsed.data.branchId ?? user.branchId;
  if (!canAccessBranch(user, branchId)) {
    res.status(403).json({ error: "You can only view stock for your branch" });
    return;
  }
  const filters = [eq(stockLotsTable.branchId, branchId)];
  if (parsed.data.search?.trim()) {
    const term = `%${parsed.data.search.trim()}%`;
    const searchFilter = or(
      ilike(stockLotsTable.ingredientName, term),
      ilike(stockLotsTable.supplier, term),
    );
    if (searchFilter) filters.push(searchFilter);
  }
  const rows = await db
    .select({
      id: stockLotsTable.id,
      branchId: stockLotsTable.branchId,
      branchName: branchesTable.name,
      ingredientName: stockLotsTable.ingredientName,
      quantity: stockLotsTable.quantity,
      unit: stockLotsTable.unit,
      importDate: stockLotsTable.importDate,
      supplier: stockLotsTable.supplier,
      shelfLife: stockLotsTable.shelfLife,
    })
    .from(stockLotsTable)
    .innerJoin(branchesTable, eq(stockLotsTable.branchId, branchesTable.id))
    .where(and(...filters))
    .orderBy(asc(stockLotsTable.ingredientName), asc(stockLotsTable.importDate));
  res.json(ListStockLotsResponse.parse(rows));
});

router.post("/stock", requireGelatoAuth, async (req, res): Promise<void> => {
  const parsed = CreateStockLotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Check the stock lot details" });
    return;
  }
  if (!canAccessBranch(req.gelatoUser!, parsed.data.branchId)) {
    res.status(403).json({ error: "You can only register stock for your branch" });
    return;
  }
  const [lot] = await db
    .insert(stockLotsTable)
    .values({
      ...parsed.data,
      importDate: parsed.data.importDate.toISOString().slice(0, 10),
      shelfLife: parsed.data.shelfLife?.toISOString().slice(0, 10) ?? null,
    })
    .returning();
  const [branch] = await db
    .select({ name: branchesTable.name })
    .from(branchesTable)
    .where(eq(branchesTable.id, lot.branchId))
    .limit(1);
  res
    .status(201)
    .json(
      CreateStockLotResponse.parse({
        ...lot,
        branchName: branch?.name ?? "",
      }),
    );
});

export default router;
