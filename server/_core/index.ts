import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes, registerSupabaseAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { ensureGlobalFeatureFlagsTable, ensureSessionsTable, ensureUserCodeColumn, ensureUserCodes, ensureWorkspaceCodes, ensureWorkspaceFeatureSettingsTable, pruneExpiredSessions, seedDemoData } from "../db";
import { isAllowedWebOrigin } from "./security";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS - only respond to allowlisted origins (local dev, platform
  // sandbox subdomains, or explicit CORS_ALLOWED_ORIGINS). Unknown origins get
  // no credentials and no preflight grants.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && isAllowedWebOrigin(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization",
      );
      res.header("Access-Control-Allow-Credentials", "true");
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerSupabaseAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.post("/api/dev/seed", async (_req, res) => {
    if (process.env.NODE_ENV === "production") {
      res.status(404).json({ error: "Demo seeding disabled in production" });
      return;
    }
    try {
      await seedDemoData();
      res.json({ ok: true, message: "Demo data seeded successfully" });
    } catch (error) {
      console.error("[Seed] Demo seeding failed:", error);
      res.status(500).json({ error: "Failed to seed demo data" });
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  await ensureSessionsTable();
  await ensureGlobalFeatureFlagsTable();
  await ensureWorkspaceFeatureSettingsTable();
  await ensureUserCodeColumn();
  await ensureUserCodes();
  await ensureWorkspaceCodes();
  await pruneExpiredSessions();

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
