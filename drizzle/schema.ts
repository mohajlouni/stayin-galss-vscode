import {
  boolean,
  index,
  int,
  longtext,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const WORKSPACE_ROLES = ["owner", "admin", "staff", "caretaker", "guest"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const stayInUsers = mysqlTable("stayInUsers", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 191 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 32 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).notNull().default("user"),
  avatarUrl: text("avatarUrl"),
  userCode: varchar("userCode", { length: 16 }),
  termsVersion: varchar("termsVersion", { length: 32 }),
  privacyVersion: varchar("privacyVersion", { length: 32 }),
  conditionsVersion: varchar("conditionsVersion", { length: 32 }),
  legalAcceptedAt: timestamp("legalAcceptedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const stayInAccountDeletionRequests = mysqlTable("stayInAccountDeletionRequests", {
  userId: int("userId").primaryKey(),
  reason: text("reason"),
  status: mysqlEnum("status", ["pending", "cancelled", "deleted"]).notNull().default("pending"),
  requestedAt: timestamp("requestedAt").notNull(),
  scheduledFor: timestamp("scheduledFor").notNull(),
  confirmedAt: timestamp("confirmedAt").notNull(),
}, (table) => ({
  statusIdx: index("stayInAccountDeletionRequests_status_idx").on(table.status),
  scheduledIdx: index("stayInAccountDeletionRequests_scheduledFor_idx").on(table.scheduledFor),
}));

export const stayInSuggestions = mysqlTable("stayInSuggestions", {
  id: int("id").autoincrement().primaryKey(),
  content: text("content").notNull(),
  language: mysqlEnum("language", ["ar", "en"]).notNull(),
  status: mysqlEnum("status", ["new"]).notNull().default("new"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  languageIdx: index("stayInSuggestions_language_idx").on(table.language),
  statusIdx: index("stayInSuggestions_status_idx").on(table.status),
}));

export const stayInWorkspaces = mysqlTable("stayInWorkspaces", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  /** host_id: مالك المنشأة هو هوية المضيف لحساب النشر والعمولة. */
  ownerUserId: int("ownerUserId").notNull(),
  /** فئة الحساب: free = مجاني مع عمولة السوق، private_saas = اشتراك سنوي خاص. */
  accountTier: mysqlEnum("accountTier", ["free", "private_saas"]).notNull().default("free"),
  /** نسبة عمولة السوق المئوية المفروضة على الحجوزات العامة. */
  marketplaceCommissionPercent: int("marketplaceCommissionPercent").notNull().default(0),
  /** قفل لوحة التحكم عند مخالفة الشروط أو التهرب من العمولة. */
  isAccountLocked: boolean("isAccountLocked").notNull().default(false),
  lockReason: varchar("lockReason", { length: 255 }),
  logoUrl: text("logoUrl"),
  currency: varchar("currency", { length: 8 }),
  timeZone: varchar("timeZone", { length: 64 }),
  featureFlags: text("featureFlags"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  ownerIdx: index("stayInWorkspaces_ownerUserId_idx").on(table.ownerUserId),
}));

export const stayInWorkspaceMembers = mysqlTable("stayInWorkspaceMembers", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  userId: int("userId").notNull(),
  displayName: varchar("displayName", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull().default(""),
  role: mysqlEnum("role", WORKSPACE_ROLES).notNull(),
  permissions: text("permissions"),
  status: mysqlEnum("status", ["active", "disabled"]).notNull().default("active"),
  cliqAlias: varchar("cliqAlias", { length: 160 }),
  bankDetails: text("bankDetails"),
  commissionRate: varchar("commissionRate", { length: 32 }),
  commissionType: mysqlEnum("commissionType", ["percent", "fixed"]),
  allowDirectCollection: boolean("allowDirectCollection").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  workspaceIdx: index("stayInWorkspaceMembers_workspaceId_idx").on(table.workspaceId),
  userIdx: index("stayInWorkspaceMembers_userId_idx").on(table.userId),
}));

export const stayInWorkspaceInvitations = mysqlTable("stayInWorkspaceInvitations", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  employeeName: varchar("employeeName", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  pinHash: varchar("pinHash", { length: 255 }).notNull(),
  createdByUserId: int("createdByUserId").notNull(),
  role: mysqlEnum("role", WORKSPACE_ROLES).notNull(),
  permissions: text("permissions"),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index("stayInWorkspaceInvitations_workspaceId_idx").on(table.workspaceId),
  createdByIdx: index("stayInWorkspaceInvitations_createdByUserId_idx").on(table.createdByUserId),
}));

export const stayInActiveWorkspaces = mysqlTable("stayInActiveWorkspaces", {
  userId: int("userId").primaryKey(),
  workspaceId: int("workspaceId").notNull(),
}, (table) => ({
  workspaceIdx: index("stayInActiveWorkspaces_workspaceId_idx").on(table.workspaceId),
}));

export const stayInWorkspaceData = mysqlTable("stayInWorkspaceData", {
  workspaceId: int("workspaceId").primaryKey(),
  payload: longtext("payload").notNull(),
  version: int("version").notNull().default(0),
  updatedByUserId: int("updatedByUserId"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  updatedByIdx: index("stayInWorkspaceData_updatedByUserId_idx").on(table.updatedByUserId),
}));

export const stayInWorkspaceDataBackups = mysqlTable("stayInWorkspaceDataBackups", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  payload: longtext("payload").notNull(),
  sourceVersion: int("sourceVersion").notNull(),
  createdByUserId: int("createdByUserId"),
  reason: varchar("reason", { length: 80 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index("stayInWorkspaceDataBackups_workspaceId_idx").on(table.workspaceId),
  createdByIdx: index("stayInWorkspaceDataBackups_createdByUserId_idx").on(table.createdByUserId),
}));

export const stayInWorkspaceActivity = mysqlTable("stayInWorkspaceActivity", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  actorUserId: int("actorUserId"),
  action: varchar("action", { length: 80 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  workspaceIdx: index("stayInWorkspaceActivity_workspaceId_idx").on(table.workspaceId),
  actionIdx: index("stayInWorkspaceActivity_action_idx").on(table.action),
  createdByIdx: index("stayInWorkspaceActivity_actorUserId_idx").on(table.actorUserId),
}));

export const stayInWorkspaceOwnerPins = mysqlTable("stayInWorkspaceOwnerPins", {
  workspaceId: int("workspaceId").primaryKey(),
  salt: varchar("salt", { length: 255 }).notNull(),
  pinHash: varchar("pinHash", { length: 255 }).notNull(),
  updatedByUserId: int("updatedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  failedAttempts: int("failedAttempts").notNull().default(0),
  lockedUntil: timestamp("lockedUntil"),
  otpCode: varchar("otpCode", { length: 6 }),
  otpExpiresAt: timestamp("otpExpiresAt"),
  otpVerifiedAt: timestamp("otpVerifiedAt"),
}, (table) => ({
  updatedByIdx: index("stayInWorkspaceOwnerPins_updatedByUserId_idx").on(table.updatedByUserId),
}));

export const stayInSessions = mysqlTable("stayInSessions", {
  jti: varchar("jti", { length: 191 }).primaryKey(),
  openId: varchar("openId", { length: 191 }).notNull(),
  name: varchar("name", { length: 255 }),
  expiresAt: timestamp("expiresAt").notNull(),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  openIdIdx: index("stayInSessions_openId_idx").on(table.openId),
  expiresIdx: index("stayInSessions_expiresAt_idx").on(table.expiresAt),
}));

export const stayInSuperAdminAudit = mysqlTable("stayInSuperAdminAudit", {
  id: int("id").autoincrement().primaryKey(),
  actorUserId: int("actorUserId").notNull(),
  action: varchar("action", { length: 80 }).notNull(),
  targetWorkspaceId: int("targetWorkspaceId"),
  targetMemberId: int("targetMemberId"),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  actorIdx: index("stayInSuperAdminAudit_actorUserId_idx").on(table.actorUserId),
  workspaceIdx: index("stayInSuperAdminAudit_targetWorkspaceId_idx").on(table.targetWorkspaceId),
}));

export const stayInGlobalFeatureFlags = mysqlTable("stayInGlobalFeatureFlags", {
  flag: varchar("flag", { length: 64 }).primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  updatedByUserId: int("updatedByUserId"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const stayInWorkspaceFeatureSettings = mysqlTable("stayInWorkspaceFeatureSettings", {
  workspaceId: int("workspaceId").notNull(),
  flag: varchar("flag", { length: 64 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  updatedByUserId: int("updatedByUserId"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  workspaceIdx: index("stayInWorkspaceFeatureSettings_workspaceId_idx").on(table.workspaceId),
  pk: primaryKey({ name: "stayInWorkspaceFeatureSettings_pk", columns: [table.workspaceId, table.flag] }),
}));

export const users = stayInUsers;
export const accountDeletionRequests = stayInAccountDeletionRequests;
export const suggestions = stayInSuggestions;
export const workspaces = stayInWorkspaces;
export const workspaceMembers = stayInWorkspaceMembers;
export const workspaceInvitations = stayInWorkspaceInvitations;
export const activeWorkspaces = stayInActiveWorkspaces;
export const workspaceData = stayInWorkspaceData;
export const workspaceDataBackups = stayInWorkspaceDataBackups;
export const workspaceActivity = stayInWorkspaceActivity;
export const workspaceOwnerPins = stayInWorkspaceOwnerPins;
export const sessions = stayInSessions;
export const superAdminAudit = stayInSuperAdminAudit;
export const globalFeatureFlags = stayInGlobalFeatureFlags;
export const workspaceFeatureSettings = stayInWorkspaceFeatureSettings;

export type User = typeof stayInUsers.$inferSelect;
export type InsertUser = typeof stayInUsers.$inferInsert;
export type Suggestion = typeof stayInSuggestions.$inferSelect;
export type InsertSuggestion = typeof stayInSuggestions.$inferInsert;
export type Workspace = typeof stayInWorkspaces.$inferSelect;
export type InsertWorkspace = typeof stayInWorkspaces.$inferInsert;
export type WorkspaceMember = typeof stayInWorkspaceMembers.$inferSelect;
export type InsertWorkspaceMember = typeof stayInWorkspaceMembers.$inferInsert;
export type WorkspaceInvitation = typeof stayInWorkspaceInvitations.$inferSelect;
export type InsertWorkspaceInvitation = typeof stayInWorkspaceInvitations.$inferInsert;
export type ActiveWorkspace = typeof stayInActiveWorkspaces.$inferSelect;
export type InsertActiveWorkspace = typeof stayInActiveWorkspaces.$inferInsert;
export type WorkspaceDataRow = typeof stayInWorkspaceData.$inferSelect;
export type InsertWorkspaceData = typeof stayInWorkspaceData.$inferInsert;
export type WorkspaceDataBackup = typeof stayInWorkspaceDataBackups.$inferSelect;
export type InsertWorkspaceDataBackup = typeof stayInWorkspaceDataBackups.$inferInsert;
export type WorkspaceActivityRecord = typeof stayInWorkspaceActivity.$inferSelect;
export type InsertWorkspaceActivity = typeof stayInWorkspaceActivity.$inferInsert;
export type WorkspaceOwnerPin = typeof stayInWorkspaceOwnerPins.$inferSelect;
export type InsertWorkspaceOwnerPin = typeof stayInWorkspaceOwnerPins.$inferInsert;
export type SuperAdminAuditRecord = typeof stayInSuperAdminAudit.$inferSelect;
export type InsertSuperAdminAudit = typeof stayInSuperAdminAudit.$inferInsert;
export type SessionRow = typeof stayInSessions.$inferSelect;
export type InsertSession = typeof stayInSessions.$inferInsert;
export type AccountDeletionRequest = typeof stayInAccountDeletionRequests.$inferSelect;
export type InsertAccountDeletionRequest = typeof stayInAccountDeletionRequests.$inferInsert;
export type GlobalFeatureFlagRow = typeof stayInGlobalFeatureFlags.$inferSelect;
export type WorkspaceFeatureSettingRow = typeof stayInWorkspaceFeatureSettings.$inferSelect;