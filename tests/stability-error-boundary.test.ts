import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const project = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Stability: unified error boundary and secure storage", () => {
  it("wraps the root navigation with an Arabic error boundary that can recover", () => {
    const root = project("app/_layout.tsx");
    const boundary = project("components/error-boundary.tsx");
    expect(root).toContain("<AppErrorBoundary>");
    expect(root).toContain("</AppErrorBoundary>");
    expect(boundary).toContain("class AppErrorBoundary");
    expect(boundary).toContain("componentDidCatch");
    expect(boundary).toContain("getDerivedStateFromError");
    expect(boundary).toContain("إعادة المحاولة");
    expect(boundary).toContain("resolveErrorMessage");
  });

  it("keeps the session token private and moves the registration draft out of AsyncStorage", () => {
    const session = project("lib/_core/auth.ts");
    const consent = project("lib/legal-consent.ts");
    expect(session).toContain('import * as SecureStore from "expo-secure-store";');
    expect(session).not.toContain("AsyncStorage");
    expect(consent).toContain("expo-secure-store");
    expect(consent).not.toContain("AsyncStorage");
    expect(consent).toContain("LEGAL_VERSIONS");
  });

  it("maps unknown errors to clear Arabic messages through the shared resolver", () => {
    const errors = project("lib/errors.ts");
    expect(errors).toContain("class AppError");
    expect(errors).toContain("resolveErrorMessage");
    expect(errors).toContain("تعذر الاتصال بالخادم");
    expect(errors).toContain("لا تملك صلاحية تنفيذ هذا الإجراء");
  });
});