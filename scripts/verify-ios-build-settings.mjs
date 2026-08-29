import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
const workspace = path.join(
  projectRoot,
  'ios',
  'EduAITestMaster.xcworkspace',
);
const expectedHarnessSettings = {
  Debug: 'YES',
  Release: 'NO',
};

function settingValue(output, key) {
  const matches = [
    ...output.matchAll(
      new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*(.*?)\\s*$`, 'gm'),
    ),
  ];
  return matches.at(-1)?.[1];
}

function readBuildSettings(configuration) {
  try {
    return execFileSync(
      'xcodebuild',
      [
        '-workspace',
        workspace,
        '-scheme',
        'EduAITestMaster',
        '-configuration',
        configuration,
        '-sdk',
        'iphonesimulator',
        '-showBuildSettings',
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } catch (error) {
    const stdout = error.stdout?.toString() ?? '';
    const stderr = error.stderr?.toString() ?? '';
    throw new Error(
      `xcodebuild non ha restituito i settings per ${configuration}.\n${stdout}${stderr}`,
    );
  }
}

if (process.platform !== 'darwin') {
  console.error(
    'Verifica build settings iOS: eseguire su macOS con Xcode e CocoaPods installati.',
  );
  process.exit(1);
}

const errors = [];
for (const [configuration, expectedHarness] of Object.entries(
  expectedHarnessSettings,
)) {
  const output = readBuildSettings(configuration);
  const actualHarness = settingValue(
    output,
    'EDUAI_ICON_DEBUG_HARNESS_ENABLED',
  );
  const infoPlist = settingValue(output, 'INFOPLIST_FILE');

  if (actualHarness !== expectedHarness) {
    errors.push(
      `${configuration}: EDUAI_ICON_DEBUG_HARNESS_ENABLED = ${actualHarness ?? '(mancante)'}, atteso ${expectedHarness}`,
    );
  }
  if (infoPlist !== 'EduAITestMaster/Info.plist') {
    errors.push(
      `${configuration}: INFOPLIST_FILE = ${infoPlist ?? '(mancante)'}, atteso EduAITestMaster/Info.plist`,
    );
  }
}

if (errors.length > 0) {
  console.error('Verifica build settings iOS fallita:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  'Verifica build settings iOS superata: harness Debug attivo, Release disattivo.',
);