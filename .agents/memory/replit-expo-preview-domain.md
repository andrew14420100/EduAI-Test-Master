---
name: Replit Expo preview domain
description: Distinguish the Replit Expo preview proxy from the app API when diagnosing mobile preview errors.
---

The Replit Expo preview domain can return `Backend Not Configured` even while Metro is healthy locally and the configured remote API is healthy. For Expo Go, use Expo tunnel mode when the managed preview host is not reachable; validate the generated `exp.direct` URL separately.

**Why:** Expo mobile artifacts use a platform-managed preview route and the browser preview can fail independently of the Metro process or remote backend.

**How to apply:** Verify the exact managed Expo workflow is running, test local `/status`, test the remote API endpoint, and use the tunnel-generated Expo Go QR before changing application networking code.