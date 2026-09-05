import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { accountDeletionRequests, activeWorkspaces, globalFeatureFlags, InsertSuggestion, InsertUser, sessions, suggestions, superAdminAudit, users, workspaceActivity, workspaceData, workspaceDataBackups, workspaceFeatureSettings, workspaceInvitations, workspaceMembers, workspaceOwnerPins, workspaces, type WorkspaceRole } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { matchesSuperAdminIdentity } from "./_core/identity";
import { nextCodeForRole, resolveIdentityRole } from "../lib/user-code";
import { getSupabaseClient } from "./_core/supabase";
import { MANAGER_PERMISSIONS, normalizeWorkspacePermissions, permissionsForWorkspaceRole, type WorkspacePermissions } from "../shared/workspace-permissions";
import { DEFAULT_DEVICE_SETTINGS, DEFAULT_SETTINGS, isValidWorkspaceCode, normalizeAppData, normalizeWorkspaceCode, suggestWorkspaceCode } from "../lib/booking-model";
import { DEFAULT_GLOBAL_FEATURE_FLAGS, DEFAULT_WORKSPACE_FEATURE_PREFERENCES, mergeGlobalOverPreference, type GlobalFeatureFlagKey, type WorkspaceFeaturePreferenceKey } from "../shared/feature-flags";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/** إنشاء جدول الجلسات في قواعد البيانات القائمة (idempotent) بلا ترحيلات. */
export async function ensureSessionsTable(): Promise<void> {
  const database = await getDb();
  if (!database) {
    console.warn("[Database] Cannot ensure sessions table: database not available");
    return;
  }
  try {
    await database.execute(sql`
      CREATE TABLE IF NOT EXISTS stayInSessions (
        jti varchar(191) NOT NULL PRIMARY KEY,
        openId varchar(191) NOT NULL,
        name varchar(255) NULL,
        expiresAt timestamp NOT NULL,
        revokedAt timestamp NULL,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (error) {
    console.error("[Database] Failed to ensure sessions table:", error);
  }
}

/** تسجيل جلسة مصدرة (jti) مع عمرها لتمكين الإبطال. */
export async function createSessionRecord(input: { jti: string; openId: string; name?: string | null; expiresAt: Date }): Promise<void> {
  const database = await getDb();
  if (!database) {
    console.warn("[Database] Cannot store session record: database not available");
    return;
  }
  try {
    await database.insert(sessions).values({ jti: input.jti, openId: input.openId, name: input.name ?? null, expiresAt: input.expiresAt });
  } catch (error) {
    console.warn("[Database] Failed to store session record:", error);
  }
}

export async function getSessionRecord(jti: string) {
  const database = await getDb();
  if (!database) return undefined;
  const rows = await database.select().from(sessions).where(eq(sessions.jti, jti)).limit(1);
  return rows[0];
}

/** إبطال جلسة بمعرّفها (idempotent). */
export async function revokeSessionByJti(jti: string): Promise<boolean> {
  const database = await getDb();
  if (!database) return false;
  try {
    await database.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.jti, jti), isNull(sessions.revokedAt)));
    return true;
  } catch (error) {
    console.warn("[Database] Failed to revoke session:", error);
    return false;
  }
}

/** إبطال كل جلسات مستخدم (تُستخدم عند حذف الحساب أو إجبار خروج). */
export async function revokeUserSessions(openId: string): Promise<number> {
  const database = await getDb();
  if (!database) return 0;
  try {
    const result = await database.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.openId, openId), isNull(sessions.revokedAt)));
    return result?.[0]?.affectedRows ?? 0;
  } catch (error) {
    console.warn("[Database] Failed to revoke user sessions:", error);
    return 0;
  }
}

/** حذف الجلسات المنتهية (صيانة دورية مقيدة الحجم). */
export async function pruneExpiredSessions(): Promise<number> {
  const database = await getDb();
  if (!database) return 0;
  try {
    const result = await database.delete(sessions).where(lt(sessions.expiresAt, new Date()));
    return result?.[0]?.affectedRows ?? 0;
  } catch (error) {
    console.warn("[Database] Failed to prune expired sessions:", error);
    return 0;
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "phone", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (matchesSuperAdminIdentity({ openId: user.openId, phone: user.phone, email: user.email }, ENV.ownerOpenId)) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });

    await ensureUserCodes();
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

/** إضافة عمود userCode للجدول في قواعد البيانات القائمة بلا ترحيلات (idempotent). */
export async function ensureUserCodeColumn(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`ALTER TABLE stayInUsers ADD COLUMN userCode varchar(16) NULL`);
    console.log("[Database] Added userCode column");
  } catch (error) {
    if (error instanceof Error && /Duplicate column|already exists/i.test(error.message)) {
      return;
    }
    console.warn("[Database] Could not add userCode column:", error);
  }
}

/** منح معرّف ذكي حسب الدور لكل مستخدم ناقصه: السوبر أدمن #U1000، والملاك #U1011+،
 *  والموظفون #S2001+، والحراس #G5001+، مع تجاهل النطاق المحجوز U1001–U1010.
 *  مدعوم بالتكرار (idempotent). */
export async function ensureUserCodes(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    const missing = await db.select({
      id: users.id,
      openId: users.openId,
      email: users.email,
      phone: users.phone,
      role: users.role,
      userCode: users.userCode,
    }).from(users).where(isNull(users.userCode));

    if (missing.length === 0) return;

    const assignedCodes = (await db.select({ userCode: users.userCode }).from(users))
      .map((row) => row.userCode)
      .filter((value): value is string => Boolean(value));

    const memberships = await db.select({ userId: workspaceMembers.userId, role: workspaceMembers.role }).from(workspaceMembers);
    const rolesByUser = new Map<number, Set<string>>();
    for (const membership of memberships) {
      const roles = rolesByUser.get(membership.userId) ?? new Set<string>();
      roles.add(membership.role);
      rolesByUser.set(membership.userId, roles);
    }

    for (const row of missing) {
      const isSuperAdmin = matchesSuperAdminIdentity({ openId: row.openId, email: row.email, phone: row.phone }, ENV.ownerOpenId);
      const identityRole = resolveIdentityRole({ isSuperAdmin, memberRoles: [...(rolesByUser.get(row.id) ?? [])] });
      if (identityRole === "internal") continue;
      const code = nextCodeForRole(identityRole, assignedCodes);
      await db.update(users).set({ userCode: code }).where(eq(users.id, row.id));
      assignedCodes.push(code);
    }
  } catch (error) {
    console.warn("[Database] Failed to assign user codes:", error);
  }
}

/** تحديث بريد المستخدم بعد التحقق من رمز OTP المرسَل إليه (تغيير داخلي ليست عبر بوابة خارجية). */
export async function updateUserEmail(userId: number, email: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(users).set({ email }).where(eq(users.id, userId));
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserProfile(userId: number, input: { name: string; phone: string | null; avatarUrl?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const updateSet: { name: string; phone: string | null; avatarUrl?: string | null } = { name: input.name, phone: input.phone };
  if (input.avatarUrl !== undefined) updateSet.avatarUrl = input.avatarUrl;
  await db.update(users).set(updateSet).where(eq(users.id, userId));
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!result[0]) throw new Error("User profile not found");
  return result[0];
}

export async function completeUserRegistration(userId: number, input: { name: string; phone: string | null; termsVersion: string; privacyVersion: string; conditionsVersion: string; acceptedAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(users).set({ name: input.name, phone: input.phone, termsVersion: input.termsVersion, privacyVersion: input.privacyVersion, conditionsVersion: input.conditionsVersion, legalAcceptedAt: input.acceptedAt }).where(eq(users.id, userId));
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!result[0]) throw new Error("User profile not found");
  return result[0];
}

export async function getAccountDeletionRequest(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db.select().from(accountDeletionRequests).where(eq(accountDeletionRequests.userId, userId)).limit(1);
  return result[0] ?? null;
}

export async function requestAccountDeletion(userId: number, reason: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const requestedAt = new Date();
  const scheduledFor = new Date(requestedAt.getTime() + 14 * 24 * 60 * 60 * 1000);
  await db.insert(accountDeletionRequests).values({ userId, reason, status: "pending", requestedAt, scheduledFor, confirmedAt: requestedAt }).onDuplicateKeyUpdate({ set: { reason, status: "pending", requestedAt, scheduledFor, confirmedAt: requestedAt } });
  return getAccountDeletionRequest(userId);
}

export async function cancelAccountDeletion(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(accountDeletionRequests).set({ status: "cancelled" }).where(eq(accountDeletionRequests.userId, userId));
  return getAccountDeletionRequest(userId);
}

export async function getPendingDeletionByEmail(email: string): Promise<{ userId: number; scheduledFor: Date; requestedAt: Date } | null> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const userResult = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
  if (!userResult[0]) return null;
  const deletionResult = await db.select().from(accountDeletionRequests).where(eq(accountDeletionRequests.userId, userResult[0].id)).limit(1);
  const req = deletionResult[0];
  if (!req || req.status !== "pending") return null;
  if (req.scheduledFor <= new Date()) return null;
  return { userId: req.userId, scheduledFor: req.scheduledFor, requestedAt: req.requestedAt };
}

export async function recoverDeletedAccountByEmail(email: string): Promise<{ ok: boolean; error?: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const userResult = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
  if (!userResult[0]) return { ok: false, error: "User not found" };
  const deletionResult = await db.select().from(accountDeletionRequests).where(eq(accountDeletionRequests.userId, userResult[0].id)).limit(1);
  const req = deletionResult[0];
  if (!req || req.status !== "pending") return { ok: false, error: "No pending deletion found" };
  if (req.scheduledFor <= new Date()) return { ok: false, error: "Deletion deadline has passed" };
  await db.update(accountDeletionRequests).set({ status: "cancelled" }).where(eq(accountDeletionRequests.userId, userResult[0].id));
  return { ok: true };
}

type ContactUser = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  loginMethod: string | null;
  role: "user" | "admin";
  createdAt: Date;
};

/** Resolve a user by email, phone, or numeric id (in that preference order). */
async function resolveUsersByContact(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, contact: string): Promise<ContactUser[]> {
  const term = contact.trim();
  if (!term) return [];
  const conditions: ReturnType<typeof eq>[] = [];
  if (term.includes("@")) conditions.push(eq(users.email, term.toLowerCase()));
  if (term.startsWith("+") || /[^\d]/.test(term) && term.includes("-")) conditions.push(eq(users.phone, term));
  if (/^\d{6,}$/.test(term)) {
    conditions.push(eq(users.phone, term));
    conditions.push(eq(users.id, Number(term)));
  }
  if (!conditions.length) return [];
  const rows = await db.select({ id: users.id, openId: users.openId, name: users.name, email: users.email, phone: users.phone, loginMethod: users.loginMethod, role: users.role, createdAt: users.createdAt }).from(users).where(or(...conditions)).limit(20);
  return rows.map((row) => ({ ...row, name: row.name, email: row.email, phone: row.phone, loginMethod: row.loginMethod }));
}

export type PreviewPurgeResult =
  | { ok: true; matchedBy: string; user: ContactUser; counts: Record<string, number>; ownedWorkspaces: string[]; memberWorkspaces: string[] }
  | { ok: false; error: string; suggestions?: string[] };

/**
 * Read-only preview of everything a permanent purge would remove, resolved by
 * email, phone, or numeric id. Never mutates data; used by the Super Admin UI
 * (المعاينة قبل الحذف) to show the user's data and all related record counts
 * before asking for the typed confirmation.
 */
export async function previewPurgeByContact(contact: string): Promise<PreviewPurgeResult> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const matches = await resolveUsersByContact(db, contact);
  if (!matches.length) return { ok: false, error: "لم يتم العثور على مستخدم بهذا البريد أو الهاتف أو المعرّف." };
  if (matches.length > 1) return { ok: false, error: `تطابقت ${matches.length} حسابات. حدّد بمعرّف رقمي دقيق.`, suggestions: matches.map((m) => `#${m.id} — ${m.email ?? ""} ${m.phone ?? ""} ${m.name ?? ""}`.trim()) };
  const user = matches[0];
  const counts: Record<string, number> = {};
  await Promise.all([
    db.select({ c: sql`count(*)` }).from(accountDeletionRequests).where(eq(accountDeletionRequests.userId, user.id)).then((r) => { counts.deletionRequests = Number(r[0]?.c ?? 0); }),
    db.select({ c: sql`count(*)` }).from(workspaceMembers).where(eq(workspaceMembers.userId, user.id)).then((r) => { counts.memberships = Number(r[0]?.c ?? 0); }),
    db.select({ c: sql`count(*)` }).from(activeWorkspaces).where(eq(activeWorkspaces.userId, user.id)).then((r) => { counts.activeWorkspaces = Number(r[0]?.c ?? 0); }),
    db.select({ c: sql`count(*)` }).from(workspaceInvitations).where(eq(workspaceInvitations.createdByUserId, user.id)).then((r) => { counts.invitations = Number(r[0]?.c ?? 0); }),
    db.select({ c: sql`count(*)` }).from(workspaceOwnerPins).where(eq(workspaceOwnerPins.updatedByUserId, user.id)).then((r) => { counts.ownerPins = Number(r[0]?.c ?? 0); }),
    db.select({ c: sql`count(*)` }).from(sessions).where(eq(sessions.openId, user.openId)).then((r) => { counts.sessions = Number(r[0]?.c ?? 0); }),
  ]);
  const [ownedRows, memberRows] = await Promise.all([
    db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.ownerUserId, user.id)),
    db.select({ name: workspaces.name }).from(workspaceMembers).innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id)).where(eq(workspaceMembers.userId, user.id)),
  ]);
  return { ok: true, matchedBy: termKind(contact), user, counts, ownedWorkspaces: ownedRows.map((r) => r.name), memberWorkspaces: memberRows.map((r) => r.name) };
}

function termKind(contact: string) {
  const t = contact.trim();
  if (t.includes("@")) return "email";
  if (/^\d{6,}$/.test(t)) return "id";
  return "phone";
}

export type PurgeResult =
  | { ok: false; error: string }
  | { ok: true; user: ContactUser; removed: Record<string, number>; supabaseAuthRemoved: boolean; supabaseAuthConfigured: boolean };

/**
 * Permanent, destructive purge of a user and all related records, resolved by
 * email, phone, or numeric id. Gated behind the Super Admin `adminProcedure`
 * and requires the operator to type "حذف" or "DELETE" (typed confirmation).
 * ONLY intended for removing test/dev accounts; logs an audit trail entry.
 *
 * Note: StayIn is normally built around a reversible 14-day deletion request, so
 * this is an explicit privileged escape hatch. The Supabase Auth record (email
 * OTP identity) is also best-effort removed when a SUPABASE_SERVICE_ROLE_KEY is
 * configured; without it the Auth record must be removed manually from the
 * Supabase dashboard (its absence does not fail the purge of StayIn data).
 */
export async function purgeUserByContact(actorUserId: number, contact: string, typedConfirmation: string) {
  const typed = typedConfirmation.trim();
  if (typed !== "حذف" && typed !== "DELETE") return { ok: false as const, error: "تأكيد الحذف غير صالح. اكتب «حذف» أو «DELETE» للمتابعة." };
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const matches = await resolveUsersByContact(db, contact);
  if (!matches.length) return { ok: false as const, error: "لم يتم العثور على مستخدم بهذا البريد أو الهاتف أو المعرّف." };
  if (matches.length > 1) return { ok: false as const, error: `تطابقت ${matches.length} حسابات. حدّد بمعرّف رقمي دقيق.` };
  const user = matches[0];

  const removed: Record<string, number> = {};
  await Promise.all([
    db.delete(accountDeletionRequests).where(eq(accountDeletionRequests.userId, user.id)).then((r) => { removed.deletionRequests = r[0].affectedRows; }).catch(() => { removed.deletionRequests = -1; }),
    db.delete(workspaceMembers).where(eq(workspaceMembers.userId, user.id)).then((r) => { removed.memberships = r[0].affectedRows; }).catch(() => { removed.memberships = -1; }),
    db.delete(activeWorkspaces).where(eq(activeWorkspaces.userId, user.id)).then((r) => { removed.activeWorkspaces = r[0].affectedRows; }).catch(() => { removed.activeWorkspaces = -1; }),
    db.delete(workspaceInvitations).where(eq(workspaceInvitations.createdByUserId, user.id)).then((r) => { removed.invitations = r[0].affectedRows; }).catch(() => { removed.invitations = -1; }),
    db.delete(workspaceOwnerPins).where(eq(workspaceOwnerPins.updatedByUserId, user.id)).then((r) => { removed.ownerPins = r[0].affectedRows; }).catch(() => { removed.ownerPins = -1; }),
    db.delete(sessions).where(eq(sessions.openId, user.openId)).then((r) => { removed.sessions = r[0].affectedRows; }).catch(() => { removed.sessions = -1; }),
  ]);

  let authRemoved = false;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (serviceRoleKey && user.email) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
      const adminClient = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await adminClient.auth.admin.deleteUser(user.email);
      authRemoved = !error;
    } catch { authRemoved = false; }
  }

  await db.delete(users).where(eq(users.id, user.id)).then((r) => { removed.users = r[0].affectedRows; }).catch(() => { removed.users = -1; });

  await createSuperAdminAudit({
    actorUserId,
    action: "user-purged",
    details: JSON.stringify({ id: user.id, email: user.email ?? "", name: user.name ?? "", phone: user.phone ?? "", removed, authRemoved, authRoleConfigured: Boolean(serviceRoleKey), permanent: true }),
  }).catch(() => undefined);

  return { ok: true as const, user, removed, supabaseAuthRemoved: authRemoved, supabaseAuthConfigured: Boolean(serviceRoleKey) };
}

export type PendingDeletionAccount = {
  userId: number;
  email: string | null;
  name: string | null;
  phone: string | null;
  requestedAt: Date;
  scheduledFor: Date;
  remainingMs: number;
};

/** Effects accounts currently within their 14-day deletion grace period (sorted soonest-expiring first). */
export async function listPendingDeletionAccounts(): Promise<PendingDeletionAccount[]> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const now = new Date();
  const rows = await db.select({ request: accountDeletionRequests, user: users }).from(accountDeletionRequests)
    .innerJoin(users, eq(accountDeletionRequests.userId, users.id))
    .where(eq(accountDeletionRequests.status, "pending"))
    .orderBy(asc(accountDeletionRequests.scheduledFor));
  return rows
    .filter((row) => row.request.scheduledFor > now)
    .map((row) => ({
      userId: row.request.userId,
      email: row.user.email,
      name: row.user.name,
      phone: row.user.phone,
      requestedAt: row.request.requestedAt,
      scheduledFor: row.request.scheduledFor,
      remainingMs: row.request.scheduledFor.getTime() - now.getTime(),
    }));
}

/** Count of accounts still waiting out their deletion grace period (for the dashboard metric). */
export async function getPendingDeletionCount(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const rows = await db.select({ c: sql`count(*)` }).from(accountDeletionRequests).where(eq(accountDeletionRequests.status, "pending"));
  return Number(rows[0]?.c ?? 0);
}

export type RemovedAccountRecord = {
  id: number;
  email: string | null;
  name: string | null;
  phone: string | null;
  removedAt: Date;
  actorName: string;
  removed: Record<string, number>;
};

/** Archive of accounts permanently removed (بل رجعة) by the Super Admin, from the server audit trail. */
export async function listRemovedAccounts(limit = 100): Promise<RemovedAccountRecord[]> {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const rows = await db.select({ audit: superAdminAudit, actorName: users.name, actorEmail: users.email })
    .from(superAdminAudit)
    .leftJoin(users, eq(superAdminAudit.actorUserId, users.id))
    .where(eq(superAdminAudit.action, "user-purged"))
    .orderBy(desc(superAdminAudit.createdAt))
    .limit(Math.min(Math.max(limit, 1), 250));
  return rows.map(({ audit, actorName, actorEmail }) => {
    let parsed: Partial<Record<string, number>> & { email?: string; name?: string; phone?: string } = {};
    try { parsed = audit.details ? JSON.parse(audit.details) : {}; } catch { parsed = {}; }
    delete parsed.removed;
    return {
      id: audit.id,
      email: parsed.email ?? null,
      name: parsed.name ?? null,
      phone: parsed.phone ?? null,
      removedAt: audit.createdAt,
      actorName: actorName ?? actorEmail ?? `مستخدم #${audit.actorUserId}`,
      removed: (() => { try { return audit.details ? (JSON.parse(audit.details).removed ?? {}) : {}; } catch { return {}; } })(),
    };
  });
}


export async function createSuggestion(input: Pick<InsertSuggestion, "content" | "language">) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");

  const result = await db.insert(suggestions).values({
    content: input.content,
    language: input.language,
    status: "new",
  });

  return Number(result[0].insertId);
}

const pinHash = (pin: string) => createHash("sha256").update(pin).digest("hex");

function parseStoredPermissions(value: string | null, role: WorkspaceRole): WorkspacePermissions {
  if (role === "owner" || role === "admin") return { ...MANAGER_PERMISSIONS };
  try {
    return normalizeWorkspacePermissions(value ? JSON.parse(value) : undefined, role === "guest" ? "guest" : "employee");
  } catch {
    return permissionsForWorkspaceRole(role);
  }
}

function withPermissions<T extends { role: WorkspaceRole; permissions: string | null }>(member: T) {
  return { ...member, permissions: parseStoredPermissions(member.permissions, member.role) };
}

const QA_SANDBOX_OWNER_OPEN_ID = "stay-in-qa-sandbox-owner-v1";
const QA_SANDBOX_STAFF_OPEN_ID = "stay-in-qa-sandbox-staff-v1";
const QA_SANDBOX_GUEST_OPEN_ID = "stay-in-qa-sandbox-guest-v1";

const QA_SANDBOX_USERS = {
  owner: { openId: QA_SANDBOX_OWNER_OPEN_ID, name: "مالك الاختبار", email: "owner@test.com", phone: "+962790000101" },
  staff: { openId: QA_SANDBOX_STAFF_OPEN_ID, name: "موظف الحجوزات التجريبي", email: "staff@test.com", phone: "+962790000102" },
  guest: { openId: QA_SANDBOX_GUEST_OPEN_ID, name: "حارس الاختبار", email: "guest@test.com", phone: "+962790000103" },
} as const;

const QA_SANDBOX_FACILITIES = [
  { key: "palm" as const, name: "قرية النخلة" },
  { key: "oasis" as const, name: "شاليهات الواحة" },
] as const;

type QaSandboxActor = "super-admin" | "owner" | "staff" | "guest";

function qaSandboxDate(daysFromToday: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function qaSandboxPayload(facility: typeof QA_SANDBOX_FACILITIES[number]) {
  const now = new Date().toISOString();
  const today = qaSandboxDate(0);
  const tomorrow = qaSandboxDate(1);
  const afterTomorrow = qaSandboxDate(2);
  const yesterday = qaSandboxDate(-1);
  const inFourDays = qaSandboxDate(4);
  const isPalm = facility.key === "palm";
  const shiftBookingType = (shift: { startTime: string }) => shift.startTime >= "22:00" ? "evening" as const : "morning" as const;
  const chalets = isPalm
    ? [
      { id: "qa-palm-1", name: "النخلة 1", referenceCode: "ن1", propertyType: "chalet" as const, color: "#0F8B83", location: "مدخل قرية النخلة", guardianName: "حارس النخلة", guardianPhone: "+962790000103", createdAt: now, shifts: [{ id: "qa-day", name: "فترة نهارية", startTime: "09:00", endTime: "21:00", weekdayPrice: 120, weekendPrice: 150, isActive: true, color: "#0F8B83" }] },
      { id: "qa-palm-2", name: "النخلة 2", referenceCode: "ن2", propertyType: "villa" as const, color: "#2563EB", location: "جناح القرية الغربي", guardianName: "حارس النخلة", guardianPhone: "+962790000103", createdAt: now, shifts: [{ id: "qa-evening", name: "سهرة", startTime: "22:00", endTime: "09:00", weekdayPrice: 135, weekendPrice: 165, isActive: true, color: "#2563EB" }] },
    ]
    : [
      { id: "qa-oasis-1", name: "الواحة الرئيسية", referenceCode: "و1", propertyType: "chalet" as const, color: "#7C3AED", location: "مدخل شاليهات الواحة", guardianName: "حارس الواحة", guardianPhone: "+962790000103", createdAt: now, shifts: [{ id: "qa-oasis-day", name: "فترة نهارية", startTime: "10:00", endTime: "22:00", weekdayPrice: 110, weekendPrice: 140, isActive: true, color: "#7C3AED" }] },
    ];
  const primary = chalets[0];
  const secondary = chalets[1] ?? chalets[0];
  const bookings = [
    { id: `qa-${facility.key}-booking-current`, bookingReference: isPalm ? "#ن1TEST1" : "#و1TEST1", customerName: isPalm ? "سارة التجريبية" : "عمر التجريبي", phone: "+962790101010", chaletId: primary.id, chaletName: primary.name, startDate: today, endDate: tomorrow, bookingType: "morning" as const, shiftId: primary.shifts[0].id, shiftName: primary.shifts[0].name, shiftColor: primary.shifts[0].color, startTime: primary.shifts[0].startTime, endTime: primary.shifts[0].endTime, price: isPalm ? 120 : 110, depositAmount: 30, payments: [{ id: `qa-${facility.key}-payment-1`, amount: isPalm ? 60 : 55, date: today, recordedAt: now, paymentMethod: "cash-owner" as const, recordedByName: "موظف الحجوزات التجريبي" }], notes: "حجز تجريبي لاختبار عزل المنشأة.", status: "confirmed" as const, createdAt: now, createdByName: "موظف الحجوزات التجريبي", createdByRole: "employee" as const },
    { id: `qa-${facility.key}-booking-upcoming`, bookingReference: isPalm ? "#ن2TEST2" : "#و1TEST2", customerName: isPalm ? "رامي التجريبي" : "ليان التجريبية", phone: "+962790202020", chaletId: secondary.id, chaletName: secondary.name, startDate: tomorrow, endDate: afterTomorrow, bookingType: "custom" as const, shiftId: secondary.shifts[0].id, shiftName: secondary.shifts[0].name, shiftColor: secondary.shifts[0].color, startTime: secondary.shifts[0].startTime, endTime: secondary.shifts[0].endTime, price: isPalm ? 165 : 140, payments: [], notes: "حجز قادم لعرض التقويم والحجوزات النشطة.", status: "awaiting-deposit" as const, createdAt: now, createdByName: "مالك الاختبار", createdByRole: "owner" as const },
    { id: `qa-${facility.key}-booking-completed`, bookingReference: isPalm ? "#ن3TEST3" : "#و1TEST3", customerName: "هدى التجريبية", phone: "+962790303030", chaletId: primary.id, chaletName: primary.name, startDate: yesterday, endDate: today, bookingType: shiftBookingType(primary.shifts[0]), shiftId: primary.shifts[0].id, shiftName: primary.shifts[0].name, shiftColor: primary.shifts[0].color, startTime: primary.shifts[0].startTime, endTime: primary.shifts[0].endTime, price: primary.shifts[0].weekendPrice, depositAmount: 30, payments: [{ id: `qa-${facility.key}-payment-completed`, amount: primary.shifts[0].weekendPrice, date: yesterday, recordedAt: now, paymentMethod: "click" as const, recordedByName: "موظف الحجوزات التجريبي" }], notes: "حجز مكتمل ومؤرشف للعرض في التقارير المالية.", status: "completed" as const, createdAt: now, createdByName: "موظف الحجوزات التجريبي", createdByRole: "employee" as const },
    { id: `qa-${facility.key}-booking-cancelled`, bookingReference: isPalm ? "#ن4TEST4" : "#و1TEST4", customerName: "طارق التجريبي", phone: "+962790404040", chaletId: secondary.id, chaletName: secondary.name, startDate: today, endDate: tomorrow, bookingType: shiftBookingType(secondary.shifts[0]), shiftId: secondary.shifts[0].id, shiftName: secondary.shifts[0].name, shiftColor: secondary.shifts[0].color, startTime: secondary.shifts[0].startTime, endTime: secondary.shifts[0].endTime, price: secondary.shifts[0].weekendPrice, depositAmount: 0, payments: [], notes: "حجز مُلغى للعرض ضمن سجل الإلغاءات.", status: "cancelled" as const, createdAt: now, createdByName: "موظف الحجوزات التجريبي", createdByRole: "employee" as const },
  ];
  return normalizeAppData({
    chalets,
    bookings,
    waitlist: [
      { id: `qa-${facility.key}-waitlist-1`, customerName: "نور التجريبية", phone: "+962790505050", chaletId: primary.id, chaletName: primary.name, requestedDate: afterTomorrow, bookingType: shiftBookingType(primary.shifts[0]), shiftId: primary.shifts[0].id, shiftName: primary.shifts[0].name, shiftColor: primary.shifts[0].color, startTime: primary.shifts[0].startTime, endTime: primary.shifts[0].endTime, price: primary.shifts[0].weekendPrice, notes: "بانتظار إلغاء أو تنازل لإتاحة الموقع.", createdAt: now },
      { id: `qa-${facility.key}-waitlist-2`, customerName: "يزن التجريبي", phone: "+962790606060", chaletId: secondary.id, chaletName: secondary.name, requestedDate: inFourDays, bookingType: shiftBookingType(secondary.shifts[0]), shiftId: secondary.shifts[0].id, shiftName: secondary.shifts[0].name, shiftColor: secondary.shifts[0].color, startTime: secondary.shifts[0].startTime, endTime: secondary.shifts[0].endTime, price: secondary.shifts[0].weekendPrice, notes: "ينتظر تأكيد التوفر على فترة أطول.", createdAt: now },
    ],
    turnoverTasks: [
      { id: `qa-${facility.key}-turnover`, checkoutBookingId: `qa-${facility.key}-booking-completed`, nextBookingId: `qa-${facility.key}-booking-current`, chaletId: primary.id, chaletName: primary.name, dueAt: new Date(`${today}T${primary.shifts[0].endTime}:00`).toISOString(), status: "pending" as const, createdAt: now },
    ],
    expenses: [
      { id: `qa-${facility.key}-expense`, chaletId: primary.id, chaletName: primary.name, amount: isPalm ? 18 : 14, date: today, category: "cleaning-supplies", note: "مواد تنظيف تجريبية", paymentMethod: "cash", createdAt: now, createdByName: "موظف الحجوزات التجريبي" },
      { id: `qa-${facility.key}-expense-maintenance`, chaletId: secondary.id, chaletName: secondary.name, amount: isPalm ? 25 : 20, date: afterTomorrow, category: "maintenance", note: "صيانة دورية تجريبية", paymentMethod: "click", createdAt: now, createdByName: "موظف الحجوزات التجريبي" },
    ],
    settings: { ...DEFAULT_SETTINGS, businessName: facility.name, businessPhone: "+962790000100", workspaceCode: isPalm ? "E01" : "E02", whatsAppEnabled: true, device: { ...DEFAULT_DEVICE_SETTINGS, whatsAppBaseHeaderTemplate: `رسالة اختبار مستقلة لمنشأة ${facility.name}: {العميل} — {الشاليه}`, receiptMessageTemplate: `إيصال اختبار ${facility.name}: {العميل} — {الإجمالي}`, readyMessageTemplate: `تأكيد اختبار ${facility.name}: {العميل} — {الفترة}` } },
    specialPriceRules: [],
    auditLog: [{ id: `qa-${facility.key}-seed-audit`, action: "booking-checked-in", subjectName: "بيانات الاختبار", details: `أُنشئت البيانات التجريبية المعزولة لمنشأة ${facility.name}`, createdAt: now, actorName: "مدير النظام" }],
  });
}

async function ensureQaSandboxUser(key: keyof typeof QA_SANDBOX_USERS) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const user = QA_SANDBOX_USERS[key];
  await database.insert(users).values({ ...user, loginMethod: "qa-sandbox", role: "user", lastSignedIn: new Date() }).onDuplicateKeyUpdate({ set: { name: user.name, email: user.email, phone: user.phone, loginMethod: "qa-sandbox" } });
  const stored = (await database.select().from(users).where(eq(users.openId, user.openId)).limit(1))[0];
  if (!stored) throw new Error("QA sandbox user could not be created");
  return stored;
}

async function ensureQaSandboxWorkspace(input: { name: string; ownerUserId: number; ownerName: string; ownerPhone: string }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  let workspace = (await database.select().from(workspaces).where(and(eq(workspaces.name, input.name), eq(workspaces.ownerUserId, input.ownerUserId))).limit(1))[0];
  let created = false;
  if (!workspace) {
    const result = await database.insert(workspaces).values({ name: input.name, ownerUserId: input.ownerUserId });
    workspace = (await database.select().from(workspaces).where(eq(workspaces.id, Number(result[0].insertId))).limit(1))[0];
    created = true;
  }
  if (!workspace) throw new Error("QA sandbox workspace could not be created");
  const ownerMember = (await database.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, input.ownerUserId))).limit(1))[0];
  if (!ownerMember) await database.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: input.ownerUserId, displayName: input.ownerName, phone: input.ownerPhone, role: "owner", permissions: JSON.stringify(MANAGER_PERMISSIONS), status: "active" });
  return { workspace, created };
}

async function ensureQaSandboxMembership(input: { workspaceId: number; userId: number; displayName: string; phone: string; role: Exclude<WorkspaceRole, "owner"> }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const existing = (await database.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, input.workspaceId), eq(workspaceMembers.userId, input.userId))).limit(1))[0];
  const fields = { displayName: input.displayName, phone: input.phone, role: input.role, permissions: JSON.stringify(permissionsForWorkspaceRole(input.role)), status: "active" as const };
  if (existing) await database.update(workspaceMembers).set(fields).where(eq(workspaceMembers.id, existing.id));
  else await database.insert(workspaceMembers).values({ workspaceId: input.workspaceId, userId: input.userId, ...fields });
}

export async function seedQaSandbox(actorUserId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const [owner, staff, guest] = await Promise.all([ensureQaSandboxUser("owner"), ensureQaSandboxUser("staff"), ensureQaSandboxUser("guest")]);
  const workspaceResults = await Promise.all(QA_SANDBOX_FACILITIES.map((facility) => ensureQaSandboxWorkspace({ name: facility.name, ownerUserId: owner.id, ownerName: owner.name ?? QA_SANDBOX_USERS.owner.name, ownerPhone: QA_SANDBOX_USERS.owner.phone })));
  for (const result of workspaceResults) {
    await ensureQaSandboxMembership({ workspaceId: result.workspace.id, userId: staff.id, displayName: QA_SANDBOX_USERS.staff.name, phone: QA_SANDBOX_USERS.staff.phone, role: "staff" });
  }
  await ensureQaSandboxMembership({ workspaceId: workspaceResults[0].workspace.id, userId: guest.id, displayName: QA_SANDBOX_USERS.guest.name, phone: QA_SANDBOX_USERS.guest.phone, role: "guest" });
  const [superAdmin] = (await database.select().from(users).where(eq(users.id, actorUserId)).limit(1));
  for (let index = 0; index < workspaceResults.length; index += 1) {
    const result = workspaceResults[index];
    const nextPayload = JSON.stringify(qaSandboxPayload(QA_SANDBOX_FACILITIES[index]));
    const existingData = await getWorkspaceData(result.workspace.id);
    if (existingData) await database.update(workspaceData).set({ payload: nextPayload, version: existingData.version + 1, updatedByUserId: actorUserId }).where(eq(workspaceData.workspaceId, result.workspace.id));
    else await database.insert(workspaceData).values({ workspaceId: result.workspace.id, payload: nextPayload, version: 1, updatedByUserId: actorUserId });
    await ensureQaSandboxMembership({ workspaceId: result.workspace.id, userId: actorUserId, displayName: superAdmin?.name ?? "مدير النظام", phone: superAdmin?.phone ?? "", role: "admin" });
    await database.insert(workspaceActivity).values({ workspaceId: result.workspace.id, actorUserId, action: "qa-sandbox-seeded", subject: result.workspace.name, details: existingData ? "تم تحديث بيانات منشأة الاختبار المعزولة" : "تم إنشاء منشأة اختبار معزولة وبياناتها الأولية" });
  }
  // Leaving the shared staff without an active facility guarantees the first demo routing path opens the selector.
  await database.delete(activeWorkspaces).where(eq(activeWorkspaces.userId, staff.id));
  await createSuperAdminAudit({ actorUserId, action: "qa-sandbox-seeded", details: JSON.stringify({ sandbox: "stay-in-qa-sandbox-v1", createdFacilities: workspaceResults.filter((item) => item.created).map((item) => item.workspace.id), staffEmail: QA_SANDBOX_USERS.staff.email }) });
  return getQaSandboxStatus();
}

export async function getQaSandboxStatus() {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const storedUsers = await Promise.all(Object.entries(QA_SANDBOX_USERS).map(async ([key, demo]) => ({ key: key as keyof typeof QA_SANDBOX_USERS, user: (await database.select().from(users).where(eq(users.openId, demo.openId)).limit(1))[0] ?? null })));
  const owner = storedUsers.find((entry) => entry.key === "owner")?.user;
  const allWorkspaces = owner ? await database.select().from(workspaces).where(eq(workspaces.ownerUserId, owner.id)) : [];
  const facilities = QA_SANDBOX_FACILITIES.map((facility) => ({ key: facility.key, name: facility.name, workspace: allWorkspaces.find((workspace) => workspace.name === facility.name) ?? null }));
  const workspaceIds = facilities.flatMap((facility) => facility.workspace ? [facility.workspace.id] : []);
  const [members, snapshots] = workspaceIds.length ? await Promise.all([database.select().from(workspaceMembers), database.select().from(workspaceData)]) : [[], []] as const;
  const accounts = storedUsers.map(({ key, user }) => ({ key, userId: user?.id ?? null, displayName: user?.name ?? QA_SANDBOX_USERS[key].name, email: user?.email ?? QA_SANDBOX_USERS[key].email, memberships: user ? members.filter((member) => member.userId === user.id && workspaceIds.includes(member.workspaceId)).map((member) => ({ workspaceId: member.workspaceId, role: member.role, status: member.status })) : [] }));
  return {
    ready: facilities.every((facility) => Boolean(facility.workspace)) && accounts.every((account) => account.userId !== null),
    accounts,
    facilities: facilities.map((facility) => {
      const snapshot = facility.workspace ? snapshots.find((item) => item.workspaceId === facility.workspace!.id) : null;
      let counts = { units: 0, bookings: 0 };
      if (snapshot) { try { const data = normalizeAppData(JSON.parse(snapshot.payload)); counts = { units: data.chalets.length, bookings: data.bookings.length }; } catch {} }
      return { key: facility.key, workspaceId: facility.workspace?.id ?? null, name: facility.name, snapshotVersion: snapshot?.version ?? null, ...counts };
    }),
  };
}

const LOCAL_DEV_ADMIN_PHONE = "0790000001";
const LOCAL_DEV_SINGLE_PHONE = "0790000002";

type LocalDevPreset = { kind: "admin"; workspaceName: string } | { kind: "single"; workspaceName: string } | { kind: "fresh" };

function localDevPreset(phoneDigits: string): LocalDevPreset {
  const digits = phoneDigits.replace(/\D/g, "");
  const normalized = digits.startsWith("962") && digits.length >= 12 ? `0${digits.slice(3)}` : digits;
  if (normalized === LOCAL_DEV_ADMIN_PHONE) return { kind: "admin", workspaceName: "منشأة المعاينة الكاملة" };
  if (normalized === LOCAL_DEV_SINGLE_PHONE) return { kind: "single", workspaceName: "شاليه النخلة" };
  return { kind: "fresh" };
}

function localDevPayload(preset: Exclude<LocalDevPreset, { kind: "fresh" }>) {
  const now = new Date().toISOString();
  const day = qaSandboxDate(0);
  const next1 = qaSandboxDate(1);
  const next2 = qaSandboxDate(2);
  const next3 = qaSandboxDate(3);
  const next4 = qaSandboxDate(4);
  const yesterday = qaSandboxDate(-1);
  const chalets = preset.kind === "admin" ? [
    { id: "lvp-1", name: "النخلة 1", referenceCode: "ن1", propertyType: "chalet" as const, color: "#0F8B83", location: "مدخل قرية النخلة", guardianName: "حارس النخلة", guardianPhone: "+962790000103", createdAt: now, shifts: [{ id: "lvp-day-1", name: "فترة نهارية", startTime: "09:00", endTime: "21:00", weekdayPrice: 120, weekendPrice: 150, isActive: true, color: "#0F8B83" }] },
    { id: "lvp-2", name: "شاليه VIP", referenceCode: "ف2", propertyType: "villa" as const, color: "#FF6B47", location: "الجناح الملكي", guardianName: "حارس النخلة", guardianPhone: "+962790000103", createdAt: now, shifts: [{ id: "lvp-evening-2", name: "سهرة", startTime: "22:00", endTime: "09:00", weekdayPrice: 200, weekendPrice: 260, isActive: true, color: "#FF6B47" }] },
    { id: "lvp-3", name: "الواحة الرئيسية", referenceCode: "و3", propertyType: "chalet" as const, color: "#7C3AED", location: "مدخل شاليهات الواحة", guardianName: "حارس الواحة", guardianPhone: "+962790000103", createdAt: now, shifts: [{ id: "lvp-day-3", name: "فترة نهارية", startTime: "10:00", endTime: "22:00", weekdayPrice: 110, weekendPrice: 140, isActive: true, color: "#7C3AED" }] },
  ] : [
    { id: "lvs-1", name: "شاليه النخلة", referenceCode: "ن1", propertyType: "chalet" as const, color: "#0F8B83", location: "مدخل قرية النخلة", guardianName: "حارس النخلة", guardianPhone: "+962790000103", createdAt: now, shifts: [{ id: "lvs-day-1", name: "فترة نهارية", startTime: "09:00", endTime: "21:00", weekdayPrice: 120, weekendPrice: 150, isActive: true, color: "#0F8B83" }, { id: "lvs-evening-1", name: "سهرة", startTime: "22:00", endTime: "09:00", weekdayPrice: 135, weekendPrice: 165, isActive: true, color: "#2563EB" }] },
  ];
  const primary = chalets[0];
  const secondary = chalets[1] ?? chalets[0];
  const third = chalets[2] ?? primary;
  const bookingDay = (id: string, ref: string, customerName: string, phone: string, chalet: (typeof chalets)[0], shift: (typeof chalets)[0]["shifts"][0], startDate: string, endDate: string, price: number, status: "confirmed" | "awaiting-deposit" | "completed" | "cancelled", depositAmount = 0) => ({ id, bookingReference: ref, customerName, phone, chaletId: chalet.id, chaletName: chalet.name, startDate, endDate, bookingType: shift.startTime >= "22:00" ? "evening" as const : "morning" as const, shiftId: shift.id, shiftName: shift.name, shiftColor: shift.color, startTime: shift.startTime, endTime: shift.endTime, price, depositAmount, payments: status === "completed" ? [{ id: `${id}-payment`, amount: price, date: startDate, recordedAt: now, paymentMethod: "cash-owner" as const, recordedByName: "مدير المعاينة" }] : [], notes: `${preset.workspaceName} — حجز تجريبي معزول برقم الهاتف.`, status, createdAt: now, createdByName: "مدير المعاينة", createdByRole: "owner" as const });
  const bookings = preset.kind === "admin"
    ? [
      bookingDay("lvp-b1", "#عA001", "سارة المعاينة", "+962790101010", primary, primary.shifts[0], day, next1, 120, "confirmed", 30),
      bookingDay("lvp-b2", "#عA002", "رامي المعاينة", "+962790202020", secondary, secondary.shifts[0], next1, next2, 200, "awaiting-deposit"),
      bookingDay("lvp-b3", "#عA003", "ليان المعاينة", "+962790303030", third, third.shifts[0], next2, next3, 110, "awaiting-deposit"),
      bookingDay("lvp-b4", "#عA004", "عمر المعاينة", "+962790404040", primary, primary.shifts[0], next3, next4, 150, "confirmed", 45),
      bookingDay("lvp-b5", "#عA005", "هدى المعاينة", "+962790505050", secondary, secondary.shifts[0], yesterday, day, 260, "completed"),
      bookingDay("lvp-b6", "#عA006", "طارق المعاينة", "+962790606060", primary, primary.shifts[0], next1, next2, 150, "cancelled"),
    ]
    : [
      bookingDay("lvs-b1", "#عS001", "سارة المعاينة", "+962790101010", primary, primary.shifts[0], day, next1, 120, "confirmed", 30),
      bookingDay("lvs-b2", "#عS002", "رامي المعاينة", "+962790202020", primary, primary.shifts[1], next1, next2, 135, "awaiting-deposit"),
      bookingDay("lvs-b3", "#عS003", "هدى المعاينة", "+962790303030", primary, primary.shifts[0], yesterday, day, 150, "completed"),
    ];
  const waitlist = preset.kind === "admin"
    ? [
      { id: "lvp-w1", customerName: "نور المعاينة", phone: "+962790707070", chaletId: primary.id, chaletName: primary.name, requestedDate: next3, bookingType: "morning" as const, shiftId: primary.shifts[0].id, shiftName: primary.shifts[0].name, shiftColor: primary.shifts[0].color, startTime: primary.shifts[0].startTime, endTime: primary.shifts[0].endTime, price: primary.shifts[0].weekendPrice, notes: "بانتظار توفر الفترة النهارية.", createdAt: now },
      { id: "lvp-w2", customerName: "يزن المعاينة", phone: "+962790808080", chaletId: secondary.id, chaletName: secondary.name, requestedDate: next4, bookingType: "evening" as const, shiftId: secondary.shifts[0].id, shiftName: secondary.shifts[0].name, shiftColor: secondary.shifts[0].color, startTime: secondary.shifts[0].startTime, endTime: secondary.shifts[0].endTime, price: secondary.shifts[0].weekendPrice, notes: "ينتظر تأكيد التوفر على السهرة.", createdAt: now },
    ]
    : [
      { id: "lvs-w1", customerName: "نور المعاينة", phone: "+962790707070", chaletId: primary.id, chaletName: primary.name, requestedDate: next3, bookingType: "morning" as const, shiftId: primary.shifts[0].id, shiftName: primary.shifts[0].name, shiftColor: primary.shifts[0].color, startTime: primary.shifts[0].startTime, endTime: primary.shifts[0].endTime, price: primary.shifts[0].weekendPrice, notes: "بانتظار إلغاء أو تنازل.", createdAt: now },
    ];
  const expenses = (preset.kind === "admin" ? [
    { id: "lvp-e1", chaletId: primary.id, chaletName: primary.name, amount: 18, date: day, category: "cleaning-supplies" as const, note: "مواد تنظيف", paymentMethod: "cash" as const, createdAt: now, createdByName: "مدير المعاينة" },
    { id: "lvp-e2", chaletId: secondary.id, chaletName: secondary.name, amount: 45, date: next1, category: "maintenance" as const, note: "صيانة السهرة", paymentMethod: "click" as const, createdAt: now, createdByName: "مدير المعاينة" },
    { id: "lvp-e3", chaletId: third.id, chaletName: third.name, amount: 12, date: next2, category: "utilities" as const, note: "فاتورة مياه", paymentMethod: "cash" as const, createdAt: now, createdByName: "مدير المعاينة" },
  ] : [
    { id: "lvs-e1", chaletId: primary.id, chaletName: primary.name, amount: 20, date: day, category: "cleaning-supplies" as const, note: "مواد تنظيف", paymentMethod: "cash" as const, createdAt: now, createdByName: "مدير المعاينة" },
  ]);
  return normalizeAppData({
    chalets,
    bookings,
    waitlist,
    turnoverTasks: [],
    expenses,
    settings: { ...DEFAULT_SETTINGS, businessName: preset.workspaceName, businessPhone: "+962790000100", whatsAppEnabled: true, device: { ...DEFAULT_DEVICE_SETTINGS } },
    specialPriceRules: [],
    auditLog: [{ id: `${preset.kind}-seed-audit`, action: "booking-checked-in", subjectName: "بيانات المعاينة", details: `أُنشئت بيانات معزولة لحساب ${preset.workspaceName}.`, createdAt: now, actorName: "مدير المعاينة" }],
  });
}

export async function ensureLocalDevAccess(input: { userId: number; displayName: string; phone: string }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const preset = localDevPreset(input.phone);
  const qaStatus = await getQaSandboxStatus().catch(() => null);
  const qaIds = (qaStatus?.facilities ?? []).map((facility) => facility.workspaceId).filter((id): id is number => id != null && id > 0);
  if (qaIds.length) {
    await database.delete(workspaceMembers).where(and(eq(workspaceMembers.userId, input.userId), inArray(workspaceMembers.workspaceId, qaIds)));
    await database.delete(activeWorkspaces).where(and(eq(activeWorkspaces.userId, input.userId), inArray(activeWorkspaces.workspaceId, qaIds)));
  }
  if (preset.kind === "fresh") return;
  const ownedWorkspaces = (await database.select().from(workspaces).where(and(eq(workspaces.ownerUserId, input.userId), eq(workspaces.name, preset.workspaceName))).limit(1))[0];
  let workspaceId: number;
  if (ownedWorkspaces) {
    workspaceId = ownedWorkspaces.id;
  } else {
    const result = await database.insert(workspaces).values({ name: preset.workspaceName, ownerUserId: input.userId });
    const created = (await database.select().from(workspaces).where(eq(workspaces.id, Number(result[0].insertId))).limit(1))[0];
    if (!created) throw new Error("Local dev workspace could not be created");
    workspaceId = created.id;
  }
  const ownerMember = (await database.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, input.userId))).limit(1))[0];
  if (!ownerMember) {
    await database.insert(workspaceMembers).values({ workspaceId, userId: input.userId, displayName: input.displayName, phone: input.phone || "—", role: "owner", permissions: JSON.stringify(MANAGER_PERMISSIONS), status: "active" });
  }
  const stored = await getWorkspaceData(workspaceId);
  if (!stored) {
    await database.insert(workspaceData).values({ workspaceId, payload: JSON.stringify(localDevPayload(preset)), version: 1, updatedByUserId: input.userId });
  }
  await setActiveWorkspace(input.userId, workspaceId);
}

export async function previewQaSandbox(input: { actorUserId: number; actor: QaSandboxActor; workspaceId: number }) {
  const status = await getQaSandboxStatus();
  const facility = status.facilities.find((item) => item.workspaceId === input.workspaceId);
  if (!status.ready || !facility || !facility.workspaceId) throw new Error("QA sandbox is not ready");
  const actorKey = input.actor === "super-admin" ? null : input.actor;
  const account = actorKey ? status.accounts.find((item) => item.key === actorKey) : null;
  const membership = account?.memberships.find((item) => item.workspaceId === input.workspaceId && item.status === "active") ?? null;
  if (input.actor !== "super-admin" && !membership) throw new Error("Demo account has no access to this workspace");
  const stored = await getWorkspaceData(input.workspaceId);
  if (!stored) throw new Error("QA sandbox workspace has no data");
  const data = normalizeAppData(JSON.parse(stored.payload));
  const permissions = input.actor === "super-admin" ? { ...MANAGER_PERMISSIONS } : permissionsForWorkspaceRole(membership!.role);
  await createSuperAdminAudit({ actorUserId: input.actorUserId, action: "qa-sandbox-simulated", targetWorkspaceId: input.workspaceId, details: JSON.stringify({ actor: input.actor, simulationOnly: true, workspaceId: input.workspaceId }) });
  return {
    simulationOnly: true as const,
    actor: input.actor,
    account: input.actor === "super-admin" ? { displayName: "مدير النظام", email: "صلاحية الإدارة العليا" } : { displayName: account!.displayName, email: account!.email },
    workspace: { id: input.workspaceId, name: facility.name, role: input.actor === "super-admin" ? "super-admin" : membership!.role },
    permissions,
    isolation: { units: data.chalets.map((unit) => ({ id: unit.id, name: unit.name })), bookings: data.bookings.map((booking) => ({ id: booking.id, customerName: booking.customerName, chaletName: booking.chaletName ?? "—", startDate: booking.startDate, status: booking.status })), whatsAppBaseHeaderTemplate: data.settings.device?.whatsAppBaseHeaderTemplate ?? "" },
  };
}

/** Looks up an existing StayIn user by canonical (lowercased, trimmed) email. */
export async function getUserByEmail(email: string | null | undefined) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user by email: database not available");
    return undefined;
  }
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return undefined;
  const result = await db.select().from(users).where(eq(users.email, normalized)).limit(10);
  return result.length > 0 ? result[0] : undefined;
}

export async function getWorkspaceMember(userId: number) {
  return getActiveWorkspaceMember(userId);
}

export async function listWorkspaceMemberships(userId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const members = (await database.select().from(workspaceMembers).where(eq(workspaceMembers.userId, userId))).filter((member) => member.status === "active");
  const summaries = await Promise.all(members.map(async (member) => {
    const workspace = (await database.select().from(workspaces).where(eq(workspaces.id, member.workspaceId)).limit(1))[0];
    return workspace ? { workspace, member: withPermissions(member) } : null;
  }));
  return summaries.filter((item): item is NonNullable<typeof item> => Boolean(item));
}

async function getActiveWorkspaceId(userId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  return (await database.select().from(activeWorkspaces).where(eq(activeWorkspaces.userId, userId)).limit(1))[0]?.workspaceId;
}

export async function getActiveWorkspaceMember(userId: number) {
  const memberships = await listWorkspaceMemberships(userId);
  if (!memberships.length) return undefined;
  const activeId = await getActiveWorkspaceId(userId);
  return memberships.find((entry) => entry.workspace.id === activeId)?.member ?? memberships[0].member;
}

export async function setActiveWorkspace(userId: number, workspaceId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const membership = (await database.select().from(workspaceMembers).where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.status, "active"))).limit(1))[0];
  if (!membership) throw new Error("workspace-membership-required");
  await database.insert(activeWorkspaces).values({ userId, workspaceId }).onDuplicateKeyUpdate({ set: { workspaceId } });
  return withPermissions(membership);
}

export async function bootstrapOwnerWorkspace(user: { id: number; name: string | null }) {
  const existing = await getWorkspaceMember(user.id);
  if (existing) return existing;
  return createWorkspace({ user, name: "StayIn" });
}

/**
 * Ensures a user (used for the Super Admin / canonical owner) resolves to their
 * EXISTING workspace — never a freshly provisioned demo/data workspace. Returns
 * the active/preferred existing workspace id, or `null` when the owner has no
 * workspace at all (so we never bootstrap a brand-new empty one that would
 * orphan their real data).
 */
export async function linkOwnerWorkspace(user: { id: number; name: string | null }): Promise<{ workspaceId: number | null }> {
  const memberships = await listWorkspaceMemberships(user.id);
  if (!memberships.length) return { workspaceId: null };

  const activeId = await getActiveWorkspaceId(user.id);
  const preferred = memberships.find((entry) => entry.workspace.id === activeId) ?? memberships[0];
  if (!memberships.some((entry) => entry.workspace.id === activeId)) {
    await setActiveWorkspace(user.id, preferred.workspace.id);
  }
  return { workspaceId: preferred.workspace.id };
}

export async function createWorkspace(input: { user: { id: number; name: string | null }; name: string; phone?: string | null; currency?: string | null }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const workspaceName = input.name.trim();
  if (!workspaceName) throw new Error("workspace-name-required");
  if (workspaceName.length > 255) throw new Error("workspace-name-too-long");
  const currency = input.currency?.trim().slice(0, 8) || null;
  const workspaceResult = await database.insert(workspaces).values({ name: workspaceName, ownerUserId: input.user.id, currency });
  const workspaceId = Number(workspaceResult[0].insertId);
  await database.insert(workspaceMembers).values({ workspaceId, userId: input.user.id, displayName: input.user.name?.trim() || "المالك", phone: input.phone?.trim() || "—", role: "owner", permissions: JSON.stringify(MANAGER_PERMISSIONS), status: "active" });
  await database.insert(workspaceActivity).values({ workspaceId, actorUserId: input.user.id, action: "workspace-created", subject: workspaceName, details: "تم إنشاء مجموعة المنشآت" });
  // Seed a real initial payload so the freshly-created workspace renders a
  // healthy dashboard immediately (settings/business identity included) instead
  // of relying on a later empty-hydration path.
  const seeded = normalizeAppData({ settings: { ...DEFAULT_SETTINGS, businessName: workspaceName, businessPhone: input.phone?.trim() || "", currency: currency ?? DEFAULT_SETTINGS.currency } });
  await database.insert(workspaceData).values({ workspaceId, payload: JSON.stringify(seeded), version: 0, updatedByUserId: input.user.id }).onDuplicateKeyUpdate({ set: {} });
  await setActiveWorkspace(input.user.id, workspaceId);
  return (await getActiveWorkspaceMember(input.user.id))!;
}

export async function getWorkspaceSummary(user: { id: number; name: string | null }) {
  const member = await getWorkspaceMember(user.id);
  if (!member) return { workspace: null, member: null };
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const workspace = (await database.select().from(workspaces).where(eq(workspaces.id, member.workspaceId)).limit(1))[0];
  return { workspace, member };
}

export async function getWorkspaceRouting(user: { id: number; name: string | null }) {
  // An account inside its 14-day deletion grace period is locked to the restore
  // gateway: every internal route must bounce the user back until they cancel
  // the deletion request (or it expires and the account is purged).
  const deletion = await getAccountDeletionRequest(user.id);
  const pendingDeletion = deletion && deletion.status === "pending" && deletion.scheduledFor && deletion.scheduledFor > new Date() ? { scheduledFor: deletion.scheduledFor.toISOString() } : null;
  if (pendingDeletion) return { destination: "restore" as const, activeWorkspace: null, memberships: [], deletion: pendingDeletion };
  const memberships = await listWorkspaceMemberships(user.id);
  if (!memberships.length) return { destination: "onboarding" as const, activeWorkspace: null, memberships, deletion: pendingDeletion };
  const activeId = await getActiveWorkspaceId(user.id);
  const active = memberships.find((entry) => entry.workspace.id === activeId);
  if (active) return { destination: "dashboard" as const, activeWorkspace: active, memberships, deletion: pendingDeletion };
  if (memberships.length === 1) {
    const single = memberships[0];
    await setActiveWorkspace(user.id, single.workspace.id);
    return { destination: "dashboard" as const, activeWorkspace: single, memberships, deletion: pendingDeletion };
  }
  return { destination: "selector" as const, activeWorkspace: null, memberships, deletion: pendingDeletion };
}

/**
 * Enriches every workspace the user belongs to with the operational profile
 * stored in that workspace's data payload (business name/phone/currency) plus
 * its active unit count, and marks which one is currently active. Used by the
 * Properties Hub (منشآتي) to render accurate per-property cards regardless of
 * the workspace that is active at the moment.
 */
export async function getWorkspaceHub(user: { id: number; name: string | null }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const memberships = await listWorkspaceMemberships(user.id);
  const activeId = await getActiveWorkspaceId(user.id);
  const cards = await Promise.all(memberships.map(async ({ workspace, member }) => {
    let businessName = workspace.name;
    let businessPhone = "";
    let currency: string | null = workspace.currency ?? null;
    let unitCount = 0;
    const stored = await getWorkspaceData(workspace.id);
    if (stored) {
      try {
        const data = normalizeAppData(JSON.parse(stored.payload));
        businessName = data.settings.businessName.trim() || workspace.name;
        businessPhone = data.settings.businessPhone.trim() ?? "";
        currency = data.settings.currency.trim() || (workspace.currency ?? null);
        unitCount = data.chalets.length;
      } catch {
        // Fall back to the workspace row values if the payload is unreadable.
      }
    }
    return {
      workspaceId: workspace.id,
      name: workspace.name,
      businessName,
      businessPhone,
      currency,
      logoUrl: workspace.logoUrl ?? null,
      role: member.role,
      unitCount,
      isActive: workspace.id === activeId,
    };
  }));
  return { memberships: cards };
}

export async function listWorkspaceMembers(workspaceId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const members = await database.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
  const userCodes = new Map((await database.select({ id: users.id, userCode: users.userCode }).from(users).where(inArray(users.id, members.map((m) => m.userId)))).map((u) => [u.id, u.userCode ?? null]));
  return members.map((m) => ({ ...withPermissions(m), userCode: userCodes.get(m.userId) ?? null }));
}

export async function listWorkspaceCollectionRecipients(workspaceId: number) {
  const members = await listWorkspaceMembers(workspaceId);
  return members.filter((member) => member.status === "active" && (member.role === "owner" || member.allowDirectCollection));
}

export async function listWorkspaceInvitations(workspaceId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  // Never return the PIN hash to clients; it is only needed server-side to
  // verify acceptance and would otherwise be trivially cracked offline.
  return database.select({ id: workspaceInvitations.id, workspaceId: workspaceInvitations.workspaceId, employeeName: workspaceInvitations.employeeName, phone: workspaceInvitations.phone, createdByUserId: workspaceInvitations.createdByUserId, role: workspaceInvitations.role, permissions: workspaceInvitations.permissions, expiresAt: workspaceInvitations.expiresAt, usedAt: workspaceInvitations.usedAt, revokedAt: workspaceInvitations.revokedAt, createdAt: workspaceInvitations.createdAt }).from(workspaceInvitations).where(eq(workspaceInvitations.workspaceId, workspaceId)).orderBy(desc(workspaceInvitations.createdAt));
}

export async function createWorkspaceInvitation(input: { workspaceId: number; employeeName: string; phone: string; pin: string; createdByUserId: number; role?: Exclude<WorkspaceRole, "owner">; permissions: WorkspacePermissions; expiresAt: Date }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const role = input.role ?? "staff";
  const result = await database.insert(workspaceInvitations).values({ workspaceId: input.workspaceId, employeeName: input.employeeName, phone: input.phone, pinHash: pinHash(input.pin), createdByUserId: input.createdByUserId, role, permissions: JSON.stringify(input.permissions), expiresAt: input.expiresAt });
  await database.insert(workspaceActivity).values({ workspaceId: input.workspaceId, actorUserId: input.createdByUserId, action: "employee-invited", subject: input.employeeName, details: `دعوة موظف: ${input.phone}` });
  return Number(result[0].insertId);
}

export async function revokeWorkspaceInvitation(workspaceId: number, invitationId: number, actorUserId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  // Scope by both id and workspaceId to prevent cross-workspace revocation
  // (IDOR) when a manager supplies another workspace's invitation id.
  const invitation = (await database.select().from(workspaceInvitations).where(and(eq(workspaceInvitations.id, invitationId), eq(workspaceInvitations.workspaceId, workspaceId))).limit(1))[0];
  if (!invitation) throw new Error("Invitation not found");
  await database.update(workspaceInvitations).set({ revokedAt: new Date() }).where(eq(workspaceInvitations.id, invitationId));
  await database.insert(workspaceActivity).values({ workspaceId: invitation.workspaceId, actorUserId, action: "invitation-revoked", subject: invitation.employeeName, details: invitation.phone });
}

export async function acceptWorkspaceInvitation(input: { userId: number; phone: string; pin: string }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const invitation = (await database.select().from(workspaceInvitations).where(and(eq(workspaceInvitations.phone, input.phone), eq(workspaceInvitations.pinHash, pinHash(input.pin)), isNull(workspaceInvitations.usedAt), isNull(workspaceInvitations.revokedAt), gt(workspaceInvitations.expiresAt, new Date()))).orderBy(desc(workspaceInvitations.createdAt)).limit(1))[0];
  if (!invitation) throw new Error("Invitation is invalid or expired");
  await database.insert(workspaceMembers).values({ workspaceId: invitation.workspaceId, userId: input.userId, displayName: invitation.employeeName, phone: invitation.phone, role: invitation.role, permissions: JSON.stringify(parseStoredPermissions(invitation.permissions, invitation.role)), status: "active" });
  await database.update(workspaceInvitations).set({ usedAt: new Date() }).where(eq(workspaceInvitations.id, invitation.id));
  await database.insert(workspaceActivity).values({ workspaceId: invitation.workspaceId, actorUserId: input.userId, action: "employee-joined", subject: invitation.employeeName, details: invitation.phone });
  await setActiveWorkspace(input.userId, invitation.workspaceId);
  return getActiveWorkspaceMember(input.userId);
}

/**
 * Resolves a single invite code (the 6-digit PIN) sent by the owner, without
 * requiring the phone number. Used by the onboarding gateway's "لدي رمز دعوة"
 * card so a staff/guard user is assigned to the workspace by code alone.
 */
export async function findWorkspaceInvitationByPin(pin: string) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  return (await database.select().from(workspaceInvitations).where(and(eq(workspaceInvitations.pinHash, pinHash(pin)), isNull(workspaceInvitations.usedAt), isNull(workspaceInvitations.revokedAt), gt(workspaceInvitations.expiresAt, new Date()))).orderBy(desc(workspaceInvitations.createdAt)).limit(1))[0] ?? null;
}

export async function updateWorkspaceMemberPermissions(input: { workspaceId: number; memberId: number; permissions: WorkspacePermissions; actorUserId: number }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const member = (await database.select().from(workspaceMembers).where(and(eq(workspaceMembers.id, input.memberId), eq(workspaceMembers.workspaceId, input.workspaceId))).limit(1))[0];
  if (!member) throw new Error("Workspace member not found");
  if (member.role === "owner") throw new Error("Owner permissions cannot be restricted");
  await database.update(workspaceMembers).set({ permissions: JSON.stringify(input.permissions) }).where(eq(workspaceMembers.id, input.memberId));
  await database.insert(workspaceActivity).values({ workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: "employee-permissions-updated", subject: member.displayName, details: "تم تحديث الصلاحيات" });
  const refreshed = (await database.select().from(workspaceMembers).where(eq(workspaceMembers.id, input.memberId)).limit(1))[0];
  return withPermissions(refreshed);
}

export async function updateWorkspaceMemberCollectionProfile(input: { workspaceId: number; memberId: number; cliqAlias?: string; bankDetails?: string; commissionRate?: number; commissionType?: "percent" | "fixed"; allowDirectCollection: boolean; actorUserId: number }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const member = (await database.select().from(workspaceMembers).where(and(eq(workspaceMembers.id, input.memberId), eq(workspaceMembers.workspaceId, input.workspaceId))).limit(1))[0];
  if (!member) throw new Error("Workspace member not found");
  if (member.role === "owner") throw new Error("Owner collection profile is managed through workspace payment settings");
  const commissionRate = Number.isFinite(input.commissionRate) && Number(input.commissionRate) >= 0 ? String(Math.min(Number(input.commissionRate), 1_000_000)) : null;
  await database.update(workspaceMembers).set({ cliqAlias: input.cliqAlias?.trim().slice(0, 160) || null, bankDetails: input.bankDetails?.trim().slice(0, 1000) || null, commissionRate, commissionType: commissionRate ? (input.commissionType ?? "percent") : null, allowDirectCollection: input.allowDirectCollection }).where(eq(workspaceMembers.id, input.memberId));
  await database.insert(workspaceActivity).values({ workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: "employee-collection-profile-updated", subject: member.displayName, details: input.allowDirectCollection ? "تم تحديث حساب التحصيل والعمولة" : "تم تعطيل التحصيل المباشر" });
  const refreshed = (await database.select().from(workspaceMembers).where(eq(workspaceMembers.id, input.memberId)).limit(1))[0];
  return withPermissions(refreshed);
}

export async function listWorkspaceActivity(workspaceId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  return database.select().from(workspaceActivity).where(eq(workspaceActivity.workspaceId, workspaceId)).orderBy(desc(workspaceActivity.createdAt)).limit(100);
}

export async function getWorkspaceMemberById(workspaceId: number, memberId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  return (await database.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.id, memberId))).limit(1))[0] ?? null;
}

export async function recordWorkspaceActivity(input: { workspaceId: number; actorUserId: number; action: string; subject: string; details: string }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  await database.insert(workspaceActivity).values({ workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: input.action.slice(0, 80), subject: input.subject.slice(0, 255), details: input.details });
}

export async function getWorkspaceData(workspaceId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  return (await database.select().from(workspaceData).where(eq(workspaceData.workspaceId, workspaceId)).limit(1))[0];
}

async function collectUsedWorkspaceCodes(database: NonNullable<Awaited<ReturnType<typeof getDb>>>, excludeWorkspaceId?: number) {
  const rows = await database.select({ workspaceId: workspaceData.workspaceId, payload: workspaceData.payload }).from(workspaceData);
  const used = new Set<string>();
  for (const row of rows) {
    if (row.workspaceId === excludeWorkspaceId) continue;
    try {
      const code = JSON.parse(row.payload)?.settings?.workspaceCode;
      if (isValidWorkspaceCode(code ?? null)) used.add(normalizeWorkspaceCode(code));
    } catch {
      // Sea skip: payloads غير قابلة للقراءة لا تحجز رمزًا.
    }
  }
  return used;
}

function applyWorkspaceCode(payload: string, code: string) {
  const parsed = JSON.parse(payload);
  parsed.settings = { ...(parsed.settings ?? {}), workspaceCode: code };
  return JSON.stringify(parsed);
}

/**
 * يضمن لكل منشأة تمتلك حمولة بيانات رمزًا معياريًا مستقرًا E01..E999 في
 * settings.workspaceCode (يُستخدم في رقم الحجز الذكي وشارات الوحدات). يعيّن
 * الرمز بترتيب workspace id ويحتفظ بالأكواد الصالحة الموجودة.
 */
export async function ensureWorkspaceCodes(): Promise<void> {
  const database = await getDb();
  if (!database) return;
  const rows = await database.select({ workspaceId: workspaceData.workspaceId, payload: workspaceData.payload, version: workspaceData.version }).from(workspaceData);
  const used = new Set<string>();
  for (const row of rows) {
    let code = "";
    try {
      const candidate = JSON.parse(row.payload)?.settings?.workspaceCode;
      if (isValidWorkspaceCode(candidate ?? null)) code = normalizeWorkspaceCode(candidate);
    } catch {
      // Sea skip.
    }
    if (code) {
      used.add(code);
      continue;
    }
    const next = suggestWorkspaceCode([...used]);
    used.add(next);
    try {
      await database.update(workspaceData).set({ payload: applyWorkspaceCode(row.payload, next), version: row.version + 1 }).where(eq(workspaceData.workspaceId, row.workspaceId));
    } catch {
      // Sea skip: حمولة غير قابلة للتحليل لا تُعدَّل.
    }
  }
}

async function payloadWithAssignedWorkspaceCode(database: NonNullable<Awaited<ReturnType<typeof getDb>>>, payload: string, workspaceId: number): Promise<string> {
  if (!payload) return payload;
  try {
    const parsed = JSON.parse(payload);
    const code = parsed?.settings?.workspaceCode;
    if (isValidWorkspaceCode(code ?? null)) return payload;
    const used = await collectUsedWorkspaceCodes(database, workspaceId);
    const next = suggestWorkspaceCode([...used]);
    return applyWorkspaceCode(payload, next);
  } catch {
    return payload;
  }
}

export async function getWorkspaceById(workspaceId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  return (await database.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1))[0];
}

export async function updateWorkspaceFeatureFlags(workspaceId: number, flags: Record<string, boolean>) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  await database.update(workspaces).set({ featureFlags: JSON.stringify(flags), updatedAt: new Date() }).where(eq(workspaces.id, workspaceId));
}

/** إنشاء جدول مفاتيح الحجب المركزي للإدارة العليا (idempotent) بلا ترحيلات. */
export async function ensureGlobalFeatureFlagsTable(): Promise<void> {
  const database = await getDb();
  if (!database) {
    console.warn("[Database] Cannot ensure global feature flags table: database not available");
    return;
  }
  try {
    await database.execute(sql`
      CREATE TABLE IF NOT EXISTS stayInGlobalFeatureFlags (
        flag varchar(64) NOT NULL PRIMARY KEY,
        enabled tinyint(1) NOT NULL DEFAULT 1,
        updatedByUserId int NULL,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
  } catch (error) {
    console.error("[Database] Failed to ensure global feature flags table:", error);
  }
}

/** إنشاء جدول تفضيلات ميزات مساحة العمل (idempotent) بلا ترحيلات. */
export async function ensureWorkspaceFeatureSettingsTable(): Promise<void> {
  const database = await getDb();
  if (!database) {
    console.warn("[Database] Cannot ensure workspace feature settings table: database not available");
    return;
  }
  try {
    await database.execute(sql`
      CREATE TABLE IF NOT EXISTS stayInWorkspaceFeatureSettings (
        workspaceId int NOT NULL,
        flag varchar(64) NOT NULL,
        enabled tinyint(1) NOT NULL DEFAULT 1,
        updatedByUserId int NULL,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (workspaceId, flag),
        INDEX stayInWorkspaceFeatureSettings_workspaceId_idx (workspaceId)
      )
    `);
  } catch (error) {
    console.error("[Database] Failed to ensure workspace feature settings table:", error);
  }
}

export async function listGlobalFeatureFlags(): Promise<Record<string, boolean>> {
  const database = await getDb();
  if (!database) return { ...DEFAULT_GLOBAL_FEATURE_FLAGS };
  const rows = await database.select().from(globalFeatureFlags);
  const merged: Record<string, boolean> = { ...DEFAULT_GLOBAL_FEATURE_FLAGS };
  for (const row of rows) merged[row.flag] = row.enabled;
  return merged;
}

export async function updateGlobalFeatureFlag(input: { flag: GlobalFeatureFlagKey; enabled: boolean; actorUserId: number }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  await database.insert(globalFeatureFlags).values({ flag: input.flag, enabled: input.enabled, updatedByUserId: input.actorUserId }).onDuplicateKeyUpdate({ set: { enabled: input.enabled, updatedByUserId: input.actorUserId } });
}

export async function getWorkspaceFeatureSettings(workspaceId: number): Promise<Record<string, boolean>> {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const rows = await database.select().from(workspaceFeatureSettings).where(eq(workspaceFeatureSettings.workspaceId, workspaceId));
  return Object.fromEntries(rows.map((row) => [row.flag, row.enabled]));
}

export async function setWorkspaceFeatureSetting(input: { workspaceId: number; flag: WorkspaceFeaturePreferenceKey; enabled: boolean; actorUserId: number }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  await database.insert(workspaceFeatureSettings).values({ workspaceId: input.workspaceId, flag: input.flag, enabled: input.enabled, updatedByUserId: input.actorUserId }).onDuplicateKeyUpdate({ set: { enabled: input.enabled, updatedByUserId: input.actorUserId } });
}

/** دمج الحجب المركزي فوق تفضيلات المالك؛ الحجب يعلو دائمًا. */
export async function getEffectiveFeatureFlags(workspaceId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const global = await listGlobalFeatureFlags();
  const settings = await getWorkspaceFeatureSettings(workspaceId);
  const serverPreferences: Record<string, boolean> = { ...DEFAULT_WORKSPACE_FEATURE_PREFERENCES, ...settings };
  return { global, workspace: serverPreferences, effective: mergeGlobalOverPreference(global, serverPreferences) };
}

export async function saveWorkspaceData(input: { workspaceId: number; payload: string; expectedVersion: number; updatedByUserId: number }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const payload = await payloadWithAssignedWorkspaceCode(database, input.payload, input.workspaceId);
  const current = await getWorkspaceData(input.workspaceId);
  if (!current) {
    if (input.expectedVersion !== 0) throw new Error("workspace-data-conflict");
    await database.insert(workspaceData).values({ workspaceId: input.workspaceId, payload, version: 1, updatedByUserId: input.updatedByUserId });
    return { version: 1 };
  }
  if (current.version !== input.expectedVersion) throw new Error("workspace-data-conflict");
  const version = current.version + 1;
  await database.update(workspaceData).set({ payload, version, updatedByUserId: input.updatedByUserId }).where(eq(workspaceData.workspaceId, input.workspaceId));
  return { version };
}

export async function listMasterWorkspaces() {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const [allWorkspaces, allMembers, allSnapshots] = await Promise.all([
    database.select().from(workspaces).orderBy(desc(workspaces.updatedAt)),
    database.select().from(workspaceMembers),
    database.select().from(workspaceData),
  ]);
  return allWorkspaces.map((workspace) => {
    const members = allMembers.filter((member) => member.workspaceId === workspace.id);
    const snapshot = allSnapshots.find((item) => item.workspaceId === workspace.id);
    return {
      workspace,
      memberCount: members.filter((member) => member.status === "active").length,
      disabledMemberCount: members.filter((member) => member.status === "disabled").length,
      snapshot: snapshot ? { version: snapshot.version, updatedAt: snapshot.updatedAt, updatedByUserId: snapshot.updatedByUserId } : null,
    };
  });
}

export async function searchMasterWorkspaceDirectory(query: string) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const needle = query.trim().toLocaleLowerCase();
  const [allWorkspaces, allMembers] = await Promise.all([database.select().from(workspaces).orderBy(desc(workspaces.updatedAt)), database.select().from(workspaceMembers)]);
  return allWorkspaces.filter((workspace) => {
    const members = allMembers.filter((member) => member.workspaceId === workspace.id);
    return !needle || [workspace.name, String(workspace.id)].some((value) => value.toLocaleLowerCase().includes(needle)) || members.some((member) => [member.displayName, member.phone].some((value) => value?.toLocaleLowerCase().includes(needle)));
  }).slice(0, 25).map((workspace) => {
    const members = allMembers.filter((member) => member.workspaceId === workspace.id);
    return { workspace: { id: workspace.id, name: workspace.name }, matchingMembers: members.filter((member) => !needle || [member.displayName, member.phone].some((value) => value?.toLocaleLowerCase().includes(needle))).slice(0, 3).map((member) => ({ displayName: member.displayName, phone: member.phone, role: member.role })) };
  });
}

export async function searchMasterUsers(query: string) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const needle = query.trim().toLocaleLowerCase();
  const candidates = await database.select().from(users).orderBy(desc(users.lastSignedIn)).limit(250);
  return candidates.filter((user) => {
    if (!needle) return true;
    return [user.name, user.email, user.phone].some((value) => value?.toLocaleLowerCase().includes(needle));
  }).slice(0, 25).map((user) => ({ id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, lastSignedIn: user.lastSignedIn }));
}

export async function createSuperAdminAudit(input: { actorUserId: number; action: string; targetWorkspaceId?: number | null; targetMemberId?: number | null; details?: string | null }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const result = await database.insert(superAdminAudit).values({
    actorUserId: input.actorUserId,
    action: input.action,
    targetWorkspaceId: input.targetWorkspaceId ?? null,
    targetMemberId: input.targetMemberId ?? null,
    details: input.details ?? null,
  });
  return Number(result[0].insertId);
}

export async function listSuperAdminAudit(limit = 120) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const rows = await database.select({ audit: superAdminAudit, actorName: users.name, actorEmail: users.email }).from(superAdminAudit).leftJoin(users, eq(superAdminAudit.actorUserId, users.id)).orderBy(desc(superAdminAudit.createdAt)).limit(Math.min(Math.max(limit, 1), 250));
  return rows.map(({ audit, actorName, actorEmail }) => ({ ...audit, actorName: actorName ?? actorEmail ?? `مستخدم #${audit.actorUserId}` }));
}

export async function listMasterWorkspaceMembers(workspaceId: number) {
  const [workspace, members] = await Promise.all([
    (await getDb())?.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1),
    listWorkspaceMembers(workspaceId),
  ]);
  if (!workspace?.[0]) throw new Error("Workspace not found");
  return { workspace: workspace[0], members };
}

export async function assignMasterWorkspaceMembership(input: { workspaceId: number; userId: number; displayName: string; phone: string; role: Exclude<WorkspaceRole, "owner">; permissions: WorkspacePermissions; status: "active" | "disabled"; actorUserId: number }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const [workspace, user] = await Promise.all([
    database.select().from(workspaces).where(eq(workspaces.id, input.workspaceId)).limit(1),
    database.select().from(users).where(eq(users.id, input.userId)).limit(1),
  ]);
  if (!workspace[0] || !user[0]) throw new Error("Workspace or user not found");
  const existing = (await database.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, input.workspaceId), eq(workspaceMembers.userId, input.userId))).limit(1))[0];
  if (existing?.role === "owner") throw new Error("Owner membership cannot be changed through master assignment");
  const fields = { displayName: input.displayName, phone: input.phone, role: input.role, permissions: JSON.stringify(input.permissions), status: input.status };
  if (existing) await database.update(workspaceMembers).set(fields).where(eq(workspaceMembers.id, existing.id));
  else await database.insert(workspaceMembers).values({ workspaceId: input.workspaceId, userId: input.userId, ...fields });
  const member = (await database.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, input.workspaceId), eq(workspaceMembers.userId, input.userId))).limit(1))[0];
  await database.insert(workspaceActivity).values({ workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: "super-admin-membership-updated", subject: member.displayName, details: `تم تحديث العضوية المركزية إلى ${input.role}/${input.status}` });
  await createSuperAdminAudit({ actorUserId: input.actorUserId, action: "membership-updated", targetWorkspaceId: input.workspaceId, targetMemberId: member.id, details: JSON.stringify({ role: input.role, status: input.status }) });
  return withPermissions(member);
}

export async function createWorkspaceRecoveryPoint(input: { workspaceId: number; actorUserId: number; reason: string }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const current = await getWorkspaceData(input.workspaceId);
  if (!current) return null;
  const result = await database.insert(workspaceDataBackups).values({ workspaceId: input.workspaceId, payload: current.payload, sourceVersion: current.version, createdByUserId: input.actorUserId, reason: input.reason });
  const id = Number(result[0].insertId);
  await createSuperAdminAudit({ actorUserId: input.actorUserId, action: "recovery-point-created", targetWorkspaceId: input.workspaceId, details: JSON.stringify({ backupId: id, sourceVersion: current.version, reason: input.reason }) });
  return { id, sourceVersion: current.version, createdAt: new Date() };
}

export async function listWorkspaceRecoveryPoints(workspaceId: number, limit = 20) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  return database.select().from(workspaceDataBackups).where(eq(workspaceDataBackups.workspaceId, workspaceId)).orderBy(desc(workspaceDataBackups.createdAt)).limit(Math.min(Math.max(limit, 1), 100));
}

export async function restoreWorkspaceRecoveryPoint(input: { workspaceId: number; backupId: number; actorUserId: number }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const backup = (await database.select().from(workspaceDataBackups).where(and(eq(workspaceDataBackups.id, input.backupId), eq(workspaceDataBackups.workspaceId, input.workspaceId))).limit(1))[0];
  if (!backup) throw new Error("Recovery point not found");
  const current = await getWorkspaceData(input.workspaceId);
  if (current) await database.insert(workspaceDataBackups).values({ workspaceId: input.workspaceId, payload: current.payload, sourceVersion: current.version, createdByUserId: input.actorUserId, reason: "pre-super-admin-restore" });
  const nextVersion = (current?.version ?? 0) + 1;
  if (current) await database.update(workspaceData).set({ payload: backup.payload, version: nextVersion, updatedByUserId: input.actorUserId }).where(eq(workspaceData.workspaceId, input.workspaceId));
  else await database.insert(workspaceData).values({ workspaceId: input.workspaceId, payload: backup.payload, version: nextVersion, updatedByUserId: input.actorUserId });
  await database.insert(workspaceActivity).values({ workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: "super-admin-recovery-restored", subject: "استعادة بيانات المنشأة", details: `تمت الاستعادة من نقطة ${input.backupId}` });
  await createSuperAdminAudit({ actorUserId: input.actorUserId, action: "recovery-point-restored", targetWorkspaceId: input.workspaceId, details: JSON.stringify({ backupId: input.backupId, version: nextVersion }) });
  return { version: nextVersion };
}

export async function saveMasterWorkspaceSnapshot(input: { workspaceId: number; payload: string; actorUserId: number; action: string; details: string }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const current = await getWorkspaceData(input.workspaceId);
  if (!current) throw new Error("Workspace data not found");
  await database.insert(workspaceDataBackups).values({ workspaceId: input.workspaceId, payload: current.payload, sourceVersion: current.version, createdByUserId: input.actorUserId, reason: `pre-${input.action}`.slice(0, 80) });
  const version = current.version + 1;
  await database.update(workspaceData).set({ payload: input.payload, version, updatedByUserId: input.actorUserId }).where(eq(workspaceData.workspaceId, input.workspaceId));
  await database.insert(workspaceActivity).values({ workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: `super-admin-${input.action}`.slice(0, 80), subject: "تدخل الإدارة العليا", details: input.details });
  await createSuperAdminAudit({ actorUserId: input.actorUserId, action: input.action, targetWorkspaceId: input.workspaceId, details: input.details });
  return { version };
}

function ownerPinHash(pin: string, salt: string) { return scryptSync(pin, salt, 32).toString("hex"); }

export async function getWorkspaceOwnerPinStatus(workspaceId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const value = await database.select().from(workspaceOwnerPins).where(eq(workspaceOwnerPins.workspaceId, workspaceId)).limit(1);
  const record = value[0];
  const now = new Date();
  const locked = record && record.lockedUntil && record.lockedUntil > now;
  const lockedUntil = locked ? record.lockedUntil : null;
  return { configured: Boolean(record), usesDefault: !record, locked, lockedUntil, failedAttempts: record?.failedAttempts ?? 0 };
}

export async function requireWorkspaceOwner(workspaceId: number, userId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const workspace = (await database.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1))[0];
  if (!workspace) throw new Error("Workspace not found");
  if (workspace.ownerUserId !== userId) throw new Error("Owner access required");
  return workspace;
}

export async function configureWorkspaceOwnerPin(input: { workspaceId: number; actorUserId: number; pin: string }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const salt = randomBytes(24).toString("hex");
  const pinHashValue = ownerPinHash(input.pin, salt);
  await database.insert(workspaceOwnerPins).values({ workspaceId: input.workspaceId, salt, pinHash: pinHashValue, updatedByUserId: input.actorUserId }).onDuplicateKeyUpdate({ set: { salt, pinHash: pinHashValue, updatedByUserId: input.actorUserId } });
  await database.insert(workspaceActivity).values({ workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: "owner-emergency-pin-configured", subject: "بوابة أدوات الطوارئ", details: "تم إعداد أو تغيير PIN أدوات المالك" });
  return { configured: true };
}

export async function verifyWorkspaceOwnerPin(input: { workspaceId: number; pin: string }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const record = (await database.select().from(workspaceOwnerPins).where(eq(workspaceOwnerPins.workspaceId, input.workspaceId)).limit(1))[0];
  if (!record) {
    return { configured: false, usesDefault: true, verified: input.pin === "0000", locked: false };
  }
  const now = new Date();
  if (record.lockedUntil && record.lockedUntil > now) {
    return { configured: true, usesDefault: false, verified: false, locked: true, lockedUntil: record.lockedUntil, failedAttempts: record.failedAttempts };
  }
  const provided = Buffer.from(ownerPinHash(input.pin, record.salt), "hex");
  const saved = Buffer.from(record.pinHash, "hex");
  const verified = provided.length === saved.length && timingSafeEqual(provided, saved);
  if (verified) {
    await database.update(workspaceOwnerPins).set({ failedAttempts: 0, lockedUntil: null }).where(eq(workspaceOwnerPins.workspaceId, input.workspaceId));
    return { configured: true, usesDefault: false, verified: true, locked: false, failedAttempts: 0 };
  } else {
    const newFailed = (record.failedAttempts ?? 0) + 1;
    const update: { failedAttempts: number; lockedUntil?: Date } = { failedAttempts: newFailed };
    if (newFailed >= 3) {
      update.lockedUntil = new Date(Date.now() + 5 * 60 * 1000);
    }
    await database.update(workspaceOwnerPins).set(update).where(eq(workspaceOwnerPins.workspaceId, input.workspaceId));
    return { configured: true, usesDefault: false, verified: false, locked: newFailed >= 3, lockedUntil: update.lockedUntil, failedAttempts: newFailed };
  }
}

export async function requestOwnerPinReset(input: { workspaceId: number; ownerEmail: string }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const record = (await database.select().from(workspaceOwnerPins).where(eq(workspaceOwnerPins.workspaceId, input.workspaceId)).limit(1))[0];
  if (!record) throw new Error("PIN not configured");
  // The email OTP is delivered by Supabase Auth using the SMTP configured in
  // the dashboard — no custom mailer. Mark pending so a reset can only proceed
  // after a successful verification.
  try {
    const { error } = await getSupabaseClient().auth.signInWithOtp({ email: input.ownerEmail, options: { shouldCreateUser: false } });
    if (error) throw error;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Could not send verification code: ${message}`);
  }
  await database.update(workspaceOwnerPins).set({ otpCode: null, otpExpiresAt: null, otpVerifiedAt: null }).where(eq(workspaceOwnerPins.workspaceId, input.workspaceId));
  await database.insert(workspaceActivity).values({ workspaceId: input.workspaceId, actorUserId: 0, action: "owner-pin-reset-requested", subject: "إعادة تعيين PIN المالك", details: `تم إرسال رمز OTP لإعادة تعيين PIN. البريد: ${input.ownerEmail}` });
  return { sent: true as const };
}

export async function verifyOwnerPinOtp(input: { workspaceId: number; ownerEmail: string; otpCode: string }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const record = (await database.select().from(workspaceOwnerPins).where(eq(workspaceOwnerPins.workspaceId, input.workspaceId)).limit(1))[0];
  if (!record) throw new Error("PIN not configured");
  try {
    const { error } = await getSupabaseClient().auth.verifyOtp({ email: input.ownerEmail, token: input.otpCode, type: "email" });
    if (error) {
      const code = (error as { status?: number }).status;
      return { verified: false as const, reason: code === 422 ? "expired" as const : "invalid" as const };
    }
  } catch {
    return { verified: false as const, reason: "invalid" as const };
  }
  await database.update(workspaceOwnerPins).set({ otpVerifiedAt: new Date() }).where(eq(workspaceOwnerPins.workspaceId, input.workspaceId));
  return { verified: true as const };
}

export async function resetOwnerPinAfterOtp(input: { workspaceId: number; actorUserId: number; newPin: string }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const record = (await database.select().from(workspaceOwnerPins).where(eq(workspaceOwnerPins.workspaceId, input.workspaceId)).limit(1))[0];
  if (!record || !record.otpVerifiedAt) throw new Error("OTP not verified");
  const salt = randomBytes(24).toString("hex");
  const pinHashValue = ownerPinHash(input.newPin, salt);
  await database.update(workspaceOwnerPins).set({ salt, pinHash: pinHashValue, updatedByUserId: input.actorUserId, failedAttempts: 0, lockedUntil: null, otpCode: null, otpExpiresAt: null, otpVerifiedAt: null }).where(eq(workspaceOwnerPins.workspaceId, input.workspaceId));
  await database.insert(workspaceActivity).values({ workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: "owner-pin-reset", subject: "إعادة تعيين PIN المالك", details: "تم إعادة تعيين PIN المالك عبر التحقق من OTP" });
  return { configured: true as const };
}

export async function unlockOwnerPinAttempts(input: { workspaceId: number }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  await database.update(workspaceOwnerPins).set({ failedAttempts: 0, lockedUntil: null }).where(eq(workspaceOwnerPins.workspaceId, input.workspaceId));
  return { unlocked: true as const };
}

export async function saveOwnerEmergencySnapshot(input: { workspaceId: number; payload: string; actorUserId: number; action: string; subject: string; details: string }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const current = await getWorkspaceData(input.workspaceId);
  if (!current) throw new Error("Workspace data not found");
  await database.insert(workspaceDataBackups).values({ workspaceId: input.workspaceId, payload: current.payload, sourceVersion: current.version, createdByUserId: input.actorUserId, reason: `pre-owner-${input.action}`.slice(0, 80) });
  const version = current.version + 1;
  await database.update(workspaceData).set({ payload: input.payload, version, updatedByUserId: input.actorUserId }).where(eq(workspaceData.workspaceId, input.workspaceId));
  await database.insert(workspaceActivity).values({ workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: `owner-emergency-${input.action}`.slice(0, 80), subject: input.subject.slice(0, 255), details: input.details });
  return { version };
}

export async function exportMasterWorkspaceSnapshot(workspaceId: number, actorUserId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const [workspace, snapshot] = await Promise.all([
    database.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1),
    getWorkspaceData(workspaceId),
  ]);
  if (!workspace[0]) throw new Error("Workspace not found");
  await createSuperAdminAudit({ actorUserId, action: "workspace-exported", targetWorkspaceId: workspaceId, details: JSON.stringify({ version: snapshot?.version ?? 0 }) });
  return { exportedAt: new Date().toISOString(), workspace: { id: workspace[0].id, name: workspace[0].name, currency: workspace[0].currency, timeZone: workspace[0].timeZone }, version: snapshot?.version ?? 0, payload: snapshot?.payload ?? null };
}

/**
 * إنشاء بيانات تجريبية واقعية للمعاينة والتطوير.
 * البنية العادية (المستخدم/المساحة/العضو/حمولة workspaceData) على مستوى الصفوف،
 * بينما الشاليهات والحجوزات وكل محتوى المعاينة يُخزَّن داخل حمولة workspaceData
 * الموحّدة عبر normalizeAppData.
 */
export async function seedDemoData(): Promise<void> {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");

  // البحث عن مستخدم المالك أو إنشاء واحد
  const ownerPhone = "0797402940";
  let owner = (await database.select().from(users).where(eq(users.phone, ownerPhone)).limit(1))[0];

  if (!owner) {
    const result = await database.insert(users).values({
      openId: "stay-in-preview-owner-v1",
      name: "مالك StayIn (سوبر أدمن)",
      phone: ownerPhone,
      email: "moh.ajlouni.90@gmail.com",
      loginMethod: "local-dev",
      role: "admin",
      lastSignedIn: new Date(),
    });
    owner = (await database.select().from(users).where(eq(users.id, Number(result[0].insertId))).limit(1))[0];
  }

  if (!owner) throw new Error("Owner user could not be created");

  // إنشاء مساحة المعاينة
  const workspaceName = "مجموعة المعاينة";
  let workspace = (await database.select().from(workspaces).where(and(eq(workspaces.ownerUserId, owner.id), eq(workspaces.name, workspaceName))).limit(1))[0];

  if (!workspace) {
    const result = await database.insert(workspaces).values({ name: workspaceName, ownerUserId: owner.id });
    workspace = (await database.select().from(workspaces).where(eq(workspaces.id, Number(result[0].insertId))).limit(1))[0];
  }

  if (!workspace) throw new Error("Workspace could not be created");

  // إضافة العضو كمالك
  const existingMember = (await database.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, owner.id))).limit(1))[0];
  if (!existingMember) {
    await database.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: owner.id,
      displayName: "مالك المعاينة",
      phone: ownerPhone,
      role: "owner",
      permissions: JSON.stringify(MANAGER_PERMISSIONS),
      status: "active",
    });
  }

  // إنشاء حمولة المعاينة داخل workspaceData فقط (لا توجد جداول منفصلة للشاليهات/الحجوزات).
  // المساحة هنا مساحة معاينة معزولة، لذا يُعاد كتابة الحمولة تجريبيةً عند كل بذر.

  const now = new Date().toISOString();
  const localDate = (offsetDays: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const dom = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${dom}`;
  };
  const yesterday = localDate(-1);
  const day = localDate(0);
  const next1 = localDate(1);
  const next2 = localDate(2);
  const next3 = localDate(3);
  const next4 = localDate(4);

  const chalets = [
    {
      id: "demo-chalet-1",
      name: "شاليه النخيل 1",
      referenceCode: "01",
      propertyType: "chalet" as const,
      color: "#0F8B83",
      location: "مدخل قرية النخيل",
      guardianName: "حارس النخيل",
      guardianPhone: "+962790000103",
      createdAt: now,
      shifts: [
        {
          id: "morning",
          name: "صباحي",
          startTime: "09:00",
          endTime: "21:00",
          weekdayPrice: 120,
          weekendPrice: 150,
          isActive: true,
          periodKind: "morning" as const,
          color: "#0284C7",
        },
        {
          id: "evening",
          name: "سهرة",
          startTime: "22:00",
          endTime: "09:00",
          weekdayPrice: 180,
          weekendPrice: 220,
          isActive: true,
          periodKind: "evening" as const,
          color: "#4F46E5",
        },
      ],
    },
    {
      id: "demo-chalet-2",
      name: "فيلا النخيل VIP",
      referenceCode: "02",
      propertyType: "villa" as const,
      color: "#4379D8",
      location: "الجناح الملكي",
      guardianName: "حارس النخيل",
      guardianPhone: "+962790000103",
      createdAt: now,
      shifts: [
        {
          id: "morning",
          name: "صباحي",
          startTime: "09:00",
          endTime: "21:00",
          weekdayPrice: 200,
          weekendPrice: 240,
          isActive: true,
          periodKind: "morning" as const,
          color: "#0284C7",
        },
        {
          id: "evening",
          name: "سهرة",
          startTime: "22:00",
          endTime: "09:00",
          weekdayPrice: 260,
          weekendPrice: 320,
          isActive: true,
          periodKind: "evening" as const,
          color: "#4F46E5",
        },
      ],
    },
    {
      id: "demo-chalet-3",
      name: "شاليه الواحة",
      referenceCode: "03",
      propertyType: "chalet" as const,
      color: "#7C3AED",
      location: "مدخل شاليهات الواحة",
      guardianName: "حارس الواحة",
      guardianPhone: "+962790000106",
      createdAt: now,
      shifts: [
        {
          id: "morning",
          name: "صباحي",
          startTime: "10:00",
          endTime: "22:00",
          weekdayPrice: 110,
          weekendPrice: 140,
          isActive: true,
          periodKind: "morning" as const,
          color: "#0284C7",
        },
      ],
    },
  ];

  const bookings = [
    { id: "demo-b1", customerName: "سارة المعاينة", phone: "+962790101010", chaletId: "demo-chalet-1", startDate: day, endDate: next1, bookingType: "morning" as const, shiftId: "morning", startTime: "09:00", endTime: "21:00", price: 120, depositAmount: 30, depositPaymentMethod: "cash-owner" as const, depositPaymentRecordedAt: now, payments: [], notes: "بيانات المعاينة — حجز تجريبي", status: "confirmed" as const, createdAt: now, createdByName: "مالك المعاينة", createdByRole: "owner" as const },
    { id: "demo-b2", customerName: "رامي المعاينة", phone: "+962790202020", chaletId: "demo-chalet-2", startDate: next1, endDate: next2, bookingType: "evening" as const, shiftId: "evening", startTime: "22:00", endTime: "09:00", price: 260, depositAmount: 0, payments: [], notes: "بيانات المعاينة — حجز تجريبي", status: "awaiting-deposit" as const, createdAt: now, createdByName: "مالك المعاينة", createdByRole: "owner" as const },
    { id: "demo-b3", customerName: "ليان المعاينة", phone: "+962790303030", chaletId: "demo-chalet-3", startDate: next2, endDate: next3, bookingType: "morning" as const, shiftId: "morning", startTime: "10:00", endTime: "22:00", price: 110, depositAmount: 0, payments: [], notes: "بيانات المعاينة — حجز تجريبي", status: "awaiting-deposit" as const, createdAt: now, createdByName: "مالك المعاينة", createdByRole: "owner" as const },
    { id: "demo-b4", customerName: "عمر المعاينة", phone: "+962790404040", chaletId: "demo-chalet-1", startDate: next3, endDate: next4, bookingType: "morning" as const, shiftId: "morning", startTime: "09:00", endTime: "21:00", price: 150, depositAmount: 45, depositPaymentMethod: "click" as const, depositPaymentRecordedAt: now, payments: [], notes: "بيانات المعاينة — حجز تجريبي", status: "confirmed" as const, createdAt: now, createdByName: "مالك المعاينة", createdByRole: "owner" as const },
    { id: "demo-b5", customerName: "هدى المعاينة", phone: "+962790505050", chaletId: "demo-chalet-2", startDate: yesterday, endDate: day, bookingType: "evening" as const, shiftId: "evening", startTime: "22:00", endTime: "09:00", price: 260, depositAmount: 0, payments: [{ id: "demo-b5-p1", amount: 260, date: day, recordedAt: now, paymentMethod: "cash-owner" as const, recordedByName: "مالك المعاينة" }], notes: "بيانات المعاينة — حجز مكتمل", status: "completed" as const, createdAt: now, createdByName: "مالك المعاينة", createdByRole: "owner" as const },
    { id: "demo-b6", customerName: "طارق المعاينة", phone: "+962790606060", chaletId: "demo-chalet-1", startDate: next1, endDate: next2, bookingType: "morning" as const, shiftId: "morning", startTime: "09:00", endTime: "21:00", price: 120, depositAmount: 0, payments: [], notes: "بيانات المعاينة — حجز ملغي", status: "cancelled" as const, createdAt: now, createdByName: "مالك المعاينة", createdByRole: "owner" as const },
  ];

  const waitlist = [
    { id: "demo-w1", customerName: "نور المعاينة", phone: "+962790707070", chaletId: "demo-chalet-1", requestedDate: next3, bookingType: "morning" as const, shiftId: "morning", startTime: "09:00", endTime: "21:00", price: 120, notes: "بانتظار توفر الفترة النهارية.", status: "active" as const, createdAt: now },
    { id: "demo-w2", customerName: "يزن المعاينة", phone: "+962790808080", chaletId: "demo-chalet-2", requestedDate: next4, bookingType: "evening" as const, shiftId: "evening", startTime: "22:00", endTime: "09:00", price: 260, notes: "ينتظر تأكيد التوفر على السهرة.", status: "active" as const, createdAt: now },
  ];

  const turnoverTasks = [
    { id: "demo-tt1", checkoutBookingId: "demo-b5", nextBookingId: "demo-b1", chaletId: "demo-chalet-2", dueAt: `${day}T09:00:00.000Z`, status: "pending" as const, createdAt: now },
    { id: "demo-tt2", checkoutBookingId: "demo-b1", nextBookingId: "demo-b4", chaletId: "demo-chalet-1", dueAt: `${next3}T09:00:00.000Z`, status: "pending" as const, createdAt: now },
  ];

  const expenses = [
    { id: "demo-e1", chaletId: "demo-chalet-1", amount: 18, date: day, category: "cleaning-supplies" as const, note: "مواد تنظيف", paymentMethod: "cash" as const, createdAt: now, createdByName: "مالك المعاينة" },
    { id: "demo-e2", chaletId: "demo-chalet-2", amount: 45, date: next1, category: "maintenance" as const, note: "صيانة السهرة", paymentMethod: "click" as const, createdAt: now, createdByName: "مالك المعاينة" },
    { id: "demo-e3", chaletId: "demo-chalet-3", amount: 12, date: next2, category: "utilities" as const, note: "فاتورة مياه", paymentMethod: "cash" as const, createdAt: now, createdByName: "مالك المعاينة" },
  ];

  const payload = normalizeAppData({
    chalets,
    bookings,
    waitlist,
    turnoverTasks,
    expenses,
    settings: {
      ...DEFAULT_SETTINGS,
      businessName: workspaceName,
      businessPhone: "+962790000100",
      whatsAppEnabled: true,
      ownerPhone,
      device: { ...DEFAULT_DEVICE_SETTINGS },
    },
    specialPriceRules: [],
    auditLog: [
      {
        id: "demo-seed-audit",
        action: "booking-checked-in",
        subjectName: "بيانات المعاينة",
        details: `أُنشئت بيانات معزولة لحساب ${workspaceName}.`,
        createdAt: now,
        actorName: "مالك المعاينة",
      },
    ],
  });

  await database
    .insert(workspaceData)
    .values({
      workspaceId: workspace.id,
      payload: JSON.stringify(payload),
      version: 1,
      updatedByUserId: owner.id,
    })
    .onDuplicateKeyUpdate({
      set: {
        payload: JSON.stringify(payload),
        version: sql`${workspaceData.version} + 1`,
        updatedByUserId: owner.id,
      },
    });

  await setActiveWorkspace(owner.id, workspace.id);
  console.log("[Seed] Demo data seeded successfully");
}
