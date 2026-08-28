export const MIN_JWT_SECRET_LENGTH = 32;

export function requireStrongJwtSecret(secret: string | undefined, isProduction: boolean): string {
  const value = secret ?? "";
  if (isProduction && value.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must contain at least ${MIN_JWT_SECRET_LENGTH} characters in production.`);
  }
  return value;
}

/** Prefers the project-owned secret while retaining compatibility with the platform JWT secret. */
export function resolveSessionSecret(environment: Record<string, string | undefined> = process.env): string | undefined {
  return environment.HAJEZ_SESSION_SECRET || environment.JWT_SECRET;
}

const isProduction = process.env.NODE_ENV === "production";

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: requireStrongJwtSecret(resolveSessionSecret(), isProduction),
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction,
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
