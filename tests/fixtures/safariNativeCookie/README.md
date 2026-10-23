# Safari native evidence verifier fixtures

These two gzip JSON files are deliberately maintained regression fixtures for `tests/services/apiTransport/safariNativeCookieEvidence.test.ts`, not acceptance evidence for the current branch.

- `observations-2026-10-10.json.gz`: historical synthetic native A/B/TAB isolation recording.
- `formal-same-site2-20261011.json.gz`: historical classified HTTPS same-site A/B/C recording, including failed ordinary-extension ambient authentication and incomplete permission/restart acceptance.

The recordings contain synthetic Cookie identities and classified outcomes, not real credentials, site URLs, account IDs, response bodies or local machine paths. Tests mutate copies to ensure the verifier rejects contamination, incomplete later runs and missing overlap. A passing verifier test establishes the verifier's behavior; it does not rerun Safari or certify the current transport. The `formal-` filename records the attempted test, not a passing release verdict.
