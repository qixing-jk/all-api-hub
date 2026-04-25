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
  mockApplyPreferenceLanguage,
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
  mockApplyPreferenceLanguage: vi.fn(),
  mockUserPreferences: {
    getPreferences: vi.fn(),
    getLanguage: vi.fn(),
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

vi.mock("~/utils/i18n/applyPreferenceLanguage", () => ({
  applyPreferenceLanguage: (...args: unknown[]) =>
    mockApplyPreferenceLanguage(...args),
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

const ENCRYPTED_BACKUP_ENVELOPE = {
  version: 1,
  algorithm: "aes-gcm",
  salt: "salt",
  iv: "iv",
  ciphertext: "cipher",
} as const

describe("WebDAVSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUserPreferences.getPreferences.mockResolvedValue(
      createPreferencesFixture(),
    )
    mockUserPreferences.getLanguage.mockResolvedValue("ja")
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
    mockApplyPreferenceLanguage.mockResolvedValue(true)
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
      expect(mockUserPreferences.savePreferences).toHaveBeenCalledWith(
        {
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
        },
        {
          expectedLastUpdated: 0,
        },
      )
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
    mockTryParseEncryptedWebdavBackupEnvelope.mockReturnValue(
      ENCRYPTED_BACKUP_ENVELOPE,
    )

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
      expect(mockUserPreferences.getLanguage).toHaveBeenCalledTimes(1)
      expect(mockApplyPreferenceLanguage).toHaveBeenCalledWith("ja")
    })
    expect(mockUserPreferences.savePreferences).toHaveBeenNthCalledWith(
      2,
      {
        webdav: {
          backupEncryptionPassword: "manual-secret",
        },
      },
      {
        expectedLastUpdated: expect.any(Number),
      },
    )

    fireEvent.click(
      screen.getByRole("button", { name: "importExport:webdav.saveConfig" }),
    )

    await waitFor(() => {
      expect(mockUserPreferences.savePreferences).toHaveBeenLastCalledWith(
        {
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
        },
        {
          expectedLastUpdated: expect.any(Number),
        },
      )
    })
    expect(toast.success).toHaveBeenCalledWith(
      "importExport:import.importSuccess",
    )
  })

  it("surfaces the save failure message when saving the WebDAV config fails", async () => {
    mockUserPreferences.savePreferences.mockResolvedValue(false)

    render(<WebDAVSettings />)

    expect(
      await screen.findByDisplayValue("https://dav.example.com/backup.json"),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", { name: "importExport:webdav.saveConfig" }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "settings:messages.saveSettingsFailed",
      )
    })
    expect(loggerMocks.error).toHaveBeenCalledWith(
      "Failed to save WebDAV settings",
      expect.any(Error),
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

  it("blocks download/import when the sync-data selection is empty", async () => {
    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    screen
      .getAllByRole("checkbox")
      .slice(0, 4)
      .forEach((checkbox) => fireEvent.click(checkbox))

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.downloadImport",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "importExport:webdav.syncData.selectionRequired",
      )
    })
    expect(mockDownloadBackupRaw).not.toHaveBeenCalled()
  })

  it("uploads a new backup when the remote WebDAV file does not exist", async () => {
    const missingBackupError = new Error("missing backup")
    mockDownloadBackup.mockRejectedValueOnce(missingBackupError)
    mockIsWebdavFileNotFoundError.mockImplementation(
      (error) => error === missingBackupError,
    )

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", { name: "importExport:webdav.uploadBackup" }),
    )

    await waitFor(() => {
      expect(mockMergeWebdavBackupPayloadBySelection).toHaveBeenCalledWith(
        expect.objectContaining({
          remoteBackup: null,
        }),
      )
      expect(mockUploadBackup).toHaveBeenCalled()
    })
    expect(toast.success).toHaveBeenCalledWith(
      "importExport:export.dataExported",
    )
  })

  it("surfaces the upload failure when fetching the remote backup fails unexpectedly", async () => {
    const downloadError = new Error("download failed")
    mockDownloadBackup.mockRejectedValueOnce(downloadError)
    mockIsWebdavFileNotFoundError.mockReturnValue(false)

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", { name: "importExport:webdav.uploadBackup" }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("download failed")
    })
    expect(mockUploadBackup).not.toHaveBeenCalled()
  })

  it("imports an unencrypted WebDAV backup without opening the decrypt dialog", async () => {
    mockDownloadBackupRaw.mockResolvedValueOnce('{"version":2,"accounts":[]}')

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.downloadImport",
      }),
    )

    await waitFor(() => {
      expect(mockBuildWebdavImportPayloadBySelection).toHaveBeenCalledWith(
        expect.objectContaining({
          rawBackup: {
            version: 2,
            accounts: [],
          },
        }),
      )
      expect(mockImportFromBackupObject).toHaveBeenCalledWith(
        { imported: true },
        { preserveWebdav: true },
      )
      expect(mockUserPreferences.getLanguage).toHaveBeenCalledTimes(1)
      expect(mockApplyPreferenceLanguage).toHaveBeenCalledWith("ja")
      expect(mockUserPreferences.getPreferences).toHaveBeenCalledTimes(2)
      expect(toast.success).toHaveBeenCalledWith(
        "importExport:import.importSuccess",
      )
    })
    expect(
      screen.queryByText("importExport:webdav.encryption.decryptDialogTitle"),
    ).not.toBeInTheDocument()
  })

  it("shows the download/import failure message when importing the backup fails", async () => {
    mockImportFromBackupObject.mockRejectedValueOnce(new Error("import failed"))

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.downloadImport",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("import failed")
    })
  })

  it("reopens the decrypt dialog with the stored password when automatic decrypt fails", async () => {
    mockDownloadBackupRaw.mockResolvedValueOnce("encrypted-payload")
    mockTryParseEncryptedWebdavBackupEnvelope.mockReturnValue(
      ENCRYPTED_BACKUP_ENVELOPE,
    )
    mockDecryptWebdavBackupEnvelope.mockRejectedValueOnce(
      new Error("stored password failed"),
    )

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("stored-secret")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.downloadImport",
      }),
    )

    await waitFor(() => {
      expect(document.getElementById("decryptPassword")).toBeTruthy()
    })
    const decryptPasswordInput = document.getElementById(
      "decryptPassword",
    ) as HTMLInputElement

    expect(decryptPasswordInput.id).toBe("decryptPassword")
    expect(decryptPasswordInput.value).toBe("stored-secret")
    expect(toast.error).toHaveBeenCalledWith(
      "importExport:webdav.encryption.decryptPrompt",
    )

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.cancel" }),
    )

    await waitFor(() => {
      expect(
        screen.queryByText("importExport:webdav.encryption.decryptDialogTitle"),
      ).not.toBeInTheDocument()
    })
  })

  it("shows the decrypt failure message when manual decrypt/import fails", async () => {
    mockDownloadBackupRaw.mockResolvedValueOnce("encrypted-payload")
    mockTryParseEncryptedWebdavBackupEnvelope.mockReturnValue(
      ENCRYPTED_BACKUP_ENVELOPE,
    )

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

    await waitFor(() => {
      expect(document.getElementById("decryptPassword")).toBeTruthy()
    })
    const decryptPasswordInput = document.getElementById(
      "decryptPassword",
    ) as HTMLInputElement
    fireEvent.change(decryptPasswordInput, {
      target: { value: "manual-secret" },
    })

    mockDecryptWebdavBackupEnvelope.mockRejectedValueOnce(
      new Error("manual decrypt failed"),
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.encryption.decryptAction",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("manual decrypt failed")
    })
  })

  it("shows both import success and save-settings failure when persisting the decrypt password fails", async () => {
    mockDownloadBackupRaw.mockResolvedValueOnce("encrypted-payload")
    mockTryParseEncryptedWebdavBackupEnvelope.mockReturnValue(
      ENCRYPTED_BACKUP_ENVELOPE,
    )
    mockUserPreferences.savePreferences.mockResolvedValueOnce(true)
    mockUserPreferences.savePreferences.mockResolvedValueOnce(false)

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

    await waitFor(() => {
      expect(document.getElementById("decryptPassword")).toBeTruthy()
    })
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
      expect(toast.success).toHaveBeenCalledWith(
        "importExport:import.importSuccess",
      )
      expect(toast.error).toHaveBeenCalledWith(
        "settings:messages.saveSettingsFailed",
      )
    })
  })

  it("blocks manual decrypt/import when sync data becomes empty", async () => {
    mockDownloadBackupRaw.mockResolvedValueOnce("encrypted-payload")
    mockTryParseEncryptedWebdavBackupEnvelope.mockReturnValue(
      ENCRYPTED_BACKUP_ENVELOPE,
    )

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

    await waitFor(() => {
      expect(document.getElementById("decryptPassword")).toBeTruthy()
    })

    screen
      .getAllByRole("checkbox")
      .slice(0, 4)
      .forEach((checkbox) => fireEvent.click(checkbox))

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.encryption.decryptAction",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "importExport:webdav.syncData.selectionRequired",
      )
    })
    expect(mockDecryptWebdavBackupEnvelope).not.toHaveBeenCalled()
  })

  it("updates the editable fields and toggles password visibility in both forms", async () => {
    mockDownloadBackupRaw.mockResolvedValueOnce("encrypted-payload")
    mockTryParseEncryptedWebdavBackupEnvelope.mockReturnValue(
      ENCRYPTED_BACKUP_ENVELOPE,
    )

    render(<WebDAVSettings />)

    const urlInput = (await screen.findByDisplayValue(
      "https://dav.example.com/backup.json",
    )) as HTMLInputElement
    const usernameInput = screen.getByDisplayValue("alice") as HTMLInputElement
    const webdavPasswordInput = screen.getByDisplayValue(
      "pw",
    ) as HTMLInputElement
    const backupPasswordInput = screen.getAllByDisplayValue(
      "stored-secret",
    )[0] as HTMLInputElement

    fireEvent.change(urlInput, {
      target: { value: "https://dav.example.com/backup-2.json" },
    })
    fireEvent.change(usernameInput, {
      target: { value: "bob" },
    })
    fireEvent.change(webdavPasswordInput, {
      target: { value: "pw-2" },
    })

    expect(urlInput.value).toBe("https://dav.example.com/backup-2.json")
    expect(usernameInput.value).toBe("bob")
    expect(webdavPasswordInput.value).toBe("pw-2")

    fireEvent.click(
      screen.getAllByRole("button", {
        name: /importExport:webdav\.(show|hide)Password/,
      })[0],
    )
    fireEvent.click(
      screen.getAllByRole("button", {
        name: /importExport:webdav\.(show|hide)Password/,
      })[1],
    )

    expect(webdavPasswordInput).toHaveAttribute("type", "text")
    expect(backupPasswordInput).toHaveAttribute("type", "text")

    fireEvent.change(backupPasswordInput, {
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

    fireEvent.click(
      screen.getAllByRole("button", {
        name: /importExport:webdav\.(show|hide)Password/,
      })[2],
    )

    expect(
      document.getElementById("decryptPassword") as HTMLInputElement,
    ).toHaveAttribute("type", "text")
  })
})
