import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { runAccountAutoDetectScenario } from "~~/e2e/scenarios/accountAutoDetect"
import type { AccountFixture } from "~~/e2e/scenarios/accountFixtures"
import { runAccountKeyLifecycleScenario } from "~~/e2e/scenarios/accountKeyLifecycle"
import { runAccountKeyToApiProfileScenario } from "~~/e2e/scenarios/accountKeyToApiProfile"
import { runAccountProviderDestinationsScenario } from "~~/e2e/scenarios/accountProviderDestinations"
import {
  verifyAccountKeyLifecycleUsage,
  verifyAccountKeyToApiProfileUsage,
  verifyAccountModelCatalogUsage,
  verifyAccountProviderDestinationUsage,
} from "~~/e2e/scenarios/accountUsage"
import { verifyAccountModelCatalog } from "~~/e2e/scenarios/modelListCatalog"
import { installExtensionPageGuards } from "~~/e2e/utils/commonUserFlows"
import { runRealSiteAccountSaveFlow } from "~~/e2e/utils/realSite/accountSaveFlow"

const mocks = vi.hoisted(() => ({
  installExtensionPageGuards: vi.fn(),
  runAccountAutoDetectScenario: vi.fn(),
  runAccountKeyLifecycleScenario: vi.fn(),
  runAccountKeyToApiProfileScenario: vi.fn(),
  runAccountProviderDestinationsScenario: vi.fn(),
  verifyAccountModelCatalog: vi.fn(),
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

vi.mock("~~/e2e/scenarios/accountKeyToApiProfile", () => ({
  runAccountKeyToApiProfileScenario: mocks.runAccountKeyToApiProfileScenario,
}))

vi.mock("~~/e2e/scenarios/accountProviderDestinations", () => ({
  runAccountProviderDestinationsScenario:
    mocks.runAccountProviderDestinationsScenario,
}))

vi.mock("~~/e2e/scenarios/modelListCatalog", () => ({
  verifyAccountModelCatalog: mocks.verifyAccountModelCatalog,
}))

describe("runRealSiteAccountSaveFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("saves a real-site account and returns its account fixture", async () => {
    const page = {} as any
    const sitePage = {
      close: vi.fn().mockResolvedValue(undefined),
    } as any
    const serviceWorker = {} as any
    const prepareDetectedDialog = vi.fn().mockResolvedValue(undefined)
    const login = vi.fn().mockResolvedValue({ prepareDetectedDialog })
    const fixture: AccountFixture = {
      accountId: "account-id",
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://sub2api.test",
      cleanup: vi.fn().mockResolvedValue(undefined),
    }

    vi.mocked(runAccountAutoDetectScenario).mockResolvedValue(fixture)

    await expect(
      runRealSiteAccountSaveFlow({
        page,
        extensionId: "extension-id",
        serviceWorker,
        sitePage,
        baseUrl: "https://sub2api.test",
        siteType: SITE_TYPES.SUB2API,
        expectedDetectedSiteType: SITE_TYPES.SUB2API,
        login,
      }),
    ).resolves.toBe(fixture)

    expect(installExtensionPageGuards).toHaveBeenCalledWith(page)
    expect(runAccountAutoDetectScenario).toHaveBeenCalledOnce()
    expect(runAccountKeyLifecycleScenario).not.toHaveBeenCalled()

    const autoDetectEnv = vi.mocked(runAccountAutoDetectScenario).mock
      .calls[0][0]
    expect(autoDetectEnv).toMatchObject({
      extensionId: "extension-id",
      extensionPage: page,
      baseUrl: "https://sub2api.test",
      siteType: SITE_TYPES.SUB2API,
      expectedDetectedSiteType: SITE_TYPES.SUB2API,
    })
    await expect(autoDetectEnv.getServiceWorker()).resolves.toBe(serviceWorker)
    await expect(autoDetectEnv.openSitePage()).resolves.toBe(sitePage)
    await expect(
      autoDetectEnv.prepareDetectableSite(sitePage),
    ).resolves.toEqual({ prepareDetectedDialog })
    expect(login).toHaveBeenCalledWith(sitePage)
    expect(autoDetectEnv.accountCleanup).toBeTypeOf("function")
    expect(sitePage.close).not.toHaveBeenCalled()
  })

  it("does not run the key lifecycle scenario when account auto-detect fails", async () => {
    const error = new Error("auto-detect failed")

    vi.mocked(runAccountAutoDetectScenario).mockRejectedValue(error)

    await expect(
      runRealSiteAccountSaveFlow({
        page: {} as any,
        extensionId: "extension-id",
        serviceWorker: {} as any,
        sitePage: {} as any,
        baseUrl: "https://sub2api.test",
        siteType: SITE_TYPES.SUB2API,
        login: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow(error)

    expect(runAccountKeyLifecycleScenario).not.toHaveBeenCalled()
  })
})

describe("verifyAccountKeyLifecycleUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("passes a saved account fixture into the key lifecycle scenario", async () => {
    const page = {} as any
    const serviceWorker = {} as any
    const fixture: AccountFixture = {
      accountId: "account-id",
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://sub2api.test",
      cleanup: vi.fn().mockResolvedValue(undefined),
    }

    vi.mocked(runAccountKeyLifecycleScenario).mockResolvedValue(undefined)

    await verifyAccountKeyLifecycleUsage({
      page,
      extensionId: "extension-id",
      serviceWorker,
      account: fixture,
      cleanupAccountFixture: true,
      buildTokenName: () => "AAH E2E Sub2API test-key",
    })

    expect(runAccountAutoDetectScenario).not.toHaveBeenCalled()
    expect(runAccountKeyLifecycleScenario).toHaveBeenCalledOnce()

    const keyLifecycleEnv = vi.mocked(runAccountKeyLifecycleScenario).mock
      .calls[0][0]
    expect(keyLifecycleEnv).toMatchObject({
      extensionId: "extension-id",
      extensionPage: page,
      cleanupAccountFixture: true,
    })
    await expect(keyLifecycleEnv.getServiceWorker()).resolves.toBe(
      serviceWorker,
    )
    await expect(
      keyLifecycleEnv.resolveAccountFixture(serviceWorker),
    ).resolves.toBe(fixture)
    expect(keyLifecycleEnv.buildTokenName()).toBe("AAH E2E Sub2API test-key")
  })

  it("forwards existing-account usage options into the key lifecycle scenario", async () => {
    const page = {} as any
    const serviceWorker = {} as any
    const fixture: AccountFixture = {
      accountId: "account-id",
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://sub2api.test",
      cleanup: vi.fn().mockResolvedValue(undefined),
    }

    vi.mocked(runAccountKeyLifecycleScenario).mockResolvedValue(undefined)

    await verifyAccountKeyLifecycleUsage({
      page,
      extensionId: "extension-id",
      serviceWorker,
      account: fixture,
      openFromAccountRow: false,
      cleanupAccountFixture: false,
      buildTokenName: () => "AAH E2E Sub2API direct-key",
    })

    const keyLifecycleEnv = vi.mocked(runAccountKeyLifecycleScenario).mock
      .calls[0][0]
    expect(keyLifecycleEnv).toMatchObject({
      openFromAccountRow: false,
      cleanupAccountFixture: false,
    })
    expect(keyLifecycleEnv.buildTokenName()).toBe("AAH E2E Sub2API direct-key")
  })

  it("passes a saved account fixture into the key-to-profile scenario", async () => {
    const page = {} as any
    const serviceWorker = {} as any
    const fixture: AccountFixture = {
      accountId: "account-id",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://new-api.test",
      cleanup: vi.fn().mockResolvedValue(undefined),
    }
    const expectedProfile = {
      name: "New API - E2E Profile Key",
      baseUrl: "https://new-api.test",
      apiKey: "sk-created-profile",
    }

    vi.mocked(runAccountKeyToApiProfileScenario).mockResolvedValue({
      id: "profile-id",
      name: expectedProfile.name,
      baseUrl: expectedProfile.baseUrl,
      apiKey: expectedProfile.apiKey,
    } as any)

    await verifyAccountKeyToApiProfileUsage({
      page,
      extensionId: "extension-id",
      serviceWorker,
      account: fixture,
      cleanupAccountFixture: false,
      cleanupCreatedProfile: true,
      cleanupCreatedToken: true,
      buildTokenName: () => "E2E Profile Key",
      expectedProfile,
    })

    expect(runAccountKeyToApiProfileScenario).toHaveBeenCalledOnce()
    const scenarioEnv = vi.mocked(runAccountKeyToApiProfileScenario).mock
      .calls[0][0]
    expect(scenarioEnv).toMatchObject({
      extensionId: "extension-id",
      extensionPage: page,
      cleanupAccountFixture: false,
      cleanupCreatedProfile: true,
      cleanupCreatedToken: true,
      expectedProfile,
    })
    await expect(scenarioEnv.getServiceWorker()).resolves.toBe(serviceWorker)
    await expect(
      scenarioEnv.resolveAccountFixture(serviceWorker),
    ).resolves.toBe(fixture)
    expect(scenarioEnv.buildTokenName()).toBe("E2E Profile Key")
  })

  it("passes account fixtures into provider destination usage", async () => {
    const page = {} as any
    const serviceWorker = {} as any
    const account = {
      accountId: "account-id",
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://sub2api.test",
    }

    vi.mocked(runAccountProviderDestinationsScenario).mockResolvedValue(
      undefined,
    )

    await verifyAccountProviderDestinationUsage({
      page,
      serviceWorker,
      account,
      validateDestinationPages: true,
    })

    expect(runAccountProviderDestinationsScenario).toHaveBeenCalledWith({
      page,
      serviceWorker,
      account,
      validateDestinationPages: true,
    })
  })

  it("passes account fixtures into model catalog usage", async () => {
    const page = {} as any
    const expectations = {
      sourceLabel: "Real Site Account",
      modelNames: ["gpt-4o-mini"],
      totalModels: 1,
    }

    vi.mocked(verifyAccountModelCatalog).mockResolvedValue(page)

    await verifyAccountModelCatalogUsage({
      page,
      extensionId: "extension-id",
      account: { accountId: "account-id" },
      expectations,
    })

    expect(verifyAccountModelCatalog).toHaveBeenCalledWith({
      page,
      extensionId: "extension-id",
      accountId: "account-id",
      expectations,
    })
  })
})
