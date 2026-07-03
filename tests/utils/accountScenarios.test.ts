import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { runAccountAutoDetectScenario } from "~~/e2e/scenarios/accountAutoDetect"
import {
  createAccountFixture,
  createNoopAccountFixtureCleanup,
} from "~~/e2e/scenarios/accountFixtures"
import { runAccountKeyLifecycleScenario } from "~~/e2e/scenarios/accountKeyLifecycle"
import {
  runAccountKeyToApiProfileScenario,
  saveExistingAccountTokenToApiProfileScenario,
} from "~~/e2e/scenarios/accountKeyToApiProfile"
import { verifyAccountTokenModelsProbeUsage } from "~~/e2e/scenarios/accountUsage"
import {
  verifyApiCredentialProfileModelsProbeScenario,
  verifyOpenApiCredentialProfileModelsProbeDialog,
} from "~~/e2e/scenarios/apiCredentialProfileVerification"
import {
  deleteApiCredentialProfileFromStorage,
  deleteTokenFromKeyManagementPage,
  expectTokenCreatedInKeyManagementPage,
  openKeyManagementForAccount,
  saveAutoDetectedAccountFromApp,
  saveTokenToApiCredentialProfilesFromKeyManagementPage,
  submitTokenCreationFromKeyManagementPage,
} from "~~/e2e/utils/accountLifecycle"

const mocks = vi.hoisted(() => ({
  saveAutoDetectedAccountFromApp: vi.fn(),
  deleteApiCredentialProfileFromStorage: vi.fn(),
  deleteTokenFromKeyManagementPage: vi.fn(),
  expectTokenCreatedInKeyManagementPage: vi.fn(),
  openKeyManagementForAccount: vi.fn(),
  saveTokenToApiCredentialProfilesFromKeyManagementPage: vi.fn(),
  submitTokenCreationFromKeyManagementPage: vi.fn(),
  verifyApiCredentialProfileModelsProbeScenario: vi.fn(),
  verifyOpenApiCredentialProfileModelsProbeDialog: vi.fn(),
}))

vi.mock("~~/e2e/utils/accountLifecycle", () => ({
  saveAutoDetectedAccountFromApp: mocks.saveAutoDetectedAccountFromApp,
  deleteApiCredentialProfileFromStorage:
    mocks.deleteApiCredentialProfileFromStorage,
  deleteTokenFromKeyManagementPage: mocks.deleteTokenFromKeyManagementPage,
  expectTokenCreatedInKeyManagementPage:
    mocks.expectTokenCreatedInKeyManagementPage,
  openKeyManagementForAccount: mocks.openKeyManagementForAccount,
  saveTokenToApiCredentialProfilesFromKeyManagementPage:
    mocks.saveTokenToApiCredentialProfilesFromKeyManagementPage,
  submitTokenCreationFromKeyManagementPage:
    mocks.submitTokenCreationFromKeyManagementPage,
}))

vi.mock("~~/e2e/scenarios/apiCredentialProfileVerification", () => ({
  verifyApiCredentialProfileModelsProbeScenario:
    mocks.verifyApiCredentialProfileModelsProbeScenario,
  verifyOpenApiCredentialProfileModelsProbeDialog:
    mocks.verifyOpenApiCredentialProfileModelsProbeDialog,
}))

describe("account E2E scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(deleteTokenFromKeyManagementPage).mockResolvedValue(undefined)
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
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://new-api.example.com",
    })

    const fixture = await runAccountAutoDetectScenario({
      extensionId: "extension-id",
      extensionPage,
      baseUrl: "https://new-api.example.com",
      siteType: SITE_TYPES.NEW_API,
      expectedDetectedSiteType: SITE_TYPES.NEW_API,
      getServiceWorker: vi.fn().mockResolvedValue(serviceWorker),
      prepareExtensionState: vi.fn().mockResolvedValue(undefined),
      openSitePage: vi.fn().mockResolvedValue(sitePage),
      prepareDetectableSite: vi
        .fn()
        .mockResolvedValue({ prepareDetectedDialog }),
      cleanup,
    })

    expect(saveAutoDetectedAccountFromApp).toHaveBeenCalledWith({
      page: extensionPage,
      extensionId: "extension-id",
      serviceWorker,
      baseUrl: "https://new-api.example.com",
      siteType: SITE_TYPES.NEW_API,
      expectedSiteType: SITE_TYPES.NEW_API,
      prepareDetectedDialog,
    })
    expect(fixture).toMatchObject({
      accountId: "account-1",
      siteType: SITE_TYPES.NEW_API,
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
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://seeded.example.com",
      cleanup: fixtureCleanup,
    })

    vi.mocked(openKeyManagementForAccount).mockResolvedValue(keyPage)
    vi.mocked(submitTokenCreationFromKeyManagementPage).mockResolvedValue(
      undefined,
    )
    vi.mocked(expectTokenCreatedInKeyManagementPage).mockResolvedValue({
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
    expect(openKeyManagementForAccount).toHaveBeenCalledWith({
      page: extensionPage,
      extensionId: "extension-id",
      accountId: "seeded-account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://seeded.example.com",
      openFromAccountRow: true,
    })
    expect(submitTokenCreationFromKeyManagementPage).toHaveBeenCalledWith({
      page: keyPage,
      tokenName: "E2E Created Key",
    })
    expect(expectTokenCreatedInKeyManagementPage).toHaveBeenCalledWith({
      page: keyPage,
      tokenName: "E2E Created Key",
    })
    expect(deleteTokenFromKeyManagementPage).toHaveBeenCalledWith({
      page: keyPage,
      token: "E2E Created Key",
    })
    expect(fixtureCleanup).toHaveBeenCalledOnce()
    expect(environmentCleanup).toHaveBeenCalledOnce()
  })

  it("creates a key from an existing account without opening from the account row", async () => {
    const extensionPage = {} as any
    const keyPage = {} as any
    const fixture = createAccountFixture({
      accountId: "seeded-account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://seeded.example.com",
      cleanup: createNoopAccountFixtureCleanup(),
    })

    vi.mocked(openKeyManagementForAccount).mockResolvedValue(keyPage)
    vi.mocked(submitTokenCreationFromKeyManagementPage).mockResolvedValue(
      undefined,
    )
    vi.mocked(expectTokenCreatedInKeyManagementPage).mockResolvedValue({
      page: keyPage,
      row: {} as any,
    })

    await runAccountKeyLifecycleScenario({
      extensionId: "extension-id",
      extensionPage,
      getServiceWorker: vi.fn().mockResolvedValue({} as any),
      resolveAccountFixture: vi.fn().mockResolvedValue(fixture),
      openFromAccountRow: false,
      buildTokenName: () => "E2E Created Key",
    })

    expect(openKeyManagementForAccount).toHaveBeenCalledWith({
      page: extensionPage,
      extensionId: "extension-id",
      accountId: "seeded-account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://seeded.example.com",
      openFromAccountRow: false,
    })
    expect(submitTokenCreationFromKeyManagementPage).toHaveBeenCalledWith({
      page: keyPage,
      tokenName: "E2E Created Key",
    })
    expect(expectTokenCreatedInKeyManagementPage).toHaveBeenCalledWith({
      page: keyPage,
      tokenName: "E2E Created Key",
    })
  })

  it("does not delete a token when token submission never happened", async () => {
    const fixture = createAccountFixture({
      accountId: "seeded-account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://seeded.example.com",
      cleanup: createNoopAccountFixtureCleanup(),
    })
    const error = new Error("create failed")

    vi.mocked(openKeyManagementForAccount).mockResolvedValue({} as any)
    vi.mocked(submitTokenCreationFromKeyManagementPage).mockRejectedValue(error)

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

  it("deletes a submitted token when post-submit verification fails", async () => {
    const keyPage = {} as any
    const fixture = createAccountFixture({
      accountId: "seeded-account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://seeded.example.com",
      cleanup: createNoopAccountFixtureCleanup(),
    })
    const error = new Error("token row did not reload")

    vi.mocked(openKeyManagementForAccount).mockResolvedValue(keyPage)
    vi.mocked(submitTokenCreationFromKeyManagementPage).mockResolvedValue(
      undefined,
    )
    vi.mocked(expectTokenCreatedInKeyManagementPage).mockRejectedValue(error)
    vi.mocked(deleteTokenFromKeyManagementPage).mockResolvedValue(undefined)

    await expect(
      runAccountKeyLifecycleScenario({
        extensionId: "extension-id",
        extensionPage: {} as any,
        getServiceWorker: vi.fn().mockResolvedValue({} as any),
        resolveAccountFixture: vi.fn().mockResolvedValue(fixture),
        buildTokenName: () => "E2E Created Key",
      }),
    ).rejects.toThrow(error)

    expect(deleteTokenFromKeyManagementPage).toHaveBeenCalledWith({
      page: keyPage,
      token: "E2E Created Key",
    })
  })

  it("runs fixture and environment cleanup when token deletion fails", async () => {
    const extensionPage = {} as any
    const keyPage = {} as any
    const deletionError = new Error("delete failed")
    const fixtureCleanup = vi.fn().mockResolvedValue(undefined)
    const environmentCleanup = vi.fn().mockResolvedValue(undefined)
    const fixture = createAccountFixture({
      accountId: "seeded-account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://seeded.example.com",
      cleanup: fixtureCleanup,
    })

    vi.mocked(openKeyManagementForAccount).mockResolvedValue(keyPage)
    vi.mocked(submitTokenCreationFromKeyManagementPage).mockResolvedValue(
      undefined,
    )
    vi.mocked(expectTokenCreatedInKeyManagementPage).mockResolvedValue({
      page: keyPage,
      row: {} as any,
    })
    vi.mocked(deleteTokenFromKeyManagementPage).mockRejectedValue(deletionError)

    await expect(
      runAccountKeyLifecycleScenario({
        extensionId: "extension-id",
        extensionPage,
        getServiceWorker: vi.fn().mockResolvedValue({} as any),
        resolveAccountFixture: vi.fn().mockResolvedValue(fixture),
        buildTokenName: () => "E2E Created Key",
        cleanup: environmentCleanup,
      }),
    ).rejects.toThrow(deletionError)

    expect(deleteTokenFromKeyManagementPage).toHaveBeenCalledWith({
      page: keyPage,
      token: "E2E Created Key",
    })
    expect(fixtureCleanup).toHaveBeenCalledOnce()
    expect(environmentCleanup).toHaveBeenCalledOnce()
  })

  it("runs environment cleanup and reports fixture cleanup failures", async () => {
    const fixtureCleanupError = new Error("fixture cleanup failed")
    const environmentCleanup = vi.fn().mockResolvedValue(undefined)
    const fixture = createAccountFixture({
      accountId: "seeded-account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://seeded.example.com",
      cleanup: vi.fn().mockRejectedValue(fixtureCleanupError),
    })

    vi.mocked(openKeyManagementForAccount).mockResolvedValue({} as any)
    vi.mocked(submitTokenCreationFromKeyManagementPage).mockResolvedValue(
      undefined,
    )
    vi.mocked(expectTokenCreatedInKeyManagementPage).mockResolvedValue({
      page: {} as any,
      row: {} as any,
    })

    await expect(
      runAccountKeyLifecycleScenario({
        extensionId: "extension-id",
        extensionPage: {} as any,
        getServiceWorker: vi.fn().mockResolvedValue({} as any),
        resolveAccountFixture: vi.fn().mockResolvedValue(fixture),
        buildTokenName: () => "E2E Created Key",
        cleanup: environmentCleanup,
      }),
    ).rejects.toThrow(fixtureCleanupError)

    expect(environmentCleanup).toHaveBeenCalledOnce()
  })

  it("preserves primary and cleanup errors when key lifecycle creation fails", async () => {
    const primaryError = new Error("create failed")
    const cleanupError = new Error("fixture cleanup failed")
    const fixture = createAccountFixture({
      accountId: "seeded-account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://seeded.example.com",
      cleanup: vi.fn().mockRejectedValue(cleanupError),
    })

    vi.mocked(openKeyManagementForAccount).mockResolvedValue({} as any)
    vi.mocked(submitTokenCreationFromKeyManagementPage).mockRejectedValue(
      primaryError,
    )

    await expect(
      runAccountKeyLifecycleScenario({
        extensionId: "extension-id",
        extensionPage: {} as any,
        getServiceWorker: vi.fn().mockResolvedValue({} as any),
        resolveAccountFixture: vi.fn().mockResolvedValue(fixture),
        buildTokenName: () => "E2E Created Key",
      }),
    ).rejects.toMatchObject({
      errors: [primaryError, cleanupError],
    })
  })

  it("runs account token cleanup finalizers when token deletion fails", async () => {
    const extensionPage = {} as any
    const keyPage = {} as any
    const deletionError = new Error("delete failed")
    const fixtureCleanup = vi.fn().mockResolvedValue(undefined)
    const environmentCleanup = vi.fn().mockResolvedValue(undefined)
    const verifyButton = {
      click: vi.fn().mockResolvedValue(undefined),
    }
    const tokenRow = {
      getByTestId: vi.fn().mockReturnValue(verifyButton),
    }
    const fixture = createAccountFixture({
      accountId: "seeded-account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://seeded.example.com",
      cleanup: fixtureCleanup,
    })

    vi.mocked(openKeyManagementForAccount).mockResolvedValue(keyPage)
    vi.mocked(submitTokenCreationFromKeyManagementPage).mockResolvedValue(
      undefined,
    )
    vi.mocked(expectTokenCreatedInKeyManagementPage).mockResolvedValue({
      page: keyPage,
      row: tokenRow as any,
    })
    vi.mocked(
      verifyOpenApiCredentialProfileModelsProbeDialog,
    ).mockResolvedValue(undefined)
    vi.mocked(deleteTokenFromKeyManagementPage).mockRejectedValue(deletionError)

    await expect(
      verifyAccountTokenModelsProbeUsage({
        page: extensionPage,
        extensionId: "extension-id",
        serviceWorker: {} as any,
        account: fixture,
        buildTokenName: () => "E2E Models Probe Key",
        cleanup: environmentCleanup,
      }),
    ).rejects.toThrow(deletionError)

    expect(deleteTokenFromKeyManagementPage).toHaveBeenCalledWith({
      page: keyPage,
      token: "E2E Models Probe Key",
    })
    expect(fixtureCleanup).toHaveBeenCalledOnce()
    expect(environmentCleanup).toHaveBeenCalledOnce()
  })

  it("runs account token models probe in the already-open verification dialog", async () => {
    const extensionPage = {} as any
    const keyPage = {} as any
    const verifyButton = {
      click: vi.fn().mockResolvedValue(undefined),
    }
    const tokenRow = {
      getByTestId: vi.fn().mockReturnValue(verifyButton),
    }
    const fixture = createAccountFixture({
      accountId: "seeded-account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://seeded.example.com",
      cleanup: createNoopAccountFixtureCleanup(),
    })

    vi.mocked(openKeyManagementForAccount).mockResolvedValue(keyPage)
    vi.mocked(submitTokenCreationFromKeyManagementPage).mockResolvedValue(
      undefined,
    )
    vi.mocked(expectTokenCreatedInKeyManagementPage).mockResolvedValue({
      page: keyPage,
      row: tokenRow as any,
    })
    vi.mocked(
      verifyOpenApiCredentialProfileModelsProbeDialog,
    ).mockResolvedValue(undefined)

    await verifyAccountTokenModelsProbeUsage({
      page: extensionPage,
      extensionId: "extension-id",
      serviceWorker: {} as any,
      account: fixture,
      buildTokenName: () => "E2E Models Probe Key",
      modelsProbe: {
        expectedStatus: "handled",
        closeDialog: true,
      },
    })

    expect(verifyButton.click).toHaveBeenCalledOnce()
    expect(
      verifyOpenApiCredentialProfileModelsProbeDialog,
    ).toHaveBeenCalledWith({
      page: keyPage,
      expectedStatus: "handled",
      closeDialog: true,
    })
    expect(verifyApiCredentialProfileModelsProbeScenario).not.toHaveBeenCalled()
  })

  it("creates a key, saves it to API profiles, and cleans up both artifacts", async () => {
    const extensionPage = {} as any
    const keyPage = {} as any
    const tokenRow = {} as any
    const fixtureCleanup = vi.fn().mockResolvedValue(undefined)
    const environmentCleanup = vi.fn().mockResolvedValue(undefined)
    const fixture = createAccountFixture({
      accountId: "seeded-account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://seeded.example.com",
      cleanup: fixtureCleanup,
    })

    vi.mocked(openKeyManagementForAccount).mockResolvedValue(keyPage)
    vi.mocked(submitTokenCreationFromKeyManagementPage).mockResolvedValue(
      undefined,
    )
    vi.mocked(expectTokenCreatedInKeyManagementPage).mockResolvedValue({
      page: keyPage,
      row: tokenRow,
    })
    vi.mocked(
      saveTokenToApiCredentialProfilesFromKeyManagementPage,
    ).mockResolvedValue({
      id: "profile-1",
      name: "Seeded - E2E Profile Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://seeded.example.com",
      apiKey: "sk-created-profile",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    })
    vi.mocked(deleteTokenFromKeyManagementPage).mockResolvedValue(undefined)
    vi.mocked(deleteApiCredentialProfileFromStorage).mockResolvedValue(
      undefined,
    )

    const profile = await runAccountKeyToApiProfileScenario({
      extensionId: "extension-id",
      extensionPage,
      getServiceWorker: vi.fn().mockResolvedValue({} as any),
      resolveAccountFixture: vi.fn().mockResolvedValue(fixture),
      buildTokenName: () => "E2E Profile Key",
      expectedProfile: {
        name: "Seeded - E2E Profile Key",
        baseUrl: "https://seeded.example.com",
        apiKey: "sk-created-profile",
      },
      cleanup: environmentCleanup,
    })

    expect(profile).toMatchObject({
      id: "profile-1",
      name: "Seeded - E2E Profile Key",
    })
    expect(openKeyManagementForAccount).toHaveBeenCalledWith({
      page: extensionPage,
      extensionId: "extension-id",
      accountId: "seeded-account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://seeded.example.com",
      openFromAccountRow: true,
    })
    expect(submitTokenCreationFromKeyManagementPage).toHaveBeenCalledWith({
      page: keyPage,
      tokenName: "E2E Profile Key",
    })
    expect(expectTokenCreatedInKeyManagementPage).toHaveBeenCalledWith({
      page: keyPage,
      tokenName: "E2E Profile Key",
    })
    expect(
      saveTokenToApiCredentialProfilesFromKeyManagementPage,
    ).toHaveBeenCalledWith({
      serviceWorker: {},
      page: keyPage,
      row: tokenRow,
      expectedProfile: {
        name: "Seeded - E2E Profile Key",
        baseUrl: "https://seeded.example.com",
        apiKey: "sk-created-profile",
      },
      openProfilesPage: false,
    })
    expect(deleteApiCredentialProfileFromStorage).toHaveBeenCalledWith({
      serviceWorker: {},
      profileId: "profile-1",
    })
    expect(deleteTokenFromKeyManagementPage).toHaveBeenCalledWith({
      page: keyPage,
      token: "E2E Profile Key",
    })
    expect(fixtureCleanup).toHaveBeenCalledOnce()
    expect(environmentCleanup).toHaveBeenCalledOnce()
  })

  it("saves an existing account token to API profiles without creating or deleting the token", async () => {
    const extensionPage = {} as any
    const keyPage = {} as any
    const tokenRow = {} as any
    const fixture = createAccountFixture({
      accountId: "seeded-account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://seeded.example.com",
      cleanup: createNoopAccountFixtureCleanup(),
    })

    vi.mocked(openKeyManagementForAccount).mockResolvedValue(keyPage)
    vi.mocked(expectTokenCreatedInKeyManagementPage).mockResolvedValue({
      page: keyPage,
      row: tokenRow,
    })
    vi.mocked(
      saveTokenToApiCredentialProfilesFromKeyManagementPage,
    ).mockResolvedValue({
      id: "profile-1",
      name: "Seeded - Existing Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://seeded.example.com",
      apiKey: "sk-existing",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    })

    const profile = await saveExistingAccountTokenToApiProfileScenario({
      extensionId: "extension-id",
      extensionPage,
      getServiceWorker: vi.fn().mockResolvedValue({} as any),
      resolveAccountFixture: vi.fn().mockResolvedValue(fixture),
      tokenName: "Existing Key",
      expectedProfile: {
        baseUrl: "https://seeded.example.com",
        apiKey: "sk-existing",
      },
      cleanupCreatedProfile: false,
    })

    expect(profile).toMatchObject({
      id: "profile-1",
      name: "Seeded - Existing Key",
    })
    expect(openKeyManagementForAccount).toHaveBeenCalledWith({
      page: extensionPage,
      extensionId: "extension-id",
      accountId: "seeded-account",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://seeded.example.com",
      openFromAccountRow: true,
    })
    expect(submitTokenCreationFromKeyManagementPage).not.toHaveBeenCalled()
    expect(expectTokenCreatedInKeyManagementPage).toHaveBeenCalledWith({
      page: keyPage,
      tokenName: "Existing Key",
    })
    expect(
      saveTokenToApiCredentialProfilesFromKeyManagementPage,
    ).toHaveBeenCalledWith({
      serviceWorker: {},
      page: keyPage,
      row: tokenRow,
      expectedProfile: {
        baseUrl: "https://seeded.example.com",
        apiKey: "sk-existing",
      },
      openProfilesPage: false,
    })
    expect(deleteTokenFromKeyManagementPage).not.toHaveBeenCalled()
    expect(deleteApiCredentialProfileFromStorage).not.toHaveBeenCalled()
  })

  it("closes the site page when account auto-detect environment cleanup fails", async () => {
    const serviceWorker = {} as any
    const cleanupError = new Error("cleanup failed")
    const sitePage = {
      close: vi.fn().mockResolvedValue(undefined),
    } as any

    vi.mocked(saveAutoDetectedAccountFromApp).mockResolvedValue({
      accountId: "account-1",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://new-api.example.com",
    })

    await expect(
      runAccountAutoDetectScenario({
        extensionId: "extension-id",
        extensionPage: {} as any,
        baseUrl: "https://new-api.example.com",
        siteType: SITE_TYPES.NEW_API,
        getServiceWorker: vi.fn().mockResolvedValue(serviceWorker),
        openSitePage: vi.fn().mockResolvedValue(sitePage),
        prepareDetectableSite: vi.fn().mockResolvedValue(undefined),
        cleanup: vi.fn().mockRejectedValue(cleanupError),
      }),
    ).rejects.toThrow(cleanupError)

    expect(sitePage.close).toHaveBeenCalledOnce()
  })

  it("preserves primary and cleanup errors when account auto-detect fails", async () => {
    const serviceWorker = {} as any
    const primaryError = new Error("save failed")
    const cleanupError = new Error("cleanup failed")
    const sitePage = {
      close: vi.fn().mockResolvedValue(undefined),
    } as any

    vi.mocked(saveAutoDetectedAccountFromApp).mockRejectedValue(primaryError)

    await expect(
      runAccountAutoDetectScenario({
        extensionId: "extension-id",
        extensionPage: {} as any,
        baseUrl: "https://new-api.example.com",
        siteType: SITE_TYPES.NEW_API,
        getServiceWorker: vi.fn().mockResolvedValue(serviceWorker),
        openSitePage: vi.fn().mockResolvedValue(sitePage),
        prepareDetectableSite: vi.fn().mockResolvedValue(undefined),
        cleanup: vi.fn().mockRejectedValue(cleanupError),
      }),
    ).rejects.toMatchObject({
      errors: [primaryError, cleanupError],
    })

    expect(sitePage.close).toHaveBeenCalledOnce()
  })
})
