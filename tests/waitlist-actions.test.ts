import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/(tabs)/waitlist.tsx"), "utf8");
const chaletManagement = readFileSync(resolve(process.cwd(), "app/chalet-management.tsx"), "utf8");

describe("waitlist actions and chalet management navigation", () => {
  it("uses an in-app confirmation before deleting or promoting a waiting request", () => {
    expect(source).toContain('type PendingAction = { kind: "promote" | "remove"; entry: WaitlistEntry }');
    expect(source).toContain('setPendingAction({ kind: "promote", entry: item })');
    expect(source).toContain('setPendingAction({ kind: "remove", entry: item })');
    expect(source).toContain('params: { waitlistId: action.entry.id }');
    expect(source).toContain("await remove(action.entry)");
  });

  it("shows booking-card details and the conflicting confirmed guest", () => {
    expect(source).toContain("findConflicts(");
    expect(source).toContain("يتعارض مع حجز العميل:");
    expect(source).toContain("الاسم:");
    expect(source).toContain("weekdayLabel(entry.requestedDate, language)");
  });

  it("returns from chalet management to the more screen", () => {
    expect(chaletManagement).toContain("SubScreenHeader");
    expect(chaletManagement).toContain('title={language === "ar" ? "إدارة الوحدات / العقارات"');
  });
});
