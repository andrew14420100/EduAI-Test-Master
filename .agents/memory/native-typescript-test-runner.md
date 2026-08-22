---
name: Native TypeScript test runner
description: Node 24 native type stripping behavior for API server tests
---

When running API server tests directly with Node 24 and native TypeScript type stripping, local ESM imports need explicit `.ts` extensions. If the production source still has extensionless imports, run the tests through the workspace's `tsx` runner instead of Node's native runner. The production esbuild bundle can resolve extensionless imports, so a test-only failure may otherwise look unrelated to the feature.

**Why:** The fixture tests use `node:test`, but the server's production ESM import graph is bundled by esbuild and is not always directly runnable by Node's resolver. `tsx` preserves the existing source imports without forcing a broad production refactor.

**How to apply:** Prefer explicit `.ts` extensions for new local imports. For the existing API test suite, invoke `tsx --test` from the workspace package that provides it, while leaving package imports unchanged.