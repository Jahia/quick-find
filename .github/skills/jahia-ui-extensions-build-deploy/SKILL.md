---
name: jahia-ui-extensions-build-deploy
description: "Use when building, packaging, and deploying a Jahia UI extension module (React/Vite + Maven OSGi bundle). Covers Maven/Yarn build flow, dev vs prod profile handling, provisioning API deployment, optional Cypress test run, and recreating deploy.sh behavior from documented steps."
---

# Jahia UI Extension Build And Deploy

## When To Use

Load this skill when you need to:

- Understand how a Jahia UI extension module is built from frontend sources into an OSGi JAR.
- Deploy that JAR to a Jahia instance through the provisioning API.
- Recreate or update a `deploy.sh` script that supports `dev|prod` build mode and optional post-deploy test execution.

## Project Build Model

This module uses a mixed toolchain:

- Frontend build: Vite via Yarn scripts in `package.json`.
- Java packaging: Maven bundle packaging in `pom.xml`.
- Integration point: Maven `exec-maven-plugin` runs `yarn install` and `yarn build` during `generate-resources`.

The resulting artifact is a module JAR in `target/` with pattern `quick-find-*.jar`.

## Source Of Truth For Build Modes

Build mode maps directly to Maven profile selection:

- `prod` mode:
  - Run `mvn clean install -q`
  - Uses default Yarn script: `build`
- `dev` mode:
  - Run `mvn clean install -q -P dev`
  - Overrides Yarn execution to `build:dev` via the Maven `dev` profile

## Required Runtime Inputs

Deployment script expects a local `.env` at repository root with:

- `JAHIA_URL`
- `JAHIA_USER`
- `JAHIA_PASS`

If missing, fail fast with a clear error.

## Deployment API Contract

Upload the built JAR with a multipart `POST` to:

- `${JAHIA_URL}/modules/api/provisioning`

Authentication:

- Basic auth with `${JAHIA_USER}:${JAHIA_PASS}`

Required multipart fields:

- `file=@<jar-path>`
- `script=[{"installBundle":"<jar-file-name>","autoStart":true,"forceUpdate":true,"uninstallPreviousVersion":true}]`

Success criteria:

- HTTP status in `2xx`

Failure behavior:

- Print server response body (without status marker)
- Exit non-zero

## Optional Test Phase

If command is `test`, run after successful deployment:

1. Ensure `tests/` exists.
2. Install test dependencies: `yarn install --silent` in `tests/`.
3. Load `tests/.env` or fallback to `tests/.env.example`.
4. Export env required by `@jahia/cypress` conventions:
   - `JAHIA_URL` (fallback `http://localhost:8080`)
   - `SUPER_USER_PASSWORD` from `${JAHIA_PASS}` fallback `root1234`
   - `CYPRESS_BASE_URL` = `${JAHIA_URL}`
5. Run: `yarn e2e:ci` in `tests/`.

## Canonical CLI Interface

Script usage:

```bash
./deploy.sh <dev|prod> [deploy|test]
```

Defaults:

- `mode`: required (`dev` or `prod`)
- `command`: optional, default `deploy`
- accepted commands: `deploy`, `test`

## Recreate deploy.sh Template

Use this exact script structure when recreating the deploy utility:

```bash
#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"
CMD="${2:-deploy}"

if [[ "$MODE" != "dev" && "$MODE" != "prod" ]]; then
  echo "Usage: $0 <dev|prod> [deploy|test]" >&2
  exit 1
fi
if [[ "$CMD" != "deploy" && "$CMD" != "test" ]]; then
  echo "Usage: $0 <dev|prod> [deploy|test]" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

source "$SCRIPT_DIR/.env" 2>/dev/null || {
  echo "✗ .env file not found. Create it with JAHIA_URL, JAHIA_USER, JAHIA_PASS." >&2
  exit 1
}

MVN_ARGS=(clean install -q)
[[ "$MODE" == "dev" ]] && MVN_ARGS+=(-P dev)

echo "==> Building module ($MODE)..."
t0=$(date +%s)
mvn "${MVN_ARGS[@]}"

JAR="$(ls "$SCRIPT_DIR"/target/quick-find-*.jar 2>/dev/null | grep -v sources | head -1)"
[[ -z "$JAR" ]] && {
  echo "✗ No JAR found in target/ after build." >&2
  exit 1
}

echo "==> Build done ($(du -h "$JAR" | cut -f1))"
echo "==> Deploying to $JAHIA_URL ..."

HTTP_RESPONSE=$(curl --silent --show-error --max-time 120 --write-out "\nHTTP_STATUS:%{http_code}" \
  -u "$JAHIA_USER:$JAHIA_PASS" -X POST "$JAHIA_URL/modules/api/provisioning" \
  --form "script=[{\"installBundle\":\"$(basename "$JAR")\",\"autoStart\":true,\"forceUpdate\":true,\"uninstallPreviousVersion\":true}]" \
  --form "file=@$JAR")

HTTP_STATUS=$(echo "$HTTP_RESPONSE" | grep "^HTTP_STATUS:" | cut -d: -f2)
elapsed=$(( $(date +%s) - t0 ))

if [[ "$HTTP_STATUS" -ge 200 && "$HTTP_STATUS" -lt 300 ]]; then
  printf "✓ Deployed (%s) in %dm%02ds\n" "$MODE" $(( elapsed / 60 )) $(( elapsed % 60 ))
else
  echo "$HTTP_RESPONSE" | sed '/^HTTP_STATUS:/d'
  echo "✗ Deployment failed (HTTP $HTTP_STATUS)" >&2
  exit 1
fi

if [[ "$CMD" == "test" ]]; then
  TESTS_DIR="$SCRIPT_DIR/tests"
  [[ ! -d "$TESTS_DIR" ]] && {
    echo "✗ tests/ directory not found." >&2
    exit 1
  }

  echo "==> Installing test dependencies..."
  (cd "$TESTS_DIR" && yarn install --silent)

  TESTS_ENV_FILE="$TESTS_DIR/.env"
  [[ ! -f "$TESTS_ENV_FILE" ]] && TESTS_ENV_FILE="$TESTS_DIR/.env.example"

  export JAHIA_URL="${JAHIA_URL:-http://localhost:8080}"
  export SUPER_USER_PASSWORD="${JAHIA_PASS:-root1234}"
  export CYPRESS_BASE_URL="$JAHIA_URL"

  echo "==> Running Cypress tests against $JAHIA_URL ..."
  (cd "$TESTS_DIR" && yarn e2e:ci)
fi
```

## Verification Checklist

After creating or modifying deployment logic, verify:

- Script rejects invalid mode or command values.
- `dev` mode effectively uses Maven `-P dev`.
- Exactly one non-sources `target/quick-find-*.jar` is selected.
- Provisioning API returns `2xx` on successful deploy.
- `test` mode executes Cypress only after deploy success.
- Script exits non-zero on build, deploy, or test failures.
