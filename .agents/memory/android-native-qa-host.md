---
name: Android native QA host
description: Environment boundary for installable Android verification of native launcher icon recovery.
---

Installable Android icon verification requires more than Java: the host must expose a compatible Android SDK, `adb`, and an emulator or connected device for each API level. In this Replit Linux workspace, Nix may expose JDK 17 and `adb` while the configured local SDK root is absent; that still cannot produce an APK or AVD.

**Why:** A temporary JDK can move Gradle past Java discovery, but workspace storage quota can reject SDK system-image or NDK extraction even when `df` reports free space; `/dev/kvm` may also be unavailable. Neither condition provides an installable AVD or real launcher evidence.

**How to apply:** Keep API-version rows as not executed until build/install, the three rejection/retry flows, forced reopen, launcher observation, and server inventory checks each have an external evidence ID. Use OpenJDK 17 for Android command-line tools and disable JVM perf data for `sdkmanager` if this host's JVM crashes in its watcher thread.