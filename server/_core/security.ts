const TRUSTED_WEB_HOST_SUFFIXES = ["manuspre.computer"];
const APP_DEEP_LINK_SCHEME_PREFIX = "manus";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function parseAllowedOrigins(): Set<string> {
  const raw = process.env.CORS_ALLOWED_ORIGINS ?? "";
  return new Set(
    raw
      .split(",")
      .map((origin) => origin.trim().toLowerCase().replace(/\/+$/, ""))
      .filter(Boolean),
  );
}

export function isDevHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (LOCAL_HOSTNAMES.has(host)) return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

export function isTrustedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (isDevHostname(host)) return true;
  return TRUSTED_WEB_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

/**
 * Whether a browser request origin may receive credentialed CORS responses.
 * Replaces the previous reflect-any-origin behaviour with an explicit allowlist:
 * local dev hosts, the platform sandbox subdomains, or origins configured
 * through CORS_ALLOWED_ORIGINS (comma-separated).
 */
export function isAllowedWebOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (isTrustedHostname(url.hostname)) return true;
  const explicit = parseAllowedOrigins();
  return explicit.has(url.origin.toLowerCase());
}

/**
 * Whether a decoded OAuth `state` redirectUri is a trusted callback target
 * before it is forwarded to the identity exchange. Accepts our web callback
 * endpoints (same allowlist as CORS) and our custom deep-link scheme for
 * native builds. Rejects malformed or foreign values, closing the login CSRF
 * / open-redirect surface while preserving the platform state contract.
 */
export function isTrustedOAuthRedirect(redirectUri: string): boolean {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return false;
  }
  if (url.protocol === "http:" || url.protocol === "https:") {
    if (isTrustedHostname(url.hostname)) return true;
    return parseAllowedOrigins().has(url.origin.toLowerCase());
  }
  return url.protocol.toLowerCase().startsWith(`${APP_DEEP_LINK_SCHEME_PREFIX}:`);
}