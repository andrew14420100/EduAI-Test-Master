---
name: Native icon recovery tests
description: Native launcher rejection recovery is tested through a dependency-injected client rollback helper.
---

Keep native icon rollback orchestration independent from React Native and database modules so bridge rejection can be simulated deterministically for purchase, equip, and reset flows.

**Why:** The API server TypeScript project has a `src` root boundary, while the recovery behavior spans the mobile client and server-owned inventory. A shared pure helper tests the real client recovery without importing mobile code into server compilation.

**How to apply:** Test the initial bridge failure, restore the prior server selection, retry the prior native icon, refresh inventory, and assert exactly one equipped custom icon plus a localized retry message.