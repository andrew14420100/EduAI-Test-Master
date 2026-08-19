import { randomBytes } from "crypto";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // excludes ambiguous 0/O/1/I

/**
 * Generate a stable 6-character invite code.
 */
export function generateInviteCode(): string {
  const bytes = randomBytes(6);
  return Array.from(bytes)
    .map((b) => CHARS[b % CHARS.length])
    .join("");
}
