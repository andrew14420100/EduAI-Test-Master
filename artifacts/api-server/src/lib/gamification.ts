import { ownedShopItemsTable } from "@workspace/db";

export const ACHIEVEMENT_BADGES = {
  streak3: "badge_streak3",
  streak7: "badge_streak7",
  streak30: "badge_streak30",
  first100: "badge_first_100",
  quiz50: "badge_quiz50",
} as const;

export type AchievementBadgeId = typeof ACHIEVEMENT_BADGES[keyof typeof ACHIEVEMENT_BADGES];

/**
 * Achievement rows use the same ownership table as shop rewards so existing
 * profiles keep their collection without a destructive migration. The unique
 * user/item constraint makes awarding safe to repeat.
 */
export async function awardAchievementBadges(
  tx: any,
  userId: string,
  badgeIds: AchievementBadgeId[],
) {
  for (const itemId of [...new Set(badgeIds)]) {
    await tx
      .insert(ownedShopItemsTable)
      .values({
        id: crypto.randomUUID(),
        userId,
        itemId,
        itemType: "distintivo",
        equipped: false,
      })
      .onConflictDoNothing({
        target: [ownedShopItemsTable.userId, ownedShopItemsTable.itemId],
      });
  }
}

export function badgeIdsForProgress(input: {
  streak: number;
  score: number;
  totalQuestions: number;
  completedQuizCount: number;
}) {
  const ids: AchievementBadgeId[] = [];
  if (input.streak >= 3) ids.push(ACHIEVEMENT_BADGES.streak3);
  if (input.streak >= 7) ids.push(ACHIEVEMENT_BADGES.streak7);
  if (input.streak >= 30) ids.push(ACHIEVEMENT_BADGES.streak30);
  if (input.score === input.totalQuestions) ids.push(ACHIEVEMENT_BADGES.first100);
  if (input.completedQuizCount >= 50) ids.push(ACHIEVEMENT_BADGES.quiz50);
  return ids;
}