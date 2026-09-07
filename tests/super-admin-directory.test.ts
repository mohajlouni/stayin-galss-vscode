import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("super admin modular launcher architecture", () => {
  it("reduces the command center to a uniform six-card grid with the new deletion and directory entries", () => {
    const panel = source("app/admin/master-control.tsx");
    expect(panel).toContain("مختبر الأدوار والمنشآت");
    expect(panel).toContain("إدارة الحجب المركزي والتعليق الشامل للوحدات");
    expect(panel).toContain("مركز رصد الأخطاء وصحة النظام");
    expect(panel).toContain("تشخيص وفحص الحسابات (User Doctor)");
    expect(panel).toContain("إدارة الحذف النهائي والمهلة الزمنية");
    expect(panel).toContain("دليل المنشآت وإدارة المستأجرين");
    expect(panel).toContain('router.push("/admin/deletion-management"');
    expect(panel).toContain('router.push("/admin/workspaces-directory"');
    expect(panel).not.toContain("الحذف النهائي لحساب (إزالة دائمة لا تُرجع)");
    expect(panel).not.toContain("حالة المستأجرين");
    expect(panel).not.toContain("البحث واختيار المنشأة");
  });

  it("preselects a workspace from the directory deep-link and keeps the tabbed operational tools behind it", () => {
    const panel = source("app/admin/master-control.tsx");
    const directory = source("app/admin/workspaces-directory.tsx");
    expect(panel).toContain('useLocalSearchParams<{ workspace?: string }>()');
    expect(panel).toContain('/^\\d+$/.test(params.workspace)');
    expect(panel).toContain('const TABS = ["ledger", "members", "system"]');
    expect(panel).toContain("tabLabel(tab)");
    expect(directory).toContain('pathname: "/admin/master-control"');
    expect(directory).toContain('params: { workspace: String(');
  });

  it("merges deletion into a single page with lifetime badges, a collapsible preview, and the red confirmation modal", () => {
    const screen = source("app/admin/deletion-management.tsx");
    expect(screen).toContain("محذوفة نهائياً");
    expect(screen).toContain("قيد المهلة (14 يوماً)");
    expect(screen).toContain('placeholder="ابحث بالبريد الإلكتروني، رقم الهاتف، أو معرف المستخدم (#ID)..."');
    expect(screen).toContain("عرض معاينة السجلات المرتبطة");
    expect(screen).toContain("إخفاء معاينة السجلات المرتبطة");
    expect(screen).toContain("حذف نهائي لا رجعة فيه");
    expect(screen).toContain("تأكيد الحذف النهائي");
    expect(screen).toContain('backHref="/admin/master-control"');
    expect(screen).toContain("قيد المهلة (١٤ يومًا)");
    expect(screen).toContain("سجل المحذوفات");
  });

  it("builds the workspaces directory with KPIs, search, filter pills, and unit expansion", () => {
    const screen = source("app/admin/workspaces-directory.tsx");
    expect(screen).toContain('title="دليل المنشآت وإدارة المستأجرين"');
    expect(screen).toContain("إجمالي المنشآت");
    expect(screen).toContain("الأعضاء النشطون");
    expect(screen).toContain("المنشآت الفارغة");
    expect(screen).toContain('placeholder="ابحث باسم المنشأة، هاتف المالك، أو المعرف..."');
    expect(screen).toContain('"الكل"');
    expect(screen).toContain("المنشآت النشطة");
    expect(screen).toContain("المنشآت الفارغة (0 أعضاء)");
    expect(screen).toContain("masterControl.overview.useQuery");
    expect(screen).toContain("masterControl.directory.useQuery");
    expect(screen).toContain("masterControl.workspaceOptions.useQuery");
    expect(screen).toContain("إدارة المنشأة");
    expect(screen).toContain("عرض الوحدات");
    expect(screen).toContain("إخفاء الوحدات");
    expect(screen).toContain('backHref="/admin/master-control"');
  });

  it("gates the directory page behind the server-side admin procedure", () => {
    const router = source("server/routers.ts");
    const screen = source("app/admin/workspaces-directory.tsx");
    expect(router).toContain("directory: adminProcedure");
    expect(router).toContain("workspaceOptions: adminProcedure");
    expect(screen).toContain("هذه اللوحة مخصصة لمدير النظام فقط");
    expect(screen).toContain("تُفرض صلاحية الإدارة العليا من الخادم");
  });
});