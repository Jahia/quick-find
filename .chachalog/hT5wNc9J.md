---
# Allowed version bumps: patch, minor, major
quick-find: patch
---

The module now requires jcontent 3.7.1 or later and graphql-dxm-provider 3.6.0 or later. Older versions no longer satisfy the dependencies, so the module is refused at deployment time instead of starting against modules that do not provide what it needs. On Jahia 8.2.2.x, upgrade both modules from the Jahia Store first.
