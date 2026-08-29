import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);

const REQUIRED_ALTERNATE_ICON_IDS = [
  'app_icon_midnight',
  'app_icon_neon',
  'app_icon_scholar',
  'app_icon_aurora',
  'app_icon_legend',
];
const EXPECTED_ICON_IDS = ['standard', ...REQUIRED_ALTERNATE_ICON_IDS];
const ANDROID_ALIASES = {
  standard: 'StandardLauncher',
  app_icon_midnight: 'MidnightLauncher',
  app_icon_neon: 'NeonLauncher',
  app_icon_scholar: 'ScholarLauncher',
  app_icon_aurora: 'AuroraLauncher',
  app_icon_legend: 'LegendLauncher',
};
const ANDROID_RESOURCE_NAMES = {
  standard: 'ic_launcher',
  app_icon_midnight: 'ic_launcher_midnight',
  app_icon_neon: 'ic_launcher_neon',
  app_icon_scholar: 'ic_launcher_scholar',
  app_icon_aurora: 'ic_launcher_aurora',
  app_icon_legend: 'ic_launcher_legend',
};
const IOS_ICON_NAMES = {
  standard: 'AppIcon',
  app_icon_midnight: 'midnight',
  app_icon_neon: 'neon',
  app_icon_scholar: 'scholar',
  app_icon_aurora: 'aurora',
  app_icon_legend: 'legend',
};

const errors = [];

function readSource(relativePath, label) {
  const absolutePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`${label}: file mancante (${relativePath})`);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function sourceBlock(source, startPattern, endPattern) {
  const start = source.search(startPattern);
  if (start < 0) return '';
  const rest = source.slice(start);
  const end = rest.search(endPattern);
  return end < 0 ? rest : rest.slice(0, end);
}

function setFromMatches(source, pattern) {
  return new Set([...source.matchAll(pattern)].map((match) => match[1]));
}

function formatIds(ids) {
  return [...ids].sort().join(', ') || '(nessuno)';
}

function compareIds(label, actual, expected) {
  for (const id of expected) {
    if (!actual.has(id)) {
      errors.push(`${label}: ID "${id}" mancante`);
    }
  }
  for (const id of actual) {
    if (!expected.includes(id)) {
      errors.push(`${label}: ID "${id}" inatteso "${id}"`);
    }
  }
}

function compareMappings(label, actual, expected) {
  compareIds(label, new Set(actual.keys()), Object.keys(expected));
  for (const [id, expectedValue] of Object.entries(expected)) {
    const actualValue = actual.get(id);
    if (actualValue !== undefined && actualValue !== expectedValue) {
      errors.push(
        `${label}: "${id}" punta a "${actualValue}", atteso "${expectedValue}"`,
      );
    }
  }
}

function escapedRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseXcodeConfigurationList(source, projectOrTargetName) {
  const listMatch = source.match(
    new RegExp(
      `\\/\\*\\s*${escapedRegExp(projectOrTargetName)}\\s*\\*\\/\\s*=\\s*\\{\\s*isa = XCConfigurationList;\\s*buildConfigurations = \\(([\\s\\S]*?)\\n\\s*\\);`,
    ),
  );
  if (!listMatch) return new Map();

  return new Map(
    [...listMatch[1].matchAll(/^\s*([A-Za-z0-9]+)\s*\/\*\s*([^*]+?)\s*\*\/,/gm)]
      .map((match) => [match[2].trim(), match[1]]),
  );
}

function parseXcodeBuildConfiguration(source, id) {
  if (!id) return null;
  const configurationMatch = source.match(
    new RegExp(
      `(?:^|\\n)\\s*${escapedRegExp(id)}\\s+\\/\\*[^*]+\\*\\/\\s*=\\s*\\{\\s*isa = XCBuildConfiguration;\\s*buildSettings = \\{([\\s\\S]*?)\\n\\s*\\};\\s*name = ([^;]+);`,
    ),
  );
  if (!configurationMatch) return null;

  return {
    buildSettings: configurationMatch[1],
    name: configurationMatch[2].trim(),
  };
}

function xcodeBuildSettingValue(buildSettings, key) {
  return buildSettings.match(
    new RegExp(`(?:^|\\n)\\s*${escapedRegExp(key)}\\s*=\\s*([^;]+);`),
  )?.[1].trim();
}

function hasXcodePreprocessorDefinition(buildSettings, definition) {
  const definitions = buildSettings.match(
    /GCC_PREPROCESSOR_DEFINITIONS\s*=\s*\(([\s\S]*?)\);/,
  )?.[1];
  return definitions
    ? new RegExp(`["']?${escapedRegExp(definition)}["']?`).test(definitions)
    : false;
}

const serverCatalogSource = readSource(
  'artifacts/api-server/src/routes/shop.ts',
  'Catalogo server',
);
const serverCatalog = sourceBlock(
  serverCatalogSource,
  /const SHOP_CATALOG\b/,
  /\n};/,
);
const serverIconIds = setFromMatches(
  serverCatalog,
  /(?:^|\n)\s*(app_icon_[a-z0-9_]+)\s*:\s*\{\s*itemType:\s*"icona_futura"/g,
);
if (serverIconIds.size !== REQUIRED_ALTERNATE_ICON_IDS.length) {
  errors.push(
    `Catalogo server: attese esattamente ${REQUIRED_ALTERNATE_ICON_IDS.length} icone alternative, trovate ${serverIconIds.size} (${formatIds(serverIconIds)})`,
  );
}
compareIds(
  'Catalogo server',
  serverIconIds,
  REQUIRED_ALTERNATE_ICON_IDS,
);

const clientCatalogSource = readSource('context/AppContext.tsx', 'Catalogo client');
const clientCatalog = sourceBlock(
  clientCatalogSource,
  /const shopCatalog\b/,
  /\n];/,
);
const clientIconIds = setFromMatches(
  clientCatalog,
  /(?:^|\n)\s*\{\s*id:\s*'([^']+)'\s*,[^}]*itemType:\s*'icona_futura'/g,
);
compareIds('Catalogo client', clientIconIds, REQUIRED_ALTERNATE_ICON_IDS);
for (const id of REQUIRED_ALTERNATE_ICON_IDS) {
  if (serverIconIds.has(id) !== clientIconIds.has(id)) {
    errors.push(`Catalogo server/client: "${id}" non è presente in entrambi i cataloghi`);
  }
}

const nativeBridgeSource = readSource('lib/nativeAppIcon.ts', 'Bridge TypeScript');
const nativeIconType = nativeBridgeSource.match(
  /export type NativeAppIconId =([\s\S]*?);/,
);
const nativeBridgeIds = nativeIconType
  ? setFromMatches(nativeIconType[1], /'([^']+)'/g)
  : new Set();
compareIds('Bridge TypeScript', nativeBridgeIds, EXPECTED_ICON_IDS);

const androidModuleSource = readSource(
  'android/app/src/main/java/com/eduai/testmaster/AppIconManagerModule.kt',
  'Bridge Android',
);
const androidMapBlock = sourceBlock(
  androidModuleSource,
  /ICON_ALIASES\s*=\s*mapOf\(/,
  /\n\s*\)/,
);
const androidBridgeMappings = new Map(
  [...androidMapBlock.matchAll(/^\s*"([^"]+)"\s+to\s+"([^"]+)",?/gm)]
    .map((match) => [match[1], match[2]]),
);
compareMappings('Bridge Android', androidBridgeMappings, ANDROID_ALIASES);

const iosBridgeSource = readSource(
  'ios/EduAITestMaster/AppIconManager.m',
  'Bridge iOS',
);
const iosBridgeMappings = new Map();
for (const match of iosBridgeSource.matchAll(
  /if\s*\(\[iconId isEqualToString:@"([^"]+)"\]\)\s*\{([\s\S]*?)\}/g,
)) {
  const iconName = match[2].match(
    /alternateIconName\s*=\s*(nil|@"([^"]+)")/,
  );
  if (iconName) {
    iosBridgeMappings.set(match[1], iconName[2] ?? null);
  }
}
compareMappings('Bridge iOS', iosBridgeMappings, {
  ...IOS_ICON_NAMES,
  standard: null,
});

const manifestSource = readSource(
  'android/app/src/main/AndroidManifest.xml',
  'Manifest Android',
);
const manifestAliases = new Map();
for (const match of manifestSource.matchAll(
  /<activity-alias\b([^>]+)>([\s\S]*?)<\/activity-alias>/g,
)) {
  const attributes = match[1];
  const name = attributes.match(/android:name="\.([^"]+)"/)?.[1];
  const icon = attributes.match(/android:icon="@mipmap\/([^"]+)"/)?.[1];
  const targetActivity = attributes.match(
    /android:targetActivity="\.([^"]+)"/,
  )?.[1];
  const hasLauncherIntent =
    /<action android:name="android\.intent\.action\.MAIN"\/>[\s\S]*<category android:name="android\.intent\.category\.LAUNCHER"\/>/.test(
      match[2],
    );
  if (name) {
    manifestAliases.set(name, { icon, targetActivity, hasLauncherIntent });
  }
}
const expectedManifestAliases = new Map(
  Object.entries(ANDROID_ALIASES).map(([id, alias]) => [
    alias,
    {
      icon: ANDROID_RESOURCE_NAMES[id],
      targetActivity: 'MainActivity',
    },
  ]),
);
compareIds(
  'Manifest Android alias',
  new Set(manifestAliases.keys()),
  [...expectedManifestAliases.keys()],
);
for (const [alias, expected] of expectedManifestAliases) {
  const actual = manifestAliases.get(alias);
  if (!actual) continue;
  if (actual.icon !== expected.icon) {
    errors.push(
      `Manifest Android alias: ".${alias}" punta a "${actual.icon ?? '(nessuna risorsa)'}", atteso "${expected.icon}"`,
    );
  }
  if (actual.targetActivity !== expected.targetActivity) {
    errors.push(
      `Manifest Android alias: ".${alias}" punta a "${actual.targetActivity ?? '(nessuna activity)'}", atteso ".${expected.targetActivity}"`,
    );
  }
  if (!actual.hasLauncherIntent) {
    errors.push(
      `Manifest Android alias: ".${alias}" non espone un intent MAIN/LAUNCHER`,
    );
  }
}
const androidApplicationSource = readSource(
  'android/app/src/main/java/com/eduai/testmaster/MainApplication.kt',
  'Registrazione bridge Android',
);
if (!/AppIconManagerPackage/.test(androidApplicationSource)) {
  errors.push(
    'Registrazione bridge Android: AppIconManagerPackage non è registrato in MainApplication',
  );
}
const applicationIcon = manifestSource.match(
  /<application\b[^>]*android:icon="@mipmap\/([^"]+)"/,
)?.[1];
if (applicationIcon !== ANDROID_RESOURCE_NAMES.standard) {
  errors.push(
    `Manifest Android standard: launcher originale non dichiarato come "${ANDROID_RESOURCE_NAMES.standard}"`,
  );
}
const standardAlias = manifestAliases.get(ANDROID_ALIASES.standard);
if (standardAlias?.icon !== ANDROID_RESOURCE_NAMES.standard) {
  errors.push(
    `Manifest Android standard: l'alias ".${ANDROID_ALIASES.standard}" non punta al launcher originale`,
  );
}

const androidResourceRoot = path.join(
  projectRoot,
  'android/app/src/main/res',
);
if (fs.existsSync(androidResourceRoot)) {
  const mipmapDirectories = fs
    .readdirSync(androidResourceRoot, { withFileTypes: true })
    .filter((entry) => {
      if (!entry.isDirectory() || !/^mipmap(?:-|$)/.test(entry.name)) {
        return false;
      }
      return fs.readdirSync(path.join(androidResourceRoot, entry.name)).length > 0;
    });
  if (mipmapDirectories.length === 0) {
    errors.push('Risorse Android: nessuna directory mipmap presente');
  }
  for (const [id, resourceName] of Object.entries(ANDROID_RESOURCE_NAMES)) {
    for (const directory of mipmapDirectories) {
      const resourceDirectory = path.join(androidResourceRoot, directory.name);
      const exists = fs
        .readdirSync(resourceDirectory)
        .some((fileName) => path.parse(fileName).name === resourceName);
      if (!exists) {
        errors.push(
          `Risorse Android: "${id}" richiede "${resourceName}" in ${directory.name}`,
        );
      }
    }
  }
}

const plistSource = readSource(
  'ios/EduAITestMaster/Info.plist',
  'Info.plist iOS',
);
const iosProjectSource = readSource(
  'ios/EduAITestMaster.xcodeproj/project.pbxproj',
  'Configurazione Xcode iOS',
);
const debugHarnessPlistValue = plistSource.match(
  /<key>EduAIIconDebugHarnessEnabled<\/key>\s*<string>([\s\S]*?)<\/string>/,
)?.[1].trim();
if (!debugHarnessPlistValue) {
  errors.push(
    'Info.plist iOS: manca la chiave EduAIIconDebugHarnessEnabled',
  );
} else if (debugHarnessPlistValue !== '$(EDUAI_ICON_DEBUG_HARNESS_ENABLED)') {
  errors.push(
    'Info.plist iOS: EduAIIconDebugHarnessEnabled deve risolvere $(EDUAI_ICON_DEBUG_HARNESS_ENABLED)',
  );
}

const targetConfigurationIds = parseXcodeConfigurationList(
  iosProjectSource,
  'Build configuration list for PBXNativeTarget "EduAITestMaster"',
);
const projectConfigurationIds = parseXcodeConfigurationList(
  iosProjectSource,
  'Build configuration list for PBXProject "EduAITestMaster"',
);
const expectedHarnessSettings = {
  Debug: 'YES',
  Release: 'NO',
};
for (const [configurationName, expectedHarnessSetting] of Object.entries(
  expectedHarnessSettings,
)) {
  const targetConfiguration = parseXcodeBuildConfiguration(
    iosProjectSource,
    targetConfigurationIds.get(configurationName),
  );
  if (!targetConfiguration) {
    errors.push(
      `Xcode iOS: configurazione target "${configurationName}" mancante o non elencata nel target EduAITestMaster`,
    );
    continue;
  }

  const actualHarnessSetting = xcodeBuildSettingValue(
    targetConfiguration.buildSettings,
    'EDUAI_ICON_DEBUG_HARNESS_ENABLED',
  );
  if (actualHarnessSetting !== expectedHarnessSetting) {
    errors.push(
      `Xcode iOS: target EduAITestMaster/${configurationName} deve impostare EDUAI_ICON_DEBUG_HARNESS_ENABLED = ${expectedHarnessSetting}, trovato ${actualHarnessSetting ?? '(mancante)'}`,
    );
  }

  const plistPath = xcodeBuildSettingValue(
    targetConfiguration.buildSettings,
    'INFOPLIST_FILE',
  );
  if (plistPath !== 'EduAITestMaster/Info.plist') {
    errors.push(
      `Xcode iOS: target EduAITestMaster/${configurationName} deve usare EduAITestMaster/Info.plist, trovato ${plistPath ?? '(mancante)'}`,
    );
  }
}

for (const [configurationName, expectedDebugMacro] of [
  ['Debug', true],
  ['Release', false],
]) {
  const projectConfiguration = parseXcodeBuildConfiguration(
    iosProjectSource,
    projectConfigurationIds.get(configurationName),
  );
  if (!projectConfiguration) {
    errors.push(
      `Xcode iOS: configurazione progetto "${configurationName}" mancante o non elencata nel progetto EduAITestMaster`,
    );
    continue;
  }
  if (
    hasXcodePreprocessorDefinition(
      projectConfiguration.buildSettings,
      'DEBUG=1',
    ) !== expectedDebugMacro
  ) {
    errors.push(
      `Xcode iOS: progetto EduAITestMaster/${configurationName} ${expectedDebugMacro ? 'deve definire' : 'non deve definire'} DEBUG=1`,
    );
  }
}

const primaryIconBlock = sourceBlock(
  plistSource,
  /<key>CFBundlePrimaryIcon<\/key>/,
  /<key>CFBundleAlternateIcons<\/key>/,
);
if (!/<string>AppIcon<\/string>/.test(primaryIconBlock)) {
  errors.push(
    'Info.plist iOS standard: CFBundlePrimaryIcon non punta al set AppIcon',
  );
}
if (
  !/<key>CFBundleIconName<\/key>\s*<string>AppIcon<\/string>/.test(
    primaryIconBlock,
  )
) {
  errors.push(
    'Info.plist iOS standard: CFBundleIconName non è AppIcon',
  );
}
const alternateIconsBlock = sourceBlock(
  plistSource,
  /<key>CFBundleAlternateIcons<\/key>/,
  /<key>CFBundleShortVersionString<\/key>/,
);
for (const id of REQUIRED_ALTERNATE_ICON_IDS) {
  const iconName = IOS_ICON_NAMES[id];
  if (
    !new RegExp(`<key>${escapedRegExp(iconName)}<\\/key>`).test(
      alternateIconsBlock,
    )
  ) {
    errors.push(
      `Info.plist iOS: "${id}" richiede l'icona alternativa "${iconName}"`,
    );
    continue;
  }
  const alternateIconBlock = alternateIconsBlock.match(
    new RegExp(
      `<key>${escapedRegExp(iconName)}<\\/key>([\\s\\S]*?)<\\/dict>`,
    ),
  )?.[1];
  if (
    !alternateIconBlock
    || !new RegExp(
      `<key>CFBundleIconName<\\/key>\\s*<string>AppIcon-${escapedRegExp(iconName)}<\\/string>`,
    ).test(alternateIconBlock)
  ) {
    errors.push(
      `Info.plist iOS: "${id}" non punta al set "AppIcon-${iconName}"`,
    );
  }
}

const iosAssetRoot = path.join(
  projectRoot,
  'ios/EduAITestMaster/Images.xcassets',
);
for (const [id, iconName] of Object.entries(IOS_ICON_NAMES)) {
  const setName = id === 'standard' ? 'AppIcon.appiconset' : `AppIcon-${iconName}.appiconset`;
  const setDirectory = path.join(iosAssetRoot, setName);
  if (!fs.existsSync(setDirectory)) {
    errors.push(`Risorse iOS: "${id}" richiede il set mancante "${setName}"`);
    continue;
  }
  const contentsPath = path.join(setDirectory, 'Contents.json');
  if (!fs.existsSync(contentsPath)) {
    errors.push(`Risorse iOS: "${setName}" non contiene Contents.json`);
    continue;
  }
  let contents;
  try {
    contents = JSON.parse(fs.readFileSync(contentsPath, 'utf8'));
  } catch {
    errors.push(`Risorse iOS: Contents.json non valido in "${setName}"`);
    continue;
  }
  const images = Array.isArray(contents.images) ? contents.images : [];
  if (images.length === 0) {
    errors.push(`Risorse iOS: "${setName}" non dichiara immagini`);
  }
  for (const image of images) {
    if (!image.filename) {
      errors.push(`Risorse iOS: "${setName}" dichiara un'immagine senza file`);
      continue;
    }
    if (!fs.existsSync(path.join(setDirectory, image.filename))) {
      errors.push(
        `Risorse iOS: "${id}" dichiara il file mancante "${image.filename}"`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error('Verifica mapping icone native fallita:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Verifica mapping icone native superata: standard + ${REQUIRED_ALTERNATE_ICON_IDS.length} alternative allineate.`,
  );
}