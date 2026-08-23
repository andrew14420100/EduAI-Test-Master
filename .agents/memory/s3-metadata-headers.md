---
name: S3 metadata headers
description: Constraints for storing ACL metadata through S3-compatible object storage.
---

S3 user-metadata keys are serialized as HTTP header names, so keys containing
characters outside the HTTP token grammar (notably `:`) cannot be used with
CopyObject metadata updates. Keep new metadata keys HTTP-safe and read legacy
spellings when migrating existing objects.

**Why:** The AWS SDK rejects invalid metadata header names before sending the
request, which can make upload finalization fail only against a real S3
endpoint.

**How to apply:** Exercise CopyObject metadata updates in the storage smoke
test, not just PUT/GET, and never print signed URLs or credential material.