import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("app/chalet-profile.tsx", "utf8");

describe("chalet profile RTL period fields", () => {
  it("keeps start time and weekday price on the Arabic right side", () => {
    expect(source).toContain('const periodFieldsRow = isArabicLayout ? "row" : "row-reverse";');
    expect(source).toContain('styles.dual, { flexDirection: periodFieldsRow }');
    expect(source.indexOf('وقت البداية / الدخول')).toBeLessThan(source.indexOf('وقت النهاية / المغادرة'));
    expect(source.indexOf('سعر وسط الأسبوع')).toBeLessThan(source.indexOf('سعر نهاية الأسبوع'));
  });
});
