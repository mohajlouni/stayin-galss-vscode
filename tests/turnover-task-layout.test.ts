import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const store = readFileSync(resolve(process.cwd(), "lib/booking-store.tsx"), "utf8");
const screen = readFileSync(resolve(process.cwd(), "app/turnover-tasks.tsx"), "utf8");

describe("turnover task board", () => {
  it("persists task changes and records the operational event", () => {
    expect(store).toContain("updateTurnoverTask");
    expect(store).toContain('action: "turnover-task-updated"');
  });

  it("shows the cleaning states and next booking handoff", () => {
    expect(screen).toContain("بدء التنظيف والفحص");
    expect(screen).toContain("جاري التنظيف");
    expect(screen).toContain("تم تجهيز الشاليه واعتماده");
    expect(screen).toContain("نافذة التجهيز");
    expect(screen).toContain("🔴 مغادرة");
    expect(screen).toContain("🟢 وصول");
    expect(screen).toContain("⚠️ متأخر");
    expect(screen).toContain("formatDayDateTime");
    expect(screen).toContain("⏳ متبقي للتسليم");
    expect(screen).toContain("⚠️ تجاوز الوقت: موعد دخول النزيل حان");
    expect(screen).toContain("startedAt");
    expect(screen).toContain("اعتماد جاهزية الوحدة");
    expect(screen).toContain("هل تم فحص وتجهيز");
    expect(screen).toContain("بدء التنظيف والفحص");
    expect(screen).toContain("Alert.alert(");
  });
});
