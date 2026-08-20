import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { db, profilesTable, ticketMessagesTable, ticketsTable } from "@workspace/db";
import { requireAdminSession, requireAuth, type AdminSessionRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

async function ticketDetails(tickets: (typeof ticketsTable.$inferSelect)[]) {
  const ticketIds = tickets.map((ticket) => ticket.id);
  const messages = ticketIds.length
    ? await db
      .select()
      .from(ticketMessagesTable)
      .where(inArray(ticketMessagesTable.ticketId, ticketIds))
      .orderBy(ticketMessagesTable.createdAt)
    : [];
  const messagesByTicketId = new Map<string, typeof messages>();
  for (const message of messages) {
    const thread = messagesByTicketId.get(message.ticketId) ?? [];
    thread.push(message);
    messagesByTicketId.set(message.ticketId, thread);
  }
  return tickets.map((ticket) => ({
    ...ticket,
    messages: [
      {
        id: `initial-${ticket.id}`,
        ticketId: ticket.id,
        authorId: ticket.userId,
        authorRole: "user",
        message: ticket.message,
        createdAt: ticket.createdAt,
      },
      ...(messagesByTicketId.get(ticket.id) ?? []),
    ],
  }));
}

/**
 * GET /tickets — list tickets for current user
 */
router.get("/tickets", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).clerkUserId;
  try {
    const tickets = await db
      .select()
      .from(ticketsTable)
      .where(eq(ticketsTable.userId, userId))
      .orderBy(desc(ticketsTable.updatedAt));
    res.json(await ticketDetails(tickets));
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
    const ticket = await db.transaction(async (tx) => {
      const id = randomUUID();
      const [created] = await tx
        .insert(ticketsTable)
        .values({
          id,
          userId,
          subject: subject.trim(),
          category: category.trim(),
          message: message.trim(),
          status: "open",
        })
        .returning();
      return created!;
    });
    res.status(201).json((await ticketDetails([ticket]))[0]);
  } catch (err) {
    req.log.error({ err }, "Errore creazione ticket");
    res.status(500).json({ error: "Errore interno del server" });
  }
});

router.get("/admin/users", requireAdminSession, async (req: Request, res: Response) => {
  try {
    const users = await db
      .select({
        userId: profilesTable.userId,
        username: profilesTable.username,
        email: profilesTable.email,
        level: profilesTable.level,
        createdAt: profilesTable.createdAt,
      })
      .from(profilesTable)
      .orderBy(desc(profilesTable.createdAt))
      .limit(200);
    res.json(users);
  } catch (err) {
    req.log.error({ err }, "Errore elenco utenti amministratore");
    res.status(500).json({ error: "Errore interno del server" });
  }
});

router.get("/admin/tickets", requireAdminSession, async (req: Request, res: Response) => {
  try {
    const tickets = await db.select().from(ticketsTable).orderBy(desc(ticketsTable.updatedAt)).limit(300);
    const profiles = await db
      .select({ userId: profilesTable.userId, username: profilesTable.username, email: profilesTable.email })
      .from(profilesTable);
    const profileById = new Map(profiles.map((profile) => [profile.userId, profile]));
    const detailed = await ticketDetails(tickets);
    res.json(detailed.map((ticket) => ({ ...ticket, user: profileById.get(ticket.userId) ?? null })));
  } catch (err) {
    req.log.error({ err }, "Errore elenco ticket amministratore");
    res.status(500).json({ error: "Errore interno del server" });
  }
});

router.post("/admin/tickets/:ticketId/reply", requireAdminSession, async (req: Request, res: Response) => {
  const adminId = (req as AdminSessionRequest).adminId;
  const ticketId = req.params.ticketId as string;
  const { message, close } = req.body as { message?: unknown; close?: unknown };
  if (typeof message !== "string" || message.trim().length < 2 || message.trim().length > 4_000) {
    res.status(400).json({ error: "La risposta deve contenere da 2 a 4000 caratteri" });
    return;
  }
  try {
    const ticket = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(ticketsTable)
        .where(eq(ticketsTable.id, ticketId))
        .limit(1);
      if (!current) return null;
      const closing = close === true;
      const [updated] = await tx
        .update(ticketsTable)
        .set({
          // A normal reply preserves a resolved state; reopening requires a
          // deliberate user follow-up rather than an accidental admin click.
          status: closing ? "closed" : current.status === "closed" ? "closed" : "in_progress",
          updatedAt: new Date(),
          ...(closing
            ? { closedAt: new Date(), closedBy: adminId }
            : current.status === "closed"
              ? { closedAt: current.closedAt, closedBy: current.closedBy }
              : { closedAt: null, closedBy: null }),
        })
        .where(eq(ticketsTable.id, ticketId))
        .returning();
      await tx.insert(ticketMessagesTable).values({
        id: randomUUID(),
        ticketId,
        authorId: adminId,
        authorRole: "admin",
        message: message.trim(),
      });
      return updated;
    });
    if (!ticket) {
      res.status(404).json({ error: "Ticket non trovato" });
      return;
    }
    res.json((await ticketDetails([ticket]))[0]);
  } catch (err) {
    req.log.error({ err }, "Errore risposta ticket amministratore");
    res.status(500).json({ error: "Errore interno del server" });
  }
});

export default router;
