---
# Allowed version bumps: patch, minor, major
quick-find: patch
---

Fixed quick find so one malformed setting, such as `minSearchChars = 3a`, no longer disables all the other settings. Quick find uses the default of that setting and logs a warning that names it.
