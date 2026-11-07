import { and, count, eq, gte, sql, sum } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetDashboardSummaryQueryParams,
  GetDashboardSummaryResponse,
} from "@workspace/api-zod";
import {
  branchesTable,
  db,
  ordersTable,
  paymentsTable,
} from "@workspace/db";
import { canAccessBranch, requireGelatoAuth } from "../middlewares/gelato-auth";

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
    const filters = [gte(ordersTable.createdAt, new Date(new Date().setUTCHours(0, 0, 0, 0)))];
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
    const [revenue] = await db
      .select({
        amount: sum(paymentsTable.amountCents),
      })
      .from(paymentsTable)
      .innerJoin(ordersTable, eq(paymentsTable.orderId, ordersTable.id))
      .where(and(...revenueFilters));
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

export default router;
