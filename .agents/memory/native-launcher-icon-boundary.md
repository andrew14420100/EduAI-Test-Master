---
name: Native launcher icon boundary
description: The app's custom launcher icon behavior depends on native build metadata and is intentionally unavailable in Expo Go/web.
---

Native launcher customization must be implemented as declared, packaged native assets plus a small platform bridge. The JavaScript layer should treat the bridge as optional so Expo Go and web previews remain usable.

**Why:** Expo Go cannot mutate the host app's launcher metadata, and remote images cannot become system icons at runtime. The server-owned inventory remains the source of truth across app restarts.

**How to apply:** Keep the standard icon as an explicit reset choice, update the native icon only after the inventory mutation succeeds, and verify the checked-in native project with an Android/iOS build when the toolchain is available.