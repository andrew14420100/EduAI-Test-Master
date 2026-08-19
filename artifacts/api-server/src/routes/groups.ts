import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db, studyGroupsTable, groupMembershipsTable } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

async function getMemberCount(groupId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(groupMembershipsTable)
    .where(eq(groupMembershipsTable.groupId, groupId));
  return Number(result[0]?.count ?? 0);
}

async function withMemberCount(group: typeof studyGroupsTable.$inferSelect) {
  const memberCount = await getMemberCount(group.id);
  return { ...group, memberCount };
}

/**
 * GET /groups — list groups the current user is a member of
 */
router.get("/groups", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).clerkUserId;
  try {
    const memberships = await db
      .select()
      .from(groupMembershipsTable)
      .where(eq(groupMembershipsTable.userId, userId));

    const groupIds = memberships.map((m) => m.groupId);
    if (groupIds.length === 0) {
      res.json([]);
      return;
    }

    const groups = await db
      .select()
      .from(studyGroupsTable)
      .where(inArray(studyGroupsTable.id, groupIds));

    const withCounts = await Promise.all(groups.map(withMemberCount));
    res.json(withCounts);
  } catch (err) {
    req.log.error({ err }, "Errore lista gruppi");
    res.status(500).json({ error: "Errore interno del server" });
  }
});

/**
 * POST /groups — create a study group and auto-join as owner
 */
router.post("/groups", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthedRequest).clerkUserId;
  const { name, description, coverObjectPath } = req.body as {
    name?: string;
    description?: string;
    coverObjectPath?: string;
  };

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "Il nome del gruppo è obbligatorio" });
    return;
  }
  if (name.length > 64) {
    res.status(400).json({ error: "Nome troppo lungo (massimo 64 caratteri)" });
    return;
  }

  try {
    const groupId = randomUUID();
    const [group] = await db
      .insert(studyGroupsTable)
      .values({
        id: groupId,
        name: name.trim(),
        description: description ?? null,
        ownerId: userId,
        coverObjectPath: coverObjectPath ?? null,
      })
      .returning();

    // Auto-join creator as first member
    await db.insert(groupMembershipsTable).values({
      id: randomUUID(),
      groupId,
      userId,
    });

    res.status(201).json({ ...group, memberCount: 1 });
  } catch (err) {
    req.log.error({ err }, "Errore creazione gruppo");
    res.status(500).json({ error: "Errore interno del server" });
  }
});

/**
 * POST /groups/:groupId/join — join a study group
 */
router.post(
  "/groups/:groupId/join",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = (req as AuthedRequest).clerkUserId;
    const groupId = req.params.groupId as string;

    try {
      const [group] = await db
        .select()
        .from(studyGroupsTable)
        .where(eq(studyGroupsTable.id, groupId));

      if (!group) {
        res.status(404).json({ error: "Gruppo non trovato" });
        return;
      }

      // Check if already a member
      const [existing] = await db
        .select()
        .from(groupMembershipsTable)
        .where(
          sql`${groupMembershipsTable.groupId} = ${groupId} AND ${groupMembershipsTable.userId} = ${userId}`,
        );

      if (!existing) {
        await db.insert(groupMembershipsTable).values({
          id: randomUUID(),
          groupId,
          userId,
        });
      }

      const groupWithCount = await withMemberCount(group);
      res.json(groupWithCount);
    } catch (err) {
      req.log.error({ err }, "Errore iscrizione gruppo");
      res.status(500).json({ error: "Errore interno del server" });
    }
  },
);

export default router;
