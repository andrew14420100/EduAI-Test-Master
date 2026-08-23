---
name: Node test module mocks
description: Runner detail for Node's experimental ESM module mocking with the repository's TypeScript test command.
---

When a test needs Node's experimental module mocking, invoke the tsx ESM CLI through Node with the flag before the CLI path; the shell shim is not a JavaScript entry point.

**Why:** Passing the flag to tsx or through `NODE_OPTIONS` either is rejected by Node or causes the shell shim to be parsed as JavaScript.

**How to apply:** Prefer dependency seams over module mocking where practical; if module mocking is needed, use the native Node invocation in the API test script.