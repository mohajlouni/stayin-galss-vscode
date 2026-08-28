import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/user-management.tsx"), "utf8");

describe("user management navigation", () => {
  it("provides an accessible back action that returns to the more screen", () => {
    expect(source).toContain("SubScreenHeader");
    expect(source).toContain('title={language === "ar" ? "إدارة المستخدمين"');
  });
});
