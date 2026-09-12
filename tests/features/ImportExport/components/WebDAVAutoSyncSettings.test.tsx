import {
  act,
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { UserPreferencesProvider } from "~/contexts/UserPreferencesContext"
import WebDAVAutoSyncSettings from "~/features/ImportExport/components/WebDAVAutoSyncSettings"
import toast from "~/lib/notify"
import { resolveProductAnalyticsActionContext } from "~/services/productAnalytics/actionConfig"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { WebdavAutoSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { CLOUD_SYNC_PROVIDERS, WEBDAV_SYNC_STRATEGIES } from "~/types/webdav"
import { testI18n } from "~~/tests/test-utils/i18n"

const {
  mockUserPreferences,
  mockSendWebdavAutoSyncMessage,
  mockStartProductAnalyticsAction,
  mockCompleteProductAnalyticsAction,
  loggerMocks,
} = vi.hoisted(() => ({
  mockUserPreferences: {
    getPreferences: vi.fn(),
    savePreferences: vi.fn(),
  },
  mockSendWebdavAutoSyncMessage: vi.fn(),
  mockStartProductAnalyticsAction: vi.fn(),
  mockCompleteProductAnalyticsAction: vi.fn(),
  loggerMocks: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock("~/lib/notify", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => loggerMocks,
}))

vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/preferences/userPreferences")
    >()
  return {
    ...actual,
    userPreferences: {
      ...actual.userPreferences,
      ...mockUserPreferences,
    },
  }
})

vi.mock("~/utils/browser/browserApi", () => ({}))

vi.mock("~/services/webdav/webdavAutoSyncMessaging", () => ({
  sendWebdavAutoSyncMessage: mockSendWebdavAutoSyncMessage,
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: unknown[]) =>
    mockStartProductAnalyticsAction(...args),
}))

vi.mock("~/components/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/components/ui")>()

  return {
    ...actual,
    Button: ({
      analyticsAction,
      children,
      leftIcon,
      rightIcon,
      loading: _loading,
      ...props
    }: any) => {
      const scope = useProductAnalyticsScope()
      const resolvedAction = resolveProductAnalyticsActionContext(
        analyticsAction,
        scope,
      )

      return (
        <button
          type="button"
          data-analytics-action={
            resolvedAction
              ? `${resolvedAction.featureId}:${resolvedAction.actionId}:${resolvedAction.surfaceId}:${resolvedAction.entrypoint}`
              : undefined
          }
          {...props}
        >
          {leftIcon}
          {children}
          {rightIcon}
        </button>
      )
    },
  }
})

function render(ui: ReactNode) {
  return rtlRender(
    <I18nextProvider i18n={testI18n}>
      <UserPreferencesProvider>{ui}</UserPreferencesProvider>
    </I18nextProvider>,
  )
}

describe("WebDAVAutoSyncSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUserPreferences.getPreferences.mockResolvedValue({
      lastUpdated: 1,
      webdav: {
        autoSync: true,
        syncInterval: 1800,
        syncStrategy: WEBDAV_SYNC_STRATEGIES.DOWNLOAD_ONLY,
      },
    })
    mockSendWebdavAutoSyncMessage.mockImplementation(async (type: string) => {
      switch (type) {
        case WebdavAutoSyncMessageTypes.GetStatus:
          return {
            success: true,
            data: {
              isSyncing: false,
              lastSyncTime: 1_700_000_000_000,
              lastSyncStatus: "error",
              lastSyncError: "sync boom",
            },
          }
        case WebdavAutoSyncMessageTypes.UpdateSettings:
          return { success: true }
        case WebdavAutoSyncMessageTypes.SyncNow:
          return { success: true, data: { message: "custom sync ok" } }
        default:
          return { success: true }
      }
    })
    mockStartProductAnalyticsAction.mockReturnValue({
      complete: mockCompleteProductAnalyticsAction,
    })
  })

  it.each(["", "   "])(
    "blocks immediate Gist sync without an encryption password: %j",
    async (backupEncryptionPassword) => {
      mockUserPreferences.getPreferences.mockResolvedValue({
        lastUpdated: 1,
        webdav: {
          provider: CLOUD_SYNC_PROVIDERS.GITHUB_GIST,
          githubGist: { token: "test-token", gistId: "test-gist" },
          backupEncryptionPassword,
          autoSync: false,
          syncInterval: 1800,
          syncStrategy: WEBDAV_SYNC_STRATEGIES.MERGE,
        },
      })
      const onPasswordError = vi.fn()
      const user = userEvent.setup()
      render(
        <WebDAVAutoSyncSettings
          onGistEncryptionPasswordErrorChange={onPasswordError}
        />,
      )
      await screen.findByText("importExport:webdav.gist.autoSyncEnableDesc")
      expect(onPasswordError).not.toHaveBeenCalled()

      await user.click(
        screen.getByRole("button", {
          name: "importExport:webdav.autoSync.syncNow",
        }),
      )

      const requiredMessage =
        "importExport:webdav.gist.encryptionPasswordRequired"
      await waitFor(() =>
        expect(onPasswordError).toHaveBeenCalledExactlyOnceWith(
          requiredMessage,
        ),
      )
      expect(toast.error).toHaveBeenLastCalledWith(requiredMessage)
      expect(mockSendWebdavAutoSyncMessage).not.toHaveBeenCalledWith(
        WebdavAutoSyncMessageTypes.SyncNow,
      )
    },
  )

  it("saves switches immediately and waits for the write before syncing", async () => {
    let finishSave!: () => void
    const original = mockSendWebdavAutoSyncMessage.getMockImplementation()!
    mockSendWebdavAutoSyncMessage.mockImplementation(
      async (type: string, ...args: unknown[]) => {
        if (type === WebdavAutoSyncMessageTypes.UpdateSettings) {
          await new Promise<void>((resolve) => {
            finishSave = resolve
          })
          return { success: true }
        }
        return original(type, ...args)
      },
    )
    const user = userEvent.setup()
    render(<WebDAVAutoSyncSettings />)
    await screen.findByDisplayValue("1800")
    await user.click(screen.getByRole("switch"))
    await waitFor(() =>
      expect(mockSendWebdavAutoSyncMessage).toHaveBeenCalledWith(
        WebdavAutoSyncMessageTypes.UpdateSettings,
        { settings: { autoSync: false } },
      ),
    )
    await user.click(
      screen.getByRole("button", {
        name: "importExport:webdav.autoSync.syncNow",
      }),
    )
    expect(mockSendWebdavAutoSyncMessage).not.toHaveBeenCalledWith(
      WebdavAutoSyncMessageTypes.SyncNow,
    )
    await act(async () => finishSave())
    await waitFor(() =>
      expect(mockSendWebdavAutoSyncMessage).toHaveBeenCalledWith(
        WebdavAutoSyncMessageTypes.SyncNow,
      ),
    )
    expect(toast.success).not.toHaveBeenCalledWith(
      "settings:messages.updateSuccess",
    )
  })

  it("saves an interval on blur and clamps it to the provider minimum", async () => {
    const user = userEvent.setup()
    render(<WebDAVAutoSyncSettings />)
    const interval = await screen.findByDisplayValue("1800")
    await user.clear(interval)
    await user.type(interval, "10")
    expect(
      mockSendWebdavAutoSyncMessage.mock.calls.filter(
        ([type]) => type === WebdavAutoSyncMessageTypes.UpdateSettings,
      ),
    ).toHaveLength(0)
    await user.tab()
    await waitFor(() =>
      expect(mockSendWebdavAutoSyncMessage).toHaveBeenCalledWith(
        WebdavAutoSyncMessageTypes.UpdateSettings,
        { settings: { syncInterval: 60 } },
      ),
    )
    expect(interval).toHaveValue(60)
  })

  it("blocks immediate sync after a failed automatic save", async () => {
    const original = mockSendWebdavAutoSyncMessage.getMockImplementation()!
    mockSendWebdavAutoSyncMessage.mockImplementation(
      async (type: string, ...args: unknown[]) =>
        type === WebdavAutoSyncMessageTypes.UpdateSettings
          ? { success: false, error: "save failed" }
          : original(type, ...args),
    )
    const user = userEvent.setup()
    render(<WebDAVAutoSyncSettings />)
    await screen.findByDisplayValue("1800")
    await user.click(screen.getByRole("switch"))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("save failed"))
    await user.click(
      screen.getByRole("button", {
        name: "importExport:webdav.autoSync.syncNow",
      }),
    )
    expect(mockSendWebdavAutoSyncMessage).not.toHaveBeenCalledWith(
      WebdavAutoSyncMessageTypes.SyncNow,
    )
  })

  it("keeps a rapid interval change back to the saved value while a write is pending", async () => {
    const original = mockSendWebdavAutoSyncMessage.getMockImplementation()!
    let finishSave!: () => void
    let writes = 0
    mockSendWebdavAutoSyncMessage.mockImplementation(
      async (type: string, ...args: unknown[]) => {
        if (
          type === WebdavAutoSyncMessageTypes.UpdateSettings &&
          ++writes === 1
        ) {
          await new Promise<void>((resolve) => {
            finishSave = resolve
          })
        }
        return original(type, ...args)
      },
    )
    render(<WebDAVAutoSyncSettings />)
    const interval = await screen.findByDisplayValue("1800")
    fireEvent.change(interval, { target: { value: "900" } })
    fireEvent.blur(interval)
    await waitFor(() => expect(finishSave).toBeTypeOf("function"))
    fireEvent.change(interval, { target: { value: "1800" } })
    fireEvent.blur(interval)
    await act(async () => finishSave())
    await waitFor(() =>
      expect(mockSendWebdavAutoSyncMessage).toHaveBeenCalledWith(
        WebdavAutoSyncMessageTypes.UpdateSettings,
        { settings: { syncInterval: 1800 } },
      ),
    )
  })

  it("uses the saved WebDAV strategy as sync-now diagnostics mode", async () => {
    mockUserPreferences.getPreferences.mockResolvedValue({
      lastUpdated: 1,
      webdav: {
        autoSync: true,
        syncInterval: 1800,
        syncStrategy: WEBDAV_SYNC_STRATEGIES.MERGE,
      },
    })

    render(<WebDAVAutoSyncSettings />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "importExport:webdav.autoSync.syncNow",
      }),
    )

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        expect.objectContaining({
          diagnostics: expect.objectContaining({
            context: {
              sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
              mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavMerge,
            },
          }),
        }),
      )
    })
  })

  it("uses local sync-now toast fallbacks when the runtime omits message copy", async () => {
    mockSendWebdavAutoSyncMessage.mockImplementation(async (type: string) => {
      switch (type) {
        case WebdavAutoSyncMessageTypes.GetStatus:
          return { success: true, data: null }
        case WebdavAutoSyncMessageTypes.SyncNow:
          return { success: true, data: {} }
        default:
          return { success: true }
      }
    })

    render(<WebDAVAutoSyncSettings />)

    expect(
      await screen.findByRole("button", {
        name: "importExport:webdav.autoSync.syncNow",
      }),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.autoSync.syncNow",
      }),
    )

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "importExport:webdav.syncSuccess",
      )
    })

    mockSendWebdavAutoSyncMessage.mockImplementation(async (type: string) => {
      switch (type) {
        case WebdavAutoSyncMessageTypes.GetStatus:
          return { success: true, data: null }
        case WebdavAutoSyncMessageTypes.SyncNow:
          return { success: false }
        default:
          return { success: true }
      }
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.autoSync.syncNow",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("importExport:webdav.syncFailed")
    })
  })

  it("tracks automatic settings-save outcomes and exposes retry only after failure", async () => {
    const original = mockSendWebdavAutoSyncMessage.getMockImplementation()!
    mockSendWebdavAutoSyncMessage.mockImplementation(
      async (type: string, ...args: unknown[]) =>
        type === WebdavAutoSyncMessageTypes.UpdateSettings
          ? { success: false, error: "save failed" }
          : original(type, ...args),
    )
    const user = userEvent.setup()
    render(<WebDAVAutoSyncSettings />)
    await screen.findByDisplayValue("1800")
    expect(
      screen.queryByRole("button", {
        name: "importExport:webdav.autoSync.saveSettings",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "importExport:webdav.retrySave" }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("switch"))
    const retry = await screen.findByRole("button", {
      name: "importExport:webdav.retrySave",
    })
    expect(mockStartProductAnalyticsAction).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebDavSync,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.UpdateWebDavAutoSyncSettings,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsWebDavAutoSyncSettings,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
    )
    mockSendWebdavAutoSyncMessage.mockImplementation(original)
    await user.click(retry)
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "importExport:webdav.retrySave" }),
      ).not.toBeInTheDocument(),
    )
    await user.click(
      screen.getByRole("button", {
        name: "importExport:webdav.autoSync.syncNow",
      }),
    )
    await waitFor(() =>
      expect(mockSendWebdavAutoSyncMessage).toHaveBeenCalledWith(
        WebdavAutoSyncMessageTypes.SyncNow,
      ),
    )
  })

  it.each([undefined, "runtime rejected"])(
    "reports a failed immediate sync with error %s",
    async (error) => {
      const original = mockSendWebdavAutoSyncMessage.getMockImplementation()!
      mockSendWebdavAutoSyncMessage.mockImplementation(
        async (type: string, ...args: unknown[]) =>
          type === WebdavAutoSyncMessageTypes.SyncNow
            ? { success: false, error }
            : original(type, ...args),
      )
      render(<WebDAVAutoSyncSettings />)
      await userEvent.setup().click(
        await screen.findByRole("button", {
          name: "importExport:webdav.autoSync.syncNow",
        }),
      )
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          error || "importExport:webdav.syncFailed",
        ),
      )
    },
  )

  it("reports a thrown runtime error while syncing", async () => {
    const original = mockSendWebdavAutoSyncMessage.getMockImplementation()!
    mockSendWebdavAutoSyncMessage.mockImplementation(
      async (type: string, ...args: unknown[]) => {
        if (type === WebdavAutoSyncMessageTypes.SyncNow)
          throw new Error("sync failed")
        return original(type, ...args)
      },
    )
    render(<WebDAVAutoSyncSettings />)
    await userEvent.setup().click(
      await screen.findByRole("button", {
        name: "importExport:webdav.autoSync.syncNow",
      }),
    )
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("sync failed"))
  })

  it("explains automatic saving without an unsaved warning", async () => {
    const user = userEvent.setup()

    render(<WebDAVAutoSyncSettings />)

    const syncIntervalInput = await screen.findByDisplayValue("1800")

    expect(
      screen.queryByText("importExport:webdav.autoSync.actionState.saved"),
    ).not.toBeInTheDocument()

    await user.clear(syncIntervalInput)
    await user.type(syncIntervalInput, "900")

    expect(await screen.findByRole("status")).toHaveTextContent(
      "importExport:webdav.autoSync.autosaveDescription",
    )
    expect(
      screen.getByRole("button", {
        name: "importExport:webdav.autoSync.syncNow",
      }),
    ).toBeInTheDocument()
  })

  it("keeps settings usable when loading sync status fails", async () => {
    mockSendWebdavAutoSyncMessage.mockRejectedValue(new Error("status offline"))
    render(<WebDAVAutoSyncSettings />)
    await waitFor(() =>
      expect(loggerMocks.error).toHaveBeenCalledWith(
        "Failed to load sync status",
        expect.any(Error),
      ),
    )
    expect(
      screen.getByRole("button", {
        name: "importExport:webdav.autoSync.syncNow",
      }),
    ).toBeEnabled()
  })

  it.each(["rejected", "empty exception"])(
    "keeps a failed schedule retry visible with fallback feedback: %s",
    async (failure) => {
      const original = mockSendWebdavAutoSyncMessage.getMockImplementation()!
      mockSendWebdavAutoSyncMessage.mockImplementation(async (type: string) => {
        if (type === WebdavAutoSyncMessageTypes.UpdateSettings) {
          if (failure === "empty exception") throw undefined
          return { success: false }
        }
        return original(type)
      })
      const user = userEvent.setup()
      render(<WebDAVAutoSyncSettings />)
      await screen.findByDisplayValue("1800")
      await user.click(screen.getByRole("switch"))
      const retry = await screen.findByRole("button", {
        name: "importExport:webdav.retrySave",
      })
      vi.mocked(toast.error).mockClear()
      await user.click(retry)
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "settings:messages.updateFailed",
        ),
      )
      expect(retry).toBeVisible()
    },
  )

  it("saves the selected strategy without rewriting an unchanged interval", async () => {
    const user = userEvent.setup()
    render(<WebDAVAutoSyncSettings />)
    const interval = await screen.findByDisplayValue("1800")
    await user.click(interval)
    await user.tab()
    expect(mockSendWebdavAutoSyncMessage).not.toHaveBeenCalledWith(
      WebdavAutoSyncMessageTypes.UpdateSettings,
      expect.anything(),
    )
    await user.click(screen.getByRole("combobox"))
    await user.click(
      await screen.findByRole("option", {
        name: "importExport:webdav.autoSync.strategyLocalFirst",
      }),
    )
    await waitFor(() =>
      expect(mockSendWebdavAutoSyncMessage).toHaveBeenCalledWith(
        WebdavAutoSyncMessageTypes.UpdateSettings,
        { settings: { syncStrategy: WEBDAV_SYNC_STRATEGIES.UPLOAD_ONLY } },
      ),
    )
  })
})
