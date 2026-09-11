---
# Allowed version bumps: patch, minor, major
quick-find: patch
---

The module now requires jcontent 3.7.1 or later. An older jcontent no longer satisfies the dependency, so the module is refused at deployment time instead of starting against a jcontent that does not provide what it needs.
