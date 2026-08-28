import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { accountDeletionRequests, activeWorkspaces, InsertSuggestion, InsertUser, suggestions, superAdminAudit, users, workspaceActivity, workspaceData, workspaceDataBackups, workspaceInvitations, workspaceMembers, workspaceOwnerPins, workspaces, type WorkspaceRole } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { MANAGER_PERMISSIONS, normalizeWorkspacePermissions, permissionsForWorkspaceRole, type WorkspacePermissions } from "../shared/workspace-permissions";
import { DEFAULT_DEVICE_SETTINGS, DEFAULT_SETTINGS, normalizeAppData } from "../lib/booking-model";

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

    const textFields = ["name", "email", "loginMethod"] as const;
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
    } else if (user.openId === ENV.ownerOpenId) {
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
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
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
  const scheduledFor = new Date(requestedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(accountDeletionRequests).values({ userId, reason, status: "pending", requestedAt, scheduledFor, confirmedAt: requestedAt }).onDuplicateKeyUpdate({ set: { reason, status: "pending", requestedAt, scheduledFor, confirmedAt: requestedAt } });
  return getAccountDeletionRequest(userId);
}

export async function cancelAccountDeletion(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(accountDeletionRequests).set({ status: "cancelled" }).where(eq(accountDeletionRequests.userId, userId));
  return getAccountDeletionRequest(userId);
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
  const isPalm = facility.key === "palm";
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
  ];
  return normalizeAppData({
    chalets,
    bookings,
    waitlist: [],
    turnoverTasks: [],
    expenses: [{ id: `qa-${facility.key}-expense`, chaletId: primary.id, chaletName: primary.name, amount: isPalm ? 18 : 14, date: today, category: "cleaning-supplies", note: "مواد تنظيف تجريبية", paymentMethod: "cash", createdAt: now, createdByName: "موظف الحجوزات التجريبي" }],
    settings: { ...DEFAULT_SETTINGS, businessName: facility.name, businessPhone: "+962790000100", whatsAppEnabled: true, device: { ...DEFAULT_DEVICE_SETTINGS, whatsAppBaseHeaderTemplate: `رسالة اختبار مستقلة لمنشأة ${facility.name}: {العميل} — {الشاليه}`, receiptMessageTemplate: `إيصال اختبار ${facility.name}: {العميل} — {الإجمالي}`, readyMessageTemplate: `تأكيد اختبار ${facility.name}: {العميل} — {الفترة}` } },
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
  for (let index = 0; index < workspaceResults.length; index += 1) {
    const result = workspaceResults[index];
    const existingData = await getWorkspaceData(result.workspace.id);
    if (!existingData) await database.insert(workspaceData).values({ workspaceId: result.workspace.id, payload: JSON.stringify(qaSandboxPayload(QA_SANDBOX_FACILITIES[index])), version: 1, updatedByUserId: actorUserId });
    if (result.created) await database.insert(workspaceActivity).values({ workspaceId: result.workspace.id, actorUserId, action: "qa-sandbox-seeded", subject: result.workspace.name, details: "تم إنشاء منشأة اختبار معزولة وبياناتها الأولية" });
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

export async function createWorkspace(input: { user: { id: number; name: string | null }; name: string }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const workspaceName = input.name.trim();
  if (!workspaceName) throw new Error("workspace-name-required");
  if (workspaceName.length > 255) throw new Error("workspace-name-too-long");
  const workspaceResult = await database.insert(workspaces).values({ name: workspaceName, ownerUserId: input.user.id });
  const workspaceId = Number(workspaceResult[0].insertId);
  await database.insert(workspaceMembers).values({ workspaceId, userId: input.user.id, displayName: input.user.name?.trim() || "المالك", phone: "—", role: "owner", permissions: JSON.stringify(MANAGER_PERMISSIONS), status: "active" });
  await database.insert(workspaceActivity).values({ workspaceId, actorUserId: input.user.id, action: "workspace-created", subject: workspaceName, details: "تم إنشاء مجموعة المنشآت" });
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
  const memberships = await listWorkspaceMemberships(user.id);
  if (!memberships.length) return { destination: "onboarding" as const, activeWorkspace: null, memberships };
  const activeId = await getActiveWorkspaceId(user.id);
  const active = memberships.find((entry) => entry.workspace.id === activeId);
  if (active) return { destination: "dashboard" as const, activeWorkspace: active, memberships };
  if (memberships.length === 1) {
    const single = memberships[0];
    await setActiveWorkspace(user.id, single.workspace.id);
    return { destination: "dashboard" as const, activeWorkspace: single, memberships };
  }
  return { destination: "selector" as const, activeWorkspace: null, memberships };
}

export async function listWorkspaceMembers(workspaceId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const members = await database.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
  return members.map(withPermissions);
}

export async function listWorkspaceCollectionRecipients(workspaceId: number) {
  const members = await listWorkspaceMembers(workspaceId);
  return members.filter((member) => member.status === "active" && (member.role === "owner" || member.allowDirectCollection));
}

export async function listWorkspaceInvitations(workspaceId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  return database.select().from(workspaceInvitations).where(eq(workspaceInvitations.workspaceId, workspaceId)).orderBy(desc(workspaceInvitations.createdAt));
}

export async function createWorkspaceInvitation(input: { workspaceId: number; employeeName: string; phone: string; pin: string; createdByUserId: number; role?: Exclude<WorkspaceRole, "owner">; permissions: WorkspacePermissions; expiresAt: Date }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const role = input.role ?? "staff";
  const result = await database.insert(workspaceInvitations).values({ workspaceId: input.workspaceId, employeeName: input.employeeName, phone: input.phone, pinHash: pinHash(input.pin), createdByUserId: input.createdByUserId, role, permissions: JSON.stringify(input.permissions), expiresAt: input.expiresAt });
  await database.insert(workspaceActivity).values({ workspaceId: input.workspaceId, actorUserId: input.createdByUserId, action: "employee-invited", subject: input.employeeName, details: `دعوة موظف: ${input.phone}` });
  return Number(result[0].insertId);
}

export async function revokeWorkspaceInvitation(invitationId: number, actorUserId: number) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const invitation = (await database.select().from(workspaceInvitations).where(eq(workspaceInvitations.id, invitationId)).limit(1))[0];
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

export async function saveWorkspaceData(input: { workspaceId: number; payload: string; expectedVersion: number; updatedByUserId: number }) {
  const database = await getDb();
  if (!database) throw new Error("Database is unavailable");
  const current = await getWorkspaceData(input.workspaceId);
  if (!current) {
    if (input.expectedVersion !== 0) throw new Error("workspace-data-conflict");
    await database.insert(workspaceData).values({ workspaceId: input.workspaceId, payload: input.payload, version: 1, updatedByUserId: input.updatedByUserId });
    return { version: 1 };
  }
  if (current.version !== input.expectedVersion) throw new Error("workspace-data-conflict");
  const version = current.version + 1;
  await database.update(workspaceData).set({ payload: input.payload, version, updatedByUserId: input.updatedByUserId }).where(eq(workspaceData.workspaceId, input.workspaceId));
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
  const value = await database.select({ workspaceId: workspaceOwnerPins.workspaceId }).from(workspaceOwnerPins).where(eq(workspaceOwnerPins.workspaceId, workspaceId)).limit(1);
  return { configured: Boolean(value[0]) };
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
  if (!record) return { configured: false, verified: false };
  const provided = Buffer.from(ownerPinHash(input.pin, record.salt), "hex");
  const saved = Buffer.from(record.pinHash, "hex");
  return { configured: true, verified: provided.length === saved.length && timingSafeEqual(provided, saved) };
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
