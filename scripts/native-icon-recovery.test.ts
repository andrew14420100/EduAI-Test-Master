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