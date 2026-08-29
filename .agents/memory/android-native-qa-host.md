---
name: Android native QA host
description: Environment boundary for installable Android verification of native launcher icon recovery.
---

Installable Android icon verification requires more than Java: the host must expose a compatible Android SDK, `adb`, and an emulator or connected device for each API level. A local SDK and AVDs can be provisioned in this Replit Linux workspace, but software-only TCG emulation is not a reliable substitute for hardware acceleration on modern API images.

**Why:** A temporary JDK can move Gradle past Java discovery, but workspace storage quota can reject SDK system-image or NDK extraction even when `df` reports free space; `/dev/kvm` may also be unavailable. API 24 ran successfully with TCG, while API 36 consumed several gigabytes and lost `system_server` before package installation, so an API-level host can be identified without being a usable installation host.

**How to apply:** Keep each API-version row as not executed until build/install, the three rejection/retry flows, forced reopen, launcher observation, and server inventory checks each have an external evidence ID. Use a standalone bundled APK for offline launch checks, and treat `sys.boot_completed=1` as insufficient until Package Installer and storage services respond.