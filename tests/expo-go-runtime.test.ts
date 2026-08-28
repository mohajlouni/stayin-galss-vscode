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
    expect(runtime).toContain("!isExpoGoRuntime()");
    expect(runtime).toContain("if (!canRegisterRemotePushNotifications()) return null");
    expect(runtime).toContain("Notifications.getExpoPushTokenAsync");
    expect(localCheckout).toContain("scheduleNotificationAsync");
  });
});
