---
name: External Render diagnostics
description: Diagnostic boundary for services deployed on Render rather than Replit
---

For an API deployed on Render, Replit’s deployment-log query may return no records even when the public endpoint is producing a 500. A valid-auth request with an invalid payload can still distinguish routing/authentication from the failing service layer.

**Why:** External Render runtime logs are not necessarily connected to Replit’s deployment-log source, while the API may intentionally return only a generic production error.

**How to apply:** Record only HTTP outcomes in smoke tests; inspect the Render service’s own runtime logs when a valid request reaches a generic 500.