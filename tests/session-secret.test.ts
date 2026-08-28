import { describe, expect, it } from "vitest";

import { MIN_JWT_SECRET_LENGTH, requireStrongJwtSecret, resolveSessionSecret } from "../server/_core/env";

describe("session signing secret", () => {
  it("rejects a missing or short secret in production", () => {
    expect(() => requireStrongJwtSecret(undefined, true)).toThrow("JWT_SECRET");
    expect(() => requireStrongJwtSecret("short-secret", true)).toThrow("JWT_SECRET");
  });

  it("accepts a strong production secret and a local development fallback", () => {
    const strongSecret = "a".repeat(MIN_JWT_SECRET_LENGTH);
    expect(requireStrongJwtSecret(strongSecret, true)).toBe(strongSecret);
    expect(requireStrongJwtSecret(undefined, false)).toBe("");
  });

  it("prefers the project-owned production secret over a platform fallback", () => {
    expect(resolveSessionSecret({ HAJEZ_SESSION_SECRET: "project-secret", JWT_SECRET: "platform-secret" })).toBe("project-secret");
    expect(resolveSessionSecret({ JWT_SECRET: "platform-secret" })).toBe("platform-secret");
  });

  it("accepts the configured production session secret without exposing its value", () => {
    const configured = resolveSessionSecret();
    expect(configured?.length ?? 0).toBeGreaterThanOrEqual(MIN_JWT_SECRET_LENGTH);
    expect(() => requireStrongJwtSecret(configured, true)).not.toThrow();
  });
});
