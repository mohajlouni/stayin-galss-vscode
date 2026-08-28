import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const home = readFileSync(resolve(process.cwd(), "app/(tabs)/index.tsx"), "utf8");
const alerts = readFileSync(resolve(process.cwd(), "components/operational-alerts.tsx"), "utf8");

describe("operational alerts", () => {
  it("shows actionable cleaning and checkout alerts only when there is an operation to follow", () => {
    expect(alerts).toContain("if (!turnoverCount && !checkoutWarningCount) return null");
    expect(alerts).toContain("مهمة تنظيف وفحص تحتاج متابعة");
    expect(alerts).toContain("مغادرة خلال ساعتين");
  });

  it("connects the alert summary to live turnover and checkout data", () => {
    expect(home).toContain("getTurnoverTaskCandidates");
    expect(home).toContain("checkoutWarningCount");
    expect(home).toContain("<OperationalAlerts");
  });
});
