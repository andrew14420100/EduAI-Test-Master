import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

export interface AuthedRequest extends Request {
  clerkUserId: string;
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
