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

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { UserPreferencesProvider } from "~/contexts/UserPreferencesContext"
import WebDAVAutoSyncSettings from "~/features/ImportExport/components/WebDAVAutoSyncSettings"
import { WEBDAV_SYNC_STRATEGIES } from "~/types/webdav"
import { testI18n } from "~~/tests/test-utils/i18n"

const { mockUserPreferences, mockSendRuntimeMessage, loggerMocks } = vi.hoisted(
  () => ({
    mockUserPreferences: {
      getPreferences: vi.fn(),
      savePreferences: vi.fn(),
    },
    mockSendRuntimeMessage: vi.fn(),
    loggerMocks: {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  }),
)

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

vi.mock("~/utils/browser/browserApi", () => ({
  sendRuntimeMessage: mockSendRuntimeMessage,
}))

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
    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      switch (message.action) {
        case RuntimeActionIds.WebdavAutoSyncGetStatus:
          return {
            success: true,
            data: {
              isSyncing: false,
              lastSyncTime: 1_700_000_000_000,
              lastSyncStatus: "error",
              lastSyncError: "sync boom",
            },
          }
        case RuntimeActionIds.WebdavAutoSyncUpdateSettings:
          return { success: true }
        case RuntimeActionIds.WebdavAutoSyncSyncNow:
          return { success: true, message: "custom sync ok" }
        default:
          return { success: true }
      }
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
      expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.WebdavAutoSyncUpdateSettings,
        expectedLastUpdated: 1,
        settings: {
          autoSync: false,
          syncInterval: 1800,
          syncStrategy: WEBDAV_SYNC_STRATEGIES.DOWNLOAD_ONLY,
        },
      })
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
      expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.WebdavAutoSyncSyncNow,
      })
    })
    expect(toast.success).toHaveBeenCalledWith("custom sync ok")
  })

  it("surfaces status, save, and sync errors", async () => {
    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      switch (message.action) {
        case RuntimeActionIds.WebdavAutoSyncGetStatus:
          throw new Error("status failed")
        case RuntimeActionIds.WebdavAutoSyncUpdateSettings:
          return { success: false, error: "save failed" }
        case RuntimeActionIds.WebdavAutoSyncSyncNow:
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
    })
  })

  it("falls back to the local update-failed copy when the runtime omits an error", async () => {
    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      switch (message.action) {
        case RuntimeActionIds.WebdavAutoSyncGetStatus:
          return { success: true, data: null }
        case RuntimeActionIds.WebdavAutoSyncUpdateSettings:
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
    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      switch (message.action) {
        case RuntimeActionIds.WebdavAutoSyncGetStatus:
          return { success: true, data: null }
        case RuntimeActionIds.WebdavAutoSyncUpdateSettings:
          throw new Error("save exploded")
        case RuntimeActionIds.WebdavAutoSyncSyncNow:
          return { success: false, message: "sync rejected" }
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
      expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.WebdavAutoSyncUpdateSettings,
        expectedLastUpdated: 1,
        settings: {
          autoSync: true,
          syncInterval: 900,
          syncStrategy: WEBDAV_SYNC_STRATEGIES.MERGE,
        },
      })
    })
  })
})
