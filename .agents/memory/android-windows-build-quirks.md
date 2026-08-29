---
name: Android Windows build quirks
description: Windows native Android builds may need Android Studio SDK installation and clean CMake/Ninja caches.
---

The newer Android CLI wrapper can appear as `sdkmanager.bat` while package installation from Windows PowerShell is unsupported; use Android Studio's SDK Manager for SDK platforms and build tools.

**Why:** A successful-looking CLI invocation can leave `android.jar` absent, while native builds then fail later with misleading Gradle dependency errors.

**How to apply:** Verify the SDK artifact on disk before building. If Ninja reports that `build.ninja` stays dirty, synchronize the Windows clock and remove generated `.cxx`/Gradle native caches before retrying.