/**
 * Regression checks for aggregated labs and the immutable study path.
 *
 * These endpoints depend on Drizzle, Clerk middleware, and the managed AI
 * client, so the tests inspect the route contract without a live database or
 * model call. The assertions deliberately cover the guards and their order:
 * they are the behavior that prevents empty catalogs, duplicate generation,
 * and accidental path changes.
 *
 * Run with:
 *   pnpm exec tsx --test artifacts/api-server/src/routes/labs-and-path.test.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { hasLabsByDefault } from "../lib/labPath.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const labsSource = fs.readFileSync(path.join(here, "labs.ts"), "utf8");
const profileSource = fs.readFileSync(path.join(here, "profile.ts"), "utf8");
const onboardingSource = fs.readFileSync(
  path.join(here, "../../../../app/onboarding.tsx"),
  "utf8",
);

function endpoint(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.ok(startIndex >= 0, `endpoint marker not found: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  return source.slice(startIndex, endIndex === -1 ? undefined : endIndex);
}

test("empty or non-ready materials expose no exercises and reject generation", () => {
  const generation = endpoint(
    labsSource,
    'router.post("/labs/generate"',
    'router.post("/materials/:materialId/labs"',
  );
  const exercises = endpoint(
    labsSource,
    'router.get("/labs/exercises"',
    'router.get("/labs/exercises/:id"',
  );

  assert.match(
    generation,
    /eq\(materialsTable\.extractionStatus, "ready"\)/,
    "generation must only load ready materials",
  );
  assert.match(
    generation,
    /material\.extractedText\?\.trim\(\)/,
    "generation must require meaningful extracted text",
  );
  assert.match(
    generation,
    /if \(!readyMaterials\.length\)[\s\S]*?res\.status\(409\)/,
    "generation must reject when no material is ready",
  );
  assert.match(
    exercises,
    /eq\(materialsTable\.extractionStatus, "ready"\)[\s\S]*?if \(!sourceIds\.length\)[\s\S]*?exercises = \[\]/,
    "exercise listing must return an empty catalog without ready materials",
  );
});

test("ready materials are aggregated into one lab and generation is idempotent", () => {
  const generation = endpoint(
    labsSource,
    'router.post("/labs/generate"',
    'router.post("/materials/:materialId/labs"',
  );
  const materialsQuery = generation.indexOf("const materials = await db");
  const sourceAggregation = generation.indexOf("readyMaterials\n      .map");
  const insert = generation.indexOf("await db.insert(labExercisesTable).values(rows)");
  const existingGuard = generation.indexOf("const existing = await db");
  const noDuplicateResponse = generation.indexOf("res.json({ created: 0");

  assert.ok(materialsQuery >= 0, "generation must query the material collection");
  assert.ok(sourceAggregation > materialsQuery, "all ready materials must feed one source prompt");
  assert.match(
    generation,
    /\.map\(\(material\) => `MATERIALE: \$\{material\.title\}/,
    "the prompt must include each ready material",
  );
  assert.ok(existingGuard > materialsQuery, "duplicate detection must happen after loading ready materials");
  assert.ok(noDuplicateResponse > existingGuard, "duplicates must return without calling the model");
  assert.ok(insert > noDuplicateResponse, "new exercises are inserted only after the duplicate guard");
  assert.match(
    generation,
    /res\.status\(201\)\.json\(\{ created: rows\.length, existing: 0, materialCount: readyMaterials\.length \}\)/,
    "the response must describe one aggregated generation",
  );
  assert.match(
    generation,
    /readyMaterials\[index % readyMaterials\.length\][\s\S]*?sourceMaterialId: material\.id/,
    "generated exercises must remain traceable to the aggregated sources",
  );
});

test("the saved study path cannot be changed through the API", () => {
  const levelPatch = endpoint(
    profileSource,
    'router.patch(\n  "/profile/level"',
    "export default router",
  );
  const profilePut = endpoint(
    profileSource,
    'router.put("/profile"',
    "/**\n * PATCH /profile/level",
  );

  assert.match(
    levelPatch,
    /isNull\(profilesTable\.level\)/,
    "level updates must only target profiles without a saved path",
  );
  assert.match(
    levelPatch,
    /res\.status\(profile\?\.level\s*\?\s*409\s*:\s*404\)/,
    "a saved path must produce a conflict instead of being overwritten",
  );
  assert.match(
    profilePut,
    /if \(existing\)[\s\S]*?res\.json\(toPublicProfile\(existing\)\)/,
    "profile upsert must preserve the existing profile after onboarding",
  );
});

test("onboarding locks the selected path in the client", () => {
  assert.match(
    onboardingSource,
    /disabled=\{Boolean\(level\)\}/,
    "saved paths must disable every onboarding option",
  );
  assert.match(
    onboardingSource,
    /level \? <IconButton name="close"/,
    "reopening onboarding is only available after a path already exists",
  );
  assert.match(
    onboardingSource,
    /Il tuo percorso è stato salvato e non può essere modificato/,
    "the locked state must explain why the path cannot change",
  );
  assert.match(
    onboardingSource,
    /\{level \? \([\s\S]*?Percorso bloccato dopo la prima scelta/,
    "the save action must be replaced with the locked notice",
  );
});

test("onboarding keeps the draft and retries the same save after an API failure", () => {
  assert.match(
    onboardingSource,
    /AsyncStorage\.setItem\(draftKey, JSON\.stringify\(draft\)\)/,
    "the form must persist the current draft locally",
  );
  assert.match(
    onboardingSource,
    /label: 'Riprova'[\s\S]*void save\(\)/,
    "the error action must retry the onboarding save",
  );
  assert.match(
    onboardingSource,
    /if \(result\.ok\)[\s\S]*?router\.replace\('\/\(tabs\)'/,
    "the app must navigate only after the server confirms the save",
  );
});

test("humanities paths stay opt-in while STEM paths keep labs by default", () => {
  assert.equal(hasLabsByDefault("Liceo Classico"), false);
  assert.equal(hasLabsByDefault("Liceo Scientifico"), true);
  assert.equal(hasLabsByDefault(null), false);
});