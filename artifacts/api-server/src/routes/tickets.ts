import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db, ticketsTable } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

/**
 * GET /tickets — list tickets for current user
 */
router.get("/tickets", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).clerkUserId;
  try {
    const tickets = await db
      .select()
      .from(ticketsTable)
      .where(eq(ticketsTable.userId, userId));
    res.json(tickets);
  } catch (err) {
    req.log.error({ err }, "Errore lista ticket");
    res.status(500).json({ error: "Errore interno del server" });
  }
});

/**
 * POST /tickets — create a support ticket
 */
router.post("/tickets", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).clerkUserId;
  const { subject, category, message } = req.body as {
    subject?: string;
    category?: string;
    message?: string;
  };

  if (!subject || typeof subject !== "string" || subject.trim().length === 0) {
    res.status(400).json({ error: "Il campo subject è obbligatorio" });
    return;
  }
  if (subject.length > 128) {
    res
      .status(400)
      .json({ error: "Subject troppo lungo (massimo 128 caratteri)" });
    return;
  }
  if (
    !category ||
    typeof category !== "string" ||
    category.trim().length === 0
  ) {
    res.status(400).json({ error: "Il campo category è obbligatorio" });
    return;
  }
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "Il campo message è obbligatorio" });
    return;
  }

  try {
    const [ticket] = await db
      .insert(ticketsTable)
      .values({
        id: randomUUID(),
        userId,
        subject: subject.trim(),
        category: category.trim(),
        message: message.trim(),
        status: "open",
      })
      .returning();
    res.status(201).json(ticket);
  } catch (err) {
    req.log.error({ err }, "Errore creazione ticket");
    res.status(500).json({ error: "Errore interno del server" });
  }
});

export default router;
