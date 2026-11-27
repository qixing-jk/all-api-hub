# PR #1950 feedback evidence

The repair concerns https://github.com/qixing-jk/all-api-hub/pull/1950, initially reviewed at `cd2d3dbf5da769d7c469bb9e45228c1aad67ec00`, with base `c8f77a29a5cc126c03deaf211c2e7e33a4a504c1` integrated locally. Regression behavior is documented in the associated tests.

Keep `artifacts/` local for review: `worklist.md` tracks feedback, `coverage-review.md` records all 23 provider-reported files, and collection snapshots retain remote evidence. Red/green logs and scoped coverage reports preserve the reproduction and validation chain. `chromium/` contains the browser captures; `chromium.log` and `firefox.log` record browser results. These synthetic browser runs and mocked live-runner checks do not establish current real-site acceptance. No live credentials were used by this repair task.

The current known verification limits are Safari execution and real-site login/rotation. Chromium exercises the application signing store and key reuse after reload; Firefox exercises native website signing and the platform's non-exportable-key persistence. IndexedDB callback error/concurrency tests complement those browser checks.

The review's MSW suggestion was adopted for redirect and identity-validation scenarios, where native Fetch semantics matter. Existing dispatch-level doubles remain for assertions about request options, signing bytes, bounded retries and cancellation. The full test-suite rewrite was not required for these repairs.

Remote CI, coverage and bot acceptance must be reconciled against the pushed repair SHA before delivery. The final collection and worklist under `artifacts/` record that outcome; original-head results must not be reused as repair-head evidence.
