# Novita AI account-site integration

Investigated 2026-10-25 through 2026-10-28. This document records the final
decisions and remaining validation boundaries; earlier experiments are superseded.

## Scope and ownership

Novita is an account-only site type with a dedicated adapter family. Its hosted
account API, USD balance and native key policies differ from the existing
New API and OpenRouter families. No managed-site or channel support is implied.

Registration and user documentation live with the existing site definitions,
integration guide and localized add-account/key-management pages. Protocol
handling belongs in `src/services/apiService/novita/`; account capabilities
belong in `src/services/apiAdapters/novita/`. The maintained browser reproducer
is `scripts/test-novita-e2e-live.mjs` (`pnpm e2e:cdp:novita`).

## Domains and authentication

| Origin | Role |
| --- | --- |
| `https://novita.ai` | Saved account and browser-session origin; login is a modal at `/console`, keys at `/settings/key-management`. The www host redirects to the apex. |
| `https://api-server.novita.ai` | Console identity, balance, key inventory and native management API. |
| `https://api.novita.ai/openapi` | API-key-authenticated account reads and model/IP policies. |
| `https://api.novita.ai/openai/v1` | OpenAI-compatible inference and public model catalog. |
| `https://api.novita.ai/anthropic` | Anthropic-compatible inference export target. |
| `https://docs.novita.ai` | Documentation, not an account origin. |

Automatic onboarding acquires the signed-in console bearer because it supports
complete native key management without issuing an inference key. The console
token is opaque; observed cookie expiry does not establish a permanent lifetime.
It is explicitly encoded locally, never classified by a guessed token prefix,
never exported for inference, and must be reacquired after expiry.

An independent `sk_` API key supports balance, inventory, model/IP policies and
inference without keeping the website signed in. Its creation-time lifetime can
be permanent, 90 days, 30 days or 24 hours. It cannot create, rename or delete keys.
The two editable credential fields preserve one another, and saving a pair
verifies both against the same account UUID. Existing single credentials remain
readable through the existing atomic account storage/backup/sync paths.

Reads prefer the console bearer; only HTTP 401 admits one API-key read retry.
Policy writes use an available API key; native CRUD requires the console bearer.
Writes and non-authentication read failures are never replayed with another
credential. Explicit API-key verification and console acquisition remain separate
from ordinary automatic detection and its same-account session recovery.

## Protocol and native-editor decisions

- Identity is verified through `/v1/user/info`; balance through
  `/v1/billing/balance/detail`; masked inventory through `/v2/user/key`
  with policy summaries. Amounts are strings in 1/10000 USD. Available balance
  is authoritative, not reconstructed from cash plus credit limit. Zero cash is
  retained; credit limit is a borrowing ceiling, not a subscription allowance.
- Console key creation is `POST /v2/user/key`, rename is
  `PUT /v2/user/key`, and delete is `DELETE /v2/user/key/{stringId}`.
  Creation returns a one-time secret. Never infer a reveal endpoint from masks.
  Expiry is immutable and uses native UTC `YYYY-MM-DD HH:mm:ss`, not seconds.
- Separate model/IP policy endpoints hydrate editable state. Updates compare
  fresh state with the baseline, retain untouched fields and read back requested
  changes. A lost mutation response remains uncertain. Failed creation cleanup
  targets only an ID proven created by that operation and confirms its absence.
- Native parity covers name, lifecycle, all-enabled/selected models, exclusions,
  IPv4/CIDR restrictions, reopening and deletion confirmation. Native bulk policy
  editing and configuration copy/paste remain outside this focused integration.
- Console model choices use native full model names. API-key-only or expired
  console contexts use optional public-catalog suggestions and allow manual full
  IDs. Public candidates do not prove account access or policy acceptance; saved
  IDs survive discovery failure. Short aliases are not guessed.
- Public prices use exact decimal USD strings where available, otherwise native
  per-million prices divided by 10000. Account-bound verification/export uses
  linked full inference keys and observes allow/exclude policies; public catalog
  browsing alone does not acquire account actions.
- Mask matches are possible credential correlations only. Provider-confirmed
  identity outranks full linked plaintext, which outranks masks. Shared resolution
  and badge presentation cover Novita and Requesty. Only provider confirmation
  permits stored-account-secret recovery; confirmed profile links retain their
  existing separate secret authority.
- Shared name resolution prefers valid deployment settings, exact registered
  platform hosts, page titles, then domains. Explicit draft name edits survive
  detection and popup handoff; this adds no persisted account schema.

## Capability boundaries

| Capability | Disposition |
| --- | --- |
| Onboarding, same-account recovery, balance, key inventory | Implemented. |
| Console create/rename/delete, model/IP policy editing | Implemented; native live roundtrip retained below. |
| Account model verification, batch/CLI checks and export | Implemented with full-key/policy admission; fixture coverage, no successful paid inference claim. |
| Public model catalog and prices | Implemented; provider-wide visibility is explicit. |
| Invitation/referral | Deferred: observed account had no invite code before GitHub verification; eligible-account retrieval remains unverified. |
| Announcements | Deferred; console-only routes were observed, no announcement integration is claimed. |
| Today usage and per-request history | Not adapted: non-empty day-window billing semantics were not established; do not invent logs from aggregate bills. |
| Plans, redemption and check-in | No matching supported account workflow was observed; no such capability is advertised. |
| Managed resources | Not applicable to this account-only integration. |

## Evidence and remaining gaps

Raw responses, website bundles, authenticated screenshots, failed runs and local
probes remain ignored under `evidence/`. They may contain account data and must
be reviewed separately before sharing. The historical development journal is
retained locally as `evidence/finish-original-spec.md`; it is not a delivery
companion. Do not delete local evidence while review or acceptance needs it.

- Native hosted roundtrip: `evidence/cdp-1793095588684/evidence.json` records
  console detection/save/refresh, live API-key policy writes and full console
  create/edit/delete. Disposable keys and the temporary account were removed;
  the original inventory was restored. This predates later form refinements,
  so it establishes the retained protocol rather than final paired live UI.
- Later field/recovery acceptance: `evidence/acquire-acceptance.md`,
  `evidence/auto-mode-acceptance.md`, `evidence/feedback-acceptance.md`.
  Pair validation, expired-console fallback, acquisition isolation and failure
  handling have automated coverage. A new full paired-credential live roundtrip
  and real server expiry/renewal were not independently repeated.
- Final model suggestions: `evidence/public-hints-acceptance.md`, including
  the retained failing custom-Enter browser run and its regression repair.
- Representative earlier comparisons remain under
  `evidence/credential-comparison/`, `evidence/identity-visual/` and
  `.scratch/visual-comparisons/`. Fixture/data differences and missing baselines
  are described in their reports; comparisons are not pixel-equality claims.
- Final branch-finish acceptance and reproducible commands:
  `evidence/finish-acceptance.md`. It records current affected tests,
  extension E2E, static checks, visual review and delivery exclusions.

Production-extension CDP evidence is available. Development/HMR loading remains
unverified because the dedicated browser had the production extension installed.
Role/team variants, real sign-out recovery, successful paid inference, and an
eligible referral account remain validation gaps. Tests cover failure/identity
admission without signing out the user's browser. No new provider mutations or
paid calls are required for local branch finishing.