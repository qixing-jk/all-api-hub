# E2E Scenario Environment Split Design

Date: 2026-05-21

## Purpose

Reduce duplicated maintenance between mocked Playwright E2E coverage and
real-site Playwright E2E coverage by separating reusable user-journey scenarios
from the environment setup that supplies a mocked site or a live upstream site.

The selected approach is not a single spec whose behavior changes through a
network-layer flag. Instead, the repo should keep separate mocked and real-site
spec entrypoints, while both call shared scenario functions for journeys that
are valuable in both environments.

## Current Context

- Regular E2E specs under `e2e/*.spec.ts` are the default browser-extension
  regression suite and run through `pnpm e2e`.
- Real-site specs under `e2e/realSite/*.spec.ts` run separately through
  `pnpm e2e:real-site` and skip when required environment variables are
  missing.
- Real-site account flows already share part of the journey through
  `e2e/utils/realSite/accountKeyFlow.ts`, which logs into a site, saves an
  auto-detected account, creates a test key, and deletes it.
- That current combined real-site flow is useful as an end-to-end smoke path,
  but it should not become the only reusable shape. Key-management scenarios
  often need an already-saved account as the precondition and should not be
  forced to repeat account auto-detection every time.
- Mocked E2E specs often provide their own site pages, localStorage state, and
  HTTP responses through Playwright `context.route`.
- Extension account auto-detection is not purely an HTTP client flow. It can
  involve content scripts, page localStorage, background/temp-window fetches,
  service-worker storage, and API-service calls.

## Problem

Maintaining a mocked E2E suite and a real-site E2E suite can become expensive if
the same user journey is copied into both suites with only small setup
differences. That duplication makes behavior changes harder to update and
increases the chance that mocked coverage and real-site coverage drift.

A tempting alternative is to keep one spec and switch between mocked and real
network calls through configuration. That would reduce files, but it does not
match this extension's runtime shape:

- Account detection may need a real page session and localStorage state, not
  only a backend API response.
- Some site types use content-script or temp-window flows before falling back to
  API calls.
- Mocked and real-site suites need different CI behavior, skip rules, runtime
  expectations, failure interpretation, and cleanup logic.

When a single spec changes identity based on configuration, failures become
harder to classify. A failure might be a product regression, a stale real-site
selector, an expired test account, a network issue, a rate limit, or a mock
fixture problem.

## Goals

- Share reusable E2E journey logic between mocked and real-site coverage.
- Keep mocked E2E and real-site E2E as separate test entrypoints with separate
  commands, reporting, and skip behavior.
- Make environment-specific behavior explicit through small adapters.
- Preserve mocked E2E as the broad, deterministic regression suite.
- Preserve real-site E2E as a small live contract/canary suite.
- Avoid duplicating full UI and edge-case matrices across real-site specs.
- Split account auto-detection/account-save scenarios from key-management
  scenarios that operate on an existing account.
- Allow real-site key-management coverage to prepare an existing extension
  account directly when the scenario is not about auto-detection.
- Preserve scenario isolation by default. Shared scenarios must not force normal
  mocked or real-site feature tests to run account-add setup first.
- Keep real-site cleanup owned by the real-site adapter or scenario finalizer.

## Non-Goals

- Do not make every E2E scenario environment-agnostic.
- Do not run real-site coverage as part of the default `pnpm e2e` path.
- Do not replace focused Vitest/service tests with more real-site E2E tests.
- Do not create a network-layer flag that makes one spec alternate between
  mocked and live upstream behavior.
- Do not add broad new abstraction for flows that only exist in mocked E2E.
- Do not turn account-add into a mandatory upstream dependency for other
  account-backed scenarios.

## Design

### Scenario Layer

A scenario is the reusable user journey. It describes what the user does and
what product outcome must be true, without owning how the external site is
provided.

The account area should be split into two scenario families:

1. Account auto-detection scenario: prove that a logged-in or otherwise
   detectable site can be recognized and saved as an extension account.
2. Existing-account scenario: prove that an existing saved account can be
   used to create, verify in UI, and delete an API key.

A composed smoke flow may call both scenario families, but that should be an
explicit composition of the two scenario families, not a third account
preparation mode. The existing-account scenario should not always create its own
account by auto-detection.

Example account auto-detection scenario:

```ts
export async function runAccountAutoDetectScenario(
  env: AccountAutoDetectEnvironment,
) {
  const serviceWorker = await env.getServiceWorker()
  await env.prepareExtensionState?.(serviceWorker)

  const sitePage = await env.openSitePage()

  try {
    const detectionContext = await env.prepareDetectableSite(sitePage)

    const savedAccount = await saveAutoDetectedAccountFromApp({
      page: env.extensionPage,
      extensionId: env.extensionId,
      serviceWorker,
      baseUrl: env.baseUrl,
      siteType: env.siteType,
      expectedSiteType: env.expectedDetectedSiteType,
      prepareDetectedDialog:
        detectionContext?.prepareDetectedDialog ?? env.prepareDetectedDialog,
    })

    return env.toAccountFixture(savedAccount)
  } finally {
    await env.cleanup?.()
    await sitePage.close().catch(() => undefined)
  }
}
```

Example account key-management scenario:

```ts
export async function runAccountKeyLifecycleScenario(
  env: AccountKeyLifecycleEnvironment,
) {
  const serviceWorker = await env.getServiceWorker()
  await env.prepareExtensionState?.(serviceWorker)
  const account = await env.resolveAccountFixture(serviceWorker)

  try {
    const tokenName = env.buildTokenName()
    const tokenResult = await createAndVerifyTokenFromApp({
      page: env.extensionPage,
      extensionId: env.extensionId,
      accountId: account.accountId,
      siteType: account.siteType,
      baseUrl: account.baseUrl,
      tokenName,
      openFromAccountRow: env.openFromAccountRow ?? true,
    })

    await env.onTokenCreated?.({
      page: tokenResult.page,
      tokenName,
    })
  } finally {
    await env.cleanup?.()
  }
}
```

The exact implementation can reuse existing helpers. The important boundary is
that the scenario owns the user journey and assertions, while the environment
adapter owns setup details.

### Environment Interface

Each environment interface should be narrow and purpose-built for one scenario
family. It should not try to model all E2E needs.

Account auto-detection environment:

```ts
export type AccountFixture = {
  accountId: string
  siteType: string
  baseUrl: string
  cleanup: () => Promise<void>
}

export type AccountAutoDetectEnvironment = {
  label: string
  extensionId: string
  extensionPage: Page
  baseUrl: string
  siteType: string
  expectedDetectedSiteType?: string
  getServiceWorker: () => Promise<ServiceWorker>
  prepareExtensionState?: (serviceWorker: ServiceWorker) => Promise<void>
  openSitePage: () => Promise<Page>
  prepareDetectableSite: (
    sitePage: Page,
  ) => Promise<void | { prepareDetectedDialog?: PrepareDetectedDialog }>
  prepareDetectedDialog?: PrepareDetectedDialog
  toAccountFixture: (savedAccount: SavedAccountUiResult) => AccountFixture
  cleanup?: () => Promise<void>
}
```

Existing-account environment:

```ts
export type AccountKeyLifecycleEnvironment = {
  label: string
  extensionId: string
  extensionPage: Page
  getServiceWorker: () => Promise<ServiceWorker>
  prepareExtensionState?: (serviceWorker: ServiceWorker) => Promise<void>
  resolveAccountFixture: (serviceWorker: ServiceWorker) => Promise<AccountFixture>
  openFromAccountRow?: boolean
  buildTokenName: () => string
  onTokenCreated?: (result: { page: Page; tokenName: string }) => Promise<void>
  cleanup?: () => Promise<void>
}
```

Keep the interfaces concrete to their scenario families. If another journey
needs a different shape, introduce a separate environment type instead of
expanding either one into a generic testing framework.

`AccountFixture` is the handoff contract between the two scenario families. It
is a test-private resource handle, not a global "there is some account in
storage" signal. It can come from account auto-detection or from a seeded
existing account. A composed real-site smoke test should pass this object
explicitly from `runAccountAutoDetectScenario` into the existing-account
scenario adapter. This avoids relying on implicit extension storage state or
repeating auto-detection when the tested behavior only needs a saved account.

Every fixture producer must return a unique account identity for the current
test and a cleanup function that removes task-created extension state and any
external resources it created. Existing-account scenarios should call
`account.cleanup()` in their own finalizer only when they own fixture cleanup;
when a composed smoke passes an account from the account-add scenario, ownership
must be explicit so cleanup runs once.

### Isolation Policy

Shared scenario functions are about reusing behavior assertions, not about
forcing tests into one long chain. The default for both mocked and real-site
feature coverage is isolated setup:

- Mocked feature specs seed the smallest account fixture they need, register
  only the required routes, and clean up extension storage at the end of the
  test.
- Real-site feature specs seed or resolve a saved extension account from
  verified real-site config when the feature only needs an account precondition.
- Account-add specs own account detection and account creation assertions.
- Composed smoke specs are intentionally rare and explicitly named. They exist
  only to prove the account-add output can feed at least one existing-account
  scenario.

An existing-account scenario must never call account auto-detection internally.
It only accepts an `AccountFixture`. This keeps failure isolation clear: if key
management fails in an isolated fixture test, the failure is not hidden behind
login, detection, or account-add setup.

### Mocked Adapter

The mocked adapter supplies a deterministic site environment:

- Register Playwright `context.route` handlers for site and API endpoints.
- Serve a minimal HTML page for the site origin.
- Seed page localStorage or dashboard state needed by content-script detection.
- Seed extension preferences through existing service-worker helpers.
- Provide stable fake API responses for account detection, token creation,
  token listing, token verification, and token deletion.
- For key-management scenarios, seed a saved account directly when
  auto-detection is not the behavior under test.
- Use per-test account ids, base URLs, token names, and cleanup helpers so
  parallel mocked specs do not share mutable account state.

The mocked adapter is allowed to cover edge cases and matrices because it is
fast, deterministic, and under repo control.

Example auto-detection usage:

```ts
test("auto-detects and saves a mocked compatible site account", async ({
  context,
  extensionId,
  page,
}) => {
  await runAccountAutoDetectScenario(
    createMockCompatibleAutoDetectEnvironment({
      context,
      extensionId,
      page,
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://mock-new-api.example.com",
    }),
  )
})
```

Example key-management usage:

```ts
test("creates and deletes a key for an existing mocked account", async ({
  context,
  extensionId,
  page,
}) => {
  await runAccountKeyLifecycleScenario(
    createMockCompatibleKeyLifecycleEnvironment({
      context,
      extensionId,
      page,
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://mock-new-api.example.com",
    }),
  )
})
```

### Real-Site Adapter

The real-site adapter supplies a live upstream environment:

- Resolve required environment variables.
- Skip with a clear reason when required variables are missing.
- Open the real site page.
- Log in through API or UI according to the site helper.
- Reuse existing site-specific selector overrides and login helpers.
- Use unique test token names.
- Delete created tokens in cleanup/finally paths.
- For existing-account scenarios, resolve an `AccountFixture` either from the
  account just returned by auto-detection or from a seeded saved account
  prepared from verified real-site config.
- Keep real-site specs conservative about parallelism when they share the same
  upstream test account. Per-test token names and cleanup are required.

The real-site adapter should avoid UI state matrices and unusual edge cases.
For each backend family, it should keep to a representative live contract flow:
login/session exists, account auto-detection works, account save works, key
creation works, and cleanup works.

That representative flow can be expressed as one composed smoke spec. The
important point is that the auto-detection scenario returns the account fixture,
and the existing-account scenario consumes that exact fixture:

```ts
test("auto-detects a real New API account and verifies key lifecycle", async ({
  context,
  extensionId,
  page,
}) => {
  const realSite = resolveNewApiRealSiteConfig()
  test.skip(
    !realSite.config,
    getNewApiRealSiteSkipReason(realSite.missingEnvKeys),
  )

  const autoDetectEnv = createRealNewApiAutoDetectEnvironment({
    context,
    extensionId,
    page,
    config: realSite.config!,
  })
  const savedAccount = await runAccountAutoDetectScenario(autoDetectEnv)

  await runAccountKeyLifecycleScenario(
    createRealNewApiKeyLifecycleEnvironment({
      context,
      extensionId,
      page,
      config: realSite.config!,
      savedAccount,
    }),
  )
})
```

Existing-account specs can also bypass auto-detection by seeding the account
fixture directly:

```ts
test("creates and deletes a key for an existing real New API account", async ({
  context,
  extensionId,
  page,
}) => {
  const realSite = resolveNewApiRealSiteConfig()
  test.skip(!realSite.config, getNewApiRealSiteSkipReason(realSite.missingEnvKeys))

  await runAccountKeyLifecycleScenario(
    createRealNewApiKeyLifecycleEnvironment({
      context,
      extensionId,
      page,
      config: realSite.config!,
    }),
  )
})
```

### Spec Entrypoints

Mocked and real-site specs remain separate even when they call the same
scenario:

- Mocked specs live in the normal `e2e/*.spec.ts` suite and run through
  `pnpm e2e`.
- Real-site specs live under `e2e/realSite/*.spec.ts` and run through
  `pnpm e2e:real-site`.

This preserves clear failure ownership:

- Mocked failure: product regression, fixture regression, or extension runtime
  issue in deterministic browser context.
- Real-site failure: live contract drift, upstream deployment behavior,
  credential/session issue, network issue, selector drift, cleanup failure, or
  product regression exposed by a live site.

### Real-Site Account Strategy

Real-site coverage should support two account-preparation paths. A spec should
choose the cheapest path that still covers the intended behavior.

1. Account-add path: log into the real site and save the account through the
   UI. Use this when the scenario is specifically about site detection,
   session/localStorage compatibility, or the add-account UI. This path returns
   an `AccountFixture`.
2. Existing-account path: use an `AccountFixture` as the scenario precondition.
   The fixture can be the one returned by the account-add path, or it can be
   seeded directly from verified real-site config. Use this when the scenario is
   about key management, model sync, usage history, or another feature that only
   requires an existing account.

A composed smoke test is just path 1 followed by path 2 with the same returned
`AccountFixture`. It is not a separate mode. This is how the suite guarantees
that the second scenario reuses the account that was just auto-detected and
saved.

Seeded existing-account coverage still uses real credentials and real API
endpoints for the feature under test. It only skips the UI auto-detection setup
when that setup is not part of the assertion.

### Coverage Policy

Use shared scenario plus two adapters only when the same full journey is useful
in both deterministic and live environments.

Good candidates:

- Account auto-detection plus account save.
- Existing-account key lifecycle.
- One composed account-add plus existing-account key lifecycle smoke path for
  each backend family where the full contract is worth live coverage.
- A complete content-script flow that depends on a real page session and also
  has a stable mocked equivalent.

Poor candidates:

- Basic UI filtering, sorting, empty states, and validation copy.
- Large edge-case matrices.
- Alarm scheduling and recovery, unless the risk depends on a live external
  service.
- Service adapter protocol parsing that can be covered by Vitest.

## Migration Strategy

1. Split the current combined real-site account/key helper into two reusable
   scenario families: account add and existing-account behavior.
2. Keep a small composed smoke wrapper for the current real-site behavior so the
   existing live contract does not lose coverage; pass the returned
   `AccountFixture` from account add into the key lifecycle scenario.
3. Add an existing-account preparation path for real-site key-management specs
   that seed an `AccountFixture` directly when account add is not under test.
4. Make mocked key-management and account-backed feature specs seed isolated
   `AccountFixture` values instead of depending on the account-add scenario.
5. Keep existing real-site helper behavior intact while moving repeated
   orchestration into the scenarios.
6. Add a mocked environment adapter only if an existing mocked spec benefits
   from calling the same journey.
7. Avoid broad rewrites of unrelated E2E specs.

Recommended file shape:

```text
e2e/
  scenarios/
    accountAutoDetect.ts
    accountKeyLifecycle.ts
  utils/
    mockedSite/
      compatibleAutoDetectEnvironment.ts
      compatibleKeyLifecycleEnvironment.ts
    realSite/
      accountAutoDetectEnvironment.ts
      accountKeyLifecycleEnvironment.ts
      newApi.ts
      oneHub.ts
      doneHub.ts
      veloera.ts
      sub2api.ts
```

This shape is illustrative. The implementation should follow nearby naming and
reuse existing files when that keeps the change smaller.

## Validation

For the first implementation pass:

- Run the focused mocked spec that uses the shared scenario.
- Run one focused real-site spec only when the required local env is available.
- Run `pnpm compile` if scenario or adapter typing changes touch shared E2E
  utility exports.
- Run `pnpm run validate:staged` before committing task-scoped files.

If real-site env is unavailable, the implementation handoff must state that
real-site runtime validation was skipped because credentials/config were not
available, and must still run deterministic mocked coverage.

## Risks and Mitigations

- Risk: the scenario interface becomes too generic.
  Mitigation: keep one environment type per scenario family.

- Risk: key-management scenarios accidentally keep depending on
  auto-detection setup.
  Mitigation: make `resolveAccountFixture` the key-management precondition and
  keep auto-detection only in account-add or composed smoke specs.

- Risk: shared scenarios encourage long chained mocked E2E flows.
  Mitigation: make isolated fixture seeding the default and reserve composed
  smoke tests for a small named contract check.

- Risk: real-site cleanup fails and leaves test keys behind.
  Mitigation: generate unique short token names and keep deletion in finally
  paths owned by the scenario or real-site adapter.

- Risk: mocked adapters duplicate backend protocol details already tested in
  Vitest.
  Mitigation: mocked E2E should provide only the minimum API behavior needed for
  the browser journey; protocol edge cases stay in service tests.

- Risk: shared scenario hides which environment failed.
  Mitigation: keep separate spec files, test names, commands, and skip reasons.

- Risk: fixture cleanup runs twice or not at all.
  Mitigation: document fixture ownership at adapter construction time and keep
  cleanup in one finalizer per fixture.

## Acceptance Criteria

- Account auto-detection/account-save logic and existing-account key lifecycle
  logic are modeled as separate scenario families.
- At least one mocked E2E journey and one real-site E2E journey can call shared
  scenario functions without duplicating the user-journey assertions.
- A composed smoke spec reuses the account created by auto-detection by passing
  the returned `AccountFixture` into the existing-account scenario adapter.
- Normal mocked account-backed scenarios seed isolated `AccountFixture` values
  and are not forced to run account auto-detection first.
- Real-site key-management coverage can prepare an existing saved account
  without always running auto-detection first.
- Every `AccountFixture` producer defines cleanup ownership and avoids shared
  mutable state across tests.
- Mocked and real-site suites remain separately runnable through existing
  commands.
- Real-site tests still skip cleanly when required env is missing.
- The default mocked E2E path does not depend on live site credentials or
  network availability.
- No scenario is migrated unless it has clear value in both mocked and real-site
  environments.
