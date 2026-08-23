---
name: Abandoned upload cleanup
description: Durable safety rules for cleaning up objects created by uploads that were never finalized.
---

Cleanup must delete an abandoned object through an idempotent storage operation, without a preceding existence check, and keep its database marker when deletion fails so a later bounded pass can retry.

**Why:** Presigned upload URLs can be issued without a subsequent PUT, and storage failures must not turn into silent orphaned objects or premature bookkeeping loss.

**How to apply:** When expiring upload records, bound the candidate batch, confirm the path is not referenced by a finalized material, log failures, and delete the pending row only after safe object cleanup.