import { TRPCError } from "@trpc/server";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import * as db from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { notifyOwner } from "./_core/notification";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { takeSuggestionSubmission } from "./suggestion-rate-limit";
import { storagePut } from "./storage";
import { normalizeInternationalPhone } from "../lib/phone-number";
import { findConflicts, normalizeAppData, type Booking } from "../lib/booking-model";

const workspacePermissionsSchema = z.object({
  view_financial_reports: z.boolean(),
  manage_payments: z.boolean(),
  refund_security_deposits: z.boolean(),
  create_bookings: z.boolean(),
  edit_bookings: z.boolean(),
  cancel_delete_bookings: z.boolean(),
  view_audit_logs: z.boolean(),
});
const workspaceInviteRoleSchema = z.enum(["admin", "staff", "guest"]);
const canManageWorkspace = (role: string | null | undefined) => role === "owner" || role === "admin";
const masterRoleSchema = z.enum(["owner", "admin", "staff", "guest"]);
const masterBookingStatusSchema = z.enum(["confirmed", "checked-in", "checked-out", "cancelled", "waiting"]);
const masterConfirmation = z.literal("ADMIN-OVERRIDE");
const expenseCategorySchema = z.enum(["guards-salaries", "maintenance", "cleaning-supplies", "utilities", "other"]);
const expensePaymentSchema = z.enum(["cash", "click"]);
const ownerPinSchema = z.string().regex(/^\d{4}$/, "Owner PIN must be four digits");

async function requireEmergencyOwner(userId: number, workspaceId: number, pin?: string) {
  try { await db.requireWorkspaceOwner(workspaceId, userId); } catch { throw new TRPCError({ code: "FORBIDDEN", message: "Owner access required" }); }
  if (pin) {
    const verification = await db.verifyWorkspaceOwnerPin({ workspaceId, pin });
    if (!verification.configured) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Owner PIN must be configured" });
    if (!verification.verified) throw new TRPCError({ code: "FORBIDDEN", message: "Invalid owner PIN" });
  }
}

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    completeRegistration: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(255), phone: z.string().trim().max(32).nullable(), termsVersion: z.string().min(1).max(32), privacyVersion: z.string().min(1).max(32), conditionsVersion: z.string().min(1).max(32), acceptedAt: z.string().datetime() })).mutation(async ({ ctx, input }) => {
      const normalized = normalizeInternationalPhone(input.phone);
      if (normalized.error) throw new TRPCError({ code: "BAD_REQUEST", message: "Phone number must use a valid international E.164 format" });
      return db.completeUserRegistration(ctx.user.id, { ...input, phone: normalized.value, acceptedAt: new Date(input.acceptedAt) });
    }),
  }),
  profile: router({
    me: protectedProcedure.query(({ ctx }) => ctx.user),
    update: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(255), phone: z.string().trim().max(32).nullable() })).mutation(async ({ ctx, input }) => {
      const phone = normalizeInternationalPhone(input.phone);
      if (phone.error || (input.phone && !phone.value)) throw new TRPCError({ code: "BAD_REQUEST", message: "Phone number must use a valid international E.164 format" });
      return db.updateUserProfile(ctx.user.id, { name: input.name, phone: phone.value });
    }),
    uploadAvatar: protectedProcedure.input(z.object({ base64: z.string().min(16).max(2_800_000), mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]) })).mutation(async ({ ctx, input }) => {
      const bytes = Buffer.from(input.base64, "base64");
      if (!bytes.byteLength || bytes.byteLength > 2 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Avatar image must be 2MB or smaller" });
      const extension = input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg";
      const { url } = await storagePut(`profiles/${ctx.user.id}/avatar.${extension}`, bytes, input.mimeType);
      const user = await db.updateUserProfile(ctx.user.id, { name: ctx.user.name ?? "StayIn user", phone: ctx.user.phone ?? null, avatarUrl: url });
      return { avatarUrl: user.avatarUrl, user };
    }),
  }),
  accountDeletion: router({
    status: protectedProcedure.query(({ ctx }) => db.getAccountDeletionRequest(ctx.user.id)),
    request: protectedProcedure.input(z.object({ confirmation: z.literal("DELETE"), reason: z.string().trim().max(800).nullable() })).mutation(({ ctx, input }) => db.requestAccountDeletion(ctx.user.id, input.reason)),
    cancel: protectedProcedure.mutation(({ ctx }) => db.cancelAccountDeletion(ctx.user.id)),
  }),
  suggestions: router({
    submit: publicProcedure
      .input(z.object({
        content: z.string().trim().min(10, "Suggestion must contain at least 10 characters.").max(1200, "Suggestion must be at most 1200 characters."),
        language: z.enum(["ar", "en"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!takeSuggestionSubmission(ctx.req)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Please wait before sending another suggestion.",
          });
        }

        const id = await db.createSuggestion(input);
        const notificationSent = await notifyOwner({
          title: input.language === "ar" ? "اقتراح جديد في Hajez" : "New Hajez suggestion",
          content: input.content,
        }).catch(() => false);

        return { id, notificationSent };
      }),
  }),
  workspace: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      const summary = await db.getWorkspaceSummary(ctx.user);
      return { workspace: summary.workspace, member: summary.member };
    }),
    routing: protectedProcedure.query(async ({ ctx }) => db.getWorkspaceRouting(ctx.user)),
    select: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const member = await db.setActiveWorkspace(ctx.user.id, input.workspaceId);
      const summary = await db.getWorkspaceSummary(ctx.user);
      return { workspace: summary.workspace, member };
    }),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(255) })).mutation(async ({ ctx, input }) => {
      const member = await db.createWorkspace({ user: ctx.user, name: input.name });
      const summary = await db.getWorkspaceSummary(ctx.user);
      return { workspace: summary.workspace, member };
    }),
    bootstrapOwner: protectedProcedure.mutation(async ({ ctx }) => {
      const existing = await db.getWorkspaceMember(ctx.user.id);
      const member = existing ?? await db.bootstrapOwnerWorkspace(ctx.user);
      const summary = await db.getWorkspaceSummary(ctx.user);
      return { workspace: summary.workspace, member };
    }),
    overview: protectedProcedure.query(async ({ ctx }) => {
      const summary = await db.getWorkspaceSummary(ctx.user);
      if (!summary.member || !canManageWorkspace(summary.member.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Manager access required" });
      const [members, invitations, activity] = await Promise.all([db.listWorkspaceMembers(summary.member.workspaceId), db.listWorkspaceInvitations(summary.member.workspaceId), db.listWorkspaceActivity(summary.member.workspaceId)]);
      return { workspace: summary.workspace, member: summary.member, members, invitations, activity };
    }),
    collectionRecipients: protectedProcedure.query(async ({ ctx }) => {
      const summary = await db.getWorkspaceSummary(ctx.user);
      if (!summary.member) throw new TRPCError({ code: "FORBIDDEN", message: "Workspace membership required" });
      return db.listWorkspaceCollectionRecipients(summary.member.workspaceId);
    }),
    inviteEmployee: protectedProcedure.input(z.object({ employeeName: z.string().trim().min(2).max(255), phone: z.string().trim().min(6).max(32), role: workspaceInviteRoleSchema.default("staff"), permissions: workspacePermissionsSchema })).mutation(async ({ ctx, input }) => {
      const summary = await db.getWorkspaceSummary(ctx.user);
      if (!summary.member || !canManageWorkspace(summary.member.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Manager access required" });
      if (summary.member.role !== "owner" && input.role === "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only the primary owner can invite an operational manager" });
      const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const invitationId = await db.createWorkspaceInvitation({ workspaceId: summary.member.workspaceId, employeeName: input.employeeName, phone: input.phone, pin, createdByUserId: ctx.user.id, role: input.role, permissions: input.permissions, expiresAt });
      return { invitationId, pin, expiresAt };
    }),
    updateMemberPermissions: protectedProcedure.input(z.object({ memberId: z.number().int().positive(), permissions: workspacePermissionsSchema })).mutation(async ({ ctx, input }) => {
      const summary = await db.getWorkspaceSummary(ctx.user);
      if (!summary.member || !canManageWorkspace(summary.member.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Manager access required" });
      const target = await db.getWorkspaceMemberById(summary.member.workspaceId, input.memberId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace member not found" });
      if (target.role === "owner") throw new TRPCError({ code: "FORBIDDEN", message: "Primary owner is immutable" });
      if (summary.member.role !== "owner" && target.role === "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Operational managers cannot modify other managers" });
      return db.updateWorkspaceMemberPermissions({ workspaceId: summary.member.workspaceId, memberId: input.memberId, permissions: input.permissions, actorUserId: ctx.user.id });
    }),
    updateMemberCollectionProfile: protectedProcedure.input(z.object({ memberId: z.number().int().positive(), cliqAlias: z.string().trim().max(160).optional(), bankDetails: z.string().trim().max(1000).optional(), commissionRate: z.number().finite().min(0).max(1_000_000).optional(), commissionType: z.enum(["percent", "fixed"]).optional(), allowDirectCollection: z.boolean() })).mutation(async ({ ctx, input }) => {
      const summary = await db.getWorkspaceSummary(ctx.user);
      if (!summary.member || !canManageWorkspace(summary.member.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Manager access required" });
      const target = await db.getWorkspaceMemberById(summary.member.workspaceId, input.memberId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace member not found" });
      if (target.role === "owner") throw new TRPCError({ code: "FORBIDDEN", message: "Primary owner collection account is managed in settings" });
      if (summary.member.role !== "owner" && target.role === "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Operational managers cannot modify other managers" });
      return db.updateWorkspaceMemberCollectionProfile({ workspaceId: summary.member.workspaceId, memberId: input.memberId, cliqAlias: input.cliqAlias, bankDetails: input.bankDetails, commissionRate: input.commissionRate, commissionType: input.commissionType, allowDirectCollection: input.allowDirectCollection, actorUserId: ctx.user.id });
    }),
    requestOwnershipTransfer: protectedProcedure.input(z.object({ targetMemberId: z.number().int().positive(), holdConfirmed: z.literal(true) })).mutation(async ({ ctx, input }) => {
      const summary = await db.getWorkspaceSummary(ctx.user);
      if (!summary.workspace || summary.member?.role !== "owner" || summary.workspace.ownerUserId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Primary owner access required" });
      const target = await db.getWorkspaceMemberById(summary.workspace.id, input.targetMemberId);
      if (!target || target.status !== "active" || target.role === "owner") throw new TRPCError({ code: "BAD_REQUEST", message: "An active non-owner member is required" });
      await db.recordWorkspaceActivity({ workspaceId: summary.workspace.id, actorUserId: ctx.user.id, action: "ownership-transfer-requested", subject: target.displayName, details: "تم طلب نقل ملكية بعد تأكيد الضغط الطويل؛ بانتظار تحقق OTP الخارجي" });
      const notificationSent = await notifyOwner({ title: "طلب نقل ملكية منشأة StayIn", content: `طلب ${ctx.user.name ?? "المالك"} نقل ملكية «${summary.workspace.name}» إلى ${target.displayName}. يلزم التحقق الخارجي قبل أي نقل فعلي.` }).catch(() => false);
      return { requested: true as const, notificationSent, delegatedToVerifiedChannel: true as const, message: "تم تسجيل الطلب وإرساله إلى القناة الموثقة. لا تزال الملكية كما هي حتى يكتمل التحقق الخارجي." };
    }),
    revokeInvitation: protectedProcedure.input(z.object({ invitationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const summary = await db.getWorkspaceSummary(ctx.user);
      if (!summary.member || !canManageWorkspace(summary.member.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Manager access required" });
      await db.revokeWorkspaceInvitation(input.invitationId, ctx.user.id);
      return { success: true };
    }),
    acceptInvitation: protectedProcedure.input(z.object({ phone: z.string().trim().min(6).max(32), pin: z.string().regex(/^\d{6}$/, "PIN must contain 6 digits") })).mutation(async ({ ctx, input }) => {
      try {
        const member = await db.acceptWorkspaceInvitation({ userId: ctx.user.id, phone: input.phone, pin: input.pin });
        return { member };
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invitation is invalid or expired" });
      }
    }),
    data: protectedProcedure.query(async ({ ctx }) => {
      const summary = await db.getWorkspaceSummary(ctx.user);
      if (!summary.member) throw new TRPCError({ code: "FORBIDDEN", message: "Workspace membership required" });
      if (summary.member.role === "guest") throw new TRPCError({ code: "FORBIDDEN", message: "Operational workspace access required" });
      const data = await db.getWorkspaceData(summary.member.workspaceId);
      return data ? { payload: data.payload, version: data.version, updatedAt: data.updatedAt } : { payload: null, version: 0, updatedAt: null };
    }),
    saveData: protectedProcedure.input(z.object({ payload: z.string().min(2).max(65535), expectedVersion: z.number().int().min(0) })).mutation(async ({ ctx, input }) => {
      const summary = await db.getWorkspaceSummary(ctx.user);
      if (!summary.member || summary.member.role === "guest") throw new TRPCError({ code: "FORBIDDEN", message: "Operational workspace access required" });
      try {
        return await db.saveWorkspaceData({ workspaceId: summary.member.workspaceId, payload: input.payload, expectedVersion: input.expectedVersion, updatedByUserId: ctx.user.id });
      } catch (error) {
        if (error instanceof Error && error.message === "workspace-data-conflict") throw new TRPCError({ code: "CONFLICT", message: "Workspace data changed on another device" });
        throw error;
      }
    }),
    resetOperations: protectedProcedure.input(z.object({ confirmation: z.literal("RESET-OPERATIONS") })).mutation(async ({ ctx }) => {
      const summary = await db.getWorkspaceSummary(ctx.user);
      if (!summary.workspace || summary.member?.role !== "owner" || summary.workspace.ownerUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Primary owner access required" });
      }
      const stored = await db.getWorkspaceData(summary.workspace.id);
      if (!stored) return { version: 0, payload: null, removed: { bookings: 0, expenses: 0 } };
      let data: ReturnType<typeof normalizeAppData>;
      try {
        data = normalizeAppData(JSON.parse(stored.payload));
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stored workspace data is invalid" });
      }
      const removed = { bookings: data.bookings.length, expenses: (data.expenses ?? []).length };
      const normalized = normalizeAppData({ ...data, bookings: [], expenses: [] });
      const payload = JSON.stringify(normalized);
      const result = await db.saveOwnerEmergencySnapshot({
        workspaceId: summary.workspace.id,
        payload,
        actorUserId: ctx.user.id,
        action: "operations-reset",
        subject: "تصفير الحجوزات والعمليات المالية",
        details: JSON.stringify(removed),
      });
      return { ...result, payload, removed };
    }),
  }),
  masterControl: router({
    overview: adminProcedure.query(async () => {
      const [workspaces, audit] = await Promise.all([db.listMasterWorkspaces(), db.listSuperAdminAudit()]);
      return { workspaces, audit };
    }),
    directory: adminProcedure.input(z.object({ query: z.string().trim().max(80) })).query(async ({ input }) => db.searchMasterWorkspaceDirectory(input.query)),
    searchUsers: adminProcedure.input(z.object({ query: z.string().trim().max(80) })).query(async ({ input }) => db.searchMasterUsers(input.query)),
    workspace: adminProcedure.input(z.object({ workspaceId: z.number().int().positive() })).query(async ({ input }) => {
      const [detail, snapshot, recoveryPoints] = await Promise.all([
        db.listMasterWorkspaceMembers(input.workspaceId),
        db.getWorkspaceData(input.workspaceId),
        db.listWorkspaceRecoveryPoints(input.workspaceId),
      ]);
      return { ...detail, snapshot: snapshot ? { version: snapshot.version, updatedAt: snapshot.updatedAt, updatedByUserId: snapshot.updatedByUserId } : null, recoveryPoints };
    }),
    workspaceOptions: adminProcedure.input(z.object({ workspaceId: z.number().int().positive() })).query(async ({ input }) => {
      const stored = await db.getWorkspaceData(input.workspaceId);
      if (!stored) return { bookings: [], units: [] };
      let data: ReturnType<typeof normalizeAppData>;
      try { data = normalizeAppData(JSON.parse(stored.payload)); } catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stored workspace data is invalid" }); }
      return {
        bookings: data.bookings.filter((booking) => !["cancelled", "completed", "waitlisted"].includes(booking.status)).slice(0, 150).map((booking) => ({ id: booking.id, customerName: booking.customerName, phone: booking.phone, chaletId: booking.chaletId, chaletName: booking.chaletName, startDate: booking.startDate, endDate: booking.endDate, startTime: booking.startTime, endTime: booking.endTime, price: booking.price, depositAmount: booking.depositAmount ?? null, status: booking.status })),
        units: data.chalets.map((chalet) => ({ id: chalet.id, name: chalet.name, color: chalet.color, propertyType: chalet.propertyType ?? "chalet" })),
      };
    }),
    simulateRole: adminProcedure.input(z.object({ workspaceId: z.number().int().positive(), role: z.enum(["super-admin", "owner", "admin", "staff", "guest"]), permissions: workspacePermissionsSchema.optional() })).mutation(async ({ ctx, input }) => {
      const detail = await db.listMasterWorkspaceMembers(input.workspaceId);
      const permissions = input.permissions ?? (input.role === "staff" ? { view_financial_reports: false, manage_payments: true, refund_security_deposits: false, create_bookings: true, edit_bookings: false, cancel_delete_bookings: false, view_audit_logs: false } : input.role === "guest" ? { view_financial_reports: false, manage_payments: false, refund_security_deposits: false, create_bookings: false, edit_bookings: false, cancel_delete_bookings: false, view_audit_logs: false } : { view_financial_reports: true, manage_payments: true, refund_security_deposits: true, create_bookings: true, edit_bookings: true, cancel_delete_bookings: true, view_audit_logs: true });
      await db.createSuperAdminAudit({ actorUserId: ctx.user.id, action: "role-simulation", targetWorkspaceId: input.workspaceId, details: JSON.stringify({ role: input.role, simulationOnly: true }) });
      return { simulationOnly: true as const, workspace: detail.workspace, role: input.role, permissions, memberCount: detail.members.filter((member) => member.status === "active").length };
    }),
    assignMembership: adminProcedure.input(z.object({ confirmation: masterConfirmation, workspaceId: z.number().int().positive(), userId: z.number().int().positive(), displayName: z.string().trim().min(2).max(255), phone: z.string().trim().min(2).max(32), role: z.enum(["admin", "staff", "guest"]), permissions: workspacePermissionsSchema, status: z.enum(["active", "disabled"]) })).mutation(async ({ ctx, input }) => {
      return db.assignMasterWorkspaceMembership({ ...input, actorUserId: ctx.user.id });
    }),
    createRecoveryPoint: adminProcedure.input(z.object({ confirmation: masterConfirmation, workspaceId: z.number().int().positive(), reason: z.string().trim().min(3).max(80) })).mutation(async ({ ctx, input }) => {
      const backup = await db.createWorkspaceRecoveryPoint({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, reason: input.reason });
      if (!backup) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace has no synchronized data" });
      return backup;
    }),
    restoreRecoveryPoint: adminProcedure.input(z.object({ confirmation: masterConfirmation, workspaceId: z.number().int().positive(), backupId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      return db.restoreWorkspaceRecoveryPoint({ workspaceId: input.workspaceId, backupId: input.backupId, actorUserId: ctx.user.id });
    }),
    exportWorkspace: adminProcedure.input(z.object({ confirmation: z.literal("EXPORT-WORKSPACE"), workspaceId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      return db.exportMasterWorkspaceSnapshot(input.workspaceId, ctx.user.id);
    }),
    forceServerSync: adminProcedure.input(z.object({ confirmation: z.literal("SYNC-WORKSPACE"), workspaceId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const snapshot = await db.getWorkspaceData(input.workspaceId);
      if (!snapshot) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace has no synchronized data" });
      await db.createSuperAdminAudit({ actorUserId: ctx.user.id, action: "server-sync-requested", targetWorkspaceId: input.workspaceId, details: JSON.stringify({ version: snapshot.version }) });
      return { version: snapshot.version, updatedAt: snapshot.updatedAt, payload: snapshot.payload };
    }),
    overrideBooking: adminProcedure.input(z.object({ confirmation: masterConfirmation, workspaceId: z.number().int().positive(), bookingId: z.string().min(1).max(128), resolveConflicts: z.boolean().default(false), patch: z.object({ customerName: z.string().trim().min(2).max(255).optional(), phone: z.string().trim().min(3).max(32).optional(), chaletId: z.string().trim().min(1).max(128).optional(), chaletName: z.string().trim().min(1).max(255).optional(), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), price: z.number().min(0).max(1_000_000).optional(), depositAmount: z.number().min(0).max(1_000_000).nullable().optional(), refundDeposit: z.object({ amount: z.number().positive().max(1_000_000), paymentMethod: z.enum(["cash-guardian", "cash-owner", "bank-transfer", "click", "wallet"]), note: z.string().trim().max(500).optional() }).optional(), status: masterBookingStatusSchema.optional(), note: z.string().trim().max(500).optional() }) })).mutation(async ({ ctx, input }) => {
      const stored = await db.getWorkspaceData(input.workspaceId);
      if (!stored) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace has no synchronized data" });
      let data: ReturnType<typeof normalizeAppData>;
      try { data = normalizeAppData(JSON.parse(stored.payload)); } catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stored workspace data is invalid" }); }
      const index = data.bookings.findIndex((booking) => booking.id === input.bookingId);
      if (index < 0) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
      const current = data.bookings[index];
      const now = new Date().toISOString();
      const targetStatus: Booking["status"] | undefined = input.patch.status === "checked-in" ? "confirmed" : input.patch.status === "checked-out" ? "completed" : input.patch.status === "waiting" ? "waitlisted" : input.patch.status;
      const statusPatch: Partial<Booking> = input.patch.status === "checked-in" ? { status: "confirmed", checkedInAt: now, checkedOutAt: undefined } : input.patch.status === "checked-out" ? { status: "completed", checkedOutAt: now } : targetStatus ? { status: targetStatus } : {};
      const { status: _requestedStatus, note, depositAmount, refundDeposit, ...bookingPatch } = input.patch;
      const next: Booking = { ...current, ...bookingPatch, ...statusPatch, depositAmount: depositAmount === null ? undefined : depositAmount ?? current.depositAmount, notes: note ?? current.notes, depositRefunds: refundDeposit ? [...(current.depositRefunds ?? []), { id: `admin-refund-${Date.now()}`, amount: refundDeposit.amount, date: now.slice(0, 10), recordedAt: now, paymentMethod: refundDeposit.paymentMethod, note: refundDeposit.note }] : current.depositRefunds };
      delete (next as { note?: string }).note;
      const conflicts = next.status === "cancelled" || next.status === "completed" || next.status === "waitlisted" ? [] : findConflicts(next, data.bookings, current.id);
      if (conflicts.length && !input.resolveConflicts) throw new TRPCError({ code: "CONFLICT", message: "Booking conflicts require explicit resolution" });
      const resolvedIds = new Set(conflicts.map((booking) => booking.id));
      data.bookings = data.bookings.map((booking, bookingIndex) => bookingIndex === index ? next : resolvedIds.has(booking.id) ? { ...booking, status: "cancelled" as const } : booking);
      const normalized = normalizeAppData(data);
      const result = await db.saveMasterWorkspaceSnapshot({ workspaceId: input.workspaceId, payload: JSON.stringify(normalized), actorUserId: ctx.user.id, action: "booking-overridden", details: JSON.stringify({ bookingId: current.id, resolvedConflictIds: [...resolvedIds], changed: Object.keys(input.patch).filter((key) => key !== "note") }) });
      return { ...result, booking: normalized.bookings.find((booking) => booking.id === current.id), resolvedConflictIds: [...resolvedIds] };
    }),
    overrideExpense: adminProcedure.input(z.object({ confirmation: masterConfirmation, workspaceId: z.number().int().positive(), expense: z.object({ id: z.string().min(1).max(128).optional(), chaletId: z.string().trim().max(128).optional(), chaletName: z.string().trim().max(255).optional(), amount: z.number().positive().max(1_000_000), date: z.string().datetime(), category: expenseCategorySchema, note: z.string().trim().max(800).optional(), paymentMethod: expensePaymentSchema.optional(), receiptUri: z.string().trim().max(2048).optional() }) })).mutation(async ({ ctx, input }) => {
      const stored = await db.getWorkspaceData(input.workspaceId);
      if (!stored) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace has no synchronized data" });
      let data: ReturnType<typeof normalizeAppData>;
      try { data = normalizeAppData(JSON.parse(stored.payload)); } catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stored workspace data is invalid" }); }
      const id = input.expense.id ?? `admin-expense-${Date.now()}`;
      const expense = { ...input.expense, id, createdAt: data.expenses?.find((item) => item.id === id)?.createdAt ?? new Date().toISOString(), createdByName: "الإدارة العليا" };
      data.expenses = [...(data.expenses ?? []).filter((item) => item.id !== id), expense];
      const normalized = normalizeAppData(data);
      const result = await db.saveMasterWorkspaceSnapshot({ workspaceId: input.workspaceId, payload: JSON.stringify(normalized), actorUserId: ctx.user.id, action: "expense-overridden", details: JSON.stringify({ expenseId: id, amount: expense.amount }) });
      return { ...result, expense: normalized.expenses?.find((item) => item.id === id) ?? null };
    }),
    deleteExpense: adminProcedure.input(z.object({ confirmation: masterConfirmation, workspaceId: z.number().int().positive(), expenseId: z.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
      const stored = await db.getWorkspaceData(input.workspaceId);
      if (!stored) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace has no synchronized data" });
      let data: ReturnType<typeof normalizeAppData>;
      try { data = normalizeAppData(JSON.parse(stored.payload)); } catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stored workspace data is invalid" }); }
      if (!(data.expenses ?? []).some((expense) => expense.id === input.expenseId)) throw new TRPCError({ code: "NOT_FOUND", message: "Expense not found" });
      data.expenses = (data.expenses ?? []).filter((expense) => expense.id !== input.expenseId);
      const result = await db.saveMasterWorkspaceSnapshot({ workspaceId: input.workspaceId, payload: JSON.stringify(normalizeAppData(data)), actorUserId: ctx.user.id, action: "expense-deleted", details: JSON.stringify({ expenseId: input.expenseId }) });
      return { ...result, expenseId: input.expenseId };
    }),
    requestIdentityReset: adminProcedure.input(z.object({ confirmation: masterConfirmation, userId: z.number().int().positive(), channel: z.enum(["phone", "email", "pin"]) })).mutation(async ({ ctx, input }) => {
      await db.createSuperAdminAudit({ actorUserId: ctx.user.id, action: "identity-reset-requested", details: JSON.stringify({ userId: input.userId, channel: input.channel, delegatedToIdentityProvider: true }) });
      return { delegatedToIdentityProvider: true as const, message: "Credential reset must be completed by the OAuth identity provider; no local password or PIN is stored by StayIn." };
    }),
    qaSandbox: router({
      status: adminProcedure.query(() => db.getQaSandboxStatus()),
      seed: adminProcedure.mutation(({ ctx }) => db.seedQaSandbox(ctx.user.id)),
      preview: adminProcedure.input(z.object({ actor: z.enum(["super-admin", "owner", "staff", "guest"]), workspaceId: z.number().int().positive() })).mutation(({ ctx, input }) => db.previewQaSandbox({ actorUserId: ctx.user.id, ...input })),
    }),
  }),
  advancedTools: router({
    status: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await requireEmergencyOwner(ctx.user.id, input.workspaceId);
      return db.getWorkspaceOwnerPinStatus(input.workspaceId);
    }),
    configurePin: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), pin: ownerPinSchema })).mutation(async ({ ctx, input }) => {
      await requireEmergencyOwner(ctx.user.id, input.workspaceId);
      return db.configureWorkspaceOwnerPin({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, pin: input.pin });
    }),
    verifyPin: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), pin: ownerPinSchema })).mutation(async ({ ctx, input }) => {
      await requireEmergencyOwner(ctx.user.id, input.workspaceId);
      const result = await db.verifyWorkspaceOwnerPin(input);
      return { verified: result.verified };
    }),
    options: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), pin: ownerPinSchema })).query(async ({ ctx, input }) => {
      await requireEmergencyOwner(ctx.user.id, input.workspaceId, input.pin);
      const stored = await db.getWorkspaceData(input.workspaceId);
      if (!stored) return { bookings: [], units: [] };
      const data = normalizeAppData(JSON.parse(stored.payload));
      return { bookings: data.bookings.filter((booking) => !["cancelled", "completed", "waitlisted"].includes(booking.status)).map((booking) => ({ id: booking.id, customerName: booking.customerName, chaletId: booking.chaletId, chaletName: booking.chaletName, startDate: booking.startDate, startTime: booking.startTime, endDate: booking.endDate, endTime: booking.endTime, bookingType: booking.bookingType })), units: data.chalets.map((chalet) => ({ id: chalet.id, name: chalet.name })) };
    }),
    movePreview: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), pin: ownerPinSchema, bookingId: z.string().min(1).max(128), destinationChaletId: z.string().min(1).max(128) })).query(async ({ ctx, input }) => {
      await requireEmergencyOwner(ctx.user.id, input.workspaceId, input.pin);
      const stored = await db.getWorkspaceData(input.workspaceId);
      if (!stored) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace data not found" });
      const data = normalizeAppData(JSON.parse(stored.payload));
      const booking = data.bookings.find((item) => item.id === input.bookingId);
      const unit = data.chalets.find((item) => item.id === input.destinationChaletId);
      if (!booking || !unit) throw new TRPCError({ code: "NOT_FOUND", message: "Booking or unit not found" });
      if (booking.chaletId === unit.id) return { allowed: false, message: "اختر وحدة وجهة مختلفة عن وحدة الحجز الحالية.", conflicts: [] };
      const moved: Booking = { ...booking, chaletId: unit.id, chaletName: unit.name };
      const conflicts = findConflicts(moved, data.bookings, booking.id);
      const conflictDetails = conflicts.slice(0, 3).map((item) => ({ id: item.id, customerName: item.customerName, chaletName: item.chaletName ?? unit.name, startDate: item.startDate, startTime: item.startTime, endDate: item.endDate, endTime: item.endTime }));
      const message = conflictDetails.length ? `يوجد حجز بالفعل في «${unit.name}» خلال الفترة ${conflictDetails[0].startDate} ${conflictDetails[0].startTime} إلى ${conflictDetails[0].endDate} ${conflictDetails[0].endTime} باسم ${conflictDetails[0].customerName}.` : `الوحدة «${unit.name}» متاحة لنقل هذا الحجز ضمن الفترة المحددة.`;
      return { allowed: conflictDetails.length === 0, message, conflicts: conflictDetails };
    }),
    moveBooking: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), pin: ownerPinSchema, bookingId: z.string().min(1).max(128), destinationChaletId: z.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
      await requireEmergencyOwner(ctx.user.id, input.workspaceId, input.pin);
      const stored = await db.getWorkspaceData(input.workspaceId);
      if (!stored) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace data not found" });
      const data = normalizeAppData(JSON.parse(stored.payload));
      const booking = data.bookings.find((item) => item.id === input.bookingId);
      const unit = data.chalets.find((item) => item.id === input.destinationChaletId);
      if (!booking || !unit) throw new TRPCError({ code: "NOT_FOUND", message: "Booking or unit not found" });
      if (booking.chaletId === unit.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Booking already belongs to this unit" });
      const moved: Booking = { ...booking, chaletId: unit.id, chaletName: unit.name, updatedByUserId: ctx.user.id, updatedByName: ctx.user.name ?? "مالك المنشأة" };
      const conflicts = findConflicts(moved, data.bookings, booking.id);
      if (conflicts.length) {
        const conflict = conflicts[0];
        throw new TRPCError({ code: "CONFLICT", message: `يوجد حجز بالفعل في «${unit.name}» خلال الفترة ${conflict.startDate} ${conflict.startTime} إلى ${conflict.endDate} ${conflict.endTime} باسم ${conflict.customerName}.` });
      }
      data.bookings = data.bookings.map((item) => item.id === booking.id ? moved : item);
      data.auditLog = [{ id: `owner-move-${Date.now()}`, action: "booking-cancelled", subjectName: moved.customerName, details: `نقل المالك الحجز من ${booking.chaletName ?? "الوحدة السابقة"} إلى ${unit.name}`, createdAt: new Date().toISOString(), actorName: ctx.user.name ?? "مالك المنشأة", bookingId: booking.id }, ...data.auditLog];
      return db.saveOwnerEmergencySnapshot({ workspaceId: input.workspaceId, payload: JSON.stringify(normalizeAppData(data)), actorUserId: ctx.user.id, action: "booking-moved", subject: moved.customerName, details: JSON.stringify({ bookingId: booking.id, from: booking.chaletId, to: unit.id }) });
    }),
    unlockDate: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), pin: ownerPinSchema, chaletId: z.string().min(1).max(128), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).mutation(async ({ ctx, input }) => {
      await requireEmergencyOwner(ctx.user.id, input.workspaceId, input.pin);
      const stored = await db.getWorkspaceData(input.workspaceId);
      if (!stored) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace data not found" });
      const data = normalizeAppData(JSON.parse(stored.payload));
      const removed = data.bookings.filter((booking) => booking.chaletId === input.chaletId && booking.startDate === input.date && booking.status === "awaiting-deposit");
      data.bookings = data.bookings.filter((booking) => !removed.some((item) => item.id === booking.id));
      if (!removed.length) return { released: 0, message: "No temporary pending hold exists for this date" };
      data.auditLog = [{ id: `owner-unlock-${Date.now()}`, action: "booking-cancelled", subjectName: `فك تعليق ${input.date}`, details: `أزال المالك ${removed.length} حجزًا مؤقتًا بانتظار الدفعة`, createdAt: new Date().toISOString(), actorName: ctx.user.name ?? "مالك المنشأة" }, ...data.auditLog];
      const result = await db.saveOwnerEmergencySnapshot({ workspaceId: input.workspaceId, payload: JSON.stringify(normalizeAppData(data)), actorUserId: ctx.user.id, action: "calendar-date-unlocked", subject: input.date, details: JSON.stringify({ chaletId: input.chaletId, releasedBookingIds: removed.map((item) => item.id) }) });
      return { ...result, released: removed.length };
    }),
    recycleBin: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), pin: ownerPinSchema })).query(async ({ ctx, input }) => {
      await requireEmergencyOwner(ctx.user.id, input.workspaceId, input.pin);
      const [stored, backups] = await Promise.all([db.getWorkspaceData(input.workspaceId), db.listWorkspaceRecoveryPoints(input.workspaceId, 100)]);
      const currentIds = new Set(stored ? normalizeAppData(JSON.parse(stored.payload)).bookings.map((booking) => booking.id) : []);
      const deleted = new Map<string, { id: string; customerName: string; chaletName?: string; startDate: string; backupId: number }>();
      backups.forEach((backup) => { try { normalizeAppData(JSON.parse(backup.payload)).bookings.forEach((booking) => { if (!currentIds.has(booking.id) && !deleted.has(booking.id)) deleted.set(booking.id, { id: booking.id, customerName: booking.customerName, chaletName: booking.chaletName, startDate: booking.startDate, backupId: backup.id }); }); } catch {} });
      return [...deleted.values()].slice(0, 30);
    }),
    restoreBooking: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), pin: ownerPinSchema, bookingId: z.string().min(1).max(128), backupId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireEmergencyOwner(ctx.user.id, input.workspaceId, input.pin);
      const [stored, backups] = await Promise.all([db.getWorkspaceData(input.workspaceId), db.listWorkspaceRecoveryPoints(input.workspaceId, 100)]);
      if (!stored) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace data not found" });
      const backup = backups.find((item) => item.id === input.backupId);
      if (!backup) throw new TRPCError({ code: "NOT_FOUND", message: "Recovery source not found" });
      const data = normalizeAppData(JSON.parse(stored.payload)); const historical = normalizeAppData(JSON.parse(backup.payload)); const booking = historical.bookings.find((item) => item.id === input.bookingId);
      if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Deleted booking not found" });
      if (data.bookings.some((item) => item.id === booking.id)) throw new TRPCError({ code: "CONFLICT", message: "Booking already exists" });
      if (findConflicts(booking, data.bookings).length) throw new TRPCError({ code: "CONFLICT", message: "Restored booking conflicts with current calendar" });
      data.bookings = [booking, ...data.bookings];
      data.auditLog = [{ id: `owner-restore-${Date.now()}`, action: "booking-waitlist-priority-confirmed", subjectName: booking.customerName, details: "استرجع المالك الحجز من سلة المحذوفات", createdAt: new Date().toISOString(), actorName: ctx.user.name ?? "مالك المنشأة", bookingId: booking.id }, ...data.auditLog];
      return db.saveOwnerEmergencySnapshot({ workspaceId: input.workspaceId, payload: JSON.stringify(normalizeAppData(data)), actorUserId: ctx.user.id, action: "booking-restored", subject: booking.customerName, details: JSON.stringify({ bookingId: booking.id, backupId: backup.id }) });
    }),
    staffActivity: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), pin: ownerPinSchema })).query(async ({ ctx, input }) => {
      await requireEmergencyOwner(ctx.user.id, input.workspaceId, input.pin);
      const stored = await db.getWorkspaceData(input.workspaceId);
      if (!stored) return [];
      const data = normalizeAppData(JSON.parse(stored.payload));
      return data.auditLog.filter((entry) => ["booking-cancelled", "booking-deleted", "payment-updated", "payment-voided"].includes(entry.action) && Boolean(entry.actorName)).slice(0, 80);
    }),
  }),
});

export type AppRouter = typeof appRouter;
