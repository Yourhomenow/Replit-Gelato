import { asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateEmployeeBody,
  UpdateEmployeeBody,
  UpdateEmployeeParams,
} from "@workspace/api-zod";
import { branchesTable, db, usersTable } from "@workspace/db";
import { hashPassword, normalizePhone } from "./gelato-auth";
import { requireGelatoAuth, requireManager } from "../middlewares/gelato-auth";

const router: IRouter = Router();
const phonePattern = /^\+?[0-9]{8,15}$/;

const employeeFields = {
  id: usersTable.id,
  fullName: usersTable.fullName,
  phone: usersTable.phone,
  role: usersTable.role,
  branchId: usersTable.branchId,
  branchName: branchesTable.name,
  isActive: usersTable.isActive,
};

async function employeeById(id: string) {
  const [employee] = await db.select(employeeFields).from(usersTable)
    .innerJoin(branchesTable, eq(usersTable.branchId, branchesTable.id))
    .where(eq(usersTable.id, id)).limit(1);
  return employee ?? null;
}

router.get("/employees", requireGelatoAuth, requireManager, async (_req, res): Promise<void> => {
  const employees = await db.select(employeeFields).from(usersTable)
    .innerJoin(branchesTable, eq(usersTable.branchId, branchesTable.id))
    .orderBy(asc(usersTable.fullName));
  res.json(employees);
});

router.post("/employees", requireGelatoAuth, requireManager, async (req, res): Promise<void> => {
  const parsed = CreateEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a name, valid phone, password, role, and branch" });
    return;
  }
  const phone = normalizePhone(parsed.data.phone);
  if (parsed.data.fullName.trim().length < 2 || !phonePattern.test(phone)) {
    res.status(400).json({ error: "Enter a valid phone number" });
    return;
  }
  const [branch] = await db.select({ id: branchesTable.id }).from(branchesTable)
    .where(eq(branchesTable.id, parsed.data.branchId)).limit(1);
  if (!branch) {
    res.status(400).json({ error: "Choose an available branch" });
    return;
  }
  const [created] = await db.insert(usersTable).values({
    fullName: parsed.data.fullName.trim(),
    phone,
    passwordHash: hashPassword(parsed.data.password),
    role: parsed.data.role,
    branchId: parsed.data.branchId,
    isActive: true,
  }).onConflictDoNothing({ target: usersTable.phone }).returning({ id: usersTable.id });
  if (!created) {
    res.status(409).json({ error: "That phone number is already registered" });
    return;
  }
  res.status(201).json(await employeeById(created.id));
});

router.patch("/employees/:id", requireGelatoAuth, requireManager, async (req, res): Promise<void> => {
  const params = UpdateEmployeeParams.safeParse(req.params);
  const parsed = UpdateEmployeeBody.safeParse(req.body);
  if (!params.success || !parsed.success || !Object.keys(parsed.data).length) {
    res.status(400).json({ error: "Enter valid employee changes" });
    return;
  }
  const changes = parsed.data;
  if (changes.fullName !== undefined && changes.fullName.trim().length < 2) {
    res.status(400).json({ error: "Enter a name with at least two characters" });
    return;
  }
  const current = await employeeById(params.data.id);
  if (!current) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  if (current.id === req.gelatoUser!.id && (changes.isActive === false || changes.role === "staff")) {
    res.status(400).json({ error: "You cannot remove your own manager access" });
    return;
  }
  if (changes.branchId) {
    const [branch] = await db.select({ id: branchesTable.id }).from(branchesTable)
      .where(eq(branchesTable.id, changes.branchId)).limit(1);
    if (!branch) {
      res.status(400).json({ error: "Choose an available branch" });
      return;
    }
  }
  const phone = changes.phone === undefined ? undefined : normalizePhone(changes.phone);
  if (phone !== undefined && !phonePattern.test(phone)) {
    res.status(400).json({ error: "Enter a valid phone number" });
    return;
  }
  try {
    const [updated] = await db.update(usersTable).set({
      ...changes,
      ...(phone === undefined ? {} : { phone }),
      ...(changes.fullName === undefined ? {} : { fullName: changes.fullName.trim() }),
    }).where(eq(usersTable.id, params.data.id)).returning({ id: usersTable.id });
    res.json(await employeeById(updated.id));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      res.status(409).json({ error: "That phone number is already registered" });
      return;
    }
    throw error;
  }
});

export default router;
