# quick-find Changelog

## 0.9.1

### New Features

* Renamed the module from `kfind` to `quick-find`. The Maven artifact, the OSGi bundle symbolic name and the module id are now `quick-find`, the Java package and the OSGi configuration PID are `org.jahia.pm.modules.quickfind`, and the display name is QuickFind. Anything that referenced the old name has to be updated: the configuration file is now `org.jahia.pm.modules.quickfind.cfg`, the provider registry key is `quickFindProvider`, and the open-search event is `quick-find:open-search`.

### Bug Fixes

* The module now requires jcontent 3.7.1 or later and graphql-dxm-provider 3.6.0 or later. Older versions no longer satisfy the dependencies, so the module is refused at deployment time instead of starting against modules that do not provide what it needs. On Jahia 8.2.2.x, upgrade both modules from the Jahia Store first.

* The module is now published under the MIT licence. A `LICENSE` file was added at the root, and the licence is declared in `pom.xml`, `package.json` and the README.

* Fixed the search modal so it opens centered at its intended width and no longer appears behind the left navigation.

* Content search now matches inside a word, and it ignores letter case and accents. Every word typed has to match, so each word added narrows the result. A term that carries punctuation, such as an exclamation mark or a percent sign, no longer makes the search fail. The search now counts only letters and digits when it decides whether enough has been typed, and the minimum drops from four to three, so a term such as `50%` waits for more input while a three-letter word starts a search.
