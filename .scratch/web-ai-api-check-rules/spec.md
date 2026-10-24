# Web AI API check: black/white site rules

Status: ready-for-human

## Accepted decisions

- Use black/white lists with configurable overlap priority (blacklist first by default), per-rule syntax and a local URL decision preview. Manual context-menu checks remain independent.
- Use a secondary add/edit dialog with explicit confirmation, bulk entry/deduplication and independently configured rows. Browser-tab choices retain the newest full page URL per origin; shortcuts distinguish a full page, whole site and subdomains.
- Preserve legacy domain/path-prefix and case-insensitive regex behavior. Empty restricted scopes must remain blocked: adopting typed lists converts them to an explicit block-all blacklist rule. An unconfigured legacy empty regex allowlist instead adopts the all-websites default while disabled switches stay disabled.
- Keep the settings surface continuous, with inline actions and separately expandable long lists showing three complete rules and a faded continuation. Cancelled and failed drafts remain available without implicit writes.

## Remaining compatibility decision

The exported `summarizeWebAiApiCheckSiteAccess` interface describes only legacy scopes and is currently consumed by tests. Decide whether to retire it or replace its contract before exposing it for typed-list summaries. Runtime decisions and the current settings preview already use the typed-rule policy.

## Review evidence and limits

Investigated final implementation `f84e65fcbf` against `fa8a675922` on 2026-10-25. Chinese, English and Japanese usage-guide sections now describe the final typed-list UI and configurable priority.

Keep ignored `artifacts/` and the existing `.scratch/visual-comparisons/` runs locally while review is pending. They retain real before/after captures, rejected stale-build evidence, failed attempts and passing behavior runs; `artifacts/finish-original-spec.md` retains their detailed execution record. `artifacts/scout-refactor.md` records the full branch audit. Six Chromium feature workflows plus the build prerequisite passed before the behavior-preserving final refactor; related final unit tests, compile, knip and commit-hook checks passed afterward. Firefox and authenticated daily-browser validation have not run. Long-list visuals have an after-only capture; no preceding equivalent fixture was simulated.

Prototype source stays on its separate prototype branch. Review-only media and execution logs stay local. No cleanup is proposed while review is pending.
