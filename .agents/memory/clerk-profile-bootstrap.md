---
name: Clerk profile bootstrap
description: How to validate that the authenticated profile bootstrap cannot enter a request loop.
---

Treat profile bootstrap as a once-per-user operation with an explicit, comparable attempt key, and verify it after a hard reload by observing the actual request count.

**Why:** A retry guard can compile and look correct while comparing different key formats, causing a rapid stream of successful profile upserts that ordinary typechecks and happy-path UI tests do not reveal.

**How to apply:** Whenever auth bootstrap, retry state, or effect dependencies change, run an authenticated smoke test and confirm the profile mutation occurs once while the page remains mounted.