import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const homeSource = source("app/(tabs)/index.tsx");
const bookingsSource = source("app/(tabs)/bookings.tsx");
const waitlistSource = source("app/(tabs)/waitlist.tsx");
const tabsSource = source("app/(tabs)/_layout.tsx");
const glassSource = source("components/glow-glass-card.tsx");
const screenContainerSource = source("components/screen-container.tsx");
const ambientBackgroundSource = source("components/ambient-screen-background.tsx");
const calendarSource = source("app/(tabs)/calendar.tsx");

describe("navigation and Android rendering performance", () => {
  it("runs time refreshes only while live operational screens are focused", () => {
    for (const screenSource of [homeSource, bookingsSource, waitlistSource]) {
      expect(screenSource).toContain("useFocusEffect(useCallback(() => {");
      expect(screenSource).toContain("setClock(Date.now())");
      expect(screenSource).toContain("return () => clearInterval(interval);");
    }
    expect(homeSource).not.toContain("setClock((value) => value + 1)");
  });

  it("keeps tab scenes current while keeping Android card clipping away from elevated shells", () => {
    expect(tabsSource).toContain("freezeOnBlur: false");
    expect(tabsSource).toContain('overflow: Platform.OS === "android" ? "visible" : "hidden"');
    expect(glassSource).toContain("const isAndroid = Platform.OS === \"android\"");
    expect(glassSource).toContain("isAndroid && styles.androidShell");
    expect(glassSource).toContain('androidShell: { overflow: "visible", elevation: 4, shadowOpacity: 0 }');
  });

  it("keeps each tab scene opaque and places the tab bar within the screen layout", () => {
    expect(tabsSource).toContain("sceneStyle: { backgroundColor: colors.background }");
    expect(tabsSource).toContain('tabBarStyle: { position: "relative"');
    expect(screenContainerSource).toContain('backgroundColor: colors.background');
    expect(ambientBackgroundSource).toContain("zIndex: 0");
  });

  it("indexes calendar markers and waitlist matches instead of rebuilding them for each visible item", () => {
    expect(calendarSource).toContain("const chaletMarkers = useMemo(() => Object.fromEntries(");
    expect(calendarSource).toContain("const calendarWaitlistIndex = useMemo(() => {");
    expect(calendarSource).toContain("chaletMarkers={chaletMarkers}");
    expect(bookingsSource).toContain("const activeWaitlistByBookingId = useMemo(() => {");
    expect(bookingsSource).toContain("activeWaitlistByBookingId.get(item.id)");
    expect(bookingsSource).not.toContain("const waitlistForBooking =");
    expect(glassSource).toContain("export const GlowGlassCard = memo(function GlowGlassCard");
  });

  it("renders booking cards in controlled virtualized batches without clipped Android rows", () => {
    expect(bookingsSource).toContain("<FlatList");
    expect(bookingsSource).toContain("keyExtractor={(item) => item.id}");
    expect(bookingsSource).toContain("initialNumToRender={3}");
    expect(bookingsSource).toContain("maxToRenderPerBatch={3}");
    expect(bookingsSource).toContain("windowSize={5}");
    expect(bookingsSource).toContain("removeClippedSubviews={false}");
  });
});
