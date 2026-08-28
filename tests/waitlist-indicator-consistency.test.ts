import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/(tabs)/waitlist.tsx"), "utf8");

describe("Waitlist indicator consistency", () => {
  it("shows only unexpired active requests in the active waitlist tab", () => {
    expect(source).toContain('(entry.status === "active" || !entry.status) && !isWaitlistExpired(entry, clock)');
  });

  it("honors the requested waitlist tab from the home indicator", () => {
    expect(source).toContain("useLocalSearchParams<{ tab?: WaitlistTab }>()");
    expect(source).toContain('if (tab === "active" || tab === "promoted" || tab === "cancelled") setWaitlistTab(tab);');
  });
});
