/**
 * Regression checks for the paid quick-explanation endpoint.
 *
 * Run with:
 *   pnpm exec tsx --test src/routes/quiz.explanations.test.ts
 *
 * These guards intentionally inspect the endpoint source because the route
 * couples an Express handler, Drizzle transactions, and the managed AI client.
 * They make the cost-control ordering explicit: no model request is reachable
 * before a persisted, debited reservation is obtained.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "quiz.ts"), "utf8");
const endpointStart = source.indexOf('router.post(\n  "/study/explanations"');
const endpointEnd = source.indexOf('\n/**\n * GET /quiz/attempts', endpointStart);
const endpoint = source.slice(endpointStart, endpointEnd);

test("quick explanation reserves a paid slot before the model call", () => {
  const reservation = endpoint.indexOf("const reservation = await db.transaction");
  const modelCall = endpoint.indexOf("await generateQuickExplanation");

  assert.ok(reservation >= 0, "the endpoint must create a database reservation");
  assert.ok(modelCall >= 0, "the endpoint must call the explanation generator");
  assert.ok(reservation < modelCall, "the paid reservation must happen before the model call");
  assert.match(
    endpoint.slice(reservation, modelCall),
    /wallet} >= \$\{QUICK_EXPLANATION_COST\}/,
    "the reservation must atomically require sufficient wallet balance",
  );
  assert.match(
    endpoint.slice(reservation, modelCall),
    /status: "pending"/,
    "the reservation must hold the unique explanation row in pending state",
  );
});

test("non-approved or concurrent requests cannot reach the model", () => {
  const modelCall = endpoint.indexOf("await generateQuickExplanation");
  const beforeModel = endpoint.slice(0, modelCall);

  assert.match(beforeModel, /reservation\.kind === "ready"/);
  assert.match(beforeModel, /reservation\.kind === "pending"/);
  assert.match(beforeModel, /reservation\.kind === "insufficient"/);
  assert.match(beforeModel, /res\.status\(409\)/, "a concurrent pending request must return conflict");
  assert.match(beforeModel, /res\.status\(400\)/, "an insufficient-balance request must fail before generation");
});

test("a stale committed reservation is atomically reclaimed on retry", () => {
  const modelCall = endpoint.indexOf("await generateQuickExplanation");
  const reservationFlow = endpoint.slice(0, modelCall);

  assert.match(
    reservationFlow,
    /QUICK_EXPLANATION_RESERVATION_TTL_MS/,
    "pending reservations must have a finite lease",
  );
  assert.match(
    reservationFlow,
    /existing\.createdAt > reservationExpiry/,
    "only live leases may return a pending conflict",
  );
  assert.match(
    reservationFlow,
    /delete\(quickExplanationsTable\)[\s\S]*lt\(quickExplanationsTable\.createdAt, reservationExpiry\)/,
    "a stale reservation must be conditionally reclaimed",
  );
  assert.match(
    reservationFlow,
    /wallet} \+ \$\{reclaimed\[0\]!\.chargedPoints\}/,
    "reclaiming a stale reservation must refund its original debit",
  );
  assert.ok(
    reservationFlow.indexOf("const [profile] = await tx\n          .update(profilesTable)") >
      reservationFlow.indexOf("const reclaimed = await tx"),
    "the replacement reservation must debit only after the stale charge is refunded",
  );
});

test("a failed model generation releases the pending reservation and refunds points", () => {
  const modelCall = endpoint.indexOf("await generateQuickExplanation");
  const failureHandler = endpoint.slice(modelCall);

  assert.match(
    failureHandler,
    /delete\(quickExplanationsTable\)[\s\S]*status, "pending"/,
    "only the pending reservation should be released after failure",
  );
  assert.match(
    failureHandler,
    /wallet} \+ \$\{QUICK_EXPLANATION_COST\}/,
    "releasing a pending reservation must refund exactly the reserved points",
  );
});