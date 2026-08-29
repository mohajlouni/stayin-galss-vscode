import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_DEVICE_SETTINGS, DEFAULT_SETTINGS, normalizeAppData } from "../lib/booking-model";

const cardSource = readFileSync(resolve(process.cwd(), "components/booking-card.tsx"), "utf8");
const homeSource = readFileSync(resolve(process.cwd(), "app/(tabs)/index.tsx"), "utf8");
const bookingsSource = readFileSync(resolve(process.cwd(), "app/(tabs)/bookings.tsx"), "utf8");

describe("booking card display modes", () => {
  it("defaults to the existing expanded card and accepts only the compact saved value", () => {
    expect(DEFAULT_DEVICE_SETTINGS.bookingCardViewMode).toBe("expanded");
    expect(normalizeAppData({ settings: { ...DEFAULT_SETTINGS, device: { ...DEFAULT_DEVICE_SETTINGS, bookingCardViewMode: "compact" } } }).settings.device?.bookingCardViewMode).toBe("compact");
    expect(normalizeAppData({ settings: { ...DEFAULT_SETTINGS, device: { ...DEFAULT_DEVICE_SETTINGS, bookingCardViewMode: "unexpected" as "compact" } } }).settings.device?.bookingCardViewMode).toBe("expanded");
  });

  it("uses the compact card to retain operational identity while removing secondary financial controls", () => {
    expect(cardSource).toContain('const isCompactView = viewMode === "compact";');
    expect(cardSource).toContain("!isCompactView ? <View style={styles.financialRow}>");
    expect(cardSource).toContain("footer && !isCompactView");
    expect(cardSource).toContain("isCompactView && styles.scheduleBoxCompact");
    expect(cardSource).toContain("isCompactView && styles.scheduleInfoCompact");
    expect(cardSource).toContain('textAlign: isCompactView ? "center"');
  });

  it("places the independent display container beside the chalet selector on both list screens", () => {
    expect(homeSource).toContain("<BookingViewToggle value={deviceSettings.bookingCardViewMode}");
    expect(bookingsSource).toContain("<BookingViewToggle value={deviceSettings.bookingCardViewMode}");
    expect(homeSource).toContain("<View style={styles.scopeChalet}><ChaletSwitcher /></View>");
    expect(bookingsSource).toContain("<View style={styles.scopeChalet}><ChaletSwitcher /></View>");
    expect(homeSource).toContain("styles.scopeBlock, { flexDirection: row }");
    expect(bookingsSource).toContain("styles.scopeBlock, { flexDirection: row }");
    expect(homeSource).toContain("viewMode={deviceSettings.bookingCardViewMode}");
    expect(bookingsSource).toContain("viewMode={deviceSettings.bookingCardViewMode}");
  });
});
