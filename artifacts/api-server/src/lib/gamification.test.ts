import assert from "node:assert/strict";
import test from "node:test";
import { badgeIdsForProgress } from "./gamification";

test("achievement thresholds are deterministic", () => {
  assert.deepEqual(
    badgeIdsForProgress({ streak: 30, score: 10, totalQuestions: 10, completedQuizCount: 50 }),
    ["badge_streak3", "badge_streak7", "badge_streak30", "badge_first_100", "badge_quiz50"],
  );
  assert.deepEqual(
    badgeIdsForProgress({ streak: 2, score: 9, totalQuestions: 10, completedQuizCount: 49 }),
    [],
  );
});