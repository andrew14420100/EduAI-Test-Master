---
name: Development database migration history
description: Development database may contain schema created outside Drizzle migration history.
---

An existing database schema can lack the migration ledger expected by the current migration tool. Treat that failure as a schema-history mismatch, not evidence that the database is unavailable.

**Why:** Applying generated migrations assumes the ledger and can fail before otherwise-safe additive changes are applied.

**How to apply:** Inspect the live schema before applying generated migrations. Use the supported publish schema-diff flow for production.