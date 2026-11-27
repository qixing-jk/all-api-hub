# Scheduled E2E failures on 2026-11-27

Status: ready-for-agent

Investigated scheduled runs on `32fe22928614bc620f507c136d5b99e9cb9ff3b3`:

- [Browser compatibility](https://github.com/qixing-jk/all-api-hub/actions/runs/45924784428): seven browsers lost their connection while discarding the favicon fixture tab; Chrome 114 additionally failed credential-page observation; Chrome stable exhausted its 35-minute global budget. Chrome 122 also had a financial-test timeout that passed its retry.
- [Real-site E2E](https://github.com/qixing-jk/all-api-hub/actions/runs/45926790532): New API's existing-tab identity check waited for fields hidden by compact token guidance. The retained detection events showed successful identification and `access_token_verification_required`.

Local implementation baseline: `f6a22a442a`, current main when the task started. No product runtime behavior changed.

## Findings and decisions

The favicon failure reproduces on Chrome 114.0.5735.133 in both headed and headless modes, including with a minimal unrelated extension. Discard creates a dormant replacement target; removing context-wide viewport emulation keeps the browser connected. The maintained test still discards the actual tab, verifies native favicon pixels, and sizes its live extension page explicitly. Do not skip discard or replace the cached icon assertion with a mock.

The popup recovery test created a message bridge after opening the credential tab. That new page could become active before the credential-page observer matched the source window. Prepare the bridge before recovery; retain the strict window/document identity assertions. The original Chrome 114 failure and corrected pass are retained locally.

Identity-only real-site checks must wait for detection to settle and use the compact guide's existing **Open full form** action before inspecting identity fields. This does not require creating a credential or saving the account. New API's original failure and corrected real-site pass are retained locally.

The financial test replaced the fixture-adjusted deadline with a fixed 60-second deadline. Keep the fixture's startup allowance and add only the optional visual-capture budget, preserving unlimited runs.

Compatibility sharding now consumes the existing duration planner and one profile frozen by the build. Keep the same three shards, two scheduled workers, separate performance phase, flaky-test gate and timeout limits. All 981 collected cases form an exact partition. The downloaded timing profile estimates the old groups at 4193/5090/3217 seconds and the new groups at 4143/4179/4178 seconds; these are historical workload weights, not predicted wall-clock durations or proof of remote success.

## Review and retained evidence

The [local acceptance report](artifacts/acceptance.md) records commands, actual results, and remaining limits. Logs, original failures, diagnostic probes, downloaded browsers, timing profiles and real-site artifacts remain local under `artifacts/` for review. They are excluded from Git and must be reviewed/redacted before any publication.

Remote confirmation on the final commit remains outstanding. A broader local Chrome 114 run had two context-teardown timeouts; both cases passed individual reruns. The passing reruns do not establish the cause of those teardown failures. No speculative shared teardown change was made.
