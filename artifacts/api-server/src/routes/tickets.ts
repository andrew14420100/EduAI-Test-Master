import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, profilesTable, pushTokensTable, ticketMessagesTable, ticketsTable } from "@workspace/db";
import { requireAdminSession, requireAuth, type AdminSessionRequest, type AuthedRequest } from "../middlewares/requireAuth";

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
    unread: messagesByTicketId.get(ticket.id)?.some(
      (message) => message.authorRole === "admin"
        && (!ticket.readAt || message.createdAt > ticket.readAt),
    ) ?? false,
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

export function isInvalidPushTokenError(error: unknown) {
  return error === "DeviceNotRegistered"
    || error === "InvalidCredentials"
    || error === "PushTokenNotRegistered";
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

router.post("/push-tokens", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).clerkUserId;
  const { token, platform } = req.body as { token?: unknown; platform?: unknown };
  if (typeof token !== "string" || !token.startsWith("ExponentPushToken[") || token.length > 256) {
    res.status(400).json({ error: "Token push non valido" });
    return;
  }
  if (platform !== "ios" && platform !== "android") {
    res.status(400).json({ error: "Piattaforma non valida" });
    return;
  }
  try {
    await db.insert(pushTokensTable).values({
      id: randomUUID(),
      userId,
      token,
      platform,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: pushTokensTable.token,
      set: { userId, platform, updatedAt: new Date() },
    });
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Errore registrazione token push");
    res.status(500).json({ error: "Errore interno del server" });
  }
});

router.patch("/tickets/:ticketId/read", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).clerkUserId;
  const ticketId = req.params.ticketId as string;
  try {
    const [ticket] = await db
      .update(ticketsTable)
      .set({ readAt: new Date() })
      .where(and(eq(ticketsTable.id, ticketId), eq(ticketsTable.userId, userId)))
      .returning();
    if (!ticket) {
      res.status(404).json({ error: "Ticket non trovato" });
      return;
    }
    res.json((await ticketDetails([ticket]))[0]);
  } catch (err) {
    req.log.error({ err }, "Errore aggiornamento lettura ticket");
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
    void sendTicketPushNotifications(ticket.userId, ticket.id, ticket.subject, message.trim(), req);
    res.json((await ticketDetails([ticket]))[0]);
  } catch (err) {
    req.log.error({ err }, "Errore risposta ticket amministratore");
    res.status(500).json({ error: "Errore interno del server" });
  }
});

async function sendTicketPushNotifications(
  userId: string,
  ticketId: string,
  subject: string,
  message: string,
  req: Request,
) {
  try {
    const tokens = await db.select().from(pushTokensTable).where(eq(pushTokensTable.userId, userId));
    if (!tokens.length) return;
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokens.map(({ token }) => ({
        to: token,
        title: subject || "Risposta dall’assistenza",
        body: message,
        sound: "default",
        data: { type: "ticket-reply", ticketId },
      }))),
    });
    if (!response.ok) {
      req.log.warn({ status: response.status }, "Invio notifiche push non riuscito");
      return;
    }
    const result = await response.json() as {
      data?: Array<{ status?: string; details?: { error?: string } }>;
    };
    const invalidTokens = tokens.filter((_, index) =>
      isInvalidPushTokenError(result.data?.[index]?.details?.error),
    );
    if (invalidTokens.length) {
      await db.delete(pushTokensTable).where(inArray(pushTokensTable.token, invalidTokens.map(({ token }) => token)));
    }
  } catch (err) {
    req.log.warn({ err }, "Errore invio notifica push");
  }
}

export default router;
