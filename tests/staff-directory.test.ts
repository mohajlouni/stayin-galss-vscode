import { describe, expect, it } from "vitest";

import {
  claimMatches,
  findOnbookByPhone,
  findOnbookByUid,
  hasDuplicatePhone,
  normalizeOnbookStaff,
  normalizeUid,
  phoneKey,
  suggestOnbookUid,
  validateOnbookEntry,
  type OnbookStaff,
} from "@/lib/staff-directory";

const staff: OnbookStaff[] = [
  { uid: "S2001", name: "ليان", phone: "0791234567", role: "staff", isAppUser: false },
  { uid: "G5001", name: "نور", phone: "+962791234568", role: "guard", isAppUser: false },
];

describe("phoneKey (أرقام الهاتف المحلية/الدولية)", () => {
  it("يدعم الصيغ المحلية والدولية القياسية", () => {
    expect(phoneKey("0791234567")).toBe("0791234567");
    expect(phoneKey("+962791234567")).toBe("0791234567");
    expect(phoneKey("00962791234567")).toBe("0791234567");
  });

  it("يعيد صيغة فارغة للمدخلات الفارغة", () => {
    expect(phoneKey(null)).toBe("");
    expect(phoneKey(undefined)).toBe("");
    expect(phoneKey("")).toBe("");
  });
});

describe("normalizeUid (توحيد المعرّف)", () => {
  it("يزيل # التمهيدي ويموّد الأحرف ويقصّ المسافات", () => {
    expect(normalizeUid("#s2005 ")).toBe("S2005");
    expect(normalizeUid("  G5002 ")).toBe("G5002");
    expect(normalizeUid(undefined)).toBe("");
  });
});

describe("suggestOnbookUid (التسلسل الآمن S/G مع دمج أكواد أعضاء التطبيق)", () => {
  it("يبدأ من S2001 للموظفين و G5001 للحراس", () => {
    expect(suggestOnbookUid("staff", [])).toBe("S2001");
    expect(suggestOnbookUid("guard", [])).toBe("G5001");
  });

  it("يمرر الأكواد المأخوذة وإن كانت ببادئات أخرى أو بصيغ مختلفة", () => {
    expect(suggestOnbookUid("staff", ["U1011", "#S2001", "s2002", "G5001"])).toBe("S2003");
    expect(suggestOnbookUid("guard", ["G5001", "G5002"])).toBe("G5003");
  });
});

describe("findOnbookByUid / findOnbookByPhone (بحث في الدليل)", () => {
  it("يجد بالمعرّف الموحد بغضّ النظر عن # أو الحالة أو الفراغات", () => {
    expect(findOnbookByUid(staff, "#s2001")?.name).toBe("ليان");
    expect(findOnbookByUid(staff, "g5001 ")?.name).toBe("نور");
    expect(findOnbookByUid(staff, "X9999")).toBeUndefined();
  });

  it("يجد بالهاتف بصيغته المختلفة", () => {
    expect(findOnbookByPhone(staff, "0791234568")?.name).toBe("نور");
    expect(findOnbookByPhone(staff, "+962791234568")?.name).toBe("نور");
    expect(findOnbookByPhone(staff, "0790000000")).toBeUndefined();
  });
});

describe("claimMatches (مطابقة مضبوطة: الهاتف + المعرّف معًا)", () => {
  it("ينجح عندما يتطابق العنصران معًا فقط", () => {
    expect(claimMatches(staff[0], "0791234567", "S2001")).toBe(true);
  });

  it("يفشل عند تطابق أحدهما فقط", () => {
    expect(claimMatches(staff[0], "0791234567", "G5001")).toBe(false);
    expect(claimMatches(staff[0], "0790000000", "S2001")).toBe(false);
  });

  it("يفشل عند فراغ أيٍّ من الحقلين", () => {
    expect(claimMatches(staff[0], "", "S2001")).toBe(false);
    expect(claimMatches(staff[0], "0791234567", undefined)).toBe(false);
  });
});

describe("hasDuplicatePhone / validateOnbookEntry (منع تكرار الهواتف)", () => {
  it("يكتشف تكرارًا مع أعضاء التطبيق أو مع المنتسبين الآخرين", () => {
    expect(hasDuplicatePhone(["0791234567"], staff, "+962791234567")).toBe(true);
    expect(hasDuplicatePhone([], staff, "0791234568")).toBe(true);
    expect(hasDuplicatePhone([], staff, "0791234568", "G5001")).toBe(false);
  });

  it("يمنع التسجيل بسبب اسم قصير أو هاتف غير مكتمل أو هاتف مكرر", () => {
    expect(validateOnbookEntry({ name: "أ", phone: "0791234567" }, [], [])).toBe("name");
    expect(validateOnbookEntry({ name: "خالد", phone: "123" }, [], [])).toBe("phone");
    expect(validateOnbookEntry({ name: "خالد", phone: "0791234567" }, ["0791234567"], [])).toBe("duplicate-phone");
    expect(validateOnbookEntry({ name: "خالد", phone: "0791234567" }, [], [])).toBeNull();
  });
});

describe("normalizeOnbookStaff (تنظيف القائمة المخزنة)", () => {
  it("يرفض القيم غير المصفوفات ويكيّب عناصر صفرية", () => {
    expect(normalizeOnbookStaff(null)).toEqual([]);
    expect(normalizeOnbookStaff({})).toEqual([]);
    expect(normalizeOnbookStaff([null, "garbage", 42])).toEqual([]);
  });

  it("يصفّي الأسطر غير المكتملة والمكررة ويوحّد الحقول", () => {
    const raw = [
      { uid: "#S2001", name: "  أحمد ", phone: "+962791234567", role: "staff", isAppUser: true },
      { uid: "#s2001", name: "مكرر", phone: "0798877665" },
      { uid: "S2002", name: "بلا هاتف", phone: "12" },
      { uid: "G5001", name: "نور", phone: "0791234568", role: "guard" },
      { uid: "S2003", name: "", phone: "0795554433" },
    ];
    const out = normalizeOnbookStaff(raw);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ uid: "S2001", name: "أحمد", phone: "962791234567", role: "staff", isAppUser: true, email: undefined, createdAt: undefined });
    expect(out[1]).toEqual({ uid: "G5001", name: "نور", phone: "0791234568", role: "guard", isAppUser: false, email: undefined, createdAt: undefined });
  });
});