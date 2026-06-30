import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import toast from "react-hot-toast"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { UserPreferencesProvider } from "~/contexts/UserPreferencesContext"
import WebDAVAutoSyncSettings from "~/features/ImportExport/components/WebDAVAutoSyncSettings"
import { resolveProductAnalyticsActionContext } from "~/services/productAnalytics/actionConfig"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { WebdavAutoSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { sendWebdavAutoSyncMessage } from "~/services/webdav/webdavAutoSyncMessaging"
import { WEBDAV_SYNC_STRATEGIES } from "~/types/webdav"
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

vi.mock("react-hot-toast", () => ({
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

  it("does not declare button analytics metadata for auto-sync settings save with a manual async span", async () => {
    render(<WebDAVAutoSyncSettings />)

    expect(
      await screen.findByRole("button", {
        name: "importExport:webdav.autoSync.saveSettings",
      }),
    ).not.toHaveAttribute("data-analytics-action")
  })

  it("completes WebDAV auto-sync settings save analytics as success", async () => {
    render(<WebDAVAutoSyncSettings />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "importExport:webdav.autoSync.saveSettings",
      }),
    )

    await waitFor(() => {
      expect(mockStartProductAnalyticsAction).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebDavSync,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.UpdateWebDavAutoSyncSettings,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsWebDavAutoSyncSettings,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    })
  })

  it("completes WebDAV auto-sync settings save analytics as unknown failure when persistence rejects the update", async () => {
    mockSendWebdavAutoSyncMessage.mockImplementation(async (type: string) => {
      switch (type) {
        case WebdavAutoSyncMessageTypes.GetStatus:
          return { success: true, data: null }
        case WebdavAutoSyncMessageTypes.UpdateSettings:
          return { success: false, error: "save failed" }
        default:
          return { success: true }
      }
    })

    render(<WebDAVAutoSyncSettings />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "importExport:webdav.autoSync.saveSettings",
      }),
    )

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
    })
  })

  it("loads settings, saves updates, and syncs immediately", async () => {
    render(<WebDAVAutoSyncSettings />)

    expect(
      await screen.findByText("importExport:webdav.syncError"),
    ).toBeInTheDocument()
    expect(screen.getByText("sync boom")).toBeInTheDocument()
    expect(screen.getByDisplayValue("1800")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("switch"))
    await waitFor(() => {
      expect(screen.queryByDisplayValue("1800")).not.toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.autoSync.saveSettings",
      }),
    )

    await waitFor(() => {
      expect(sendWebdavAutoSyncMessage).toHaveBeenCalledWith(
        WebdavAutoSyncMessageTypes.UpdateSettings,
        {
          expectedLastUpdated: 1,
          settings: {
            autoSync: false,
            syncInterval: 1800,
            syncStrategy: WEBDAV_SYNC_STRATEGIES.DOWNLOAD_ONLY,
          },
        },
      )
    })
    expect(toast.success).toHaveBeenCalledWith(
      "settings:messages.updateSuccess",
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.autoSync.syncNow",
      }),
    )

    await waitFor(() => {
      expect(sendWebdavAutoSyncMessage).toHaveBeenCalledWith(
        WebdavAutoSyncMessageTypes.SyncNow,
      )
    })
    expect(toast.success).toHaveBeenCalledWith("custom sync ok")
    expect(mockStartProductAnalyticsAction).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebDavSync,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SyncWebDavNow,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsWebDavAutoSyncSettings,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        diagnostics: {
          context: {
            sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
            mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavDownloadOnly,
          },
          outcome: {
            itemCount: 1,
            successCount: 1,
            failureCount: 0,
            skippedCount: 0,
          },
        },
      },
    )
  })

  it("surfaces status, save, and sync errors", async () => {
    mockSendWebdavAutoSyncMessage.mockImplementation(async (type: string) => {
      switch (type) {
        case WebdavAutoSyncMessageTypes.GetStatus:
          throw new Error("status failed")
        case WebdavAutoSyncMessageTypes.UpdateSettings:
          return { success: false, error: "save failed" }
        case WebdavAutoSyncMessageTypes.SyncNow:
          throw new Error("sync failed")
        default:
          return { success: true }
      }
    })

    render(<WebDAVAutoSyncSettings />)

    await waitFor(() => {
      expect(loggerMocks.error).toHaveBeenCalled()
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.autoSync.saveSettings",
      }),
    )
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("save failed")
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.autoSync.syncNow",
      }),
    )
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("sync failed")
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          diagnostics: {
            context: {
              sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
              mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavDownloadOnly,
            },
            outcome: {
              itemCount: 1,
              successCount: 0,
              failureCount: 1,
              skippedCount: 0,
            },
            failure: {
              category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
              stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
              reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
            },
          },
        },
      )
    })
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

  it("falls back to the local update-failed copy when the runtime omits an error", async () => {
    mockSendWebdavAutoSyncMessage.mockImplementation(async (type: string) => {
      switch (type) {
        case WebdavAutoSyncMessageTypes.GetStatus:
          return { success: true, data: null }
        case WebdavAutoSyncMessageTypes.UpdateSettings:
          return { success: false }
        default:
          return { success: true }
      }
    })

    render(<WebDAVAutoSyncSettings />)

    expect(
      await screen.findByRole("button", {
        name: "importExport:webdav.autoSync.saveSettings",
      }),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.autoSync.saveSettings",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("settings:messages.updateFailed")
    })
  })

  it("surfaces thrown save failures and unsuccessful sync responses", async () => {
    mockSendWebdavAutoSyncMessage.mockImplementation(async (type: string) => {
      switch (type) {
        case WebdavAutoSyncMessageTypes.GetStatus:
          return { success: true, data: null }
        case WebdavAutoSyncMessageTypes.UpdateSettings:
          throw new Error("save exploded")
        case WebdavAutoSyncMessageTypes.SyncNow:
          return { success: false, error: "sync rejected" }
        default:
          return { success: true }
      }
    })

    render(<WebDAVAutoSyncSettings />)

    expect(
      await screen.findByRole("button", {
        name: "importExport:webdav.autoSync.saveSettings",
      }),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.autoSync.saveSettings",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("save exploded")
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.autoSync.syncNow",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("sync rejected")
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
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

  it("saves edited interval and strategy values from the local draft", async () => {
    const user = userEvent.setup()

    render(<WebDAVAutoSyncSettings />)

    const syncIntervalInput = await screen.findByDisplayValue("1800")
    expect(syncIntervalInput).toBeInTheDocument()

    await user.clear(syncIntervalInput)
    await user.type(syncIntervalInput, "900")

    await user.click(screen.getByRole("combobox"))
    await user.click(
      screen.getByRole("option", {
        name: "importExport:webdav.autoSync.strategyMerge",
      }),
    )

    await user.click(
      screen.getByRole("button", {
        name: "importExport:webdav.autoSync.saveSettings",
      }),
    )

    await waitFor(() => {
      expect(sendWebdavAutoSyncMessage).toHaveBeenCalledWith(
        WebdavAutoSyncMessageTypes.UpdateSettings,
        {
          expectedLastUpdated: 1,
          settings: {
            autoSync: true,
            syncInterval: 900,
            syncStrategy: WEBDAV_SYNC_STRATEGIES.MERGE,
          },
        },
      )
    })
  })

  it("explains that sync now uses saved auto-sync settings when the draft is dirty", async () => {
    const user = userEvent.setup()

    render(<WebDAVAutoSyncSettings />)

    const syncIntervalInput = await screen.findByDisplayValue("1800")

    expect(
      screen
        .getByText("importExport:webdav.autoSync.actionState.saved")
        .closest('[role="alert"]'),
    ).toBeInTheDocument()
    expect(
      screen
        .getByText("importExport:webdav.autoSync.actionState.saved")
        .closest('[role="alert"]')
        ?.querySelector("svg"),
    ).toBeInTheDocument()

    await user.clear(syncIntervalInput)
    await user.type(syncIntervalInput, "900")

    expect(
      (
        await screen.findByText(
          "importExport:webdav.autoSync.actionState.unsaved",
        )
      ).closest('[role="alert"]'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "importExport:webdav.autoSync.syncNow",
      }),
    ).toBeInTheDocument()
  })
})
