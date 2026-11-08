import {
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetCurrentUserResponse as AuthUserResponse,
  LoginBody,
  RegisterBody,
  VerifyOtpBody,
} from "@workspace/api-zod";
import {
  branchesTable,
  db,
  otpChallengesTable,
  usersTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import {
  clearSessionCookie,
  loadGelatoUser,
  requireGelatoAuth,
  setSessionCookie,
} from "../middlewares/gelato-auth";

const router: IRouter = Router();
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const PHONE_PATTERN = /^\+?[0-9]{8,15}$/;

function normalizePhone(phone: string): string {
  return phone.trim().replace(/[\s()-]/g, "");
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function hashOtp(challengeId: string, code: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be configured");
  return createHmac("sha256", secret)
    .update(`${challengeId}:${code}`)
    .digest("hex");
}

async function sendOtp(phone: string, code: string): Promise<void> {
  logger.info({ phone, code }, "Prototype OTP issued");
}

async function createChallenge(
  userId: string,
  phone: string,
): Promise<{
  challengeId: string;
  expiresAt: string;
  deliveryHint: string;
  demoCode: string | null;
}> {
  const challengeId = randomUUID();
  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await db.insert(otpChallengesTable).values({
    id: challengeId,
    userId,
    codeHash: hashOtp(challengeId, code),
    expiresAt,
  });
  await sendOtp(phone, code);
  return {
    challengeId,
    expiresAt: expiresAt.toISOString(),
    deliveryHint: `Prototype code issued for ${phone}`,
    demoCode: process.env.NODE_ENV === "production" ? null : code,
  };
}

router.get("/branches", async (_req, res): Promise<void> => {
  const branches = await db
    .select({ id: branchesTable.id, name: branchesTable.name })
    .from(branchesTable)
    .orderBy(branchesTable.name);
  res.json(branches);
});

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a name, valid phone, password, role, and branch" });
    return;
  }
  const phone = normalizePhone(parsed.data.phone);
  if (!PHONE_PATTERN.test(phone)) {
    res.status(400).json({ error: "Enter a valid phone number" });
    return;
  }
  const [branch] = await db
    .select({ id: branchesTable.id })
    .from(branchesTable)
    .where(eq(branchesTable.id, parsed.data.branchId))
    .limit(1);
  if (!branch) {
    res.status(400).json({ error: "Choose an available branch" });
    return;
  }

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.phone, phone))
    .limit(1);
  if (existing[0]) {
    res.status(409).json({ error: "That phone number is already registered" });
    return;
  }
  const [user] = await db
    .insert(usersTable)
    .values({
      fullName: parsed.data.fullName.trim(),
      phone,
      passwordHash: hashPassword(parsed.data.password),
      role: parsed.data.role,
      branchId: parsed.data.branchId,
      isActive: false,
    })
    .onConflictDoNothing({ target: usersTable.phone })
    .returning({ id: usersTable.id });
  if (!user) {
    res.status(409).json({ error: "That phone number is already registered" });
    return;
  }
  const challenge = await createChallenge(user.id, phone);
  res.status(201).json(challenge);
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(401).json({ error: "Phone number or password is incorrect" });
    return;
  }
  const phone = normalizePhone(parsed.data.phone);
  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.phone, phone), eq(usersTable.isActive, true)))
    .limit(1);
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    res.status(401).json({ error: "Phone number or password is incorrect" });
    return;
  }
  const challenge = await createChallenge(user.id, phone);
  res.json(challenge);
});

router.post("/auth/verify-otp", async (req, res): Promise<void> => {
  const parsed = VerifyOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(401).json({ error: "Enter the six-digit code" });
    return;
  }
  const { challengeId, code } = parsed.data;
  const [challenge] = await db
    .select()
    .from(otpChallengesTable)
    .where(eq(otpChallengesTable.id, challengeId))
    .limit(1);
  if (!challenge || challenge.expiresAt.getTime() <= Date.now()) {
    if (challenge) {
      await db.delete(otpChallengesTable).where(eq(otpChallengesTable.id, challengeId));
    }
    res.status(401).json({ error: "The code has expired. Request a new one." });
    return;
  }
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    res.status(401).json({ error: "Too many attempts. Sign in again to request a new code." });
    return;
  }
  const suppliedHash = hashOtp(challengeId, code);
  const expected = Buffer.from(challenge.codeHash, "hex");
  const supplied = Buffer.from(suppliedHash, "hex");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    const nextAttempts = challenge.attempts + 1;
    if (nextAttempts >= OTP_MAX_ATTEMPTS) {
      await db.delete(otpChallengesTable).where(eq(otpChallengesTable.id, challengeId));
    } else {
      await db
        .update(otpChallengesTable)
        .set({ attempts: nextAttempts })
        .where(eq(otpChallengesTable.id, challengeId));
    }
    res.status(401).json({
      error:
        nextAttempts >= OTP_MAX_ATTEMPTS
          ? "Too many attempts. Sign in again to request a new code."
          : "That code is incorrect",
    });
    return;
  }
  const consumed = await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(otpChallengesTable)
      .where(eq(otpChallengesTable.id, challengeId))
      .returning({ userId: otpChallengesTable.userId });
    if (!deleted) return null;
    await tx
      .update(usersTable)
      .set({ isActive: true })
      .where(eq(usersTable.id, deleted.userId));
    return deleted.userId;
  });
  if (!consumed) {
    res.status(401).json({ error: "That code has already been used" });
    return;
  }
  const user = await loadGelatoUser(consumed);
  if (!user) {
    res.status(401).json({ error: "Could not start a session for this account" });
    return;
  }
  setSessionCookie(res, user.id);
  res.json(AuthUserResponse.parse(user));
});

router.get("/auth/me", requireGelatoAuth, async (req, res): Promise<void> => {
  res.json(AuthUserResponse.parse(req.gelatoUser));
});

router.post("/auth/logout", (_req, res): void => {
  clearSessionCookie(res);
  res.sendStatus(204);
});

export default router;
