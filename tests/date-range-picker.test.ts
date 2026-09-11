import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const rangePicker = readFileSync(resolve(process.cwd(), "components/ui/DateRangePicker.tsx"), "utf8");

describe("shared DateRangePicker", () => {
  it("renders the calendar in a full-screen portal sheet that escapes clipping with high z-index and elevation", () => {
    expect(rangePicker).toContain("<Modal transparent visible={visible}");
    expect(rangePicker).toContain("animationType=\"fade\"");
    expect(rangePicker).toContain("statusBarTranslucent");
    expect(rangePicker).toContain("StyleSheet.absoluteFill");
    expect(rangePicker).toContain("zIndex: 50");
    expect(rangePicker).toContain("elevation: 50");
    expect(rangePicker).toContain("alignItems: \"center\", justifyContent: \"center\"");
  });

  it("picks both edges with CalendarDateField portals and no inline or floating done buttons", () => {
    expect(rangePicker).toContain("CalendarDateField");
    expect(rangePicker).toContain("من تاريخ");
    expect(rangePicker).toContain("إلى تاريخ");
    expect(rangePicker).toContain("اختر تاريخ البداية والنهاية من التقويم");
    expect(rangePicker).not.toContain("DateTimePicker");
    expect(rangePicker).not.toContain("تم");
  });

  it("offers a single consolidated footer with cancel and apply, committing both dates", () => {
    expect(rangePicker).toContain("إلغاء");
    expect(rangePicker).toContain("تطبيق الفلترة");
    expect(rangePicker).toContain("تحديد الفترة الزمنية");
    expect(rangePicker).toContain("onApply({ start: draftStart, end: draftEnd })");
    expect(rangePicker).toContain("onRequestClose={onClose}");
  });

  it("formats every displayed date through the centralized app date formatter", () => {
    expect(rangePicker).toContain("useAppPreferences()");
    expect(rangePicker).toContain("formatDate");
    expect(rangePicker).toContain("weekdayLabel");
    expect(rangePicker).toContain("النطاق الحالي");
  });
});