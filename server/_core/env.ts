export const MIN_JWT_SECRET_LENGTH = 32;
export const MIN_MASTER_PASSWORD_LENGTH = 12;
export const MASTER_PIN_LENGTH = 4;

export function requireStrongJwtSecret(secret: string | undefined, isProduction: boolean): string {
  const value = secret ?? "";
  if (isProduction && value.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must contain at least ${MIN_JWT_SECRET_LENGTH} characters in production.`);
  }
  return value;
}

/**
 * Resolves a super-admin secret strictly from the environment. Production
 * refuses to boot when the secret is missing or shorter than the minimum so a
 * misconfigured deploy fails fast instead of silently disabling the backdoor.
 */
function requireMasterSecret(value: string | undefined, name: string, minLength: number): string {
  const secret = value ?? "";
  if (isProduction && secret.length < minLength) {
    throw new Error(`${name} must be set to at least ${minLength} characters in production.`);
  }
  return secret;
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
  /** Super-admin master password; read ONLY from the environment. Never hardcode. */
  superAdminMasterPassword: requireMasterSecret(process.env.SUPER_ADMIN_MASTER_PASSWORD, "SUPER_ADMIN_MASTER_PASSWORD", MIN_MASTER_PASSWORD_LENGTH),
  /** Master emergency PIN for the owner-level tool gate; read ONLY from the environment. */
  superAdminMasterPin: requireMasterSecret(process.env.SUPER_ADMIN_MASTER_PIN, "SUPER_ADMIN_MASTER_PIN", MASTER_PIN_LENGTH),
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
