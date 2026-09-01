#!/bin/bash
version=$(node -p "require('./package.json').devDependencies['@jahia/cypress']")
echo Using @jahia/cypress@$version...

# Keep legacy artifact paths available for external CI publishers.
mkdir -p results artifacts/results

npx --yes --package @jahia/cypress@$version env.run
status=$?

# Make marker generation deterministic for downstream workflows.
if [[ "$status" -eq 0 ]]; then
	rm -f results/test_failure artifacts/results/test_failure
	touch results/test_success
	cp results/test_success artifacts/results/test_success
else
	rm -f results/test_success artifacts/results/test_success
	touch results/test_failure
	cp results/test_failure artifacts/results/test_failure
fi

exit "$status"
