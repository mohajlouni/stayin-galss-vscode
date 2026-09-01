import type { Express } from "express";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { matchesSuperAdminIdentity } from "./identity";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    // Only authenticated sessions may resolve signed storage URLs. Super admin
    // can read any key; regular users are scoped to their own profile uploads;
    // non-profile keys (e.g. generated assets) require any authenticated user.
    try {
      const user = await sdk.authenticateRequest(req);
      const isSuperAdmin = matchesSuperAdminIdentity(user, ENV.ownerOpenId);
      if (!isSuperAdmin && key.startsWith("profiles/") && !key.startsWith(`profiles/${user.openId}/`)) {
        res.status(403).send("Forbidden");
        return;
      }
    } catch {
      res.status(401).send("Unauthorized");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
