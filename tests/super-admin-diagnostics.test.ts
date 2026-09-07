import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (paths: string) => readFileSync(resolve(process.cwd(), paths), "utf8");

describe("super admin diagnostics & system health center", () => {
  it("adds both entry cards from the master control gateway with the exact card layout and chevron", () => {
    const master = source("app/admin/master-control.tsx");
    expect(master).toContain("مركز رصد الأخطاء وصحة النظام");
    expect(master).toContain("مراقبة فورية لنبض السيرفر، قواعد البيانات، وسجل الأخطاء الحية وتتبع المشاكل.");
    expect(master).toContain('router.push("/admin/system-health-errors"');
    expect(master).toContain("تشخيص وفحص الحسابات (User Doctor)");
    expect(master).toContain("فحص تسلسلي آلي لحالات المستخدمين، التوثيق، الصلاحيات، والجلسات النشطة.");
    expect(master).toContain('router.push("/admin/user-diagnostics"');
    expect(master).toContain("monitor-heart");
    expect(master).toContain("manage-accounts");
    expect(master).toContain('name="chevron-left"');
  });

  it("exposes the diagnostic API surface strictly through the admin (super admin) procedure", () => {
    const router = source("server/routers.ts");
    expect(router).toContain("systemDiagnostics: router");
    expect(router).toContain("healthCheck: adminProcedure.query");
    expect(router).toContain("errors: adminProcedure.query");
    expect(router).toContain("resolveError: adminProcedure.input");
    expect(router).toContain("diagnoseUser: adminProcedure.input");
    expect(router).toContain("forceLogout: adminProcedure.input");
    expect(router).toContain("db.pingDatabase()");
    expect(router).toContain("db.listUnresolvedSystemErrors()");
    expect(router).toContain("db.getUserDiagnosticRecord(input.query)");
    expect(router).toContain("db.revokeUserSessions(user.openId)");
  });

  it("adds the idempotent system error log table with occurrence merging and resolution", () => {
    const db = source("server/db.ts");
    expect(db).toContain("ensureSystemErrorLogsTable");
    expect(db).toContain("CREATE TABLE IF NOT EXISTS stayInSystemErrorLogs");
    expect(db).toContain("occurrenceCount int NOT NULL DEFAULT 1");
    expect(db).toContain("status varchar(16) NOT NULL DEFAULT 'unresolved'");
    expect(db).toContain("recordSystemError");
    expect(db).toContain("listUnresolvedSystemErrors");
    expect(db).toContain("{systemErrorLogs.occurrenceCount} + 1");
    expect(db).toContain("resolveSystemError");
    expect(db).toContain("getUserDiagnosticRecord");
    expect(db).toContain("countUserLiveSessions");
  });

  it("defines the system error log columns in the drizzle schema and exports the type", () => {
    const schema = source("drizzle/schema.ts");
    expect(schema).toContain('mysqlTable("stayInSystemErrorLogs"');
    expect(schema).toContain('endpoint: varchar("endpoint", { length: 255 }).notNull()');
    expect(schema).toContain('statusCode: int("statusCode").notNull()');
    expect(schema).toContain('occurrenceCount: int("occurrenceCount").notNull().default(1)');
    expect(schema).toContain('lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull()');
    expect(schema).toContain('mysqlEnum("status", ["unresolved", "resolved"]).notNull().default("unresolved")');
    expect(schema).toContain("export const systemErrorLogs = stayInSystemErrorLogs");
  });

  it("boots the error log table alongside the existing idempotent schema guards", () => {
    const index = source("server/_core/index.ts");
    expect(index).toContain("ensureSystemErrorLogsTable");
    expect(index).toContain("await ensureSystemErrorLogsTable();");
  });

  it("renders the health + error center with a super admin gate, three health cards, and live error actions", () => {
    const screen = source("app/admin/system-health-errors.tsx");
    expect(screen).toContain("مركز رصد الأخطاء وصحة النظام");
    expect(screen).toContain("مراقبة حية لجاهزية الخوادم وحركة استثناءات النظام البرمجية.");
    expect(screen).toContain('backHref="/admin/master-control"');
    expect(screen).toContain('trpc.systemDiagnostics.healthCheck.useQuery');
    expect(screen).toContain('trpc.systemDiagnostics.errors.useQuery');
    expect(screen).toContain('trpc.systemDiagnostics.resolveError.useMutation');
    expect(screen).toContain("🟢 متصل (");
    expect(screen).toContain("🟢 يعمل بكفاءة");
    expect(screen).toContain("🟢 مجدولة");
    expect(screen).toContain("معاينة التفاصيل");
    expect(screen).toContain("تم الحل");
    expect(screen).toContain("تكرر {entry.occurrenceCount} مرة");
    expect(screen).toContain("زائر غير مسجل");
    expect(screen).toContain("هذه اللوحة مخصصة لمدير النظام فقط");
    expect(screen).toContain("isSuperAdmin");
  });

  it("renders the user doctor with search, sequential checklist, and a force-logout action bar", () => {
    const screen = source("app/admin/user-diagnostics.tsx");
    expect(screen).toContain("تشخيص وفحص الحسابات (User Doctor)");
    expect(screen).toContain("أداة الفحص السريع لعزل مشاكل الحسابات الفردية وتصحيحها.");
    expect(screen).toContain('backHref="/admin/master-control"');
    expect(screen).toContain("ابحث بالبريد الإلكتروني، رقم الهاتف، أو رقم الحساب (#ID)...");
    expect(screen).toContain('trpc.systemDiagnostics.diagnoseUser.useQuery');
    expect(screen).toContain('trpc.systemDiagnostics.forceLogout.useMutation');
    expect(screen).toContain("حالة الحساب والتوثيق");
    expect(screen).toContain("الرتبة والصلاحيات القياسية");
    expect(screen).toContain("الربط بالمنشأة والوحدات");
    expect(screen).toContain("رمز التحقق (OTP)");
    expect(screen).toContain("الجلسات والأجهزة النشطة");
    expect(screen).toContain("إنهاء كافة الجلسات النشطة فوراً (Force Logout)");
    expect(screen).toContain("تشخيص الحساب");
    expect(screen).toContain("هذه اللوحة مخصصة لمدير النظام فقط");
  });
});