# Changelog

All notable user-visible changes to this module should be documented in this file.

## Unreleased

### Added

### Changed

- Dependency update: `@jahia/moonstone` moved to `^2.19.0`.

### Fixed

- Fixed the admin page-load crash caused by Module Federation singleton version
  negotiation: kfind no longer wins the shared-React negotiation (`version: "0.0.0"`
  overrides in `vite.config.ts`), so the host's React is always used.
- Fixed the search modal never opening (nav Search button and ⌘K/Ctrl+K doing nothing).
  Jahia's shared i18next default import resolves to the module *namespace* (which lacks
  `.on`) rather than the live instance; passing it to `<I18nextProvider>` made Moonstone's
  react-i18next throw `o.on is not a function` and unmount the modal subtree. `routes.tsx`
  now unwraps to the real i18next instance. See `HANDOFF_RUNTIME_ISSUE.md`.

### Removed
