---
name: Xcode project-file parsing
description: The repeated configuration-list labels in pbxproj files and the safe anchor for automated validation.
---

When validating an Xcode project file directly, anchor configuration-list parsing to the comment followed by `isa = XCConfigurationList`, not to the earlier target or project reference that repeats the same label.

**Why:** A pbxproj contains both a reference to each configuration list and the later list object. Searching from the reference can accidentally capture the first unrelated `buildConfigurations` block.

**How to apply:** Locate the exact `XCConfigurationList` object, resolve its configuration IDs, then parse each `XCBuildConfiguration` object by ID before checking build settings.