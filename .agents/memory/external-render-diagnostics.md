---
name: External Render diagnostics
description: Diagnostic boundary for services deployed on Render rather than Replit
---

For an API deployed on Render, Replit’s deployment-log query may return no records even when the public endpoint is producing a 500. The public service follows its connected GitHub branch, so local commits do not change live routes until that branch is synchronized. A valid-auth request with an invalid payload can still distinguish routing/authentication from the failing service layer.

**Why:** External Render runtime logs are not necessarily connected to Replit’s deployment-log source, while the API may intentionally return only a generic production error. A workspace can therefore contain a route that the deployed service does not yet expose.

**How to apply:** Record HTTP outcomes in smoke tests, compare the live endpoint against the branch Render watches, and inspect Render’s own runtime logs when a valid request reaches a generic 500.