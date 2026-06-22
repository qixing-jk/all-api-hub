import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type InstalledListener = (details: {
  reason: string
  previousVersion?: string
}) => void

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * Background entrypoint tests for the "open changelog after update" preference.
 *
 * The background entrypoint registers an onInstalled listener and then runs a
 * migration + update flow. These tests mock the WebExtension wrappers and
 * dependent services so we can assert that updates mark a pending version
 * (consumed by the first UI open) instead of opening a tab directly.
 */
describe("background onInstalled changelog opening", () => {
  let onInstalledListener: InstalledListener | undefined
  let onStartupListener: (() => void | Promise<void>) | undefined
  let onSuspendListener: (() => void | Promise<void>) | undefined

  let createTabMock: ReturnType<typeof vi.fn>
  let getDocsChangelogUrlMock: ReturnType<typeof vi.fn>
  let getManifestMock: ReturnType<typeof vi.fn>
  let getPreferencesMock: ReturnType<typeof vi.fn>
  let hasPermissionsMock: ReturnType<typeof vi.fn>
  let hasNewOptionalPermissionsMock: ReturnType<typeof vi.fn>
  let openOrFocusOptionsMenuItemMock: ReturnType<typeof vi.fn>
  let optionalPermissions: string[]
  let setPendingVersionMock: ReturnType<typeof vi.fn>
  let setLastSeenOptionalPermissionsMock: ReturnType<typeof vi.fn>
  let shouldAutoOpenChangelogForUpdateMock: ReturnType<typeof vi.fn>
  let triggerStartupSponsorRecommendationsDailySummaryMock: ReturnType<
    typeof vi.fn
  >
  let isTestModeMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onInstalledListener = undefined
    onStartupListener = undefined
    onSuspendListener = undefined

    createTabMock = vi.fn().mockResolvedValue(undefined)
    getDocsChangelogUrlMock = vi.fn((version?: string) =>
      version
        ? "https://docs.example.test/changelog.html#_2-39-0"
        : "https://docs.example.test/changelog.html",
    )
    getManifestMock = vi.fn(() => ({ version: "2.39.0" }))
    getPreferencesMock = vi.fn().mockResolvedValue({
      actionClickBehavior: "popup",
      openChangelogOnUpdate: true,
    })
    hasPermissionsMock = vi.fn().mockResolvedValue(true)
    hasNewOptionalPermissionsMock = vi.fn().mockResolvedValue(false)
    openOrFocusOptionsMenuItemMock = vi.fn()
    optionalPermissions = []
    setPendingVersionMock = vi.fn().mockResolvedValue(undefined)
    setLastSeenOptionalPermissionsMock = vi.fn().mockResolvedValue(undefined)
    shouldAutoOpenChangelogForUpdateMock = vi.fn().mockResolvedValue(true)
    triggerStartupSponsorRecommendationsDailySummaryMock = vi.fn()
    isTestModeMock = vi.fn().mockReturnValue(true)

    vi.resetModules()
    ;(globalThis as any).defineBackground = (factory: () => unknown) =>
      factory()

    vi.doMock("~/utils/browser/browserApi", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/utils/browser/browserApi")>()
      return {
        ...actual,
        createTab: createTabMock,
        getExtensionVersion: vi.fn(
          (fallback = "0.0.0") => getManifestMock().version?.trim() || fallback,
        ),
        getManifest: getManifestMock,
        onInstalled: vi.fn((listener: InstalledListener) => {
          onInstalledListener = listener
        }),
        onStartup: vi.fn((listener: () => void | Promise<void>) => {
          onStartupListener = listener
        }),
        onSuspend: vi.fn((listener: () => void | Promise<void>) => {
          onSuspendListener = listener
        }),
      }
    })

    vi.doMock("~/utils/navigation/docsLinks", () => ({
      getDocsChangelogUrl: getDocsChangelogUrlMock,
    }))

    vi.doMock("~/services/preferences/userPreferences", () => ({
      userPreferences: { getPreferences: getPreferencesMock },
    }))

    vi.doMock("~/services/updates/changelogOnUpdateState", () => ({
      changelogOnUpdateState: {
        setPendingVersion: setPendingVersionMock,
      },
    }))

    vi.doMock("~/services/updates/changelogIndex", () => ({
      shouldAutoOpenChangelogForUpdate: shouldAutoOpenChangelogForUpdateMock,
    }))

    // Avoid heavy side effects from the background entrypoint; only the update
    // flow under test needs to run.
    vi.doMock("~/entrypoints/background/runtimeMessages", () => ({
      setupRuntimeMessageListeners: vi.fn(),
    }))
    vi.doMock("~/entrypoints/background/tempWindowPool", () => ({
      cleanupTempContextsOnSuspend: vi.fn().mockResolvedValue(undefined),
      setupTempWindowListeners: vi.fn(),
    }))
    vi.doMock("~/entrypoints/background/contextMenus", () => ({
      setupContextMenus: vi.fn(),
    }))
    vi.doMock("~/entrypoints/background/cookieInterceptor", () => ({
      initializeCookieInterceptors: vi.fn().mockResolvedValue(undefined),
      setupCookieInterceptorListeners: vi.fn(),
    }))
    vi.doMock("~/entrypoints/background/devActionBranding", () => ({
      applyDevActionBranding: vi.fn().mockResolvedValue(undefined),
    }))
    vi.doMock("~/entrypoints/background/servicesInit", () => ({
      initializeServices: vi.fn().mockResolvedValue(undefined),
    }))
    vi.doMock("~/entrypoints/background/actionClickBehavior", () => ({
      applyActionClickBehavior: vi.fn().mockResolvedValue(undefined),
    }))
    vi.doMock("~/services/productAnalytics/runtime", () => ({
      setupProductAnalyticsAccountChangeListener: vi.fn(),
      setupProductAnalyticsPreferencesChangeListener: vi.fn(),
      triggerStartupSettingsSnapshot: vi.fn(),
      triggerStartupShieldBypassDailySummary: vi.fn(),
      triggerStartupSponsorRecommendationsDailySummary:
        triggerStartupSponsorRecommendationsDailySummaryMock,
      triggerStartupSiteEcosystemSnapshot: vi.fn(),
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
      OPTIONAL_PERMISSIONS: optionalPermissions,
      hasPermissions: hasPermissionsMock,
    }))
    vi.doMock("~/services/permissions/optionalPermissionState", () => ({
      hasNewOptionalPermissions: hasNewOptionalPermissionsMock,
      setLastSeenOptionalPermissions: setLastSeenOptionalPermissionsMock,
    }))
    vi.doMock("~/utils/core/environment", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/utils/core/environment")>()
      return {
        ...actual,
        isTestMode: isTestModeMock,
      }
    })
    vi.doMock("~/utils/navigation", () => ({
      openOrFocusOptionsMenuItem: openOrFocusOptionsMenuItemMock,
    }))
  })

  afterEach(() => {
    delete (globalThis as any).defineBackground

    vi.doUnmock("~/utils/browser/browserApi")
    vi.doUnmock("~/utils/navigation/docsLinks")
    vi.doUnmock("~/services/updates/changelogOnUpdateState")
    vi.doUnmock("~/services/updates/changelogIndex")
    vi.doUnmock("~/services/preferences/userPreferences")
    vi.doUnmock("~/entrypoints/background/runtimeMessages")
    vi.doUnmock("~/entrypoints/background/tempWindowPool")
    vi.doUnmock("~/entrypoints/background/contextMenus")
    vi.doUnmock("~/entrypoints/background/cookieInterceptor")
    vi.doUnmock("~/entrypoints/background/devActionBranding")
    vi.doUnmock("~/entrypoints/background/servicesInit")
    vi.doUnmock("~/entrypoints/background/actionClickBehavior")
    vi.doUnmock("~/services/productAnalytics/runtime")
    vi.doUnmock("~/services/tags/tagStorage")
    vi.doUnmock("~/services/accounts/accountStorage")
    vi.doUnmock("~/services/accounts/migrations/accountDataMigration")
    vi.doUnmock("~/services/permissions/permissionManager")
    vi.doUnmock("~/services/permissions/optionalPermissionState")
    vi.doUnmock("~/utils/core/environment")
    vi.doUnmock("~/utils/navigation")

    vi.resetModules()
    vi.restoreAllMocks()
  })

  it("does not open any changelog tab on update and marks the pending version instead", async () => {
    await import("~/entrypoints/background/index")

    expect(onInstalledListener).toBeTypeOf("function")
    expect(onStartupListener).toBeTypeOf("function")
    expect(onSuspendListener).toBeTypeOf("function")
    await onInstalledListener?.({ reason: "update" })
    await flushPromises()

    expect(getPreferencesMock).toHaveBeenCalled()
    expect(getManifestMock).toHaveBeenCalled()
    expect(setPendingVersionMock).toHaveBeenCalledWith("2.39.0")
    expect(getDocsChangelogUrlMock).not.toHaveBeenCalled()
    expect(createTabMock).not.toHaveBeenCalled()
  })

  it("triggers sponsor recommendations summary capture during background startup", async () => {
    await import("~/entrypoints/background/index")
    await flushPromises()

    expect(
      triggerStartupSponsorRecommendationsDailySummaryMock,
    ).toHaveBeenCalledTimes(1)
  })

  it("passes current and previous versions to the changelog index gate", async () => {
    await import("~/entrypoints/background/index")

    expect(onInstalledListener).toBeTypeOf("function")
    await onInstalledListener?.({
      reason: "update",
      previousVersion: "2.38.0",
    })
    await flushPromises()

    expect(shouldAutoOpenChangelogForUpdateMock).toHaveBeenCalledWith({
      currentVersion: "2.39.0",
      previousVersion: "2.38.0",
    })
    expect(setPendingVersionMock).toHaveBeenCalledWith("2.39.0")
  })

  it("skips pending-version state when the changelog index gate rejects the version", async () => {
    shouldAutoOpenChangelogForUpdateMock.mockResolvedValue(false)

    await import("~/entrypoints/background/index")

    expect(onInstalledListener).toBeTypeOf("function")
    await onInstalledListener?.({
      reason: "update",
      previousVersion: "2.40.0",
    })
    await flushPromises()

    expect(shouldAutoOpenChangelogForUpdateMock).toHaveBeenCalledWith({
      currentVersion: "2.39.0",
      previousVersion: "2.40.0",
    })
    expect(setPendingVersionMock).not.toHaveBeenCalled()
  })

  it("marks pending version even when openChangelogOnUpdate is disabled", async () => {
    getPreferencesMock.mockResolvedValue({
      actionClickBehavior: "popup",
      openChangelogOnUpdate: false,
    })

    await import("~/entrypoints/background/index")

    expect(onInstalledListener).toBeTypeOf("function")
    expect(onStartupListener).toBeTypeOf("function")
    expect(onSuspendListener).toBeTypeOf("function")
    await onInstalledListener?.({ reason: "update" })
    await flushPromises()

    expect(setPendingVersionMock).toHaveBeenCalledWith("2.39.0")
    expect(getDocsChangelogUrlMock).not.toHaveBeenCalled()
    expect(createTabMock).not.toHaveBeenCalled()
  })

  it("does not auto-open permissions onboarding on install in test mode", async () => {
    optionalPermissions = ["cookies"]

    await import("~/entrypoints/background/index")

    expect(onInstalledListener).toBeTypeOf("function")
    await onInstalledListener?.({ reason: "install" })
    await flushPromises()

    expect(openOrFocusOptionsMenuItemMock).not.toHaveBeenCalled()
  })

  it("opens Overview permissions onboarding on install outside test mode", async () => {
    optionalPermissions = ["cookies"]
    isTestModeMock.mockReturnValue(false)

    await import("~/entrypoints/background/index")

    expect(onInstalledListener).toBeTypeOf("function")
    await onInstalledListener?.({ reason: "install" })
    await flushPromises()

    expect(openOrFocusOptionsMenuItemMock).toHaveBeenCalledWith("overview", {
      onboarding: "permissions",
    })
  })

  it("skips pending-version state when the manifest has no version", async () => {
    getManifestMock.mockReturnValue({})

    await import("~/entrypoints/background/index")

    expect(onInstalledListener).toBeTypeOf("function")
    await onInstalledListener?.({ reason: "update" })
    await flushPromises()

    expect(getManifestMock).toHaveBeenCalled()
    expect(setPendingVersionMock).not.toHaveBeenCalled()
    expect(createTabMock).not.toHaveBeenCalled()
  })

  it("does not auto-open new-permissions onboarding on update in test mode", async () => {
    optionalPermissions = ["cookies"]
    hasNewOptionalPermissionsMock.mockResolvedValue(true)
    hasPermissionsMock.mockResolvedValue(false)

    await import("~/entrypoints/background/index")

    expect(onInstalledListener).toBeTypeOf("function")
    await onInstalledListener?.({ reason: "update" })
    await flushPromises()

    expect(setPendingVersionMock).toHaveBeenCalledWith("2.39.0")
    expect(openOrFocusOptionsMenuItemMock).not.toHaveBeenCalled()
  })

  it("opens Overview new-permissions onboarding on update outside test mode", async () => {
    optionalPermissions = ["cookies"]
    hasNewOptionalPermissionsMock.mockResolvedValue(true)
    hasPermissionsMock.mockResolvedValue(false)
    isTestModeMock.mockReturnValue(false)

    await import("~/entrypoints/background/index")

    expect(onInstalledListener).toBeTypeOf("function")
    await onInstalledListener?.({ reason: "update" })
    await flushPromises()

    expect(setPendingVersionMock).toHaveBeenCalledWith("2.39.0")
    expect(openOrFocusOptionsMenuItemMock).toHaveBeenCalledWith("overview", {
      onboarding: "permissions",
      reason: "new-permissions",
    })
  })

  it("quietly refreshes the optional-permission snapshot when new permissions are already granted", async () => {
    optionalPermissions = ["cookies"]
    hasNewOptionalPermissionsMock.mockResolvedValue(true)
    hasPermissionsMock.mockResolvedValue(true)

    await import("~/entrypoints/background/index")

    expect(onInstalledListener).toBeTypeOf("function")
    await onInstalledListener?.({ reason: "update" })
    await flushPromises()

    expect(setPendingVersionMock).toHaveBeenCalledWith("2.39.0")
    expect(hasNewOptionalPermissionsMock).toHaveBeenCalled()
    expect(hasPermissionsMock).toHaveBeenCalledWith(["cookies"])
    expect(setLastSeenOptionalPermissionsMock).toHaveBeenCalledTimes(1)
    expect(openOrFocusOptionsMenuItemMock).not.toHaveBeenCalled()
  })
})
