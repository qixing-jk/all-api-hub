import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import type { AccountFixture } from "~~/e2e/scenarios/accountFixtures"
import {
  verifyAccountKeyLifecycleUsage,
  verifyAccountKeyToApiProfileUsage,
  verifyAccountModelCatalogUsage,
  verifyAccountProviderDestinationUsage,
} from "~~/e2e/scenarios/accountUsage"
import {
  maybeVerifyRealSiteModelToKeyUsage,
  realSiteAccountUsageChecks,
  runRealSiteAccountFixtureUsageChecks,
  verifyRealSiteAccountKeyLifecycleUsage,
  verifyRealSiteAccountKeyToApiProfileUsage,
  verifyRealSiteAccountModelCatalogUsage,
  verifyRealSiteAccountProviderDestinationUsage,
} from "~~/e2e/utils/realSite/accountUsage"
import {
  buildRealSiteRunId,
  buildRealSiteTestTokenName,
} from "~~/e2e/utils/realSite/keyManagement"
import { maybeRunRealSiteModelToKeyScenario } from "~~/e2e/utils/realSite/modelToKey"

const mocks = vi.hoisted(() => ({
  verifyAccountKeyLifecycleUsage: vi.fn(),
  verifyAccountKeyToApiProfileUsage: vi.fn(),
  verifyAccountProviderDestinationUsage: vi.fn(),
  verifyAccountModelCatalogUsage: vi.fn(),
  buildRealSiteRunId: vi.fn(),
  buildRealSiteTestTokenName: vi.fn(),
  maybeRunRealSiteModelToKeyScenario: vi.fn(),
  testStep: vi.fn(),
}))

vi.mock("~~/e2e/scenarios/accountUsage", () => ({
  verifyAccountKeyLifecycleUsage: mocks.verifyAccountKeyLifecycleUsage,
  verifyAccountKeyToApiProfileUsage: mocks.verifyAccountKeyToApiProfileUsage,
  verifyAccountProviderDestinationUsage:
    mocks.verifyAccountProviderDestinationUsage,
  verifyAccountModelCatalogUsage: mocks.verifyAccountModelCatalogUsage,
}))

vi.mock("~~/e2e/utils/realSite/keyManagement", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~~/e2e/utils/realSite/keyManagement")
  >()),
  buildRealSiteRunId: mocks.buildRealSiteRunId,
  buildRealSiteTestTokenName: mocks.buildRealSiteTestTokenName,
}))

vi.mock("~~/e2e/utils/realSite/modelToKey", () => ({
  maybeRunRealSiteModelToKeyScenario: mocks.maybeRunRealSiteModelToKeyScenario,
}))

vi.mock("~~/e2e/fixtures/extensionTest", () => ({
  test: {
    step: mocks.testStep,
  },
}))

describe("real-site account usage adapters", () => {
  const page = {} as any
  const serviceWorker = {} as any
  const account: AccountFixture = {
    accountId: "account-1",
    siteType: SITE_TYPES.NEW_API,
    baseUrl: "https://new-api.test",
    cleanup: vi.fn().mockResolvedValue(undefined),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(buildRealSiteRunId).mockReturnValue("run-id")
    vi.mocked(buildRealSiteTestTokenName).mockImplementation(
      ({ label, runId }) => `${label}:${runId}`,
    )
    mocks.testStep.mockImplementation(async (_name, run) => {
      await run()
    })
  })

  it("runs key lifecycle with real-site token naming and external fixture cleanup", async () => {
    vi.mocked(verifyAccountKeyLifecycleUsage).mockResolvedValue(undefined)

    await verifyRealSiteAccountKeyLifecycleUsage({
      page,
      extensionId: "extension-id",
      serviceWorker,
      account,
      label: "New API",
    })

    expect(verifyAccountKeyLifecycleUsage).toHaveBeenCalledOnce()
    const call = vi.mocked(verifyAccountKeyLifecycleUsage).mock.calls[0][0]
    expect(call).toMatchObject({
      page,
      extensionId: "extension-id",
      serviceWorker,
      account,
      cleanupAccountFixture: false,
      cleanupTokenNameMatcher: expect.any(Function),
    })
    expect(call.cleanupTokenNameMatcher?.("AAH E2E NewAPI abc123def4")).toBe(
      true,
    )
    expect(call.cleanupTokenNameMatcher?.("AAH E2E Personal")).toBe(false)
    expect(call.buildTokenName()).toBe("New API:run-id")
  })

  it("runs key-to-profile with account base URL as the default expectation", async () => {
    vi.mocked(verifyAccountKeyToApiProfileUsage).mockResolvedValue({
      id: "profile-id",
    } as any)

    await verifyRealSiteAccountKeyToApiProfileUsage({
      page,
      extensionId: "extension-id",
      serviceWorker,
      account,
      label: "New API",
      expectedProfile: {
        name: "Custom profile",
      },
    })

    const call = vi.mocked(verifyAccountKeyToApiProfileUsage).mock.calls[0][0]
    expect(call).toMatchObject({
      cleanupAccountFixture: false,
      cleanupTokenNameMatcher: expect.any(Function),
      expectedProfile: {
        baseUrl: "https://new-api.test",
        name: "Custom profile",
      },
    })
    expect(call.cleanupTokenNameMatcher?.("AAH E2E NewAPIPr abc123def4")).toBe(
      true,
    )
    expect(call.cleanupTokenNameMatcher?.("AAH E2E NewAPI abc123def4")).toBe(
      false,
    )
    expect(call.buildTokenName()).toBe("New API Profile:run-id")
  })

  it("saves a real-site key to API profiles without probing models", async () => {
    vi.mocked(verifyAccountKeyToApiProfileUsage).mockResolvedValue({
      id: "profile-id",
    } as any)

    await realSiteAccountUsageChecks
      .keyToApiProfile({
        expectedProfile: { name: "Expected profile" },
      })
      .run({
        testInfo: { annotations: [] } as any,
        page,
        extensionId: "extension-id",
        serviceWorker,
        account,
        label: "DoneHub",
      })

    expect(verifyAccountKeyToApiProfileUsage).toHaveBeenCalledOnce()
    expect(verifyAccountKeyToApiProfileUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedProfile: {
          baseUrl: "https://new-api.test",
          name: "Expected profile",
        },
      }),
    )
    const call = vi.mocked(verifyAccountKeyToApiProfileUsage).mock.calls[0][0]
    expect(call.afterProfileSaved).toBeUndefined()
  })

  it("forwards provider destinations and model catalog as separate scenarios", async () => {
    vi.mocked(verifyAccountProviderDestinationUsage).mockResolvedValue(
      undefined,
    )
    vi.mocked(verifyAccountModelCatalogUsage).mockResolvedValue(undefined)

    await verifyRealSiteAccountProviderDestinationUsage({
      page,
      serviceWorker,
      account,
      validateDestinationPages: { usage: true, redeem: false },
    })
    await verifyRealSiteAccountModelCatalogUsage({
      page,
      extensionId: "extension-id",
      account,
      expectations: { allowEmptyCatalog: true },
    })

    expect(verifyAccountProviderDestinationUsage).toHaveBeenCalledWith({
      page,
      serviceWorker,
      account,
      validateDestinationPages: { usage: true, redeem: false },
    })
    expect(verifyAccountModelCatalogUsage).toHaveBeenCalledWith({
      page,
      extensionId: "extension-id",
      account,
      expectations: { allowEmptyCatalog: true },
    })
  })

  it("passes the account fixture into the real-site model-to-key decision helper", async () => {
    vi.mocked(maybeRunRealSiteModelToKeyScenario).mockResolvedValue(undefined)
    const testInfo = { annotations: [] } as any

    await maybeVerifyRealSiteModelToKeyUsage({
      testInfo,
      page,
      extensionId: "extension-id",
      account,
      envPrefix: "SUB2API",
      label: "Sub2API",
    })

    expect(maybeRunRealSiteModelToKeyScenario).toHaveBeenCalledWith({
      testInfo,
      page,
      extensionId: "extension-id",
      accountId: "account-1",
      envPrefix: "SUB2API",
      label: "Sub2API",
      hasAvailableModel: undefined,
    })
  })

  it("records an explicit skip when a real-site account catalog is unsupported", async () => {
    const testInfo = { annotations: [] } as any

    await realSiteAccountUsageChecks
      .accountBackedModelCatalogUnavailable({
        reason:
          "Sub2API account model catalog skipped because this site type does not expose an account-backed model catalog.",
      })
      .run({
        testInfo,
        page,
        extensionId: "extension-id",
        serviceWorker,
        account,
        label: "Sub2API",
      })

    expect(testInfo.annotations).toEqual([
      {
        type: "skip",
        description:
          "Sub2API account model catalog skipped because this site type does not expose an account-backed model catalog.",
      },
    ])
  })

  it("runs fixture-backed usage checks through real-site test steps and cleans up afterwards", async () => {
    vi.mocked(verifyAccountKeyLifecycleUsage).mockResolvedValue(undefined)
    const cleanup = vi.fn().mockResolvedValue(undefined)
    const fixture: AccountFixture = {
      ...account,
      cleanup,
    }

    await runRealSiteAccountFixtureUsageChecks(
      {
        testInfo: { annotations: [] } as any,
        page,
        extensionId: "extension-id",
        serviceWorker,
        account: fixture,
        label: "New API",
      },
      [realSiteAccountUsageChecks.keyLifecycle()],
    )

    expect(mocks.testStep).toHaveBeenCalledWith(
      "create and delete an account API key",
      expect.any(Function),
    )
    expect(verifyAccountKeyLifecycleUsage).toHaveBeenCalledOnce()
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it("raises the timeout only for real-site account checks that perform remote writes", async () => {
    vi.mocked(maybeRunRealSiteModelToKeyScenario).mockResolvedValue(undefined)
    vi.mocked(verifyAccountModelCatalogUsage).mockResolvedValue(undefined)
    const testInfo = {
      annotations: [],
      timeout: 60_000,
      setTimeout: vi.fn(),
    } as any

    await runRealSiteAccountFixtureUsageChecks(
      {
        testInfo,
        page,
        extensionId: "extension-id",
        serviceWorker,
        account,
        label: "New API",
      },
      [
        realSiteAccountUsageChecks.modelToKey({ envPrefix: "NEW_API" }),
        realSiteAccountUsageChecks.modelCatalog(),
      ],
    )

    expect(testInfo.setTimeout).toHaveBeenCalledOnce()
    expect(testInfo.setTimeout).toHaveBeenCalledWith(120_000)
  })

  it("sums timeout budgets when multiple real-site remote-write checks run together", async () => {
    vi.mocked(verifyAccountKeyLifecycleUsage).mockResolvedValue(undefined)
    vi.mocked(maybeRunRealSiteModelToKeyScenario).mockResolvedValue(undefined)
    const testInfo = {
      annotations: [],
      timeout: 60_000,
      setTimeout: vi.fn(),
    } as any

    await runRealSiteAccountFixtureUsageChecks(
      {
        testInfo,
        page,
        extensionId: "extension-id",
        serviceWorker,
        account,
        label: "New API",
      },
      [
        realSiteAccountUsageChecks.keyLifecycle(),
        realSiteAccountUsageChecks.modelToKey({ envPrefix: "NEW_API" }),
      ],
    )

    expect(testInfo.setTimeout).toHaveBeenCalledOnce()
    expect(testInfo.setTimeout).toHaveBeenCalledWith(240_000)
  })
})
