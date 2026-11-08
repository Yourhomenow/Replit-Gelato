import {
  and,
  asc,
  desc,
  eq,
  inArray,
} from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateOrderBody,
  CreateOrderResponse,
  ListOrdersQueryParams,
  ListOrdersResponse,
  RecordPaymentBody,
  RecordPaymentParams,
  RecordPaymentResponse,
  UpdateOrderStatusBody,
  UpdateOrderStatusParams,
  UpdateOrderStatusResponse,
} from "@workspace/api-zod";
import {
  branchesTable,
  db,
  menuAvailabilityTable,
  menuItemsTable,
  orderLinesTable,
  ordersTable,
  paymentsTable,
  stockLotsTable,
  usersTable,
} from "@workspace/db";
import type { IngredientRequirement } from "@workspace/db";
import { canAccessBranch, requireGelatoAuth } from "../middlewares/gelato-auth";

const router: IRouter = Router();
const statusOrder = ["blending", "resting", "ready_to_serve"] as const;

class FlowError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

async function serializeOrders(orderIds: string[]) {
  if (!orderIds.length) return [];
  const baseRows = await db
    .select({
      id: ordersTable.id,
      branchId: ordersTable.branchId,
      branchName: branchesTable.name,
      createdBy: usersTable.fullName,
      createdAt: ordersTable.createdAt,
      status: ordersTable.status,
      totalCents: ordersTable.totalCents,
    })
    .from(ordersTable)
    .innerJoin(branchesTable, eq(ordersTable.branchId, branchesTable.id))
    .innerJoin(usersTable, eq(ordersTable.createdBy, usersTable.id))
    .where(inArray(ordersTable.id, orderIds));
  const lines = await db
    .select()
    .from(orderLinesTable)
    .where(inArray(orderLinesTable.orderId, orderIds))
    .orderBy(asc(orderLinesTable.id));
  const payments = await db
    .select()
    .from(paymentsTable)
    .where(inArray(paymentsTable.orderId, orderIds));
  const paymentByOrder = new Map(payments.map((payment) => [payment.orderId, payment]));
  const linesByOrder = new Map<string, typeof lines>();
  for (const line of lines) {
    const entries = linesByOrder.get(line.orderId) ?? [];
    entries.push(line);
    linesByOrder.set(line.orderId, entries);
  }
  return baseRows.map((row) => {
    const payment = paymentByOrder.get(row.id);
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      payment: payment
        ? {
            id: payment.id,
            method: payment.method,
            amountCents: payment.amountCents,
            status: payment.status,
            paidAt: payment.paidAt.toISOString(),
          }
        : null,
      lines: (linesByOrder.get(row.id) ?? []).map((line) => ({
        ...line,
        toppings: line.toppings ?? [],
      })),
    };
  });
}

async function serializedOrder(orderId: string) {
  return (await serializeOrders([orderId]))[0] ?? null;
}

router.get("/orders", requireGelatoAuth, async (req, res): Promise<void> => {
  const parsed = ListOrdersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid order filters" });
    return;
  }
  const user = req.gelatoUser!;
  const branchId = parsed.data.branchId;
  if (branchId && !canAccessBranch(user, branchId)) {
    res.status(403).json({ error: "You can only view orders for your branch" });
    return;
  }
  const rows = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(
      user.role === "manager"
        ? branchId
          ? eq(ordersTable.branchId, branchId)
          : undefined
        : eq(ordersTable.branchId, user.branchId),
    )
    .orderBy(desc(ordersTable.createdAt))
    .limit(parsed.data.limit ?? 30);
  const orderIds = rows.map((row) => row.id);
  const serialized = await serializeOrders(orderIds);
  const ordered = new Map(serialized.map((order) => [order.id, order]));
  res.json(ListOrdersResponse.parse(orderIds.map((id) => ordered.get(id))));
});

router.post("/orders", requireGelatoAuth, async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Add at least one valid item to the order" });
    return;
  }
  const user = req.gelatoUser!;
  const orderBranchId =
    user.role === "manager" ? parsed.data.branchId ?? user.branchId : user.branchId;
  if (!canAccessBranch(user, orderBranchId)) {
    res.status(403).json({ error: "You can only create orders for your branch" });
    return;
  }
  try {
    const orderId = await db.transaction(async (tx) => {
      const itemIds = [...new Set(parsed.data.lines.map((line) => line.menuItemId))].sort();
      const availabilityRows = await tx
        .select({
          id: menuItemsTable.id,
          name: menuItemsTable.name,
          priceCents: menuItemsTable.priceCents,
          isActive: menuItemsTable.isActive,
          ingredients: menuItemsTable.ingredients,
          availability: menuAvailabilityTable.quantity,
        })
        .from(menuItemsTable)
        .innerJoin(
          menuAvailabilityTable,
          and(
            eq(menuAvailabilityTable.menuItemId, menuItemsTable.id),
            eq(menuAvailabilityTable.branchId, orderBranchId),
          ),
        )
        .where(inArray(menuItemsTable.id, itemIds))
        .orderBy(asc(menuItemsTable.id))
        .for("update");
      const itemsById = new Map(availabilityRows.map((row) => [row.id, row]));
      if (availabilityRows.length !== itemIds.length) {
        throw new FlowError("One or more menu items are not available at this branch", 400);
      }
      const requestedCounts = new Map<string, number>();
      for (const line of parsed.data.lines) {
        requestedCounts.set(
          line.menuItemId,
          (requestedCounts.get(line.menuItemId) ?? 0) + line.quantity,
        );
      }
      for (const [itemId, quantity] of requestedCounts) {
        const item = itemsById.get(itemId)!;
        if (!item.isActive) throw new FlowError(`${item.name} is not currently available`, 400);
        if (item.availability < quantity) {
          throw new FlowError(`Only ${item.availability} ${item.name} serving(s) remain`, 400);
        }
      }

      const ingredientRequirements = new Map<
        string,
        { ingredientName: string; unit: string; quantity: number }
      >();
      for (const [itemId, servings] of requestedCounts) {
        const item = itemsById.get(itemId)!;
        for (const ingredient of item.ingredients as IngredientRequirement[]) {
          const key = `${ingredient.ingredientName.toLocaleLowerCase()}|${ingredient.unit.toLocaleLowerCase()}`;
          const current = ingredientRequirements.get(key);
          ingredientRequirements.set(key, {
            ingredientName: ingredient.ingredientName,
            unit: ingredient.unit,
            quantity:
              (current?.quantity ?? 0) + ingredient.quantityPerServing * servings,
          });
        }
      }
      const stockDeductions: Array<{ lotId: string; remaining: number }> = [];
      for (const requirement of [...ingredientRequirements.values()].sort((a, b) =>
        `${a.ingredientName}|${a.unit}`.localeCompare(`${b.ingredientName}|${b.unit}`),
      )) {
        const lots = await tx
          .select({
            id: stockLotsTable.id,
            quantity: stockLotsTable.quantity,
          })
          .from(stockLotsTable)
          .where(
            and(
              eq(stockLotsTable.branchId, orderBranchId),
              eq(stockLotsTable.ingredientName, requirement.ingredientName),
              eq(stockLotsTable.unit, requirement.unit),
            ),
          )
          .orderBy(asc(stockLotsTable.importDate), asc(stockLotsTable.id))
          .for("update");
        let needed = requirement.quantity;
        for (const lot of lots) {
          if (needed <= 0) break;
          const quantity = Number(lot.quantity);
          const deduction = Math.min(quantity, needed);
          if (deduction > 0) {
            stockDeductions.push({ lotId: lot.id, remaining: quantity - deduction });
            needed -= deduction;
          }
        }
        if (needed > 0.000001) {
          throw new FlowError(
            `Not enough ${requirement.ingredientName} in stock (${requirement.unit})`,
            400,
          );
        }
      }

      for (const [itemId, quantity] of requestedCounts) {
        const item = itemsById.get(itemId)!;
        await tx
          .update(menuAvailabilityTable)
          .set({ quantity: item.availability - quantity })
          .where(
            and(
              eq(menuAvailabilityTable.branchId, orderBranchId),
              eq(menuAvailabilityTable.menuItemId, itemId),
            ),
          );
      }
      for (const deduction of stockDeductions) {
        await tx
          .update(stockLotsTable)
          .set({ quantity: deduction.remaining })
          .where(eq(stockLotsTable.id, deduction.lotId));
      }

      let totalCents = 0;
      const lineValues = parsed.data.lines.map((line) => {
        const item = itemsById.get(line.menuItemId)!;
        const lineTotal = item.priceCents * line.quantity;
        totalCents += lineTotal;
        return {
          menuItemId: line.menuItemId,
          menuItemName: item.name,
          quantity: line.quantity,
          size: line.size,
          flavor: line.flavor,
          toppings: line.toppings,
          unitPriceCents: item.priceCents,
          totalCents: lineTotal,
        };
      });
      const [order] = await tx
        .insert(ordersTable)
        .values({
          branchId: orderBranchId,
          createdBy: user.id,
          totalCents,
          status: "blending",
        })
        .returning({ id: ordersTable.id });
      await tx.insert(orderLinesTable).values(
        lineValues.map((line) => ({ ...line, orderId: order.id })),
      );
      return order.id;
    });
    const order = await serializedOrder(orderId);
    res.status(201).json(CreateOrderResponse.parse(order));
  } catch (error) {
    if (error instanceof FlowError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    throw error;
  }
});

router.patch(
  "/orders/:id/status",
  requireGelatoAuth,
  async (req, res): Promise<void> => {
    const params = UpdateOrderStatusParams.safeParse(req.params);
    const parsed = UpdateOrderStatusBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Choose a valid preparation status" });
      return;
    }
    const order = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, params.data.id))
        .for("update")
        .limit(1);
      if (!current) {
        return { error: "Order not found", statusCode: 404, id: null } as const;
      }
      if (!canAccessBranch(req.gelatoUser!, current.branchId)) {
        return {
          error: "You can only update orders for your branch",
          statusCode: 403,
          id: null,
        } as const;
      }
      const currentIndex = statusOrder.indexOf(current.status);
      const nextIndex = statusOrder.indexOf(parsed.data.status);
      if (nextIndex !== currentIndex && nextIndex !== currentIndex + 1) {
        return {
          error: "Preparation must move from blending to resting to ready to serve",
          statusCode: 400,
          id: null,
        } as const;
      }
      const [updated] = await tx
        .update(ordersTable)
        .set({ status: parsed.data.status })
        .where(eq(ordersTable.id, current.id))
        .returning({ id: ordersTable.id });
      return { error: null, statusCode: 200, id: updated.id } as const;
    });
    if (order.error) {
      res.status(order.statusCode).json({ error: order.error });
      return;
    }
    const result = await serializedOrder(order.id!);
    res.json(UpdateOrderStatusResponse.parse(result));
  },
);

router.post(
  "/orders/:id/payment",
  requireGelatoAuth,
  async (req, res): Promise<void> => {
    const params = RecordPaymentParams.safeParse(req.params);
    const parsed = RecordPaymentBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Enter a payment method and amount" });
      return;
    }
    try {
      const orderId = await db.transaction(async (tx) => {
        const [order] = await tx
          .select()
          .from(ordersTable)
          .where(eq(ordersTable.id, params.data.id))
          .for("update")
          .limit(1);
        if (!order) throw new FlowError("Order not found", 404);
        if (!canAccessBranch(req.gelatoUser!, order.branchId)) {
          throw new FlowError("You can only record payment for your branch", 403);
        }
        const [existing] = await tx
          .select({ id: paymentsTable.id })
          .from(paymentsTable)
          .where(eq(paymentsTable.orderId, order.id))
          .limit(1);
        if (existing) throw new FlowError("This order has already been paid", 409);
        if (parsed.data.amountCents !== order.totalCents) {
          throw new FlowError("Payment amount must match the order total", 400);
        }
        await tx.insert(paymentsTable).values({
          orderId: order.id,
          method: parsed.data.method,
          amountCents: parsed.data.amountCents,
          status: "paid",
        });
        return order.id;
      });
      const result = await serializedOrder(orderId);
      res.status(201).json(RecordPaymentResponse.parse(result));
    } catch (error) {
      if (error instanceof FlowError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      throw error;
    }
  },
);

export default router;
