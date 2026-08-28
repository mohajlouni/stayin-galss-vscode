import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const store = readFileSync(resolve(process.cwd(), "lib/booking-store.tsx"), "utf8");
const layout = readFileSync(resolve(process.cwd(), "app/_layout.tsx"), "utf8");

describe("workspace sync conflict recovery", () => {
  it("captures version conflicts without leaving an unhandled asynchronous mutation", () => {
    expect(store).toContain("setSyncConflict(isWorkspaceVersionConflict(error))");
    expect(store).toContain("finally {");
    expect(store).toContain("setRemoteReady(true)");
    expect(store).toContain("const remoteSyncStarted = useRef(false)");
    expect(store).toContain("remoteSyncStarted.current || !remoteData.data");
    expect(store).toContain("remoteSyncStarted.current = true");
  });

  it("keeps a rescue copy before refreshing shared data and exposes an Arabic refresh banner", () => {
    expect(store).toContain("RESCUE_BACKUP_KEY}:${activeWorkspaceId}");
    expect(store).toContain("refreshWorkspaceData");
    expect(layout).toContain("WorkspaceSyncBanner");
    expect(layout).toContain("تعارض في مزامنة البيانات");
    expect(layout).toContain("حُفظت نسخة إنقاذ محلية");
    expect(layout).toContain("تحميل الأحدث");
    expect(layout).toContain("useInternetAvailability");
  });
});
