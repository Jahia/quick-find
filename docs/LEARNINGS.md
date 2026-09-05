# Learnings

Hard-won notes from debugging this module's CI and test environment. `tests/LEARNINGS.md` holds
test-authoring notes; this file holds the things that cost days.

Every claim below is written to be checkable. Where a mechanism is suspected rather than proven,
it says so — several confident explanations for these bugs turned out to be wrong, and the wrong
ones cost more time than the bugs.

## The recurring defect: failures that do not surface where they happen

Three bugs in this repository shared one shape — something failed, the job carried on, and the
symptom appeared somewhere unrelated. Two are fixed; the class is not.

**1. A failed build that the run ignored.** When `mvn` could not resolve the Jahia parent POM, the
test module was never built, the job continued, provisioning installed nothing, and the failure
appeared later as **nine Cypress specs** failing in their `before` hooks on
`Timed out waiting for node: /sites/quick-find-test-site`. The reported cause was three steps
removed from the real one. Fixed in `fa9b012` by declaring the Jahia repository in
`tests/jahia-module/pom.xml`.

The swallowing itself is still open — see issue #5. The `ignoreReturnCode: true` is not in this
repo, nor in `reusable-integration-tests.yml`: it is in the action they call, at
`jahia-modules-action` → `integration-tests/src/docker/build.ts`, which runs
`bash ci.build.sh` with `ignoreReturnCode: true`. Don't go looking for it in the workflow YAML.

**2. A script that lost its executable bit in an unrelated refactor.** `tests/env.run.sh` is the
cypress container's command. It was added correctly as `100755`, and four hours later commit
`ddb8939` — a *rename* commit — flipped it to `100644`. Same blob, mode only, and it took
`env.debug.sh`, `ci.build.sh`, `ci.startup.sh` and `ci.postrun.sh` with it. From then on the
container exited 126 with `Permission denied` and **zero tests ran**, while the job failed on a
missing `test_success` marker that says nothing about the cause.

A mode-only change is invisible in a normal diff review. `git log --raw` shows it:
`:100755 100644 5cd0aa3 5cd0aa3 M tests/env.run.sh`.

**3. A spec that stops halfway.** `quickFindPagination.cy.ts` runs 4 of its 7 tests. Mocha reports
the other three as *skipped*. There is no `it.skip` in that file. **Still open — issue #8.**

The visible outcome is not stable, which is itself the trap: issue #8 records a run that stopped
this way with `failures: 0` — fully green — while the reports kept in the tree show the same
4-of-7 stop with `failures: 1`. Do not rely on the colour. What is stable is the shape.

### Detecting the class

Compare `testsRegistered` with `tests` in the **per-spec** reports:

```bash
python3 -c "
import json,glob
for f in sorted(glob.glob('tests/results/reports/cypress_*.json')):
    s=json.load(open(f))['stats']
    flag='' if s['testsRegistered']==s['tests'] else '   <-- INCOMPLETE'
    print(f\"{s['testsRegistered']:>3} registered {s['tests']:>3} ran  {f.split('_')[1]}{flag}\")
"
```

Two caveats that matter:

- This works on the per-spec `cypress_*.json` files. It does **not** work on the merged
  `report.json` that CI publishes: in a run where pagination stopped at 4 of 7, the merged report
  read `testsRegistered: 33, tests: 33, skipped: 3` — the counters agree while three tests never
  ran. Check the per-spec files.
- A deliberate `it.skip` reports `pending`, not `skipped`, so it does not trip this. The repo has
  exactly one, the conditional `(isJahiaVanityHostnameStrategy() ? it : it.skip)` in
  `tests/cypress/e2e/quickFindUrlReverseLookup.cy.ts`.

## `window.parent` is not the Jahia shell under Cypress

`globals.d.ts` declares `CE_API` and `jahia` on `Window` — the module's own window — while the
navigation code reads them from `window.parent`. In production the module is federated into the
jContent SPA, so `window.parent === window`, both spellings coincide, and the asymmetry is
invisible.

Under Cypress they diverge: the AUT top document *is* jContent, so `window.parent` is the
**Cypress runner window**, and `chromeWebSecurity: false` (`tests/cypress.config.ts`) lets a
cross-origin write through instead of throwing.

**This is a hazard, not a diagnosis.** Issue #8 attributes the pagination teardown to
`window.parent.history.pushState(...)` reaching the runner. That attribution does not survive the
evidence in the tree: in the recorded report the run stops after test 4, so test 5 — the only test
that reaches `pushParentNavigation` — never started, and the `editSpy` in test 4 was never called,
so `CE_API.edit` never fired either. Neither proposed mechanism explains that run. **The teardown
is currently unexplained.**

What is worth carrying forward regardless:

- Code that reaches for a Jahia global on `window.parent` is a latent test-environment bug even
  though it is correct in production. Resolving the shell by *where the globals actually are*
  is the shape of the fix; it is parked, unmerged and explicitly "not ready", on
  `fix/pagination-tests-never-run`.
- `cy.spy` calls through to the real implementation. jContent defines a real `CE_API.edit`, so
  spying on the AUT's own window can genuinely open Content Editor and navigate the AUT away;
  `cy.stub` replaces instead. On `main` today `quickFindPagination.cy.ts` still spies on
  `window.parent.CE_API`, which is safe only because the runner window has no real `CE_API`.

## Ctrl+K is a toggle, not an open

`QuickFindModal` binds Ctrl+K to `setIsOpen(prev => !prev)` and the `quick-find:open-search`
custom event to `setIsOpen(true)`.

A test harness cannot read `isOpen` synchronously, so it must never send Ctrl+K to open the modal:
applied to a modal that has opened but not yet committed its render, it closes it again. Moonstone
renders nothing while closed, so the node leaves the DOM entirely and the next assertion waits its
full timeout for something nothing will reopen.

Drive the open with the **idempotent** event, replayed inside a retrying assertion, so a listener
that had not attached on the first pass receives it on a later one.

The reasoning that found this is the reusable part: **the assertion had already waited 10 seconds.**
A React commit losing a race against one Cypress command is milliseconds late, not seconds. When a
generous timeout expires in full, the state is genuinely wrong — something actively changed it —
and raising the timeout cannot help. An earlier attempt had raised it from 2000 to 10000 and
changed nothing. Fixed in #7; a rarer residual flake remains as issue #28.

## Reading a failed integration-tests run

Do **not** run `gh run view --job <id> --log-failed` unfiltered on these jobs. The log is enormous
because the action runs `printenv` (`jahia-modules-action` → `integration-tests/src/init/displayInfo.ts`),
so the entire environment is echoed twice; searching it for words like `403` or `permission`
returns substrings of container digests and input names, not errors.

Download the artifact and read the report:

```bash
RUN=<run-id>
NAME=$(gh api "repos/Jahia/quick-find/actions/runs/$RUN/artifacts" \
        --jq '.artifacts[] | select(.name|startswith("quick-find-artifacts")) | .name' | head -1)
gh run download "$RUN" -R Jahia/quick-find -n "$NAME" -D /tmp/art
# /tmp/art/results/reports/report.json  — merged stats and per-test failure messages
# /tmp/art/results/cypress.log          — why the container itself died, if it did
# /tmp/art/startup.log                  — docker compose bring-up
```

Select the artifact by name, not `.artifacts[0]`: the listing is newest-first, so on a run whose
Integration Tests job is still going, `[0]` resolves to `sbom` instead.

`results/cypress.log` is what revealed the exit-126 entrypoint bug — `docker logs cypress` showed
a one-line `Permission denied` that appeared nowhere in the job log's own error reporting.

## The rename from `kfind` is a breaking change

An installed `kfind` does **not** upgrade to `quick-find`. The OSGi bundle symbolic name changed,
so it is a different bundle: the old module has to be uninstalled, and configuration in
`org.jahia.pm.modules.kfind.cfg` moved to `org.jahia.pm.modules.quickfind.cfg`.

What the two modules do **not** collide on, contrary to a plausible first guess: the primary-nav
key (`kfind-search` vs `quick-find-search`), the i18n namespace (`kfind` vs `quick-find`) and the
GraphQL provider class names all differ, precisely because the rename was thorough. Two installed
modules therefore coexist without overwriting each other's registrations — they just both appear.

One observation worth knowing, from a single local instance rather than from documentation: after
installing the module into a long-running Jahia, the GraphQL extension's field was missing from
`Query` until the bundle was restarted. Restarting it made the field appear. Whether that is a
general property of the DXGraphQL provider's schema lifecycle is not established here.

Note also that the npm package name in `package.json` is `quickfind`, not `quick-find`, and must
stay different from the module id or the Jahia UI stops rendering the module. The root cause is
still unknown; it is listed in the README's Known Issues.

## GitHub Actions permissions belong on the job

`on-pr.yml` and `on-merge.yml` each granted `actions: read`, `checks: write`, `contents: read` and
`id-token: write` at workflow level, so every job received every scope. SonarQube raises
`githubactions:S8233` and `S8264` on this — six findings across the two files — and the resulting
security rating of B is enough to fail the Quality Gate. Fixed in `c373bdb`.

Two things make the fix less mechanical than it looks:

- **Check whether OIDC is actually used before removing `id-token: write`.** Here nothing used it,
  in either the reusable workflow or the composite actions, so it could go entirely.
- **A reusable workflow that declares no `permissions:` block runs on whatever the calling job
  grants**, and can only narrow it. `reusable-integration-tests.yml` declares none and uses
  `dorny/test-reporter`, so the calling job must grant `checks: write` — otherwise the check
  silently never reports, which reads as an infrastructure hiccup rather than a permissions bug.

Scope to what each job does, not to what is convenient: `sbom` needs `actions: read` because it
downloads `build-artifacts` and uploads `sbom`, but nothing else.
