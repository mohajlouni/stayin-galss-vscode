import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("master blackout — kill-switch buttons must visibly respond and never fail silently", () => {
  const panel = source("app/admin/master-blackout.tsx");

  it("reads the global flag list with retry disabled so server truth drives the toggles", () => {
    expect(panel).toContain("featureControl.global.list.useQuery(undefined, { retry: false })");
  });

  it("refuses to render fake all-on rows while the flags are loading or unavailable", () => {
    expect(panel).toContain("flagsList.isLoading");
    expect(panel).toContain("flagsList.isFetching && !flagsList.data");
    expect(panel).toContain("جارٍ تحميل حالات الميزات…");
    expect(panel).toContain("تعذر تحميل حالات الميزات من الخادم.");
    expect(panel).toContain("إعادة المحاولة");
    expect(panel).toContain("المفاتيح لن تُلمس حتى تعود البيانات.");
    expect(panel).toContain("flagsList.refetch()");
    expect(panel).toContain("flagsList.error?.message");
  });

  it("disables the silent retry storm and surfaces mutation failures with retry:false + onError alert", () => {
    expect(panel).toContain("retry: false");
    expect(panel).toContain("onError:");
    expect(panel).toContain("onSuccess:");
    expect(panel).toContain("تعذر تطبيق الحجب المركزي");
    expect(panel).toContain("تعذر حفظ الحالة الآن. تحقق من اتصالك بالسيرفر وأعد المحاولة.");
    expect(panel).toContain("globalToggle.mutate({ flag, enabled: true })");
    expect(panel).toContain("globalToggle.mutate({ flag, enabled: false })");
  });

  it("rolls back the optimistic toggle when the write fails", () => {
    expect(panel).toContain("const previous = utils.featureControl.global.list.getData();");
    expect(panel).toContain("if (previous) utils.featureControl.global.list.setData(undefined, { ...previous, [flag]: enabled });");
    expect(panel).toContain("if (context?.previous) utils.featureControl.global.list.setData(undefined, context.previous);");
  });

  it("never claims success before the server write actually resolves", () => {
    expect(panel).toContain("onSuccess: (_data, variables) => {");
    expect(panel).not.toContain('setSavedMessage(isRTL ? "تم تفعيل الميزة عالميًا." : "Feature enabled globally.");');
    expect(panel).not.toContain('setSavedMessage(isRTL ? "تم الحجب المركزي للميزة." : "Kill-switch activated.");');
  });

  it("keeps the super-admin gate and the existing kill-switch copy intact", () => {
    expect(panel).toContain("if (!isSuperAdmin) return;");
    expect(panel).toContain("هذه اللوحة مخصصة لمدير النظام فقط");
    expect(panel).toContain("تأكيد الحجب المركزي");
    expect(panel).toContain("تعطيل الميزة");
    expect(panel).toContain('trpc.featureControl.global.update');
  });

  it("binds every row to the server-loaded truth and never falls back to silent all-on defaults", () => {
    expect(panel).not.toContain("useGlobalFeatureFlags");
    expect(panel).toContain("const enabled = Boolean(flagsList.data?.[flag]);");
    expect(panel).toContain("const enabledCount = flagsList.isSuccess ?");
    expect(panel).toContain('String(GLOBAL_FEATURE_FLAG_KEYS.length - enabledCount)');
  });

  it("reports the metric cards and audit action types exactly per the editorial spec", () => {
    expect(panel).toContain('<Metric label="مفعّلة"');
    expect(panel).toContain('<Metric label="محجوبة"');
    expect(panel).toContain('<Metric label="عمليات حجب"');
    expect(panel).toContain('? "حجب مركزي" : "إلغاء حجب مركزي"');
  });

  it("disables only the row currently being written so one stuck request can never freeze all 13 switches", () => {
    expect(panel).toContain("const [pendingFlag, setPendingFlag] = useState<GlobalFeatureFlagKey | null>(null);");
    expect(panel).toContain("setPendingFlag(flag);");
    expect(panel).toContain("disabled={pendingFlag === flag} accessibilityLabel={meta.label}");
    expect(panel).not.toContain("disabled={globalToggle.isPending} accessibilityLabel={meta.label}");
  });

  it("is fully web-safe: no native Alert dependency, in-component confirm modal, and inline error toast", () => {
    expect(panel).not.toContain("Alert.alert");
    expect(panel).not.toContain("Alert,");
    expect(panel).toContain("Modal visible={Boolean(confirmTarget)}");
    expect(panel).toContain("const [confirmTarget, setConfirmTarget] = useState<GlobalFeatureFlagKey | null>(null);");
    expect(panel).toContain("setConfirmTarget(flag)");
    expect(panel).toContain("confirmDisable()");
    expect(panel).toContain("const [errorMessage, setErrorMessage] = useState<string | null>(null);");
    expect(panel).toContain("errorMessage ? <Text");
    expect(panel).toContain("pointerEvents=\"none\" style={StyleSheet.absoluteFill}");
  });
});