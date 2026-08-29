import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const consts = readFileSync(resolve(process.cwd(), "shared/const.ts"), "utf8");
const schema = readFileSync(resolve(process.cwd(), "drizzle/schema.ts"), "utf8");
const sdk = readFileSync(resolve(process.cwd(), "server/_core/sdk.ts"), "utf8");
const oauth = readFileSync(resolve(process.cwd(), "server/_core/oauth.ts"), "utf8");
const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
const dbSource = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");

describe("H-02 closure: session lifetime and revocation", () => {
  it("caps sessions at 8 hours instead of one year", () => {
    expect(consts).toContain("SESSION_TTL_MS = 8 * 60 * 60 * 1000");
  });

  it("records every issued session in a dedicated stayInSessions table", () => {
    expect(schema).toContain("stayInSessions");
    expect(schema).toContain('jti: varchar("jti", { length: 191 }).primaryKey()');
    expect(schema).toContain('revokedAt: timestamp("revokedAt")');
    expect(dbSource).toContain("createSessionRecord");
    expect(dbSource).toContain("getSessionRecord");
    expect(dbSource).toContain("revokeSessionByJti");
    expect(dbSource).toContain("ensureSessionsTable");
  });

  it("issues tokens with a unique jti and rejects revoked or expired sessions server-side", () => {
    expect(sdk).toContain("randomBytes(16)");
    expect(sdk).toContain("jti: string");
    expect(sdk).toContain("db.createSessionRecord");
    expect(sdk).toContain("db.getSessionRecord");
    expect(sdk).toContain("record.revokedAt");
    expect(sdk).toContain("SESSION_TTL_MS");
    expect(sdk).not.toContain("expiresInMs ?? ONE_YEAR_MS");
  });

  it("revokes the presented token on every logout path", () => {
    expect(oauth).toContain("sdk.revokeSessionToken");
    expect(oauth).toContain("sessionTokenFromRequest(req)");
    expect(routers).toContain("sdk.revokeSessionToken(sessionTokenFromRequest(ctx.req))");
    expect(sdk).toContain("revokeSessionToken");
    expect(sdk).toContain("db.revokeSessionByJti");
  });

  it("no longer issues one-year sessions from any auth route", () => {
    expect(oauth).not.toContain("ONE_YEAR_MS");
  });
});