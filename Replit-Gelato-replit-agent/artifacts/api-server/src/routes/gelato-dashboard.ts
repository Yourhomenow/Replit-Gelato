import { and, count, eq, gte, isNull, sql, sum } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetDashboardSummaryQueryParams,
  GetDashboardSummaryResponse,
  GetFinancialSummaryQueryParams,
  GetFinancialSummaryResponse,
} from "@workspace/api-zod";
import {
  branchesTable,
  db,
  ordersTable,
  paymentsTable,
} from "@workspace/db";
import { canAccessBranch, requireGelatoAuth, requireManager } from "../middlewares/gelato-auth";

const router: IRouter = Router();

router.get(
  "/dashboard/summary",
  requireGelatoAuth,
  async (req, res): Promise<void> => {
    const parsed = GetDashboardSummaryQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid branch filter" });
      return;
    }
    const user = req.gelatoUser!;
    const branchId =
      parsed.data.branchId ?? (user.role === "staff" ? user.branchId : undefined);
    if (branchId && !canAccessBranch(user, branchId)) {
      res.status(403).json({ error: "You can only view your branch summary" });
      return;
    }
    const filters = [gte(ordersTable.createdAt, new Date(new Date().setUTCHours(0, 0, 0, 0))), isNull(ordersTable.cancelledAt)];
    if (branchId) filters.push(eq(ordersTable.branchId, branchId));
    const [totals] = await db
      .select({
        todayOrders: count(ordersTable.id),
        activeOrders: count(
          sql`case when ${ordersTable.status} <> 'ready_to_serve' then 1 end`,
        ),
      })
      .from(ordersTable)
      .where(and(...filters));
    const revenueFilters = [
      gte(paymentsTable.paidAt, new Date(new Date().setUTCHours(0, 0, 0, 0))),
    ];
    if (branchId) revenueFilters.push(eq(ordersTable.branchId, branchId));
    const [revenue] = user.role === "manager" ? await db
      .select({ amount: sum(paymentsTable.amountCents) })
      .from(paymentsTable)
      .innerJoin(ordersTable, eq(paymentsTable.orderId, ordersTable.id))
      .where(and(...revenueFilters)) : [];
    let branchName = "All branches";
    if (branchId) {
      const [branch] = await db
        .select({ name: branchesTable.name })
        .from(branchesTable)
        .where(eq(branchesTable.id, branchId))
        .limit(1);
      branchName = branch?.name ?? user.branchName;
    }
    res.json(
      GetDashboardSummaryResponse.parse({
        activeOrders: totals?.activeOrders ?? 0,
        todayOrders: totals?.todayOrders ?? 0,
        todayRevenueCents: Number(revenue?.amount ?? 0),
        branchName,
      }),
    );
  },
);

router.get("/dashboard/financial", requireGelatoAuth, requireManager, async (req, res): Promise<void> => {
  const parsed = GetFinancialSummaryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid branch filter" });
    return;
  }
  const branchId = parsed.data.branchId;
  let branchName = "All branches";
  if (branchId) {
    const [branch] = await db.select({ name: branchesTable.name }).from(branchesTable)
      .where(eq(branchesTable.id, branchId)).limit(1);
    if (!branch) {
      res.status(404).json({ error: "Branch not found" });
      return;
    }
    branchName = branch.name;
  }
  const filters = [eq(paymentsTable.status, "paid")];
  if (branchId) filters.push(eq(ordersTable.branchId, branchId));
  const rows = await db.select({
    method: paymentsTable.method,
    paidOrders: count(paymentsTable.id),
    revenueCents: sum(paymentsTable.amountCents),
  }).from(paymentsTable)
    .innerJoin(ordersTable, eq(paymentsTable.orderId, ordersTable.id))
    .where(and(...filters))
    .groupBy(paymentsTable.method);
  const methods = { qr: 0, card: 0, transfer: 0 };
  let paidOrders = 0;
  let revenueCents = 0;
  for (const row of rows) {
    methods[row.method] = Number(row.revenueCents ?? 0);
    paidOrders += row.paidOrders;
    revenueCents += methods[row.method];
  }
  res.json(GetFinancialSummaryResponse.parse({
    branchName,
    revenueCents,
    paidOrders,
    averageOrderCents: paidOrders ? Math.round(revenueCents / paidOrders) : 0,
    byMethodCents: methods,
  }));
});

export default router;
