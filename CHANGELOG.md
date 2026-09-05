# quick-find Changelog

## 0.1.0

### New Features

* Fixed the search modal so it opens centered at its intended width and no longer appears behind the left navigation.

* Renamed the module from `kfind` to `quick-find`. The Maven artifact, the OSGi bundle symbolic name and the module id are now `quick-find`, the Java package and the OSGi configuration PID are `org.jahia.pm.modules.quickfind`, and the display name is QuickFind. Anything that referenced the old name has to be updated: the configuration file is now `org.jahia.pm.modules.quickfind.cfg`, the provider registry key is `quickFindProvider`, and the open-search event is `quick-find:open-search`.

### Bug Fixes

* The module is now published under the MIT licence. A `LICENSE` file was added at the root, and the licence is declared in `pom.xml`, `package.json` and the README.

* Tightened the CI workflow permissions. Each job now receives only the GitHub token scopes it needs, instead of every job receiving `checks: write` and `id-token: write`.

* Added `docs/LEARNINGS.md`, documenting the CI and test-environment problems found while renaming the module, and how to diagnose each one again.
