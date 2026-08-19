import { clerkClient, getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

export interface AuthedRequest extends Request {
  clerkUserId: string;
}

export interface AdminRequest extends AuthedRequest {
  isAdmin: true;
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
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Non autorizzato" });
    return;
  }
  (req as AuthedRequest).clerkUserId = userId;
  next();
};

/**
 * Requires a signed-in Clerk user whose public metadata explicitly grants the
 * admin role. The server reads Clerk directly so a client-side route guard can
 * never grant access by itself.
 */
export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const userId = (req as AuthedRequest).clerkUserId;
  if (!userId) {
    res.status(401).json({ error: "Non autorizzato" });
    return;
  }
  try {
    const user = await clerkClient.users.getUser(userId);
    if (user.publicMetadata?.role !== "admin") {
      res.status(403).json({ error: "Accesso riservato all'amministratore" });
      return;
    }
    (req as AdminRequest).isAdmin = true;
    next();
  } catch (error) {
    req.log.error({ err: error, userId }, "Verifica ruolo amministratore non riuscita");
    res.status(503).json({ error: "Impossibile verificare i permessi amministrativi" });
  }
};
