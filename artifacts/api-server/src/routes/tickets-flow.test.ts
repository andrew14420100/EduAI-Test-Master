import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, "../../../../");
const read = (relativePath: string) => fs.readFileSync(path.join(workspace, relativePath), "utf8");

test("ticket flow keeps the initial request and admin reply in the user's history", () => {
  const route = read("artifacts/api-server/src/routes/tickets.ts");
  const context = read("context/AppContext.tsx");
  const profile = read("app/(tabs)/profile.tsx");
  const admin = read("app/admin.tsx");

  // Creation is user-owned and starts an open thread.
  assert.match(route, /where\(eq\(ticketsTable\.userId, userId\)\)/);
  assert.match(route, /status: "open"/);
  assert.match(route, /messages: \[/);
  assert.match(route, /id: `initial-\$\{ticket\.id\}`/);

  // The admin response is persisted as a message and close=true is durable.
  assert.match(route, /status: closing \? "closed" : current\.status === "closed" \? "closed" : "in_progress"/);
  assert.match(route, /closedAt: new Date\(\), closedBy: adminId/);
  assert.match(route, /authorRole: "admin"/);
  assert.match(route, /message: message\.trim\(\)/);

  // The user's profile consumes admin-authored messages and refreshes across sessions.
  assert.match(context, /useListTickets/);
  assert.match(context, /refetchInterval: dataEnabled \? 15_000 : false/);
  assert.match(profile, /entry\.authorRole === 'admin'/);
  assert.match(profile, /ticketStatusLabel\(ticket\.status\)/);

  // The console sends the close flag and refreshes its own list after replying.
  assert.match(admin, /data: \{ message: draft\.trim\(\), close \}/);
  assert.match(admin, /await tickets\.refetch\(\)/);
  assert.match(admin, /ticketStatusLabel\(ticket\.status\)/);
});
