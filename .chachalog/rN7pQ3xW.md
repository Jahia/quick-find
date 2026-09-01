---
# Allowed version bumps: patch, minor, major
quick-find: minor
---

Renamed the module from `kfind` to `quick-find`. The Maven artifact, the OSGi bundle symbolic name and the module id are now `quick-find`, the Java package and the OSGi configuration PID are `org.jahia.pm.modules.quickfind`, and the display name is QuickFind. Anything that referenced the old name has to be updated: the configuration file is now `org.jahia.pm.modules.quickfind.cfg`, the provider registry key is `quickFindProvider`, and the open-search event is `quick-find:open-search`.
