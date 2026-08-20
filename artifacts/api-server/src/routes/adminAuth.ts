import { Router, type Request, type Response } from "express";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { requireAdminSession, adminSessions } from "../middlewares/requireAuth";

const router = Router();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function safeSecretMatches(value: string, expected: string): boolean {
  const received = createHash("sha256").update(value).digest();
  const configured = createHash("sha256").update(expected).digest();
  return timingSafeEqual(received, configured);
}

router.post("/admin/auth/login", (req: Request, res: Response) => {
  const configuredSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
  const suppliedSecret = typeof req.body?.secret === "string" ? req.body.secret : "";
  if (!configuredSecret) {
    res.status(503).json({ error: "Accesso amministratore non configurato" });
    return;
  }
  if (!suppliedSecret || !safeSecretMatches(suppliedSecret, configuredSecret)) {
    res.status(401).json({ error: "Codice amministratore non valido" });
    return;
  }

  const sessionId = randomBytes(32).toString("hex");
  adminSessions.set(sessionId, { adminId: "admin", expiresAt: Date.now() + SESSION_TTL_MS });
  res.json({ sessionToken: sessionId, expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() });
});

router.get("/admin/auth/session", requireAdminSession, (_req, res) => {
  res.json({ authenticated: true });
});

router.post("/admin/auth/logout", requireAdminSession, (req, res) => {
  adminSessions.delete(req.header("x-admin-session")!);
  res.status(204).send();
});

export default router;