import { Router, type IRouter, type Request, type Response } from "express";
import { desc } from "drizzle-orm";
import { db, profilesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

/**
 * GET /leaderboard — global leaderboard (username and wallet only)
 * Returns real profiles sorted by wallet descending.
 */
router.get(
  "/leaderboard",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const entries = await db
        .select({
          username: profilesTable.username,
          wallet: profilesTable.wallet,
        })
        .from(profilesTable)
        .orderBy(desc(profilesTable.wallet))
        .limit(100);
      res.json(entries);
    } catch (err) {
      req.log.error({ err }, "Errore leaderboard");
      res.status(500).json({ error: "Errore interno del server" });
    }
  },
);

export default router;
