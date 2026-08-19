---
name: PostgreSQL list filters
description: A Drizzle/PostgreSQL query-construction pitfall for filtering against a list of scalar IDs.
---

Use Drizzle's list-filter helper for scalar ID collections rather than interpolating a JavaScript array inside a PostgreSQL `ANY` expression.

**Why:** Template interpolation can expand the values into multiple placeholders, but `ANY` requires a single SQL array on its right-hand side; the query then fails only at runtime.

**How to apply:** For owner-scoped or membership-scoped list queries, prefer the ORM's `inArray` helper and exercise the route with more than one ID in an integration test.