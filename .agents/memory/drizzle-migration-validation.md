---
name: Drizzle migration validation
description: A Drizzle Kit path-resolution constraint and the standard for proving clean-database bootstrap.
---

Keep the migration output directory relative to the database package, and require both metadata validation and a clean-schema run with the official migrator.

**Why:** Drizzle Kit can generate migrations with an absolute output path but later prepend the working directory during `check`, producing an invalid duplicated path. A raw SQL smoke test alone also does not prove the configured migration command works.

**How to apply:** After schema changes, run `drizzle-kit check`, confirm generation reports no drift, and apply `drizzle-kit migrate` to an isolated empty schema or database before release.