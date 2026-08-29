import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  nativeIconRecoveryMessage,
  restoreNativeIconSelection,
  type IconSelectionSnapshot,
} from "../lib/nativeIconRecovery.ts";

type InventoryRow = {
  id: string;
  itemId: string;
  equipped: boolean;
};

type RecoveryCase = {
  operation: "acquisto" | "equipaggiamento" | "ripristino";
  requestedIcon: "app_icon_neon" | "app_icon_aurora" | "standard";
  previous: IconSelectionSnapshot;
  inventory: InventoryRow[];
  expectedMessage: string;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const shopRouteSource = fs.readFileSync(
  path.join(here, "../artifacts/api-server/src/routes/shop.ts"),
  "utf8",
);
const appContextSource = fs.readFileSync(
  path.join(here, "../context/AppContext.tsx"),
  "utf8",
);
const shopScreenSource = fs.readFileSync(
  path.join(here, "../app/(tabs)/shop.tsx"),
  "utf8",
);
const nativeAppIconSource = fs.readFileSync(
  path.join(here, "../lib/nativeAppIcon.ts"),
  "utf8",
);
const androidModuleSource = fs.readFileSync(
  path.join(here, "../android/app/src/main/java/com/eduai/testmaster/AppIconManagerModule.kt"),
  "utf8",
);
const iosModuleSource = fs.readFileSync(
  path.join(here, "../ios/EduAITestMaster/AppIconManager.m"),
  "utf8",
);
const iosInfoPlistSource = fs.readFileSync(
  path.join(here, "../ios/EduAITestMaster/Info.plist"),
  "utf8",
);
const iosProjectSource = fs.readFileSync(
  path.join(here, "../ios/EduAITestMaster.xcodeproj/project.pbxproj"),
  "utf8",
);
const iosWorkflowSource = fs.readFileSync(
  path.join(here, "../.github/workflows/ios-native-icon-qa.yml"),
  "utf8",
);
const androidWorkflowSource = fs.readFileSync(
  path.join(here, "../.github/workflows/android-native-icon-qa.yml"),
  "utf8",
);

function equippedIcons(inventory: InventoryRow[]) {
  return inventory.filter((item) => item.itemId.startsWith("app_icon_") && item.equipped);
}

function setEquipped(inventory: InventoryRow[], itemId: string | null) {
  for (const item of inventory) {
    if (item.itemId.startsWith("app_icon_")) item.equipped = itemId === item.itemId;
  }
}

function simulateServerMutation(testCase: RecoveryCase) {
  if (testCase.operation === "ripristino") {
    setEquipped(testCase.inventory, null);
    return;
  }

  if (testCase.operation === "acquisto") {
    setEquipped(testCase.inventory, null);
    testCase.inventory.push({
      id: "new-icon",
      itemId: testCase.requestedIcon,
      equipped: true,
    });
    return;
  }

  setEquipped(testCase.inventory, null);
  const requested = testCase.inventory.find((item) => item.itemId === testCase.requestedIcon);
  assert.ok(requested, "the equip scenario must own the requested icon");
  requested.equipped = true;
}

function restoreServerSnapshot(inventory: InventoryRow[], previous: IconSelectionSnapshot) {
  setEquipped(inventory, previous.iconId === "standard" ? null : previous.iconId);
}

const cases: RecoveryCase[] = [
  {
    operation: "acquisto",
    requestedIcon: "app_icon_neon",
    previous: { iconId: "app_icon_midnight", ownedItemId: "previous-icon" },
    inventory: [
      { id: "previous-icon", itemId: "app_icon_midnight", equipped: true },
    ],
    expectedMessage: "L’acquisto è stato conservato nella tua collezione e non devi pagarlo di nuovo.",
  },
  {
    operation: "equipaggiamento",
    requestedIcon: "app_icon_aurora",
    previous: { iconId: "app_icon_midnight", ownedItemId: "previous-icon" },
    inventory: [
      { id: "previous-icon", itemId: "app_icon_midnight", equipped: true },
      { id: "requested-icon", itemId: "app_icon_aurora", equipped: false },
    ],
    expectedMessage: "L’oggetto resta nella tua collezione e l’equipaggiamento precedente è stato mantenuto.",
  },
  {
    operation: "ripristino",
    requestedIcon: "standard",
    previous: { iconId: "app_icon_midnight", ownedItemId: "previous-icon" },
    inventory: [
      { id: "previous-icon", itemId: "app_icon_midnight", equipped: true },
      { id: "other-icon", itemId: "app_icon_neon", equipped: false },
    ],
    expectedMessage: "L’icona personalizzata precedente è stata mantenuta.",
  },
];

for (const testCase of cases) {
  test(`${testCase.operation} ripristina inventario e icona dopo il rifiuto del bridge`, async () => {
    simulateServerMutation(testCase);
    const nativeCalls: string[] = [];
    let refreshes = 0;

    await assert.rejects(
      async () => {
        nativeCalls.push(testCase.requestedIcon);
        throw new Error("OS_REJECTED");
      },
      /OS_REJECTED/,
    );

    const rollback = await restoreNativeIconSelection(testCase.previous, {
      restoreServerSelection: async () => {
        restoreServerSnapshot(testCase.inventory, testCase.previous);
      },
      applyNativeIcon: async (iconId) => {
        nativeCalls.push(iconId);
      },
      refresh: async () => {
        refreshes++;
      },
    });

    assert.deepEqual(rollback, { ok: true });
    assert.deepEqual(nativeCalls, [testCase.requestedIcon, testCase.previous.iconId]);
    assert.equal(refreshes, 1);
    assert.equal(equippedIcons(testCase.inventory).length, 1);
    assert.equal(equippedIcons(testCase.inventory)[0]?.itemId, testCase.previous.iconId);

    const message = nativeIconRecoveryMessage(
      testCase.operation,
      testCase.requestedIcon,
      { code: "E_OS_REJECTED" },
      rollback,
    );
    assert.match(message, /Non è stato possibile applicare/);
    assert.match(message, /Puoi riprovare|riprova/);
    assert.match(message, new RegExp(testCase.expectedMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
}

type DebugScenario = RecoveryCase["operation"];

function createDebugRejectionHarness() {
  let armed: DebugScenario | null = null;
  return {
    configure(scenario: DebugScenario) {
      armed = scenario;
    },
    setIcon(operation?: DebugScenario) {
      if (operation && operation === armed) {
        armed = null;
        throw new Error("E_DEBUG_ICON_REJECTION");
      }
    },
  };
}

for (const platform of ["Android", "iOS"] as const) {
  for (const scenario of ["acquisto", "equipaggiamento", "ripristino"] as const) {
    test(`il harness ${platform} rifiuta una sola volta nello scenario ${scenario}`, () => {
      const harness = createDebugRejectionHarness();
      harness.configure(scenario);

      // Startup synchronization has no operation and must not consume the arm.
      assert.doesNotThrow(() => harness.setIcon());
      assert.throws(() => harness.setIcon(scenario), /E_DEBUG_ICON_REJECTION/);
      assert.doesNotThrow(() => harness.setIcon(scenario));
    });
  }
}

test("i bridge nativi espongono un harness debug per scenario senza alterare l’inventario", () => {
  assert.match(nativeAppIconSource, /NativeIconDebugScenario/);
  assert.match(nativeAppIconSource, /configureNativeIconDebugRejection/);
  assert.match(nativeAppIconSource, /Platform\.OS === 'android' \|\| Platform\.OS === 'ios'/);
  assert.match(nativeAppIconSource, /Platform\.OS !== 'android' && Platform\.OS !== 'ios'/);
  assert.match(appContextSource, /native-icon-test\?reject=<scenario>/);
  assert.match(appContextSource, /'acquisto'/);
  assert.match(appContextSource, /'equipaggiamento'/);
  assert.match(appContextSource, /'ripristino'/);
  assert.match(androidModuleSource, /BuildConfig\.DEBUG/);
  assert.match(androidModuleSource, /E_DEBUG_ICON_REJECTION/);
  assert.match(androidModuleSource, /compareAndSet\(debugScenario, null\)/);
  assert.match(androidModuleSource, /configureDebugRejection/);
  assert.match(iosModuleSource, /debugScenario:\(NSString \*\)debugScenario/);
  assert.match(iosModuleSource, /#if DEBUG/);
  assert.match(iosModuleSource, /E_DEBUG_ICON_REJECTION/);
  assert.match(iosModuleSource, /consumeDebugRejectionForScenario\(debugScenario\)/);
  assert.match(iosModuleSource, /alternateIconName = nil/);
  assert.match(iosModuleSource, /debugRejectionScenario = nil/);
  assert.match(iosModuleSource, /configureDebugRejection/);
  assert.match(iosModuleSource, /EduAIIconDebugHarnessEnabled/);
  assert.match(iosInfoPlistSource, /<key>EduAIIconDebugHarnessEnabled<\/key>/);
  assert.match(iosInfoPlistSource, /<string>\$\(EDUAI_ICON_DEBUG_HARNESS_ENABLED\)<\/string>/);
  assert.match(
    iosProjectSource,
    /13B07F941A680F5B00A75B9A \/\* Debug \*\/[\s\S]*?EDUAI_ICON_DEBUG_HARNESS_ENABLED = YES;[\s\S]*?name = Debug;/,
  );
  assert.match(
    iosProjectSource,
    /13B07F951A680F5B00A75B9A \/\* Release \*\/[\s\S]*?EDUAI_ICON_DEBUG_HARNESS_ENABLED = NO;[\s\S]*?name = Release;/,
  );
});

test("il server serializza e mantiene una sola icona launcher equipaggiata", () => {
  assert.match(shopRouteSource, /lockUserThemeSelection\(tx, userId\)/);
  assert.match(
    shopRouteSource,
    /eq\(ownedShopItemsTable\.itemType, "icona_futura"\)[\s\S]*?set\(\{ equipped: false \}\)/,
  );
  assert.match(
    shopRouteSource,
    /if \(itemType === "icona_futura"\)[\s\S]*?equipped: itemType === "icona_futura"/,
  );
  assert.match(
    shopRouteSource,
    /POST \/shop\/icons\/use-standard[\s\S]*?set\(\{ equipped: false \}\)/,
  );
});

test("il client mostra il recupero localizzato e lascia riprovare", () => {
  assert.match(appContextSource, /restoreNativeIconSelection/);
  assert.match(appContextSource, /nativeIconRecoveryMessage/);
  assert.match(shopScreenSource, /testID="recupero-icona"/);
  assert.match(shopScreenSource, /testID="riprova-icona"/);
  assert.match(shopScreenSource, /retryNativeIcon\(\)/);
});

test("la pipeline macOS produce una build QA e conserva log identificabili", () => {
  assert.match(iosWorkflowSource, /runs-on: macos-14/);
  assert.match(iosWorkflowSource, /pod install --project-directory=ios/);
  assert.match(iosWorkflowSource, /pnpm run verify:ios-harness/);
  assert.match(iosWorkflowSource, /configuration Debug/);
  assert.match(iosWorkflowSource, /SKIP_BUNDLING=0/);
  assert.match(iosWorkflowSource, /actions\/upload-artifact@v4/);
  assert.match(iosWorkflowSource, /github\.run_id/);
});

test("la pipeline Android offre host API 24/API 36 e fingerprint dell’APK QA", () => {
  assert.match(androidWorkflowSource, /runs-on: ubuntu-24\.04/);
  assert.match(androidWorkflowSource, /reactivecircus\/android-emulator-runner@v2/);
  assert.match(androidWorkflowSource, /api: 24/);
  assert.match(androidWorkflowSource, /api: 36/);
  assert.match(androidWorkflowSource, /-PqaBundle=true/);
  assert.match(androidWorkflowSource, /sha256sum/);
  assert.match(androidWorkflowSource, /actions\/upload-artifact@v4/);
  assert.match(androidWorkflowSource, /EduAITestMaster-QA-debug\.apk/);
  assert.match(androidWorkflowSource, /deep-link-\$scenario\.log/);
  assert.match(androidWorkflowSource, /acquisto/);
  assert.match(androidWorkflowSource, /equipaggiamento/);
  assert.match(androidWorkflowSource, /ripristino/);
  assert.match(androidWorkflowSource, /flow-checklist\.md/);
});
