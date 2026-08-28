---
name: Replit Expo preview domain
description: Distinguish the Replit Expo preview proxy from the app API when diagnosing mobile preview errors.
---

The Replit Expo preview domain can return `Backend Not Configured` even while Metro is healthy locally and the configured remote API is healthy. Treat the app's `/status` on the assigned local port and the actual API health endpoint as separate checks; do not replace a valid API URL based only on the preview proxy response.

**Why:** Expo mobile artifacts use a platform-managed preview route and the browser preview can fail independently of the Metro process or remote backend.

**How to apply:** Verify the exact managed Expo workflow is running, test local `/status`, test the remote API endpoint, and use Expo Go/native preview for the mobile artifact before changing application networking code.