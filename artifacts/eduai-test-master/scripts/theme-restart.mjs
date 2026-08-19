#!/usr/bin/env node
/**
 * Cold-start visual regression check for the native splash -> first screen
 * transition.
 *
 * This runner intentionally delegates device lifecycle and screenshots to
 * Maestro. It does not compare a single screenshot: every captured frame is
 * checked, so a one-frame flash cannot be hidden by a later stable frame.
 *
 * Usage:
 *   pnpm --filter @workspace/eduai-test-master run test:theme-restart
 *
 * Required tools:
 *   - maestro
 *   - adb (Android device/emulator)
 *   - ImageMagick's `identify`
 *
 * A signed-in test account must be present on the device. The runner writes
 * the same AsyncStorage record the app reads, then performs a cold launch.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const packageId = process.env.EDUAI_ANDROID_PACKAGE ?? 'com.eduai.testmaster';
const root = new URL('..', import.meta.url).pathname;
const flow = join(root, 'e2e', 'theme-restart.yaml');
const output = process.env.EDUAI_THEME_FRAMES ?? join(tmpdir(), 'eduai-theme-frames');

if (!existsSync(flow)) throw new Error(`Missing Maestro flow: ${flow}`);
mkdirSync(output, { recursive: true });

function run(command, args, cwd = root) {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

function seed(value) {
  // The development-only deep-link hook writes the same AsyncStorage key the
  // app uses after the signed-in user's id is available.
  run('adb', ['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW',
    '-d', `eduai-test-master://theme-test?value=${value}`, packageId]);
  run('adb', ['shell', 'am', 'force-stop', packageId]);
}

function capture(scenario, value) {
  seed(value);
  const scenarioDir = join(output, scenario);
  mkdirSync(scenarioDir, { recursive: true });
  // Maestro screenshots are useful for the settled UI, but its launch
  // command can wait past a very short splash flash. Poll the device surface
  // directly while the app is starting so the assertion includes that window.
  run('adb', ['shell', 'monkey', '-p', packageId, '1']);
  const deadline = Date.now() + 2500;
  let frame = 0;
  while (Date.now() < deadline) {
    writeFileSync(join(scenarioDir, `native-${String(frame).padStart(3, '0')}.png`),
      execFileSync('adb', ['exec-out', 'screencap', '-p']));
    frame += 1;
  }
  run('maestro', ['test', flow], scenarioDir);
  const screenshots = readdirSync(scenarioDir)
    .filter((file) => file.endsWith('.png'))
    .map((file) => join(scenarioDir, file));
  if (screenshots.length === 0) throw new Error(`Maestro produced no frames for ${scenario}.`);
  return screenshots;
}

function isLightFrame(file) {
  const result = run('identify', ['-format', '%[mean]', file]).trim();
  const mean = Number(result);
  if (!Number.isFinite(mean)) throw new Error(`Could not read brightness for ${file}.`);
  return mean > 0.72;
}

const darkFrames = capture('dark', 'dark');
const lightFrames = capture('fallback-light', 'none');
const darkFlash = darkFrames.find(isLightFrame);
if (darkFlash) {
  throw new Error(`Dark restart briefly rendered a light frame: ${darkFlash}`);
}
if (!lightFrames.some(isLightFrame)) {
  throw new Error('Fallback-light restart never rendered a light frame.');
}

console.log(`Theme restart check passed (${darkFrames.length} dark, ${lightFrames.length} light frames).`);
rmSync(output, { recursive: true, force: true });