import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

export interface AuthedRequest extends Request {
  clerkUserId: string;
}

export interface AdminRequest extends AuthedRequest {
  isAdmin: true;
}

export interface AdminSessionRequest extends Request {
  adminSessionId: string;
  adminId: string;
}

function safeTokenDiagnostics(value: string | undefined) {
  if (!value) return { tokenFormat: "missing" };
  const token = value.startsWith("Bearer ") ? value.slice(7).trim() : "";
  if (!token) return { tokenFormat: "not-bearer" };
  const parts = token.split(".");
  if (parts.length !== 3) return { tokenFormat: "not-jwt" };
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as {
      iss?: unknown;
      exp?: unknown;
      azp?: unknown;
    };
    return {
      tokenFormat: "jwt",
      issuer: typeof payload.iss === "string" ? payload.iss : "unknown",
      authorizedParty: typeof payload.azp === "string" ? payload.azp : "unknown",
      expired: typeof payload.exp === "number" ? payload.exp * 1000 <= Date.now() : "unknown",
    };
  } catch {
    return { tokenFormat: "invalid-payload" };
  }
}

/**
 * Requires a valid Clerk session. Attaches `clerkUserId` to the request.
 * Returns 401 if no authenticated session is found.
 */
export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const auth = getAuth(req);
  const claimedUserId = auth?.sessionClaims?.userId;
  const userId =
    typeof claimedUserId === "string" ? claimedUserId : auth?.userId;
  if (!userId) {
    req.log.warn(
      {
        hasAuthorizationHeader: Boolean(req.headers.authorization),
        token: safeTokenDiagnostics(req.headers.authorization),
      },
      "Richiesta autenticata senza sessione Clerk valida",
    );
    res.status(401).json({ error: "Non autorizzato" });
    return;
  }
  (req as AuthedRequest).clerkUserId = userId;
  next();
};

export const requireAdminSession = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const sessionId = req.header("x-admin-session");
  if (!sessionId) {
    res.status(401).json({ error: "Sessione amministratore richiesta" });
    return;
  }
  const session = adminSessions.get(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    if (session) adminSessions.delete(sessionId);
    res.status(401).json({ error: "Sessione amministratore scaduta" });
    return;
  }
  (req as AdminSessionRequest).adminSessionId = sessionId;
  (req as AdminSessionRequest).adminId = session.adminId;
  next();
};

type AdminSession = { adminId: string; expiresAt: number };
export const adminSessions = new Map<string, AdminSession>();
