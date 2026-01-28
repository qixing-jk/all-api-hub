import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type InstalledListener = (details: { reason: string }) => void

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * Background entrypoint tests for the "open changelog after update" preference.
 *
 * The background entrypoint registers an onInstalled listener and then runs a
 * migration + update flow. These tests mock the WebExtension wrappers and
 * dependent services so we can assert whether the changelog tab is created.
 */
describe("background onInstalled changelog opening", () => {
  let onInstalledListener: InstalledListener | undefined

  let createTabMock: ReturnType<typeof vi.fn>
  let getDocsChangelogUrlMock: ReturnType<typeof vi.fn>
  let getManifestMock: ReturnType<typeof vi.fn>
  let getPreferencesMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onInstalledListener = undefined

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

    vi.resetModules()
    ;(globalThis as any).defineBackground = (factory: () => unknown) =>
      factory()

    vi.doMock("~/utils/browserApi", async (importOriginal) => {
      const actual = await importOriginal<typeof import("~/utils/browserApi")>()
      return {
        ...actual,
        createTab: createTabMock,
        getManifest: getManifestMock,
        onInstalled: vi.fn((listener: InstalledListener) => {
          onInstalledListener = listener
        }),
      }
    })

    vi.doMock("~/utils/docsLinks", () => ({
      getDocsChangelogUrl: getDocsChangelogUrlMock,
    }))

    vi.doMock("~/services/userPreferences", () => ({
      userPreferences: { getPreferences: getPreferencesMock },
    }))

    // Avoid heavy side effects from the background entrypoint; only the update
    // flow under test needs to run.
    vi.doMock("~/entrypoints/background/runtimeMessages", () => ({
      setupRuntimeMessageListeners: vi.fn(),
    }))
    vi.doMock("~/entrypoints/background/tempWindowPool", () => ({
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
    vi.doMock("~/services/accountTags/tagStorage", () => ({
      tagStorage: {
        ensureLegacyMigration: vi.fn().mockResolvedValue(undefined),
      },
    }))
    vi.doMock("~/services/accountStorage", () => ({
      accountStorage: {
        getAllAccounts: vi.fn().mockResolvedValue([]),
        exportData: vi.fn().mockResolvedValue({ accounts: [] }),
        importData: vi.fn().mockResolvedValue(undefined),
      },
    }))
    vi.doMock(
      "~/services/configMigration/account/accountDataMigration",
      () => ({
        migrateAccountsConfig: vi.fn((accounts: any[]) => ({
          accounts,
          migratedCount: 0,
        })),
      }),
    )
    vi.doMock("~/services/permissions/permissionManager", () => ({
      OPTIONAL_PERMISSIONS: [],
      hasPermissions: vi.fn().mockResolvedValue(true),
    }))
    vi.doMock("~/services/permissions/optionalPermissionState", () => ({
      hasNewOptionalPermissions: vi.fn().mockResolvedValue(false),
      setLastSeenOptionalPermissions: vi.fn().mockResolvedValue(undefined),
    }))
    vi.doMock("~/utils/navigation", () => ({
      openOrFocusOptionsMenuItem: vi.fn(),
    }))
  })

  afterEach(() => {
    delete (globalThis as any).defineBackground

    vi.doUnmock("~/utils/browserApi")
    vi.doUnmock("~/utils/docsLinks")
    vi.doUnmock("~/services/userPreferences")
    vi.doUnmock("~/entrypoints/background/runtimeMessages")
    vi.doUnmock("~/entrypoints/background/tempWindowPool")
    vi.doUnmock("~/entrypoints/background/contextMenus")
    vi.doUnmock("~/entrypoints/background/cookieInterceptor")
    vi.doUnmock("~/entrypoints/background/devActionBranding")
    vi.doUnmock("~/entrypoints/background/servicesInit")
    vi.doUnmock("~/entrypoints/background/actionClickBehavior")
    vi.doUnmock("~/services/accountTags/tagStorage")
    vi.doUnmock("~/services/accountStorage")
    vi.doUnmock("~/services/configMigration/account/accountDataMigration")
    vi.doUnmock("~/services/permissions/permissionManager")
    vi.doUnmock("~/services/permissions/optionalPermissionState")
    vi.doUnmock("~/utils/navigation")

    vi.resetModules()
    vi.restoreAllMocks()
  })

  it("opens the version-anchored changelog tab on update when enabled", async () => {
    await import("~/entrypoints/background/index")

    expect(onInstalledListener).toBeTypeOf("function")
    onInstalledListener?.({ reason: "update" })
    await flushPromises()

    expect(getPreferencesMock).toHaveBeenCalled()
    expect(getManifestMock).toHaveBeenCalled()
    expect(getDocsChangelogUrlMock).toHaveBeenCalledWith("2.39.0")
    expect(createTabMock).toHaveBeenCalledWith(
      "https://docs.example.test/changelog.html#_2-39-0",
      true,
    )
  })

  it("does not open any changelog tab on update when disabled", async () => {
    getPreferencesMock.mockResolvedValue({
      actionClickBehavior: "popup",
      openChangelogOnUpdate: false,
    })

    await import("~/entrypoints/background/index")

    expect(onInstalledListener).toBeTypeOf("function")
    onInstalledListener?.({ reason: "update" })
    await flushPromises()

    expect(getDocsChangelogUrlMock).not.toHaveBeenCalled()
    expect(createTabMock).not.toHaveBeenCalled()
  })
})
