---
name: OpenAPI generated contract drift
description: Risk of unrelated client contract changes when regenerating from an incomplete OpenAPI specification.
---

OpenAPI regeneration is not always a narrow change: fields present in generated client types but absent from the source specification can be removed during code generation.

**Why:** A targeted health-contract update once caused an unrelated profile field to disappear from generated output, creating avoidable client drift.

**How to apply:** Review the complete generated diff after every spec change, restore unrelated established fields when the source spec is known to lag, and separately consider bringing the source spec up to date.