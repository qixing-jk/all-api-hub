# PM-Plan account integration

PM-Plan is an account-only integration for the hosted console and independently hosted installations. This is its first, unreleased adaptation; intermediate development formats do not require production migrations. Preserve existing shared storage contracts.

The maintained [acceptance report](artifacts/review-20261127/acceptance.md) records final behavior, retained visual evidence and verification limits. Local execution history, earlier proposals, logs, screenshots and raw captures remain under ignored `artifacts/` and `evidence/`; they are not delivery assets.

## Evidence and integration boundary

The authoritative upstream is [gh7mk2l2/pm-plan](https://github.com/gh7mk2l2/pm-plan), investigated on 2026-11-27 at `1217291345fb154c6424d9338434c256a03f6292`. The deployed frontend at [plan.pmcat.top](https://plan.pmcat.top/) matched `46cd78064ec8072abb445db5290db58b617d0754`; the deployed backend revision was not independently exposed. [Pinned research](artifacts/upstream-20261127/research.md) distinguishes source contracts from observations. The similarly named `red0908/PM-Plan` repository is unrelated.

PM-Plan has one site type and adapter family. Its bare dashboard, OAuth Cookie authentication, rolling allowances and native keys differ from PM-API, so it is not an alias. Managed-site administration, paid inference, plan upgrades, ZCode grants, card consumption/redemption and full paginated usage analytics are outside this integration.

The official hostname retains fast detection. Other deployments require the positive public `/api/health` marker (`ok`, program `name`, `version`, `time`) through a bounded, credential-free, nonredirecting GET; conflicting known signatures reject classification. Upstream `BASE_URL` is configurable. The hardcoded `bootstrap.app.homepage` is not a routing authority. Each account retains its origin for detection, login, saved credentials, refresh and `/v1` exports; equal user IDs at different origins are separate accounts.

## Authentication and mutations

The console uses Linux DO OAuth, a host-scoped `pmplan_session` and separate Cloudflare clearance. Console authentication is Cookie-only; inference Bearer keys cannot replace it. Automatic session renewal is unverified. Recovery is login and re-detection for the same deployment and account.

Every native operation verifies the saved user identity. A mutation and its readback share one captured session; wrong identity, expired credentials, invalid URLs and cross-origin endpoints fail without borrowing ambient credentials. Chromium uses the existing isolated Cookie owner; Firefox requires its explicit Cookie interceptor permission. Native writes send `X-PMPlan-CSRF: 1`, and cancellation follows the captured operation.

Hosted live runners require exactly one saved PM-Plan account matching console origin and verified user ID. Notice polling also matches the selected saved-account ID. Only keys submitted and confirmed by the current writable run may be cleaned up; evidence-write failures must not discard cleanup ownership.

## Native meaning and product behavior

| Native fact or task | Product contract |
| --- | --- |
| `usage.{h5,weekly,monthly}_used/_limit` | Overlapping 5H, 7D and 30D allowances in integer micro USD; 1,000,000 units = USD 1. Preserve each used/ceiling/remaining observation. Display the tightest finite remaining window first; null limit means unlimited. Never sum windows or include them in purchased-cash totals. |
| Current plan | Preserve native name and limits. Do not invent expiry, reset countdown, upgrade eligibility or payout. |
| `requests_30d`, `tokens_30d` | Rolling historical counters. Monthly used allowance can reset through a card and is not historical spending. |
| `daily_usage` and `checkin.today` | Require one valid matching server-day aggregate. Preserve exact USD and reported day as site_today; exclude it from globally comparable today totals because reset boundaries are unverified. Missing, duplicate or invalid data is unavailable. |
| Model square and available models | Personalized catalog plus account-eligible channel facts, read in one captured session. Restricted entries remain visible and unavailable. Account pricing must not be attributed to one inference key. |
| Input/output channel rates | Structured USD per million tokens; source resolves the native square's incorrect 1K caption. Available models use eligible-channel rates; restricted entries retain catalog rates. One channel has a published rate; multiple channels expose independent minima as estimated Lowest channel price, including zero/asymmetric rates. Quotes support estimates, never guaranteed charges. |
| Native model tiers | Preserve all tiers and order. Render an inline list with known display names, preserve custom names and highlight the current plan. |
| Personal notices | Account-scoped latest notices with native read facts. Reject cross-account batches; local read changes do not acknowledge upstream. Nonempty and failure behavior uses controlled fixtures because live notices were empty. |
| Standalone hosted inference credential | Auto telemetry reads runtime models only and directs users to Account Management for console allowances/usage. Explicit telemetry configurations remain available. Self-hosted standalone credential discovery is outside this change. |
| Native check-in | Automatic execution defaults off. The slider requires manual verification; continuation uses bounded shared page actions and independent identity/day/status readback. Opening or clicking is not proof of a grant. |

## Native key tasks

| Task | Adaptation and limits |
| --- | --- |
| Create | Expiry and model restrictions share basic settings. Default to never expiring, following the extension convention; retain timed presets and custom date. No invented name or spend-limit fields. |
| Model scope | Empty selection dynamically follows all account-available models, including later additions. An empty available-model list still permits unrestricted creation. |
| One-time secret | Only the create response exposes plaintext. Inventory preserves the native prefix and missing-secret state. Acknowledgement, copy/export and caller-appropriate import use existing owners. Never infer a secret from its prefix. |
| Update | Active, unexpired keys expose model restrictions only. PUT replaces the list with at most 200 entries. Empty clears restrictions; expiry and secret remain unchanged. |
| Concurrent or obsolete edit | Fresh detail rejects changed model scope, invalid status and unsupported selections. Previously selected unavailable models remain visible so users can clear them. Upstream has no atomic compare-and-swap guarantee. |
| Revoke | Preserve accepted-write evidence before inventory readback. Failed confirmation remains uncertain and must not invite blind replay. Do not fabricate delete/rotate/enable operations. |
| Validation recovery | Changing a field clears only its own validation errors; other field errors and non-validation failures remain visible. An old editor cannot change a newer editor. |

## Shared owners

Reuse the registered account adapter, canonical allowance/usage models, native key workflow, announcement store and model pricing/presentation. PM-API and PM-Plan share native-page check-in orchestration while retaining protocol/discovery differences. Xiaoen and PM-Plan use the existing Cookie operation owner's browser-specific preparation.

Provider field and section rules live in provider modules behind the existing native key editor dispatcher and shared primitives. `MODEL_GROUP_ACCESS_EVIDENCE_KINDS` owns the four exact discriminants used by catalog producers, schemas and consumers; runtime values and meanings remain unchanged.

## Acceptance and evidence gaps

The [maintained branch report](artifacts/review-20261127/acceptance.md) is the reviewer entry point. Supporting reports cover [deployment isolation](artifacts/deployment-20261128/acceptance.md), [pricing and tiers](artifacts/native-ui-20261128/acceptance.md), [key defaults](artifacts/key-default-20261128/acceptance.md), [native keys/notices](artifacts/upstream-20261127/acceptance.md), [telemetry](artifacts/telemetry-fix-20261127/acceptance.md), [branch audit](artifacts/scout-current-20261128/acceptance.md) and [shared-policy/tooling follow-ups](artifacts/followups-20261128/acceptance.md).

Retain these limits until their prerequisites are available:

- Self-hosted onboarding uses two controlled origins and wire-level Cookie assertions, not a running PM-Plan backend; the local Docker engine was unavailable.
- Real-site evidence comes from Edge CDP; controlled extension flows ran in Chromium. Firefox permission/isolation has unit coverage; Firefox and Safari browser acceptance was not run.
- The live account was already checked in. Unchecked slider completion and an actual grant remain unverified.
- Live notices and usage logs were empty. Nonempty notices, malformed responses, expired sessions and mutation-readback failures use controlled fixtures.
- Prior screenshots and live runs describe their recorded builds. Behavior-preserving refactors reuse that evidence with affected unit/component checks; they are not fresh live runs.

Maintained runners: `pnpm e2e:cdp:pmplan`, `e2e/pmplanAccountSemantics.spec.ts` and `e2e/pmplanDeploymentOnboarding.spec.ts`. Writable live execution requires authorization and run-owned disposable resources. No paid inference is required.

Related requests: [#1801](https://github.com/qixing-jk/all-api-hub/issues/1801) reports the supported hosted-account detection failure. [#1877](https://github.com/qixing-jk/all-api-hub/issues/1877) also requests redemption, which remains outside this integration; use a non-closing reference for that broader request.
