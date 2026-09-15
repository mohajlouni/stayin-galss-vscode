/**
 * Test-environment configuration (Vitest setup only).
 *
 * Super-admin secrets are mocked HERE — the dedicated test config — never in
 * production code. Production resolves `SUPER_ADMIN_MASTER_PASSWORD` /
 * `SUPER_ADMIN_MASTER_PIN` strictly from real environment variables via
 * `server/_core/env.ts`. These fallbacks exist solely so test suites can
 * exercise the env-driven code paths deterministically.
 */
process.env.SUPER_ADMIN_MASTER_PASSWORD = process.env.SUPER_ADMIN_MASTER_PASSWORD || "test-super-admin-password";
process.env.SUPER_ADMIN_MASTER_PIN = process.env.SUPER_ADMIN_MASTER_PIN || "1357";