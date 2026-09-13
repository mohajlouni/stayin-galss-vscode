import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const modal = readFileSync("components/users/AddUserModal.tsx", "utf8");

describe("نموذج إضافة العضو: التنسيق الإجباري والاختيار الصريح للدور", () => {
  it("يحوّل المعرّف الشخصي إلى أحرف كبيرة فوريًا ويفرض اتجاهًا لاتينيًا مع تطابق غير حساس لحالة الأحرف", () => {
    expect(modal).toContain("setUserCode(text.toUpperCase().slice(0, 24))");
    expect(modal).toContain('autoCapitalize="characters"');
    expect(modal).toContain('writingDirection: "ltr"');
    expect(modal).toContain('textAlign: "left"');
    expect(modal).toContain("#U1024");
    expect(modal).toContain("normalizeUid(userCode)");
    expect(modal).toContain("lookupUserCode");
  });

  it("يعرض حقلي الهاتف والمعرّف في شبكة من عمودين مع عناوين فوق المدخلات مباشرة", () => {
    expect(modal).toContain("رقم الهاتف للتواصل");
    expect(modal).toContain("مثال: 079xxxxxxx أو مع رمز البلد (+962 / 00962)");
    expect(modal).toContain("المعرّف الشخصي (اختياري للتأكيد)");
    expect(modal).toContain("styles.fieldsRow");
    expect(modal).toContain("styles.fieldCol");
  });

  it("يعرض أدوارًا مبسطة وواضحة، ولا يحدد أي دور مسبقًا", () => {
    expect(modal).toContain('{ id: "guard", emoji: "🛡️", ar: "حارس", en: "Guard" },');
    expect(modal).toContain('{ id: "staff", emoji: "💼", ar: "موظف", en: "Staff" },');
    expect(modal).toContain('{ id: "mini-admin", emoji: "⚙️", ar: "مدير تشغيلي", en: "Operational manager" },');
    expect(modal).not.toContain("حارس / شفت");
    expect(modal).not.toContain("موظف حجوزات");
    expect(modal).toContain("useState<AddUserRole | null>(null)");
    expect(modal).toContain('setRole(null);');
  });

  it("يفرض اختيار الدور قبل الحفظ ويُعطّل زر الإرسال حتى الاختيار", () => {
    expect(modal).toContain("يرجى اختيار دور العضو أولاً");
    expect(modal).toContain('disabled={pending || role === null}');
    expect(modal).toContain("accessibilityState={{ disabled: pending || role === null }}");
  });

  it("يفتح درج الصلاحيات تلقائيًا عند اختيار الدور مع تحديد الصلاحيات الافتراضية مسبقًا", () => {
    expect(modal).toContain("setCaps(capabilitiesForRole(next));");
    expect(modal).toContain("setPermsOpen(true);");
    expect(modal).toContain("تخصيص الصلاحيات (");
    expect(modal).toContain("capabilitiesToPermissions(caps)");
  });
});