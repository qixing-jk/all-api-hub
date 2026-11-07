# Account Cookie verification and AnyRouter login recovery

## Scope and decisions

AnyRouter is the first adopted consumer of account-owned Cookie recovery. Recovery is opt-in and uses the existing login configuration and check-in method. Additional production sites and Token renewal (including Sub2API) require separate adoption and verification contracts.

Independent Cookie diagnostics are available where Cookie authentication and an account identity reader are supported. A successful normal operation may use a saved Token or ambient browser session, so it does not prove that the supplied Cookie works. Verification must authenticate that exact Cookie and compare the expected identity; unavailable transport, permissions, network or website verification are inconclusive.

The adapter owns login protocols, supported methods, required inputs and credential capture. Shared browser login owns session lifetime and cancellation. Recovery owns eligibility, serialization, independent exported-Cookie verification and guarded persistence. Operations own retry admission: only explicitly admitted safe reads retry, once, after persistence. A GET method alone is insufficient because some New API GET endpoints mutate credentials. Putting recovery in the lowest transport layer was rejected to avoid recursive recovery during discovery, login and verification.

Check-in verifies identity before dispatch and rechecks current execution intent before the mutation. An uncertain mutation is never replayed. Manual editor recovery and verified import update only the current draft; saving is a separate action. Closing or changing that draft cancels its recovery. Cancellation of a queued caller must not cancel another caller's login.

Keep production adoption separate from implemented adapter methods and read-only deployment discovery. Alternate adapter-family contract fixtures establish reusable boundaries, not hosted support for those sites. Login success alone never proves that an exported credential can authenticate a subsequent account request.

## Investigated AnyRouter protocol

Observed on `https://anyrouter.top`, 2026-11-04:

- Anonymous `/login` and `/api/status` exposed GitHub, Linux DO and native password login. The native form submits username/password to `/api/user/login` and completes at `/console`.
- The frontend triggers `/api/user/sign_in` when its authenticated user is loaded. A balance/key recovery can therefore cause a website check-in. Preserve the subsequent already-checked-in outcome and never use this mutating endpoint as a validity probe.
- Anonymous frontend bundle SHA256: `23c862eb98bda604068a1f4205d60c047ff5d9edf1e3f191331fe31e7e945fb9`. These observations describe this deployment, not every New API fork.

Capture the session Cookie from the actual login tab's browser partition before it closes. Do not substitute ambient cookies from another partition. Cookie export must independently authenticate the expected account before either draft acceptance or automatic replacement.

## Hosted evidence and remaining coverage

Hosted AnyRouter/Linux DO verification on 2026-11-07 established invalid saved-Cookie isolation despite an authenticated browser, manual recovery, independent validation, save/reopen readback, and automatic recovery followed by another authenticated refresh without a second login. The invalid Cookie was deliberate test input; OAuth, transport, server responses and storage were real.

An initial dedicated check-in recovery failed when `/api/oauth/state` returned HTML 403 and the ESA response reported `Denied by http_ratelimit`. No extension-provider sign-in POST followed that failed preflight. After public APIs returned JSON again, one owned-account quick-check-in at 12:26 UTC produced a self-endpoint 401, one Linux DO callback, verified identity, persisted replacement Cookie and the extension's persisted successful check-in result. Native page loading also emitted sign-in requests, so one UI action does not imply one total POST.

This proves the tested rejected-Cookie recovery scenario, not every reported 401 cause. Hosted evidence predates the final shared-contract and cancellation changes. Those changes have controlled Chromium coverage; Firefox and other hosted login methods remain unverified. To close these gaps, exercise an authorized account on the target browser/method with an invalid saved Cookie and require independent credential verification, persisted readback and the subsequent operation's authoritative result.

Local private evidence is indexed in [hosted coverage](artifacts/live-20261107/coverage.md). Raw captures, scoped session transfers, browser profiles and screenshots must remain local; they can contain private session material.

## Maintained validation and reproducer

Regression owners:

- `tests/services/accountLogin/`: configuration, migration, method/adoption contracts, recovery concurrency, cancellation and Cookie validation.
- `tests/services/accountCredentialRecovery/manual.test.ts`: runtime admission, manual results and cancellation.
- `tests/services/apiService/anyrouter.credentialRecovery.test.ts` and `tests/services/autoCheckin/providers/anyrouter.test.ts`: safe-read recovery and mutation admission.
- `tests/features/AccountManagement/`: editor verification/import/recovery, permissions and navigation, with related check-in/key/overview component tests.
- `e2e/dnrRequired/accountCredentialRecovery.spec.ts`: controlled Chromium password login, isolated exported-Cookie verification, manual draft/save/reopen and cancellation.
- `e2e/dnrRequired/accountCookieDnrRealBrowser.spec.ts`: actual Cookie request isolation.

The reusable task-scoped [CDP matrix](cdp-cookie-matrix.mjs) uses fake accounts and a local HTTP fixture in its own profile. From the repository root, build the DNR variant with `AAH_E2E_BUILD_VARIANT=dnr-required pnpm build:e2e`, then run `node .scratch/account-auth-recovery/cdp-cookie-matrix.mjs`. Set that environment variable using the current shell's syntax. The runner verifies build freshness, supports `--case` and `--group` selection, asserts request/storage/UI outcomes and records cleanup errors. It is controlled Chromium evidence, not a production OAuth or Firefox test.

The final implementation's [acceptance report](artifacts/scout-20261108/report.md) indexes unit, browser, CDP and visual evidence. Intermediate logs and screenshots are retained locally for diagnosis; their existence is not evidence of a passing case. The first cancellation browser scenario used Escape after a popup opened; the maintained test uses the explicit Cancel button. A later diagnostic was unavailable once and passed unchanged with tracing; its cause remains unknown.


## PR 1839 repair evidence

The follow-up repair retains opt-in recovery while deferring the recovery dependency graph until an admitted read, preserves non-authentication HTTP rejection classification, and completes automatic Cookie import before applying detected identity. Local red/green results and the per-file coverage disposition are retained in [the PR worklist](../pr-1839/artifacts/worklist.md). Controlled browser artifacts are in `artifacts/pr-1839/`; CI/Codecov/CodeRabbit acceptance remains tied to the final pushed SHA. These artifacts remain local until remote reconciliation and developer review finish.
