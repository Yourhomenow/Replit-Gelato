import { asc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { CreatePromotionBody, UpdatePromotionParams } from "@workspace/api-zod";
import { db, menuItemsTable, promotionsTable } from "@workspace/db";
import { requireGelatoAuth, requireManager } from "../middlewares/gelato-auth";

const router: IRouter = Router();

function serialize(row: typeof promotionsTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    discountPercent: row.discountPercent,
    menuItemIds: row.menuItemIds,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    isActive: row.isActive,
  };
}

router.get("/promotions", requireGelatoAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(promotionsTable).orderBy(asc(promotionsTable.startsAt), asc(promotionsTable.id));
  const now = Date.now();
  res.json(rows.filter((row) => req.gelatoUser!.role === "manager" ||
    (row.isActive && row.startsAt.getTime() <= now && now < row.endsAt.getTime())).map(serialize));
});

async function save(req: Request, res: Response, id?: string): Promise<void> {
  const parsed = CreatePromotionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a name, discount from 1 to 100, items, and valid dates" });
    return;
  }
  const data = parsed.data;
  const startsAt = data.startsAt;
  const endsAt = data.endsAt;
  if (!data.name.trim() || data.name.length > 120 || startsAt >= endsAt || new Set(data.menuItemIds).size !== data.menuItemIds.length) {
    res.status(400).json({ error: "End time must follow start time and menu items must be unique" });
    return;
  }
  const existing = await db.select({ id: menuItemsTable.id }).from(menuItemsTable)
    .where(inArray(menuItemsTable.id, data.menuItemIds));
  if (existing.length !== data.menuItemIds.length) {
    res.status(400).json({ error: "Choose menu items that exist" });
    return;
  }
  const values = { name: data.name.trim(), discountPercent: data.discountPercent,
    menuItemIds: data.menuItemIds, startsAt, endsAt, isActive: data.isActive };
  const [row] = id
    ? await db.update(promotionsTable).set(values).where(eq(promotionsTable.id, id)).returning()
    : await db.insert(promotionsTable).values(values).returning();
  if (!row) {
    res.status(404).json({ error: "Promotion not found" });
    return;
  }
  res.status(id ? 200 : 201).json(serialize(row));
}

router.post("/promotions", requireGelatoAuth, requireManager, async (req, res) => save(req, res));
router.patch("/promotions/:id", requireGelatoAuth, requireManager, async (req, res) => {
  const id = UpdatePromotionParams.safeParse(req.params);
  if (!id.success) {
    res.status(400).json({ error: "Invalid promotion ID" });
    return;
  }
  await save(req, res, id.data.id);
});

export default router;
