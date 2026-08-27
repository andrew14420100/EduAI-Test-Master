---
name: Workflow preflight directories
description: A managed-workflow restart can fail during workspace preflight because ephemeral secondary-skill directories were removed.
---

Managed workflow restart failures that report missing `.local/secondary_skills/.tmp-*` paths can happen before the application command starts.

**Why:** The failure is produced by the workflow preflight search, so restarting repeatedly does not test the app and can misleadingly look like an Expo or API regression.

**How to apply:** Check the workflow logs/status and distinguish preflight errors from port or application errors. Use direct typecheck/build commands to validate the code, and report the preview limitation instead of changing app ports or startup code without evidence.