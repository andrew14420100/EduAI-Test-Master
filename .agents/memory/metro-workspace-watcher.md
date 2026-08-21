---
name: Metro workspace watcher
description: Expo Metro watcher behavior in this monorepo when tool-generated temporary directories appear under .local.
---

When Expo Metro watches the repository root, exclude `.local/secondary_skills` from its resolver block list because tool jobs can create and remove temporary directories there while Metro is crawling.

**Why:** Metro's fallback watcher can receive an `ENOENT` for a temporary directory that disappeared between discovery and watch setup, causing the Expo workflow to fail before opening its port.

**How to apply:** Keep the exclusion in the root Metro configuration; do not remove pnpm symlink or package-export support that the mobile app needs.