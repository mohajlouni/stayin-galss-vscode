import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");

describe("Expo Go runtime safety", () => {
  it("declares the Expo Babel preset directly while preserving the NativeWind and worklets transforms", () => {
    const packageJson = read("package.json");
    const babel = read("babel.config.js");
    expect(packageJson).toContain('"babel-preset-expo": "~54.0.10"');
    expect(babel).toContain('"babel-preset-expo"');
    expect(babel).toContain('"nativewind/babel"');
    expect(babel).toContain('"react-native-worklets/plugin"');
  });

  it("recognizes Expo Go and excludes it from remote push registration without blocking local notifications", () => {
    const runtime = read("lib/notification-runtime.ts");
    const localCheckout = read("lib/checkout-notifications.ts");
    expect(runtime).toContain("ExecutionEnvironment.StoreClient");
    expect(runtime).toContain("AppOwnership.Expo");
    expect(runtime).toContain("Constants.appOwnership");
    expect(runtime).toContain("!isExpoGoRuntime()");
    expect(runtime).toContain("if (!canRegisterRemotePushNotifications()) return null");
    expect(runtime).toContain("Notifications.getExpoPushTokenAsync");
    expect(localCheckout).toContain("scheduleNotificationAsync");
  });

  it("keeps the New Architecture enabled because Reanimated 4 only runs on Fabric", () => {
    const appConfig = read("app.config.ts");
    const packageJson = read("package.json");
    // "Reanimated 4 works only with the React Native New Architecture." Disabling
    // Fabric leaves the worklet runtime uninitialized and Expo Go never renders.
    expect(appConfig).toContain("newArchEnabled: true");
    expect(appConfig).not.toContain("newArchEnabled: false");
    expect(packageJson).toContain('"react-native-reanimated": "~4.1.6"');
    expect(packageJson).toContain('"react-native-worklets": "0.5.1"');
  });

  it("never touches the expo-notifications barrel outside the guarded remote-push path", () => {
    const barrelStatic = /^import[^\n]*from "expo-notifications";$/m;
    const barrelDynamic = 'import("expo-notifications")';

    // `build/index.js` (the barrel) fires module-scope side effects that no runtime guard can
    // intercept: `console.warn` on line 5, plus the `DevicePushTokenAutoRegistration.fx`
    // (line 35) and `TokenEmitter` (line 38) re-exports. Those evaluate immediately and call
    // `addPushTokenListener` -> `warnOfExpoGoPushUsage()`, which uses `console.error` on
    // Android and therefore raises a red LogBox screen at startup in Expo Go.
    for (const path of ["lib/checkout-notifications.ts", "lib/waitlist-priority-notifications.ts"]) {
      const source = read(path);
      expect(source).not.toMatch(barrelStatic);
      expect(source).not.toContain(barrelDynamic);
      expect(source).toContain("loadLocalNotifications");
    }

    // The shared loader reaches platform leaves only, and no file inside build/ imports
    // `./index`, so the warn chain can never be pulled back in.
    const leaves = read("lib/local-notifications.ts");
    expect(leaves).not.toMatch(barrelStatic);
    expect(leaves).not.toContain(barrelDynamic);
    expect(leaves).toContain('import("expo-notifications/build/NotificationsHandler")');
    expect(leaves).toContain('import("expo-notifications/build/scheduleNotificationAsync")');

    // The remote-push path may use the barrel, but only lazily and only after the guard.
    const runtime = read("lib/notification-runtime.ts");
    expect(runtime).not.toMatch(barrelStatic);
    expect(runtime).toContain(barrelDynamic);
  });

  it("never animates a host-less SVG config node such as <Stop>", () => {
    const scene = read("components/glass-scene-background.tsx");
    // react-native-svg renders <Stop> as `null` (gradient config only, no native view), so
    // wrapping it in createAnimatedComponent makes Reanimated throw while resolving a tag.
    expect(scene).not.toContain("AnimatedStop");
    expect(scene).not.toContain("createAnimatedComponent(Stop)");
    expect(scene).toContain('stopColor={glowStopColor}');
    expect(scene).toContain('stopColor={coreStopColor}');
  });

  it("keeps a zero-size native host instead of `null` for root overlays and animated wrappers", () => {
    const rootLayout = read("app/_layout.tsx");
    const featureRouteGuard = read("components/feature-route-guard.tsx");
    const undoDeleteBanner = read("components/undo-delete-banner.tsx");

    // Root overlays mount as siblings of the root navigator: returning `null`
    // deletes their host node and breaks Reanimated host-instance lookups.
    [rootLayout, featureRouteGuard, undoDeleteBanner].forEach((source) => {
      expect(source).toContain('style={{ width: 0, height: 0, overflow: "hidden" }} pointerEvents="none" collapsable={false} />');
    });
    expect(rootLayout).not.toContain("if (!syncConflict) return null;");
    expect(featureRouteGuard).not.toContain("if (!blocked) return null;");
    expect(undoDeleteBanner).not.toContain("if (!lastDeleted) return null;");

    // Every Animated.View keeps an explicit native host so it can never collapse away.
    for (const path of [
      "components/unified-auth-screen.tsx",
      "components/ambient-screen-background.tsx",
      "components/dynamic-ambient-background.tsx",
      "components/glass-modal-motion.tsx",
      "components/home-top-widget.tsx",
      "components/parallax-scroll-view.tsx",
      "components/calendar-date-picker.tsx",
    ]) {
      expect(read(path)).toContain("collapsable={false}");
    }
  });

  it("restarts through the runtime-agnostic reload API instead of the Expo Go-hostile Updates.reloadAsync", () => {
    const preferences = read("lib/app-preferences.tsx");
    // `Updates.reloadAsync()` is rejected in Expo Go and development mode with
    // ERR_UPDATES_DISABLED, which left the app frozen after a language change.
    expect(preferences).not.toContain("Updates.reloadAsync");
    expect(preferences).not.toContain('from "expo-updates"');
    expect(preferences).toContain('import { reloadAppAsync } from "expo"');
    expect(preferences).toContain("await reloadAppAsync()");
  });
});
