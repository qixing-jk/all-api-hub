import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const {
  applyActionClickBehaviorMock,
  getPreferencesMock,
  getPreferencesStrictMock,
  initializeCookieInterceptorsMock,
  initializeServicesMock,
  loggerErrorMock,
  loggerWarnMock,
  setupActionClickBehaviorListenerMock,
  triggerStartupSettingsSnapshotMock,
  triggerStartupShieldBypassDailySummaryMock,
  triggerStartupSiteEcosystemSnapshotMock,
  triggerStartupSponsorRecommendationsDailySummaryMock,
} = vi.hoisted(() => ({
  applyActionClickBehaviorMock: vi.fn(),
  getPreferencesMock: vi.fn(),
  getPreferencesStrictMock: vi.fn(),
  initializeCookieInterceptorsMock: vi.fn(),
  initializeServicesMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  setupActionClickBehaviorListenerMock: vi.fn(),
  triggerStartupSettingsSnapshotMock: vi.fn(),
  triggerStartupShieldBypassDailySummaryMock: vi.fn(),
  triggerStartupSiteEcosystemSnapshotMock: vi.fn(),
  triggerStartupSponsorRecommendationsDailySummaryMock: vi.fn(),
}))

const originalBrowser = (globalThis as any).browser

describe("background onSuspend temp-context cleanup", () => {
  let onSuspendListener: (() => void | Promise<void>) | undefined
  let cleanupTempContextsOnSuspendMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onSuspendListener = undefined
    cleanupTempContextsOnSuspendMock = vi.fn().mockResolvedValue(undefined)
    applyActionClickBehaviorMock.mockReset().mockResolvedValue(undefined)
    getPreferencesMock.mockReset().mockResolvedValue({
      actionClickBehavior: "popup",
    })
    getPreferencesStrictMock.mockReset().mockResolvedValue({
      actionClickBehavior: "popup",
    })
    initializeCookieInterceptorsMock.mockReset().mockResolvedValue(undefined)
    initializeServicesMock.mockReset().mockResolvedValue(undefined)
    loggerErrorMock.mockReset()
    loggerWarnMock.mockReset()
    setupActionClickBehaviorListenerMock.mockReset()
    triggerStartupSettingsSnapshotMock.mockReset()
    triggerStartupShieldBypassDailySummaryMock.mockReset()
    triggerStartupSiteEcosystemSnapshotMock.mockReset()
    triggerStartupSponsorRecommendationsDailySummaryMock.mockReset()

    vi.resetModules()
    ;(globalThis as any).browser = {
      runtime: {
        id: "test-extension-id",
      },
    }
    ;(globalThis as any).defineBackground = (factory: () => unknown) =>
      factory()

    vi.doMock("~/utils/browser/browserApi", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/utils/browser/browserApi")>()
      return {
        ...actual,
        getManifest: vi.fn(() => ({ version: "2.39.0" })),
        onInstalled: vi.fn(),
        onStartup: vi.fn(),
        onSuspend: vi.fn((listener: () => void | Promise<void>) => {
          onSuspendListener = listener
        }),
      }
    })

    vi.doMock("~/entrypoints/background/tempWindowPool", () => ({
      cleanupTempContextsOnSuspend: cleanupTempContextsOnSuspendMock,
      setupTempWindowListeners: vi.fn(),
    }))
    vi.doMock("~/entrypoints/background/runtimeMessages", () => ({
      setupRuntimeMessageListeners: vi.fn(),
    }))
    vi.doMock("~/entrypoints/background/contextMenus", () => ({
      setupContextMenus: vi.fn(),
    }))
    vi.doMock("~/entrypoints/background/cookieInterceptor", () => ({
      initializeCookieInterceptors: initializeCookieInterceptorsMock,
      setupCookieInterceptorListeners: vi.fn(),
    }))
    vi.doMock("~/entrypoints/background/devActionBranding", () => ({
      applyDevActionBranding: vi.fn().mockResolvedValue(undefined),
    }))
    vi.doMock("~/entrypoints/background/servicesInit", () => ({
      initializeServices: initializeServicesMock,
    }))
    vi.doMock("~/entrypoints/background/actionClickBehavior", () => ({
      applyActionClickBehavior: applyActionClickBehaviorMock,
      setupActionClickBehaviorListener: setupActionClickBehaviorListenerMock,
    }))
    vi.doMock("~/services/productAnalytics/runtime", () => ({
      setupProductAnalyticsAccountChangeListener: vi.fn(),
      setupProductAnalyticsPreferencesChangeListener: vi.fn(),
      triggerStartupSettingsSnapshot: triggerStartupSettingsSnapshotMock,
      triggerStartupShieldBypassDailySummary:
        triggerStartupShieldBypassDailySummaryMock,
      triggerStartupSiteEcosystemSnapshot:
        triggerStartupSiteEcosystemSnapshotMock,
      triggerStartupSponsorRecommendationsDailySummary:
        triggerStartupSponsorRecommendationsDailySummaryMock,
    }))
    vi.doMock("~/services/preferences/userPreferences", () => ({
      userPreferences: {
        getPreferences: getPreferencesMock,
        getPreferencesStrict: getPreferencesStrictMock,
      },
    }))
    vi.doMock("~/services/tags/tagStorage", () => ({
      tagStorage: {
        ensureLegacyMigration: vi.fn().mockResolvedValue(undefined),
      },
    }))
    vi.doMock("~/services/accounts/accountStorage", () => ({
      accountStorage: {
        getAllAccounts: vi.fn().mockResolvedValue([]),
        exportData: vi.fn().mockResolvedValue({ accounts: [] }),
        importData: vi.fn().mockResolvedValue(undefined),
      },
    }))
    vi.doMock("~/services/accounts/migrations/accountDataMigration", () => ({
      migrateAccountsConfig: vi.fn((accounts: any[]) => ({
        accounts,
        migratedCount: 0,
      })),
    }))
    vi.doMock("~/services/permissions/permissionManager", () => ({
      OPTIONAL_PERMISSIONS: [],
      hasPermissions: vi.fn().mockResolvedValue(true),
    }))
    vi.doMock("~/services/permissions/optionalPermissionState", () => ({
      hasNewOptionalPermissions: vi.fn().mockResolvedValue(false),
      setLastSeenOptionalPermissions: vi.fn().mockResolvedValue(undefined),
    }))
    vi.doMock("~/services/updates/changelogOnUpdateState", () => ({
      changelogOnUpdateState: {
        setPendingVersion: vi.fn().mockResolvedValue(undefined),
      },
    }))
    vi.doMock("~/utils/core/logger", () => ({
      createLogger: vi.fn(() => ({
        debug: vi.fn(),
        error: loggerErrorMock,
        info: vi.fn(),
        warn: loggerWarnMock,
      })),
    }))
    vi.doMock("~/utils/navigation", () => ({
      openOrFocusOptionsMenuItem: vi.fn(),
    }))
  })

  afterEach(() => {
    ;(globalThis as any).browser = originalBrowser
    delete (globalThis as any).defineBackground

    vi.doUnmock("~/utils/browser/browserApi")
    vi.doUnmock("~/entrypoints/background/tempWindowPool")
    vi.doUnmock("~/entrypoints/background/runtimeMessages")
    vi.doUnmock("~/entrypoints/background/contextMenus")
    vi.doUnmock("~/entrypoints/background/cookieInterceptor")
    vi.doUnmock("~/entrypoints/background/devActionBranding")
    vi.doUnmock("~/entrypoints/background/servicesInit")
    vi.doUnmock("~/entrypoints/background/actionClickBehavior")
    vi.doUnmock("~/services/productAnalytics/runtime")
    vi.doUnmock("~/services/preferences/userPreferences")
    vi.doUnmock("~/services/tags/tagStorage")
    vi.doUnmock("~/services/accounts/accountStorage")
    vi.doUnmock("~/services/accounts/migrations/accountDataMigration")
    vi.doUnmock("~/services/permissions/permissionManager")
    vi.doUnmock("~/services/permissions/optionalPermissionState")
    vi.doUnmock("~/services/updates/changelogOnUpdateState")
    vi.doUnmock("~/utils/core/logger")
    vi.doUnmock("~/utils/navigation")

    vi.resetModules()
    vi.restoreAllMocks()
  })

  it("registers runtime.onSuspend and delegates to temp-context cleanup", async () => {
    await import("~/entrypoints/background/index")

    expect(onSuspendListener).toBeTypeOf("function")

    onSuspendListener?.()

    expect(cleanupTempContextsOnSuspendMock).toHaveBeenCalledTimes(1)
  })

  it("registers toolbar clicks and starts services before background startup awaits", async () => {
    await import("~/entrypoints/background/index")

    await vi.waitFor(() => {
      expect(initializeCookieInterceptorsMock).toHaveBeenCalledTimes(1)
    })
    expect(setupActionClickBehaviorListenerMock).toHaveBeenCalledTimes(1)
    expect(
      setupActionClickBehaviorListenerMock.mock.invocationCallOrder[0],
    ).toBeLessThan(initializeServicesMock.mock.invocationCallOrder[0])
    expect(initializeServicesMock.mock.invocationCallOrder[0]).toBeLessThan(
      getPreferencesStrictMock.mock.invocationCallOrder[0],
    )
    expect(applyActionClickBehaviorMock).toHaveBeenCalledWith("popup")
  })

  it("continues background startup when toolbar reconciliation fails", async () => {
    applyActionClickBehaviorMock.mockRejectedValueOnce(
      new Error("toolbar projection failed"),
    )

    await import("~/entrypoints/background/index")

    await vi.waitFor(() => {
      expect(initializeCookieInterceptorsMock).toHaveBeenCalledTimes(1)
    })

    expect(initializeServicesMock).toHaveBeenCalledTimes(1)
    expect(triggerStartupSiteEcosystemSnapshotMock).toHaveBeenCalledTimes(1)
    expect(triggerStartupSettingsSnapshotMock).toHaveBeenCalledTimes(1)
    expect(triggerStartupShieldBypassDailySummaryMock).toHaveBeenCalledTimes(1)
    expect(
      triggerStartupSponsorRecommendationsDailySummaryMock,
    ).toHaveBeenCalledTimes(1)
  })

  it("continues background startup when strict toolbar preference storage fails", async () => {
    const storageError = new Error("preference storage unavailable")
    getPreferencesStrictMock.mockRejectedValueOnce(storageError)

    await import("~/entrypoints/background/index")

    await vi.waitFor(() => {
      expect(initializeCookieInterceptorsMock).toHaveBeenCalledTimes(1)
    })

    expect(applyActionClickBehaviorMock).not.toHaveBeenCalled()
    expect(initializeServicesMock).toHaveBeenCalledTimes(1)
    expect(triggerStartupSiteEcosystemSnapshotMock).toHaveBeenCalledTimes(1)
    expect(triggerStartupSettingsSnapshotMock).toHaveBeenCalledTimes(1)
    expect(triggerStartupShieldBypassDailySummaryMock).toHaveBeenCalledTimes(1)
    expect(
      triggerStartupSponsorRecommendationsDailySummaryMock,
    ).toHaveBeenCalledTimes(1)
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "Failed to reconcile toolbar action click behavior",
      storageError,
    )
  })

  it("logs an essential service initialization failure without an unhandled rejection", async () => {
    const serviceInitializationError = new Error(
      "service initialization failed",
    )
    initializeServicesMock.mockRejectedValueOnce(serviceInitializationError)
    getPreferencesStrictMock.mockImplementationOnce(() => new Promise(() => {}))

    await import("~/entrypoints/background/index")

    await vi.waitFor(() => {
      expect(loggerErrorMock).toHaveBeenCalledWith(
        "Failed to initialize background startup",
        serviceInitializationError,
      )
    })

    expect(initializeCookieInterceptorsMock).not.toHaveBeenCalled()
  })
})
