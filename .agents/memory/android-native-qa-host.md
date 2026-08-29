---
name: Android native QA host
description: Environment boundary for installable Android verification of native launcher icon recovery.
---

Installable Android icon verification requires more than Java: the host must expose a compatible Android SDK, `adb`, and an emulator or connected device for each API level.

**Why:** A temporary JDK can move Gradle past Java discovery, but it cannot install or observe a debug APK, trigger the one-shot bridge rejection, inspect the launcher icon, or compare server inventory.

**How to apply:** Keep API-version rows as not executed until build/install, the three rejection/retry flows, forced reopen, launcher observation, and server inventory checks each have an external evidence ID.