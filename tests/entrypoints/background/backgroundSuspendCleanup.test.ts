import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const originalBrowser = (globalThis as any).browser

describe("background onSuspend temp-context cleanup", () => {
  let onSuspendListener: (() => void | Promise<void>) | undefined
  let cleanupTempContextsOnSuspendMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onSuspendListener = undefined
    cleanupTempContextsOnSuspendMock = vi.fn().mockResolvedValue(undefined)

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
    vi.doMock("~/services/preferences/userPreferences", () => ({
      userPreferences: {
        getPreferences: vi.fn().mockResolvedValue({
          actionClickBehavior: "popup",
        }),
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
    vi.doUnmock("~/services/preferences/userPreferences")
    vi.doUnmock("~/services/tags/tagStorage")
    vi.doUnmock("~/services/accounts/accountStorage")
    vi.doUnmock("~/services/accounts/migrations/accountDataMigration")
    vi.doUnmock("~/services/permissions/permissionManager")
    vi.doUnmock("~/services/permissions/optionalPermissionState")
    vi.doUnmock("~/services/updates/changelogOnUpdateState")
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
})
