---
name: GitHub workflow push permissions
description: Replit GitHub OAuth may push repository code but reject changes to GitHub Actions workflow files.
---

When a GitHub push from Replit is rejected for a `.github/workflows/*.yml` file, the connected OAuth authorization lacks the `workflow` scope even if ordinary repository pushes work. Reauthorize with that scope or use a securely stored GitHub URL/token with repository and workflow permissions; never paste credentials in chat.

**Why:** GitHub accepts the uploaded objects but refuses to move the remote branch when an OAuth app tries to create or update a workflow without explicit permission.

**How to apply:** Treat a successful `git push` as the only confirmation that the remote branch moved, then update other clones with `git pull`. Remove or revoke a one-time push credential when it is no longer needed.