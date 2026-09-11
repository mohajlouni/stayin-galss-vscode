import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("horizontal calendar strip steps in exact 7-day weeks with pre-day retention", () => {
  const source = read("app/maintenance-dashboard.tsx");

  it("always keeps two pre-days before today so the week window stays complete", () => {
    expect(source).toContain("const preStart = addDays(todayISO, -2);");
    expect(source).toContain("addDays(todayISO, 59)");
  });

  it("steps the strip by a full week locked to day borders, never cutting a pill in half", () => {
    expect(source).toContain("const ROLLER_PILL_STEP = 60;");
    expect(source).toContain("weeks * 7 * ROLLER_PILL_STEP");
    expect(source).toContain("rollerRef.current?.scrollTo({ x: target, animated: true })");
  });

  it("gives the Current Day a distinct inline marker inside its tile", () => {
    expect(source).toContain("rollerTodayUnderline");
    expect(source).toContain('const topLabel = isToday ? (language === "ar" ? "اليوم" : "Today") : weekday;');
    expect(source).not.toContain("rollerTodayBadge");
  });
});

describe("asset purchase expense linking (optional, create mode only)", () => {
  const source = read("app/maintenance-dashboard.tsx");

  it("offers the expense-posting toggle only for a new asset with a positive purchase cost", () => {
    expect(source).toContain('assetSheet.mode === "create" && Number(assetSheet.draft.purchaseCost || 0) > 0');
    expect(source).toContain("ترحيل تكلفة الشراء إلى سجل المصروفات");
  });

  it("lets the owner choose the payment source cash/CliQ/bank with active treasury accounts", () => {
    expect(source).toContain("EXPENSE_FUNDING_CHANNELS.map((channel)");
    expect(source).toContain('const paymentMethod = draft.expenseChannel === "vault-cash" ? "cash" : draft.expenseChannel === "cliq" ? "click" : "iban";');
    expect(source).toContain("fundingOwnerAccounts.filter((account) =>");
  });

  it("posts a single 'أخرى / شراء أصول وتجهيزات' voucher (general share split for multi-unit assets)", () => {
    expect(source).toContain("const note = `شراء أصول وتجهيزات: ${draft.name.trim()}`;");
    expect(source).toContain("generalAllocations: allocations");
    expect(source).toContain("useBookings()");
    expect(source).toContain("addExpense,");
  });
});

describe("red visual validation inside the add-asset modal", () => {
  const source = read("app/maintenance-dashboard.tsx");

  it("shows rose red inline validation on empty name or unselected units, gating on save", () => {
    expect(source).toContain('setAssetErrors({ name: !draft.name.trim(), units: !draft.unitIds.length })');
    expect(source).toContain("يُرجى إدخال اسم الأصل");
    expect(source).toContain("يُرجى اختيار وحدة واحدة على الأقل");
    expect(source).toContain('borderColor: assetErrors.name ? "#F43F5E" : colors.border');
  });

  it("clears the errors as the user fixes the fields and keeps the save button always tappable", () => {
    expect(source).toContain("setAssetErrors((prev) => ({ ...prev, name: false }))");
    expect(source).toContain("setAssetErrors((prev) => ({ ...prev, units: false }))");
    expect(source).toContain('disabled={saving} onPress={() => void saveAssetDraft()}');
  });
});

describe("assets helper banner guides asset registration", () => {
  const source = read("app/maintenance-dashboard.tsx");

  it("shows the inventory helper banner above the assets filter bar", () => {
    expect(source).toContain('tab === "assets" ?');
    expect(source).toContain("سجل عتاد الشاليهات (مكيفات، مضخات، بويلرات، شاشات) لحصر الأجهزة ومواقعها ومتابعة تكاليف صيانتها دورياً.");
    expect(source).toContain("assetHelper");
  });
});