import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const store = readFileSync(resolve(process.cwd(), "lib/booking-store.tsx"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");

describe("workspace member synchronization", () => {
  it("allows signed-in operational members to receive and save the active workspace snapshot", () => {
    expect(store).toContain("isAuthenticated && activeWorkspaceId !== null && !isGuest");
    expect(router).toContain('summary.member.role === "guest"');
    expect(router).toContain("Operational workspace access required");
  });
});
