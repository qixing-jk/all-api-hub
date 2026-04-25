import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from "@testing-library/react"
import type { ReactNode } from "react"
import toast from "react-hot-toast"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { UserPreferencesProvider } from "~/contexts/UserPreferencesContext"
import WebDAVSettings from "~/features/ImportExport/components/WebDAVSettings"
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import { testI18n } from "~~/tests/test-utils/i18n"

const {
  mockUserPreferences,
  mockAccountStorage,
  mockTagStorage,
  mockChannelConfigStorage,
  mockApiCredentialProfilesStorage,
  mockDecryptWebdavBackupEnvelope,
  mockTryParseEncryptedWebdavBackupEnvelope,
  mockBuildWebdavImportPayloadBySelection,
  mockMergeWebdavBackupPayloadBySelection,
  mockDownloadBackup,
  mockDownloadBackupRaw,
  mockIsWebdavFileNotFoundError,
  mockTestWebdavConnection,
  mockUploadBackup,
  mockImportFromBackupObject,
  loggerMocks,
} = vi.hoisted(() => ({
  mockUserPreferences: {
    getPreferences: vi.fn(),
    savePreferences: vi.fn(),
    exportPreferences: vi.fn(),
  },
  mockAccountStorage: { exportData: vi.fn() },
  mockTagStorage: { exportTagStore: vi.fn() },
  mockChannelConfigStorage: { exportConfigs: vi.fn() },
  mockApiCredentialProfilesStorage: { exportConfig: vi.fn() },
  mockDecryptWebdavBackupEnvelope: vi.fn(),
  mockTryParseEncryptedWebdavBackupEnvelope: vi.fn(),
  mockBuildWebdavImportPayloadBySelection: vi.fn(),
  mockMergeWebdavBackupPayloadBySelection: vi.fn(),
  mockDownloadBackup: vi.fn(),
  mockDownloadBackupRaw: vi.fn(),
  mockIsWebdavFileNotFoundError: vi.fn(),
  mockTestWebdavConnection: vi.fn(),
  mockUploadBackup: vi.fn(),
  mockImportFromBackupObject: vi.fn(),
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

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: mockAccountStorage,
}))

vi.mock("~/services/tags/tagStorage", () => ({
  tagStorage: mockTagStorage,
}))

vi.mock("~/services/managedSites/channelConfigStorage", () => ({
  channelConfigStorage: mockChannelConfigStorage,
}))

vi.mock(
  "~/services/apiCredentialProfiles/apiCredentialProfilesStorage",
  () => ({
    apiCredentialProfilesStorage: mockApiCredentialProfilesStorage,
  }),
)

vi.mock("~/services/webdav/webdavBackupEncryption", () => ({
  decryptWebdavBackupEnvelope: mockDecryptWebdavBackupEnvelope,
  tryParseEncryptedWebdavBackupEnvelope:
    mockTryParseEncryptedWebdavBackupEnvelope,
}))

vi.mock("~/services/webdav/webdavSelectiveSync", () => ({
  buildWebdavImportPayloadBySelection: mockBuildWebdavImportPayloadBySelection,
  mergeWebdavBackupPayloadBySelection: mockMergeWebdavBackupPayloadBySelection,
}))

vi.mock("~/services/webdav/webdavService", () => ({
  downloadBackup: mockDownloadBackup,
  downloadBackupRaw: mockDownloadBackupRaw,
  isWebdavFileNotFoundError: mockIsWebdavFileNotFoundError,
  testWebdavConnection: mockTestWebdavConnection,
  uploadBackup: mockUploadBackup,
}))

vi.mock("~/features/ImportExport/utils", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/features/ImportExport/utils")>()
  return {
    ...actual,
    importFromBackupObject: mockImportFromBackupObject,
  }
})

function render(ui: ReactNode) {
  return rtlRender(
    <I18nextProvider i18n={testI18n}>
      <UserPreferencesProvider>{ui}</UserPreferencesProvider>
    </I18nextProvider>,
  )
}

const createPreferencesFixture = (): UserPreferences => ({
  ...structuredClone(DEFAULT_PREFERENCES),
  showTodayCashflow: true,
  webdav: {
    ...structuredClone(DEFAULT_PREFERENCES.webdav),
    url: "https://dav.example.com/backup.json",
    username: "alice",
    password: "pw",
    backupEncryptionEnabled: true,
    backupEncryptionPassword: "stored-secret",
    syncData: {
      accounts: true,
      bookmarks: true,
      apiCredentialProfiles: true,
      preferences: true,
    },
  },
})

describe("WebDAVSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUserPreferences.getPreferences.mockResolvedValue(
      createPreferencesFixture(),
    )
    mockUserPreferences.savePreferences.mockResolvedValue(true)
    mockUserPreferences.exportPreferences.mockResolvedValue({
      themeMode: "dark",
    })
    mockAccountStorage.exportData.mockResolvedValue([{ id: "acc-1" }])
    mockTagStorage.exportTagStore.mockResolvedValue({ tags: [] })
    mockChannelConfigStorage.exportConfigs.mockResolvedValue([{ id: 1 }])
    mockApiCredentialProfilesStorage.exportConfig.mockResolvedValue([{ id: 2 }])
    mockDownloadBackup.mockResolvedValue('{"version":2,"accounts":[]}')
    mockDownloadBackupRaw.mockResolvedValue('{"version":2}')
    mockTryParseEncryptedWebdavBackupEnvelope.mockReturnValue(null)
    mockIsWebdavFileNotFoundError.mockReturnValue(false)
    mockMergeWebdavBackupPayloadBySelection.mockReturnValue({ merged: true })
    mockBuildWebdavImportPayloadBySelection.mockResolvedValue({
      imported: true,
    })
    mockImportFromBackupObject.mockResolvedValue({ allImported: true })
    mockDecryptWebdavBackupEnvelope.mockResolvedValue('{"version":2}')
    mockTestWebdavConnection.mockResolvedValue(undefined)
    mockUploadBackup.mockResolvedValue(undefined)
  })

  it("loads settings, saves config, tests the connection, and uploads a merged backup", async () => {
    render(<WebDAVSettings />)

    expect(
      await screen.findByDisplayValue("https://dav.example.com/backup.json"),
    ).toBeInTheDocument()
    expect(screen.getByDisplayValue("alice")).toBeInTheDocument()
    expect(screen.getByDisplayValue("pw")).toBeInTheDocument()

    fireEvent.click(
      screen.getAllByRole("button", {
        name: /importExport:webdav\.(show|hide)Password/,
      })[0],
    )
    expect(screen.getByDisplayValue("pw")).toHaveAttribute("type", "text")

    fireEvent.click(
      screen.getByRole("button", { name: "importExport:webdav.saveConfig" }),
    )
    await waitFor(() => {
      expect(mockUserPreferences.savePreferences).toHaveBeenCalledWith({
        webdav: {
          url: "https://dav.example.com/backup.json",
          username: "alice",
          password: "pw",
          backupEncryptionEnabled: true,
          backupEncryptionPassword: "stored-secret",
          syncData: {
            accounts: true,
            bookmarks: true,
            apiCredentialProfiles: true,
            preferences: true,
          },
        },
      })
    })
    expect(toast.success).toHaveBeenCalledWith(
      "settings:messages.updateSuccess",
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.testConnection",
      }),
    )
    await waitFor(() => {
      expect(mockTestWebdavConnection).toHaveBeenCalled()
    })
    expect(toast.success).toHaveBeenCalledWith(
      "importExport:webdav.testSuccess",
    )

    fireEvent.click(
      screen.getByRole("button", { name: "importExport:webdav.uploadBackup" }),
    )
    await waitFor(() => {
      expect(mockMergeWebdavBackupPayloadBySelection).toHaveBeenCalled()
      expect(mockUploadBackup).toHaveBeenCalled()
    })
    expect(toast.success).toHaveBeenCalledWith(
      "importExport:export.dataExported",
    )
  })

  it("blocks upload when the sync-data selection is empty", async () => {
    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    screen
      .getAllByRole("checkbox")
      .slice(0, 4)
      .forEach((checkbox) => fireEvent.click(checkbox))

    fireEvent.click(
      screen.getByRole("button", { name: "importExport:webdav.uploadBackup" }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "importExport:webdav.syncData.selectionRequired",
      )
    })
    expect(mockUploadBackup).not.toHaveBeenCalled()
  })

  it("prompts for a decrypt password, imports the decrypted backup, and stores the password", async () => {
    mockDownloadBackupRaw.mockResolvedValueOnce("encrypted-payload")
    mockTryParseEncryptedWebdavBackupEnvelope.mockReturnValue({
      version: 1,
      algorithm: "aes-gcm",
      salt: "salt",
      iv: "iv",
      ciphertext: "cipher",
    })

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    fireEvent.change(screen.getAllByDisplayValue("stored-secret")[0], {
      target: { value: "" },
    })
    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.downloadImport",
      }),
    )

    expect(
      await screen.findByText(
        "importExport:webdav.encryption.decryptDialogTitle",
      ),
    ).toBeInTheDocument()

    fireEvent.change(
      document.getElementById("decryptPassword") as HTMLInputElement,
      {
        target: { value: "manual-secret" },
      },
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.encryption.decryptAction",
      }),
    )

    await waitFor(() => {
      expect(mockDecryptWebdavBackupEnvelope).toHaveBeenCalled()
      expect(mockBuildWebdavImportPayloadBySelection).toHaveBeenCalled()
      expect(mockImportFromBackupObject).toHaveBeenCalledWith(
        { imported: true },
        { preserveWebdav: true },
      )
    })
    expect(mockUserPreferences.savePreferences).toHaveBeenCalledWith({
      webdav: {
        backupEncryptionPassword: "manual-secret",
      },
    })

    fireEvent.click(
      screen.getByRole("button", { name: "importExport:webdav.saveConfig" }),
    )

    await waitFor(() => {
      expect(mockUserPreferences.savePreferences).toHaveBeenLastCalledWith({
        webdav: {
          url: "https://dav.example.com/backup.json",
          username: "alice",
          password: "pw",
          backupEncryptionEnabled: true,
          backupEncryptionPassword: "manual-secret",
          syncData: {
            accounts: true,
            bookmarks: true,
            apiCredentialProfiles: true,
            preferences: true,
          },
        },
      })
    })
    expect(toast.success).toHaveBeenCalledWith(
      "importExport:import.importSuccess",
    )
  })

  it("shows the action-specific connection failure message when persisting settings fails", async () => {
    mockUserPreferences.savePreferences.mockResolvedValue(false)

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.testConnection",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("importExport:webdav.testFailed")
    })
    expect(mockTestWebdavConnection).not.toHaveBeenCalled()
  })
})
