import { describe, expect, it } from "vitest";
import {
  formatUserCode,
  parseUserCode,
  parseUserCodeNumber,
  nextCodeForRole,
  nextUserCode,
  identityRoleFromMemberRoles,
  resolveIdentityRole,
  SUPER_ADMIN_USER_CODE,
  RESERVED_USER_CODE_START,
  RESERVED_USER_CODE_END,
  OWNER_CODE_START,
  STAFF_CODE_START,
  GUARD_CODE_START,
  ROLE_CODE_SEQ,
  SHIFT_CODE_MAP,
} from "../lib/user-code";

describe("role-based ID sequences (#U / #S / #G)", () => {
  it("defines the reserved boundaries and per-role start points", () => {
    expect(SUPER_ADMIN_USER_CODE).toBe(1000);
    expect(RESERVED_USER_CODE_START).toBe(1001);
    expect(RESERVED_USER_CODE_END).toBe(1010);
    expect(OWNER_CODE_START).toBe(1011);
    expect(STAFF_CODE_START).toBe(2001);
    expect(GUARD_CODE_START).toBe(5001);
    expect(ROLE_CODE_SEQ.owner.prefix).toBe("U");
    expect(ROLE_CODE_SEQ.staff.prefix).toBe("S");
    expect(ROLE_CODE_SEQ.guard.prefix).toBe("G");
  });

  it("always reserves #U1000 for the super admin regardless of existing codes", () => {
    expect(nextCodeForRole("super-admin", [])).toBe("U1000");
    expect(nextCodeForRole("super-admin", ["U1011", "S2001", "G5001"])).toBe("U1000");
  });

  it("assigns owners forward from #U1011, skipping the reserved range", () => {
    expect(nextCodeForRole("owner", [])).toBe("U1011");
    expect(nextCodeForRole("owner", ["U1011"])).toBe("U1012");
    expect(nextCodeForRole("owner", ["U1011", "U1012", "U1013"])).toBe("U1014");
    // reserved entries are ignored and never influence the auto counter
    expect(nextCodeForRole("owner", ["U1001", "U1002", "U1011"])).toBe("U1012");
  });

  it("assigns staff forward from #S2001 and guards from #G5001 in their own pools", () => {
    expect(nextCodeForRole("staff", [])).toBe("S2001");
    expect(nextCodeForRole("staff", ["S2001", "S2002"])).toBe("S2003");
    expect(nextCodeForRole("staff", ["S5001"])).toBe("S2001");
    expect(nextCodeForRole("guard", [])).toBe("G5001");
    expect(nextCodeForRole("guard", ["G5001", "G5002"])).toBe("G5003");
  });

  it("keeps each role pool independent (U/S/G never collide)", () => {
    const existing = ["U1011", "S2001", "G5001"];
    expect(nextCodeForRole("owner", existing)).toBe("U1012");
    expect(nextCodeForRole("staff", existing)).toBe("S2002");
    expect(nextCodeForRole("guard", existing)).toBe("G5002");
  });

  it("resolves the global identity role from member roles with owner > staff > guard precedence", () => {
    expect(identityRoleFromMemberRoles(["owner"])).toBe("owner");
    expect(identityRoleFromMemberRoles(["admin"])).toBe("staff");
    expect(identityRoleFromMemberRoles(["staff"])).toBe("staff");
    expect(identityRoleFromMemberRoles(["caretaker"])).toBe("guard");
    expect(identityRoleFromMemberRoles(["guest"])).toBe("guard");
    expect(identityRoleFromMemberRoles(["staff", "caretaker"])).toBe("staff");
    expect(identityRoleFromMemberRoles(["owner", "staff"])).toBe("owner");
    expect(identityRoleFromMemberRoles(["caretaker", "owner"])).toBe("owner");
    expect(resolveIdentityRole({ isSuperAdmin: true, memberRoles: ["guest"] })).toBe("super-admin");
    expect(resolveIdentityRole({ isSuperAdmin: false, memberRoles: ["owner"] })).toBe("owner");
  });

  it("formats and parses #U / #S / #G codes symmetrically", () => {
    expect(formatUserCode("U", 1011)).toBe("U1011");
    expect(formatUserCode("S", 2001)).toBe("S2001");
    expect(formatUserCode("G", 5001)).toBe("G5001");
    expect(parseUserCode("U1011")).toEqual({ prefix: "U", num: 1011 });
    expect(parseUserCode("S2001")).toEqual({ prefix: "S", num: 2001 });
    expect(parseUserCode("g5007")).toEqual({ prefix: "G", num: 5007 });
    expect(parseUserCode("")).toBeNull();
    expect(parseUserCode(null)).toBeNull();
    expect(parseUserCode("ABC")).toBeNull();
    // parseUserCodeNumber is U-only for backward compatibility
    expect(parseUserCodeNumber("U1011")).toBe(1011);
    expect(parseUserCodeNumber("S2001")).toBeNull();
  });

  it("keeps nextUserCode backward-compatible for the owner (U) pool", () => {
    expect(nextUserCode([], false)).toBe(1011);
    expect(nextUserCode([1011], false)).toBe(1012);
    expect(nextUserCode([1011, 1012], true)).toBe(1000);
  });

  it("maps shift keys to the smart booking reference letters M/N/D/S/C/X", () => {
    expect(SHIFT_CODE_MAP.morning).toBe("M");
    expect(SHIFT_CODE_MAP.evening).toBe("N");
    expect(SHIFT_CODE_MAP["24h"]).toBe("D");
    expect(SHIFT_CODE_MAP.full_day).toBe("D");
    expect(SHIFT_CODE_MAP["multi-day"]).toBe("S");
    expect(SHIFT_CODE_MAP.overnight).toBe("S");
    expect(SHIFT_CODE_MAP.event).toBe("C");
    expect(SHIFT_CODE_MAP.custom).toBe("X");
    expect(SHIFT_CODE_MAP.other).toBe("X");
  });
});
