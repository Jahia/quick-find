---
# Allowed version bumps: patch, minor, major
quick-find: patch
---

Tightened the CI workflow permissions. Each job now receives only the GitHub token scopes it needs, instead of every job receiving `checks: write` and `id-token: write`.
