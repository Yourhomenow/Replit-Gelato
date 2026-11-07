import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, branchesTable, usersTable } from "@workspace/db";

export type GelatoRole = "staff" | "manager";

export type GelatoSessionUser = {
  id: string;
  fullName: string;
  phone: string;
  role: GelatoRole;
  branchId: string;
  branchName: string;
};

declare global {
  namespace Express {
    interface Request {
      gelatoUser?: GelatoSessionUser;
    }
  }
}

const COOKIE_NAME = "gelato_session";
const SESSION_TTL_SECONDS = 60 * 60 * 10;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET must be configured");
  return value;
}

function signature(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function makeSessionToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000 }),
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

function sessionUserId(token: string): string | undefined {
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature) return undefined;
  const expected = signature(payload);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId?: unknown;
      expiresAt?: unknown;
    };
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt < Date.now()
    ) {
      return undefined;
    }
    return parsed.userId;
  } catch {
    return undefined;
  }
}

export function setSessionCookie(res: Response, userId: string): void {
  res.cookie(COOKIE_NAME, makeSessionToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api",
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api",
  });
}

export async function loadGelatoUser(userId: string): Promise<GelatoSessionUser | null> {
  const [row] = await db
    .select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      phone: usersTable.phone,
      role: usersTable.role,
      branchId: usersTable.branchId,
      branchName: branchesTable.name,
    })
    .from(usersTable)
    .innerJoin(branchesTable, eq(usersTable.branchId, branchesTable.id))
    .where(and(eq(usersTable.id, userId), eq(usersTable.isActive, true)))
    .limit(1);
  return row ?? null;
}

export async function requireGelatoAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = readCookie(req, COOKIE_NAME);
  const userId = token ? sessionUserId(token) : undefined;
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue" });
    return;
  }
  const user = await loadGelatoUser(userId);
  if (!user) {
    clearSessionCookie(res);
    res.status(401).json({ error: "Your session is no longer active" });
    return;
  }
  req.gelatoUser = user;
  next();
}

export function requireManager(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.gelatoUser?.role !== "manager") {
    res.status(403).json({ error: "Manager access required" });
    return;
  }
  next();
}

export function canAccessBranch(
  user: GelatoSessionUser,
  requestedBranchId: string,
): boolean {
  return user.role === "manager" || user.branchId === requestedBranchId;
}
