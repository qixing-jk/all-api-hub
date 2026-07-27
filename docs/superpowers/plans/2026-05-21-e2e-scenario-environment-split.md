# E2E Scenario Environment Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split account-backed Playwright E2E helpers into reusable scenario functions with isolated account fixtures, while preserving existing mocked and real-site test entrypoints.

**Architecture:** Add a small `e2e/scenarios/` layer that owns reusable user-journey assertions and accepts environment adapters for setup. Keep account-add and existing-account behavior separate. Migrate the existing real-site account/key smoke path to compose the two scenarios, and migrate one mocked key-management test to demonstrate isolated fixture setup without forcing account-add as a prerequisite.

**Tech Stack:** TypeScript, Playwright, Vitest, WXT extension test helpers, pnpm.

---

## File Structure

- Create `e2e/scenarios/accountFixtures.ts`
  - Defines `AccountFixture`, cleanup ownership helpers, and conversion from saved account UI result to fixture.
- Create `e2e/scenarios/accountAutoDetect.ts`
  - Runs the account-add/autodetect user journey and returns an `AccountFixture`.
- Create `e2e/scenarios/accountKeyLifecycle.ts`
  - Runs existing-account key creation, visible verification, deletion, and fixture cleanup.
- Modify `e2e/utils/accountLifecycle.ts`
  - Export `SavedAccountUiResult` and include `accountId` when a service worker is provided.
- Modify `e2e/utils/realSite/accountKeyFlow.ts`
  - Keep current public wrapper name, but implement it as composed account-add plus existing-account key lifecycle.
- Modify `e2e/utils/realSite/compatibleAccountKeyFlow.ts`
  - Pass `serviceWorker` into the composed real-site wrapper.
- Modify `e2e/realSite/*AccountAdd.spec.ts`
  - Pass the already-created service worker to the real-site wrapper.
- Modify `e2e/keyManagementCommonFlow.spec.ts`
  - Use a seeded isolated `AccountFixture` in the create-key test only.
- Create `tests/utils/accountScenarioFixtures.test.ts`
  - Unit coverage for fixture conversion and cleanup-once behavior.
- Create `tests/utils/accountScenarios.test.ts`
  - Unit coverage for scenario composition, cleanup, and no implicit account-add dependency.
- Modify `tests/utils/realSiteAccountKeyFlow.test.ts`
  - Update expected calls for the composed real-site wrapper.

---

### Task 1: Account Fixture Primitives

**Files:**
- Create: `e2e/scenarios/accountFixtures.ts`
- Modify: `e2e/utils/accountLifecycle.ts`
- Test: `tests/utils/accountScenarioFixtures.test.ts`

- [ ] **Step 1: Write failing fixture tests**

Create `tests/utils/accountScenarioFixtures.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"

import {
  createAccountFixture,
  createNoopAccountFixtureCleanup,
  createOnceAccountFixtureCleanup,
  toAccountFixtureFromSavedAccount,
} from "~~/e2e/scenarios/accountFixtures"

describe("account scenario fixtures", () => {
  it("creates a fixture from a saved account result with cleanup ownership", () => {
    const cleanup = vi.fn().mockResolvedValue(undefined)

    const fixture = toAccountFixtureFromSavedAccount(
      {
        accountId: "account-1",
        siteType: "new-api",
        baseUrl: "https://new-api.example.com",
      },
      { cleanup },
    )

    expect(fixture).toMatchObject({
      accountId: "account-1",
      siteType: "new-api",
      baseUrl: "https://new-api.example.com",
    })
    expect(fixture.cleanup).toBe(cleanup)
  })

  it("rejects saved account results without an account id", () => {
    expect(() =>
      toAccountFixtureFromSavedAccount(
        {
          siteType: "new-api",
          baseUrl: "https://new-api.example.com",
        },
        { cleanup: createNoopAccountFixtureCleanup() },
      ),
    ).toThrow("AccountFixture requires accountId")
  })

  it("runs cleanup at most once when ownership is shared across composed scenarios", async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined)
    const onceCleanup = createOnceAccountFixtureCleanup(cleanup)

    await onceCleanup()
    await onceCleanup()

    expect(cleanup).toHaveBeenCalledOnce()
  })

  it("creates explicit seeded fixtures for isolated existing-account scenarios", () => {
    const cleanup = createNoopAccountFixtureCleanup()

    const fixture = createAccountFixture({
      accountId: "seeded-account",
      siteType: "new-api",
      baseUrl: "https://seeded.example.com",
      cleanup,
    })

    expect(fixture).toEqual({
      accountId: "seeded-account",
      siteType: "new-api",
      baseUrl: "https://seeded.example.com",
      cleanup,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest --run tests/utils/accountScenarioFixtures.test.ts
```

Expected: FAIL because `~~/e2e/scenarios/accountFixtures` does not exist.

- [ ] **Step 3: Export saved account result shape**

In `e2e/utils/accountLifecycle.ts`, change the private type:

```ts
type SavedAccountUiResult = {
  siteType: string
  baseUrl: string
}
```

to:

```ts
export type SavedAccountUiResult = {
  accountId?: string
  siteType: string
  baseUrl: string
}
```

Then change the return after `waitForSavedAccount` from:

```ts
return {
  siteType: savedAccount.site_type,
  baseUrl: savedAccount.site_url,
}
```

to:

```ts
return {
  accountId: savedAccount.id,
  siteType: savedAccount.site_type,
  baseUrl: savedAccount.site_url,
}
```

Leave the no-service-worker fallback as:

```ts
return {
  siteType: params.siteType,
  baseUrl: params.baseUrl,
}
```

That fallback preserves existing callers; fixture conversion will reject it when a scenario requires a real account identity.

- [ ] **Step 4: Implement fixture primitives**

Create `e2e/scenarios/accountFixtures.ts`:

```ts
import type { SavedAccountUiResult } from "~~/e2e/utils/accountLifecycle"

export type AccountFixture = {
  accountId: string
  siteType: string
  baseUrl: string
  cleanup: () => Promise<void>
}

export function createNoopAccountFixtureCleanup() {
  return async () => undefined
}

export function createOnceAccountFixtureCleanup(
  cleanup: () => Promise<void>,
): () => Promise<void> {
  let hasRun = false

  return async () => {
    if (hasRun) {
      return
    }

    hasRun = true
    await cleanup()
  }
}

export function createAccountFixture(params: AccountFixture): AccountFixture {
  if (!params.accountId) {
    throw new Error("AccountFixture requires accountId")
  }

  return params
}

export function toAccountFixtureFromSavedAccount(
  savedAccount: SavedAccountUiResult,
  options: {
    cleanup: () => Promise<void>
  },
): AccountFixture {
  if (!savedAccount.accountId) {
    throw new Error("AccountFixture requires accountId")
  }

  return createAccountFixture({
    accountId: savedAccount.accountId,
    siteType: savedAccount.siteType,
    baseUrl: savedAccount.baseUrl,
    cleanup: options.cleanup,
  })
}
```

- [ ] **Step 5: Run fixture tests**

Run:

```bash
pnpm vitest --run tests/utils/accountScenarioFixtures.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add e2e/scenarios/accountFixtures.ts e2e/utils/accountLifecycle.ts tests/utils/accountScenarioFixtures.test.ts
git commit -m "test(e2e): add account fixture primitives"
```

Expected: commit succeeds and the staged validation hook passes.

---

### Task 2: Account Scenario Functions

**Files:**
- Create: `e2e/scenarios/accountAutoDetect.ts`
- Create: `e2e/scenarios/accountKeyLifecycle.ts`
- Test: `tests/utils/accountScenarios.test.ts`

- [ ] **Step 1: Write failing scenario tests**

Create `tests/utils/accountScenarios.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createAccountFixture,
  createNoopAccountFixtureCleanup,
} from "~~/e2e/scenarios/accountFixtures"
import { runAccountAutoDetectScenario } from "~~/e2e/scenarios/accountAutoDetect"
import { runAccountKeyLifecycleScenario } from "~~/e2e/scenarios/accountKeyLifecycle"
import {
  createAndVerifyTokenFromApp,
  deleteTokenFromKeyManagementPage,
  saveAutoDetectedAccountFromApp,
} from "~~/e2e/utils/accountLifecycle"

const mocks = vi.hoisted(() => ({
  saveAutoDetectedAccountFromApp: vi.fn(),
  createAndVerifyTokenFromApp: vi.fn(),
  deleteTokenFromKeyManagementPage: vi.fn(),
}))

vi.mock("~~/e2e/utils/accountLifecycle", () => ({
  saveAutoDetectedAccountFromApp: mocks.saveAutoDetectedAccountFromApp,
  createAndVerifyTokenFromApp: mocks.createAndVerifyTokenFromApp,
  deleteTokenFromKeyManagementPage: mocks.deleteTokenFromKeyManagementPage,
}))

describe("account E2E scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("runs account auto-detect and returns a fixture from the saved account", async () => {
    const serviceWorker = {} as any
    const extensionPage = {} as any
    const sitePage = {
      close: vi.fn().mockResolvedValue(undefined),
    } as any
    const cleanup = vi.fn().mockResolvedValue(undefined)
    const prepareDetectedDialog = vi.fn().mockResolvedValue(undefined)

    vi.mocked(saveAutoDetectedAccountFromApp).mockResolvedValue({
      accountId: "account-1",
      siteType: "new-api",
      baseUrl: "https://new-api.example.com",
    })

    const fixture = await runAccountAutoDetectScenario({
      extensionId: "extension-id",
      extensionPage,
      baseUrl: "https://new-api.example.com",
      siteType: "new-api",
      expectedDetectedSiteType: "new-api",
      getServiceWorker: vi.fn().mockResolvedValue(serviceWorker),
      prepareExtensionState: vi.fn().mockResolvedValue(undefined),
      openSitePage: vi.fn().mockResolvedValue(sitePage),
      prepareDetectableSite: vi.fn().mockResolvedValue({ prepareDetectedDialog }),
      cleanup,
    })

    expect(saveAutoDetectedAccountFromApp).toHaveBeenCalledWith({
      page: extensionPage,
      extensionId: "extension-id",
      serviceWorker,
      baseUrl: "https://new-api.example.com",
      siteType: "new-api",
      expectedSiteType: "new-api",
      prepareDetectedDialog,
    })
    expect(fixture).toMatchObject({
      accountId: "account-1",
      siteType: "new-api",
      baseUrl: "https://new-api.example.com",
    })
    expect(sitePage.close).toHaveBeenCalledOnce()
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it("uses an existing fixture for key lifecycle without auto-detecting an account", async () => {
    const extensionPage = {} as any
    const keyPage = {} as any
    const fixtureCleanup = vi.fn().mockResolvedValue(undefined)
    const environmentCleanup = vi.fn().mockResolvedValue(undefined)
    const fixture = createAccountFixture({
      accountId: "seeded-account",
      siteType: "new-api",
      baseUrl: "https://seeded.example.com",
      cleanup: fixtureCleanup,
    })

    vi.mocked(createAndVerifyTokenFromApp).mockResolvedValue({
      page: keyPage,
      row: {} as any,
    })
    vi.mocked(deleteTokenFromKeyManagementPage).mockResolvedValue(undefined)

    await runAccountKeyLifecycleScenario({
      extensionId: "extension-id",
      extensionPage,
      getServiceWorker: vi.fn().mockResolvedValue({} as any),
      resolveAccountFixture: vi.fn().mockResolvedValue(fixture),
      buildTokenName: () => "E2E Created Key",
      cleanup: environmentCleanup,
    })

    expect(saveAutoDetectedAccountFromApp).not.toHaveBeenCalled()
    expect(createAndVerifyTokenFromApp).toHaveBeenCalledWith({
      page: extensionPage,
      extensionId: "extension-id",
      accountId: "seeded-account",
      siteType: "new-api",
      baseUrl: "https://seeded.example.com",
      tokenName: "E2E Created Key",
      openFromAccountRow: true,
      onTokenSubmitted: expect.any(Function),
    })
    expect(deleteTokenFromKeyManagementPage).toHaveBeenCalledWith({
      page: keyPage,
      token: "E2E Created Key",
    })
    expect(fixtureCleanup).toHaveBeenCalledOnce()
    expect(environmentCleanup).toHaveBeenCalledOnce()
  })

  it("does not delete a token when token submission never happened", async () => {
    const fixture = createAccountFixture({
      accountId: "seeded-account",
      siteType: "new-api",
      baseUrl: "https://seeded.example.com",
      cleanup: createNoopAccountFixtureCleanup(),
    })
    const error = new Error("create failed")

    vi.mocked(createAndVerifyTokenFromApp).mockRejectedValue(error)

    await expect(
      runAccountKeyLifecycleScenario({
        extensionId: "extension-id",
        extensionPage: {} as any,
        getServiceWorker: vi.fn().mockResolvedValue({} as any),
        resolveAccountFixture: vi.fn().mockResolvedValue(fixture),
        buildTokenName: () => "E2E Created Key",
      }),
    ).rejects.toThrow(error)

    expect(deleteTokenFromKeyManagementPage).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest --run tests/utils/accountScenarios.test.ts
```

Expected: FAIL because `accountAutoDetect.ts` and `accountKeyLifecycle.ts` do not exist.

- [ ] **Step 3: Implement account auto-detect scenario**

Create `e2e/scenarios/accountAutoDetect.ts`:

```ts
import type { Page } from "@playwright/test"

import type { AccountFixture } from "~~/e2e/scenarios/accountFixtures"
import {
  createNoopAccountFixtureCleanup,
  toAccountFixtureFromSavedAccount,
} from "~~/e2e/scenarios/accountFixtures"
import { saveAutoDetectedAccountFromApp } from "~~/e2e/utils/accountLifecycle"
import type { getServiceWorker } from "~~/e2e/utils/extensionState"
import type { AccountAddDialog } from "~~/e2e/utils/realSite/accountAdd"

type ServiceWorker = Awaited<ReturnType<typeof getServiceWorker>>

type AccountDetectionContext = void | {
  prepareDetectedDialog?: (dialog: AccountAddDialog) => Promise<void>
}

export type AccountAutoDetectEnvironment = {
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
  ) => Promise<AccountDetectionContext>
  prepareDetectedDialog?: (dialog: AccountAddDialog) => Promise<void>
  cleanup?: () => Promise<void>
  accountCleanup?: () => Promise<void>
}

export async function runAccountAutoDetectScenario(
  env: AccountAutoDetectEnvironment,
): Promise<AccountFixture> {
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

    return toAccountFixtureFromSavedAccount(savedAccount, {
      cleanup: env.accountCleanup ?? createNoopAccountFixtureCleanup(),
    })
  } finally {
    await env.cleanup?.()
    await sitePage.close().catch(() => undefined)
  }
}
```

- [ ] **Step 4: Implement key lifecycle scenario**

Create `e2e/scenarios/accountKeyLifecycle.ts`:

```ts
import type { Page } from "@playwright/test"

import type { AccountFixture } from "~~/e2e/scenarios/accountFixtures"
import {
  createAndVerifyTokenFromApp,
  deleteTokenFromKeyManagementPage,
} from "~~/e2e/utils/accountLifecycle"
import type { getServiceWorker } from "~~/e2e/utils/extensionState"

type ServiceWorker = Awaited<ReturnType<typeof getServiceWorker>>

export type AccountKeyLifecycleEnvironment = {
  extensionId: string
  extensionPage: Page
  getServiceWorker: () => Promise<ServiceWorker>
  prepareExtensionState?: (serviceWorker: ServiceWorker) => Promise<void>
  resolveAccountFixture: (
    serviceWorker: ServiceWorker,
  ) => Promise<AccountFixture>
  openFromAccountRow?: boolean
  buildTokenName: () => string
  cleanupAccountFixture?: boolean
  cleanup?: () => Promise<void>
}

export async function runAccountKeyLifecycleScenario(
  env: AccountKeyLifecycleEnvironment,
) {
  const serviceWorker = await env.getServiceWorker()
  await env.prepareExtensionState?.(serviceWorker)
  const account = await env.resolveAccountFixture(serviceWorker)
  const tokenName = env.buildTokenName()
  let keyManagementPage = env.extensionPage
  let submittedTokenName: string | null = null

  try {
    const tokenResult = await createAndVerifyTokenFromApp({
      page: env.extensionPage,
      extensionId: env.extensionId,
      accountId: account.accountId,
      siteType: account.siteType,
      baseUrl: account.baseUrl,
      tokenName,
      openFromAccountRow: env.openFromAccountRow ?? true,
      onTokenSubmitted: (result) => {
        keyManagementPage = result.page
        submittedTokenName = result.tokenName
      },
    })
    keyManagementPage = tokenResult.page
  } finally {
    if (submittedTokenName) {
      await deleteTokenFromKeyManagementPage({
        page: keyManagementPage,
        token: submittedTokenName,
      })
    }

    if (env.cleanupAccountFixture !== false) {
      await account.cleanup()
    }

    await env.cleanup?.()
  }
}
```

- [ ] **Step 5: Run scenario tests**

Run:

```bash
pnpm vitest --run tests/utils/accountScenarioFixtures.test.ts tests/utils/accountScenarios.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add e2e/scenarios/accountAutoDetect.ts e2e/scenarios/accountKeyLifecycle.ts tests/utils/accountScenarios.test.ts
git commit -m "test(e2e): add account scenario helpers"
```

Expected: commit succeeds and the staged validation hook passes.

---

### Task 3: Migrate Real-Site Smoke Wrapper to Compose Scenarios

**Files:**
- Modify: `e2e/utils/realSite/accountKeyFlow.ts`
- Modify: `e2e/utils/realSite/compatibleAccountKeyFlow.ts`
- Modify: `e2e/realSite/newApiAccountAdd.spec.ts`
- Modify: `e2e/realSite/oneHubAccountAdd.spec.ts`
- Modify: `e2e/realSite/doneHubAccountAdd.spec.ts`
- Modify: `e2e/realSite/veloeraAccountAdd.spec.ts`
- Modify: `e2e/realSite/sub2apiAccountAdd.spec.ts`
- Test: `tests/utils/realSiteAccountKeyFlow.test.ts`

- [ ] **Step 1: Update the real-site wrapper test first**

Replace `tests/utils/realSiteAccountKeyFlow.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createAccountFixture } from "~~/e2e/scenarios/accountFixtures"
import { runAccountAutoDetectScenario } from "~~/e2e/scenarios/accountAutoDetect"
import { runAccountKeyLifecycleScenario } from "~~/e2e/scenarios/accountKeyLifecycle"
import { installExtensionPageGuards } from "~~/e2e/utils/commonUserFlows"
import { runRealSiteAccountKeyFlow } from "~~/e2e/utils/realSite/accountKeyFlow"

const mocks = vi.hoisted(() => ({
  installExtensionPageGuards: vi.fn(),
  runAccountAutoDetectScenario: vi.fn(),
  runAccountKeyLifecycleScenario: vi.fn(),
}))

vi.mock("~~/e2e/utils/commonUserFlows", () => ({
  installExtensionPageGuards: mocks.installExtensionPageGuards,
}))

vi.mock("~~/e2e/scenarios/accountAutoDetect", () => ({
  runAccountAutoDetectScenario: mocks.runAccountAutoDetectScenario,
}))

vi.mock("~~/e2e/scenarios/accountKeyLifecycle", () => ({
  runAccountKeyLifecycleScenario: mocks.runAccountKeyLifecycleScenario,
}))

describe("runRealSiteAccountKeyFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("composes account auto-detect with key lifecycle using the same fixture", async () => {
    const page = {} as any
    const serviceWorker = {} as any
    const sitePage = {
      close: vi.fn().mockResolvedValue(undefined),
    } as any
    const prepareDetectedDialog = vi.fn().mockResolvedValue(undefined)
    const login = vi.fn().mockResolvedValue({ prepareDetectedDialog })
    const fixture = createAccountFixture({
      accountId: "account-1",
      siteType: "sub2api",
      baseUrl: "https://sub2api.test",
      cleanup: vi.fn().mockResolvedValue(undefined),
    })

    vi.mocked(runAccountAutoDetectScenario).mockResolvedValue(fixture)
    vi.mocked(runAccountKeyLifecycleScenario).mockResolvedValue(undefined)

    await runRealSiteAccountKeyFlow({
      page,
      extensionId: "extension-id",
      serviceWorker,
      sitePage,
      baseUrl: "https://sub2api.test",
      siteType: "sub2api",
      expectedDetectedSiteType: "sub2api",
      label: "Sub2API",
      login,
    })

    expect(installExtensionPageGuards).toHaveBeenCalledWith(page)
    expect(runAccountAutoDetectScenario).toHaveBeenCalledWith(
      expect.objectContaining({
        extensionId: "extension-id",
        extensionPage: page,
        baseUrl: "https://sub2api.test",
        siteType: "sub2api",
        expectedDetectedSiteType: "sub2api",
      }),
    )
    expect(runAccountKeyLifecycleScenario).toHaveBeenCalledWith(
      expect.objectContaining({
        extensionId: "extension-id",
        extensionPage: page,
        cleanupAccountFixture: true,
      }),
    )

    const autoDetectEnv = vi.mocked(runAccountAutoDetectScenario).mock.calls[0][0]
    const detectionContext = await autoDetectEnv.prepareDetectableSite(sitePage)
    expect(login).toHaveBeenCalledWith(sitePage)
    expect(detectionContext).toEqual({ prepareDetectedDialog })

    const keyLifecycleEnv =
      vi.mocked(runAccountKeyLifecycleScenario).mock.calls[0][0]
    await expect(
      keyLifecycleEnv.resolveAccountFixture(serviceWorker),
    ).resolves.toBe(fixture)
  })

  it("does not run key lifecycle when account auto-detect fails", async () => {
    const error = new Error("detect failed")

    vi.mocked(runAccountAutoDetectScenario).mockRejectedValue(error)

    await expect(
      runRealSiteAccountKeyFlow({
        page: {} as any,
        extensionId: "extension-id",
        serviceWorker: {} as any,
        sitePage: { close: vi.fn().mockResolvedValue(undefined) } as any,
        baseUrl: "https://sub2api.test",
        siteType: "sub2api",
        label: "Sub2API",
        login: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow(error)

    expect(runAccountKeyLifecycleScenario).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest --run tests/utils/realSiteAccountKeyFlow.test.ts
```

Expected: FAIL because `runRealSiteAccountKeyFlow` does not accept `serviceWorker` and still calls the old direct helper path.

- [ ] **Step 3: Rewrite real-site account/key wrapper**

Replace `e2e/utils/realSite/accountKeyFlow.ts` with:

```ts
import type { Page } from "@playwright/test"

import {
  createNoopAccountFixtureCleanup,
  type AccountFixture,
} from "~~/e2e/scenarios/accountFixtures"
import { runAccountAutoDetectScenario } from "~~/e2e/scenarios/accountAutoDetect"
import { runAccountKeyLifecycleScenario } from "~~/e2e/scenarios/accountKeyLifecycle"
import { installExtensionPageGuards } from "~~/e2e/utils/commonUserFlows"
import type { getServiceWorker } from "~~/e2e/utils/extensionState"
import type { AccountAddDialog } from "~~/e2e/utils/realSite/accountAdd"
import { buildRealSiteTestTokenName, buildRealSiteRunId } from "~~/e2e/utils/realSite/keyManagement"

type ServiceWorker = Awaited<ReturnType<typeof getServiceWorker>>

type RealSiteAccountKeyLoginResult = void | {
  prepareDetectedDialog?: (dialog: AccountAddDialog) => Promise<void>
}

export async function runRealSiteAccountKeyFlow(params: {
  page: Page
  extensionId: string
  serviceWorker: ServiceWorker
  sitePage: Page
  baseUrl: string
  siteType: string
  expectedDetectedSiteType?: string
  label: string
  login: (sitePage: Page) => Promise<RealSiteAccountKeyLoginResult>
}) {
  installExtensionPageGuards(params.page)

  const accountFixture = await runAccountAutoDetectScenario({
    extensionId: params.extensionId,
    extensionPage: params.page,
    baseUrl: params.baseUrl,
    siteType: params.siteType,
    expectedDetectedSiteType: params.expectedDetectedSiteType,
    getServiceWorker: async () => params.serviceWorker,
    openSitePage: async () => params.sitePage,
    prepareDetectableSite: async (sitePage) => {
      return await params.login(sitePage)
    },
    accountCleanup: createNoopAccountFixtureCleanup(),
  })

  await runAccountKeyLifecycleScenario({
    extensionId: params.extensionId,
    extensionPage: params.page,
    getServiceWorker: async () => params.serviceWorker,
    resolveAccountFixture: async (): Promise<AccountFixture> => accountFixture,
    buildTokenName: () =>
      buildRealSiteTestTokenName({
        label: params.label,
        runId: buildRealSiteRunId(),
      }),
    cleanupAccountFixture: true,
  })
}
```

Note: `runAccountAutoDetectScenario` closes `sitePage` in its finalizer because `openSitePage` returns `params.sitePage`.

- [ ] **Step 4: Update compatible wrapper signature**

In `e2e/utils/realSite/compatibleAccountKeyFlow.ts`, add `serviceWorker` to params:

```ts
import type { getServiceWorker } from "~~/e2e/utils/extensionState"

type ServiceWorker = Awaited<ReturnType<typeof getServiceWorker>>
```

Change the exported params type to include:

```ts
serviceWorker: ServiceWorker
```

Then pass it into `runRealSiteAccountKeyFlow`:

```ts
await runRealSiteAccountKeyFlow({
  page: params.page,
  extensionId: params.extensionId,
  serviceWorker: params.serviceWorker,
  sitePage: params.sitePage,
  baseUrl: params.config.baseUrl,
  siteType: params.siteType,
  expectedDetectedSiteType: params.expectedDetectedSiteType,
  label: params.label,
  login: async (sitePage) => {
    const loginResult = await params.login(sitePage, params.config)
    expect(loginResult.user).toBeTruthy()
  },
})
```

- [ ] **Step 5: Update real-site spec call sites**

In each file below, add `serviceWorker,` to the `runCompatibleRealSiteAccountKeyFlow` call or `runRealSiteAccountKeyFlow` call:

- `e2e/realSite/newApiAccountAdd.spec.ts`
- `e2e/realSite/oneHubAccountAdd.spec.ts`
- `e2e/realSite/doneHubAccountAdd.spec.ts`
- `e2e/realSite/veloeraAccountAdd.spec.ts`
- `e2e/realSite/sub2apiAccountAdd.spec.ts`

Example for `newApiAccountAdd.spec.ts`:

```ts
await runCompatibleRealSiteAccountKeyFlow({
  page,
  extensionId,
  serviceWorker,
  sitePage,
  config,
  siteType: SITE_TYPES.NEW_API,
  label: "New API",
  login: loginToRealNewApiSite,
})
```

Example for `sub2apiAccountAdd.spec.ts`:

```ts
await runRealSiteAccountKeyFlow({
  page,
  extensionId,
  serviceWorker,
  sitePage,
  baseUrl: config.baseUrl,
  siteType: SITE_TYPES.SUB2API,
  label: "Sub2API",
  login: async (realSitePage) => {
    const loginResult = await loginToRealSub2ApiSite(realSitePage, config)
    expect(loginResult.user).toBeTruthy()
    return {
      prepareDetectedDialog: loginResult.prepareDetectedDialog,
    }
  },
})
```

Use the existing `sub2apiAccountAdd.spec.ts` login return shape when applying this edit; preserve any current Sub2API-specific `prepareDetectedDialog` behavior.

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
pnpm vitest --run tests/utils/realSiteAccountKeyFlow.test.ts tests/utils/accountScenarios.test.ts tests/utils/accountScenarioFixtures.test.ts
pnpm compile
```

Expected: both commands PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add e2e/utils/realSite/accountKeyFlow.ts e2e/utils/realSite/compatibleAccountKeyFlow.ts e2e/realSite/newApiAccountAdd.spec.ts e2e/realSite/oneHubAccountAdd.spec.ts e2e/realSite/doneHubAccountAdd.spec.ts e2e/realSite/veloeraAccountAdd.spec.ts e2e/realSite/sub2apiAccountAdd.spec.ts tests/utils/realSiteAccountKeyFlow.test.ts
git commit -m "test(e2e): compose real-site account scenarios"
```

Expected: commit succeeds and the staged validation hook passes.

---

### Task 4: Add One Isolated Mocked Account Fixture Adapter

**Files:**
- Create: `e2e/utils/mockedSite/accountFixtures.ts`
- Modify: `e2e/keyManagementCommonFlow.spec.ts`

- [ ] **Step 1: Create a small mocked fixture helper**

Create `e2e/utils/mockedSite/accountFixtures.ts`:

```ts
import { SITE_TYPES } from "~/constants/siteType"
import type { SiteAccount } from "~/types"
import {
  createStoredAccount,
  seedStoredAccounts,
} from "~~/e2e/utils/commonUserFlows"
import type { AccountFixture } from "~~/e2e/scenarios/accountFixtures"
import {
  createAccountFixture,
  createOnceAccountFixtureCleanup,
} from "~~/e2e/scenarios/accountFixtures"

type ServiceWorker = Worker

export async function seedMockAccountFixture(params: {
  serviceWorker: ServiceWorker
  account?: SiteAccount
  accountId?: string
  siteType?: string
  baseUrl?: string
}): Promise<AccountFixture> {
  const account = params.account ?? createStoredAccount({
    id: params.accountId ?? `e2e-account-${Date.now().toString(36)}`,
    site_type: params.siteType ?? SITE_TYPES.NEW_API,
    site_url: params.baseUrl ?? "https://example.com",
  })

  await seedStoredAccounts(params.serviceWorker, [account])

  return createAccountFixture({
    accountId: account.id,
    siteType: account.site_type,
    baseUrl: account.site_url,
    cleanup: createOnceAccountFixtureCleanup(async () => {
      await seedStoredAccounts(params.serviceWorker, [])
    }),
  })
}
```

- [ ] **Step 2: Migrate the create-token mocked E2E only**

In `e2e/keyManagementCommonFlow.spec.ts`, update imports:

```ts
import { runAccountKeyLifecycleScenario } from "~~/e2e/scenarios/accountKeyLifecycle"
import { seedMockAccountFixture } from "~~/e2e/utils/mockedSite/accountFixtures"
```

In the test `"creates a token from key management and reloads it into the visible list"`, replace:

```ts
await seedStoredAccounts(serviceWorker, [createStoredAccount()])
await stubNewApiSiteRoutes(context)

await createAndVerifyTokenFromApp({
  page,
  extensionId,
  accountId: "e2e-account-1",
  tokenName: "E2E Created Key",
})
```

with:

```ts
const accountFixture = await seedMockAccountFixture({
  serviceWorker,
  account: createStoredAccount({
    id: "e2e-key-create-account",
    site_url: "https://example.com",
  }),
})
await stubNewApiSiteRoutes(context)

await runAccountKeyLifecycleScenario({
  extensionId,
  extensionPage: page,
  getServiceWorker: async () => serviceWorker,
  resolveAccountFixture: async () => accountFixture,
  openFromAccountRow: false,
  buildTokenName: () => "E2E Created Key",
})
```

Remove the old assertion from this test:

```ts
await expect(page.getByText("E2E Created Key")).toBeVisible()
```

The shared lifecycle scenario now verifies the created key and deletes it before
returning, so the key should not remain visible after the scenario completes.

Leave the update/delete key tests unchanged in this task. They already seed their own accounts and should not be pulled into the scenario abstraction unless a later change benefits from it.

- [ ] **Step 3: Run focused mocked E2E**

Run:

```bash
pnpm playwright test e2e/keyManagementCommonFlow.spec.ts --grep "creates a token from key management"
```

Expected: PASS. If the extension bundle is stale, run `pnpm run build:e2e` and rerun the focused Playwright command.

- [ ] **Step 4: Run related unit tests and typecheck**

Run:

```bash
pnpm vitest --run tests/utils/accountScenarioFixtures.test.ts tests/utils/accountScenarios.test.ts tests/utils/realSiteAccountKeyFlow.test.ts
pnpm compile
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add e2e/utils/mockedSite/accountFixtures.ts e2e/keyManagementCommonFlow.spec.ts
git commit -m "test(e2e): seed isolated account fixtures"
```

Expected: commit succeeds and the staged validation hook passes.

---

### Task 5: Final Validation and Documentation Alignment

**Files:**
- Modify if needed: `e2e/realSite/README.md`
- Modify if needed: `docs/superpowers/specs/2026-05-21-e2e-scenario-environment-split-design.md`

- [ ] **Step 1: Check whether real-site README still matches behavior**

Read `e2e/realSite/README.md`. If it still accurately says real-site specs exercise account auto-detection and key lifecycle through the UI, no edit is needed.

If it needs clarification, add this paragraph after the opening description:

```md
Account auto-detection and existing-account feature checks are implemented as
separate scenario helpers. Real-site smoke specs may compose them to prove that
an account saved by auto-detection can feed key management, while feature
specific real-site specs should seed or resolve the existing account fixture
directly when account detection is not under test.
```

- [ ] **Step 2: Run the full focused validation set**

Run:

```bash
pnpm vitest --run tests/utils/accountScenarioFixtures.test.ts tests/utils/accountScenarios.test.ts tests/utils/realSiteAccountKeyFlow.test.ts
pnpm compile
pnpm playwright test e2e/keyManagementCommonFlow.spec.ts --grep "creates a token from key management"
```

Expected: PASS.

- [ ] **Step 3: Run staged validation**

Stage only task-scoped files, then run:

```bash
pnpm run validate:staged
```

Expected: PASS. If no files are staged, stage only the task-scoped files first; do not treat a no-staged-files run as validation.

- [ ] **Step 4: Commit documentation alignment if files changed**

If Step 1 changed docs, run:

```bash
git add e2e/realSite/README.md docs/superpowers/specs/2026-05-21-e2e-scenario-environment-split-design.md
git commit -m "docs: align e2e scenario guidance"
```

Expected: commit succeeds and the staged validation hook passes.

If Step 1 changed no files, skip this commit and report that docs already matched.

---

## Self-Review

- Spec coverage: The plan implements separate account-add and existing-account scenario families, explicit `AccountFixture` handoff, isolated mocked fixture setup, real-site composed smoke behavior, and separate mocked/real-site entrypoints.
- Placeholder scan: This plan contains no placeholder implementation steps. Each code-producing task includes concrete file paths, code, commands, and expected outcomes.
- Type consistency: `AccountFixture`, `AccountAutoDetectEnvironment`, `AccountKeyLifecycleEnvironment`, `SavedAccountUiResult`, and `serviceWorker` are used consistently across tasks.
