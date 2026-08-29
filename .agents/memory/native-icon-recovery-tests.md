---
name: Native icon recovery tests
description: Native launcher rejection recovery is tested through a dependency-injected client rollback helper.
---

Keep native icon rollback orchestration independent from React Native and database modules so bridge rejection can be simulated deterministically for purchase, equip, and reset flows.

**Why:** The API server TypeScript project has a `src` root boundary, while the recovery behavior spans the mobile client and server-owned inventory. A shared pure helper tests the real client recovery without importing mobile code into server compilation.

**How to apply:** Test the initial bridge failure, restore the prior server selection, retry the prior native icon, refresh inventory, and assert exactly one equipped custom icon plus a localized retry message.

The installable iOS rejection harness must be gated both by the development JavaScript bundle and by native `DEBUG` plus an explicit Info.plist build flag; the one-shot arm is consumed only for the matching operation.

**Why:** A deep link is user-controllable input, so a release build must remain unable to inject launcher failures even if the bridge method is discovered or called directly.

**How to apply:** Keep QA/Debug enabled and Release disabled in native build settings, and preserve scenario-specific consumption so startup synchronization and unrelated icon operations cannot spend the armed rejection.