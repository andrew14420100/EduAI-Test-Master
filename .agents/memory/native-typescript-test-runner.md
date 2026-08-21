---
name: Native TypeScript test runner
description: Node 24 native type stripping behavior for API server tests
---

When running API server tests directly with Node 24 and native TypeScript type stripping, local ESM imports need explicit `.ts` extensions. The production esbuild bundle can resolve extensionless imports, so a test-only failure may otherwise look unrelated to the feature.

**Why:** The fixture tests are intentionally dependency-free and run with the built-in `node:test` runner; keeping their import graph native makes CI deterministic without adding a test dependency.

**How to apply:** Use explicit `.ts` extensions in local imports reachable from native test entrypoints, while leaving package imports unchanged.