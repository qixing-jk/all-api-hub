import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import WebDAVAutoSyncSettings from "~/features/ImportExport/components/WebDAVAutoSyncSettings"
import WebDAVSettings from "~/features/ImportExport/components/WebDAVSettings"
import { WEBDAV_TARGET_IDS } from "~/features/ImportExport/searchTargets"
import toast from "~/lib/notify"
import { ImportExportError } from "~/services/importExport/importExportService"

import {
  clearWebdavSyncDataSelection,
  clickWebdavAction,
  createStalePreferenceWriteResult,
  ENCRYPTED_BACKUP_ENVELOPE,
  loggerMocks,
  mockDownloadBackup,
  mockDownloadBackupRaw,
  mockIsWebdavFileNotFoundError,
  mockMergeWebdavBackupPayloadBySelection,
  mockParseWebdavBackupJson,
  mockTestWebdavConnection,
  mockTryParseEncryptedWebdavBackupEnvelope,
  mockUploadBackup,
  mockUserPreferences,
  render,
  setupWebdavSettingsTestHarness,
} from "./webdavSettingsHarness"

// Register shared module mocks before loading the components under test.
await vi.hoisted(() => import("./webdavSettingsHarness"))

describe("WebDAVSettings Backup", () => {
  setupWebdavSettingsTestHarness()
  it("localizes unsupported remote backup versions during WebDAV upload", async () => {
    mockMergeWebdavBackupPayloadBySelection.mockImplementationOnce(() => {
      throw new ImportExportError("VERSION_NOT_SUPPORTED")
    })

    render(<WebDAVSettings />)

    await clickWebdavAction(WEBDAV_TARGET_IDS.uploadBackup)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "importExport:import.versionNotSupported",
      )
    })
  })

  it("uses the stable upload fallback when a failure has no message", async () => {
    mockUploadBackup.mockRejectedValueOnce(null)

    render(<WebDAVSettings />)

    await clickWebdavAction(WEBDAV_TARGET_IDS.uploadBackup)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "importExport:webdav.uploadFailed",
      )
    })
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

    expect(
      screen.queryByRole("button", { name: "importExport:webdav.saveConfig" }),
    ).not.toBeInTheDocument()

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

    await clickWebdavAction(WEBDAV_TARGET_IDS.uploadBackup)
    await waitFor(() => {
      expect(mockMergeWebdavBackupPayloadBySelection).toHaveBeenCalled()
      expect(mockUploadBackup).toHaveBeenCalled()
    })
    expect(toast.success).toHaveBeenCalledWith(
      "importExport:webdav.uploadSuccess",
    )
  })

  it("refreshes preferences after immediate auto-sync so manual WebDAV actions keep working", async () => {
    render(
      <>
        <WebDAVSettings />
        <WebDAVAutoSyncSettings />
      </>,
    )

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    fireEvent.click(
      await screen.findByRole("button", {
        name: "importExport:webdav.autoSync.syncNow",
      }),
    )

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "importExport:webdav.syncSuccess",
      )
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.testConnection",
      }),
    )

    await waitFor(() => {
      expect(mockTestWebdavConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://dav.example.com/backup.json",
          username: "alice",
          password: "pw",
        }),
      )
    })
    expect(toast.success).toHaveBeenCalledWith(
      "importExport:webdav.testSuccess",
    )
  })

  it("saves dirty WebDAV settings after unrelated preference timestamp changes before testing", async () => {
    render(
      <>
        <WebDAVSettings />
        <WebDAVAutoSyncSettings />
      </>,
    )

    const webdavUrlInput = (await screen.findByDisplayValue(
      "https://dav.example.com/backup.json",
    )) as HTMLInputElement

    fireEvent.change(webdavUrlInput, {
      target: {
        value: "http://127.0.0.1:1900/configSync/ALL-API-HUB",
      },
    })

    fireEvent.click(
      await screen.findByRole("button", {
        name: "importExport:webdav.autoSync.syncNow",
      }),
    )

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        "importExport:webdav.syncSuccess",
      )
    })

    await clickWebdavAction(WEBDAV_TARGET_IDS.testConnection)

    await waitFor(() => {
      expect(
        mockUserPreferences.savePreferencesWithResult,
      ).toHaveBeenCalledWith(
        {
          webdav: expect.objectContaining({
            url: "http://127.0.0.1:1900/configSync/ALL-API-HUB",
            username: "alice",
            password: "pw",
          }),
        },
        {
          expectedLastUpdated: 1,
        },
      )
      expect(mockTestWebdavConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "http://127.0.0.1:1900/configSync/ALL-API-HUB",
          username: "alice",
          password: "pw",
        }),
      )
    })
    expect(toast.success).toHaveBeenCalledWith(
      "importExport:webdav.testSuccess",
    )
  })

  it("keeps action labels stable while a field is being edited", async () => {
    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()
    expect(
      screen.queryByText("importExport:webdav.actionState.saved"),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "importExport:webdav.testConnection",
      }),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue("alice"), {
      target: { value: "bob" },
    })

    expect(
      screen.queryByText("importExport:webdav.actionState.unsaved"),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "importExport:webdav.testConnection",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "importExport:webdav.uploadBackup",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "importExport:webdav.downloadImport",
      }),
    ).toBeInTheDocument()
  })

  it("blocks upload when the sync-data selection is empty", async () => {
    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    clearWebdavSyncDataSelection()

    await clickWebdavAction(WEBDAV_TARGET_IDS.uploadBackup)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "importExport:webdav.syncData.selectionRequired",
      )
    })
    expect(mockUploadBackup).not.toHaveBeenCalled()
  })

  it("surfaces stale preference guidance when saving the WebDAV config is rejected by the version guard", async () => {
    mockUserPreferences.savePreferencesWithResult.mockResolvedValue(
      createStalePreferenceWriteResult(1, 2),
    )

    render(<WebDAVSettings />)

    expect(
      await screen.findByDisplayValue("https://dav.example.com/backup.json"),
    ).toBeInTheDocument()

    const username = screen.getByDisplayValue("alice")
    fireEvent.change(username, { target: { value: "bob" } })
    fireEvent.blur(username)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "settings:messages.preferencesChangedExternally",
      )
    })
    expect(loggerMocks.error).toHaveBeenCalledWith(
      "Failed to save WebDAV settings",
      expect.any(Error),
    )
  })

  it("shows stale preference guidance when persisting settings before connection test is rejected by the version guard", async () => {
    mockUserPreferences.savePreferencesWithResult.mockResolvedValue(
      createStalePreferenceWriteResult(1, 2),
    )

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue("alice"), {
      target: { value: "bob" },
    })

    await clickWebdavAction(WEBDAV_TARGET_IDS.testConnection)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "settings:messages.preferencesChangedExternally",
      )
    })
    expect(mockTestWebdavConnection).not.toHaveBeenCalled()
  })

  it("shows stale preference guidance when persisting settings before upload is rejected by the version guard", async () => {
    mockUserPreferences.savePreferencesWithResult.mockResolvedValue(
      createStalePreferenceWriteResult(1, 2),
    )

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue("alice"), {
      target: { value: "bob" },
    })

    await clickWebdavAction(WEBDAV_TARGET_IDS.uploadBackup)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "settings:messages.preferencesChangedExternally",
      )
    })
    expect(mockUploadBackup).not.toHaveBeenCalled()
  })

  it("uploads a new backup when the remote WebDAV file does not exist", async () => {
    const missingBackupError = new Error("missing backup")
    mockDownloadBackup.mockRejectedValueOnce(missingBackupError)
    mockIsWebdavFileNotFoundError.mockImplementation(
      (error) => error === missingBackupError,
    )

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    await clickWebdavAction(WEBDAV_TARGET_IDS.uploadBackup)

    await waitFor(() => {
      expect(mockMergeWebdavBackupPayloadBySelection).toHaveBeenCalledWith(
        expect.objectContaining({
          remoteBackup: null,
        }),
      )
      expect(mockUploadBackup).toHaveBeenCalled()
    })
    expect(toast.success).toHaveBeenCalledWith(
      "importExport:webdav.uploadSuccess",
    )
  })

  it("asks before rebuilding the WebDAV backup when the existing remote backup is malformed", async () => {
    mockDownloadBackup.mockResolvedValueOnce('{"version":2,"accounts":"')
    mockParseWebdavBackupJson.mockImplementationOnce(() => {
      throw new Error("messages:webdav.invalidBackupJson")
    })

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    await clickWebdavAction(WEBDAV_TARGET_IDS.uploadBackup)

    expect(
      await screen.findByText("importExport:webdav.rebuildDialog.title"),
    ).toBeInTheDocument()
    expect(mockUploadBackup).not.toHaveBeenCalled()
    expect(mockMergeWebdavBackupPayloadBySelection).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.rebuildDialog.cancel",
      }),
    )

    await waitFor(() => {
      expect(
        screen.queryByText("importExport:webdav.rebuildDialog.title"),
      ).not.toBeInTheDocument()
    })
    expect(mockUploadBackup).not.toHaveBeenCalled()
  })

  it("keeps the rebuild dialog open and exposes processing while a forced rebuild is pending", async () => {
    mockDownloadBackup.mockResolvedValueOnce('{"version":2,"accounts":"')
    mockParseWebdavBackupJson.mockImplementationOnce(() => {
      throw new Error("messages:webdav.invalidBackupJson")
    })
    let resolveUpload: () => void = () => {}
    mockUploadBackup.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveUpload = resolve
      }),
    )

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()
    await clickWebdavAction(WEBDAV_TARGET_IDS.uploadBackup)

    expect(
      await screen.findByText("importExport:webdav.rebuildDialog.title"),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.rebuildDialog.confirm",
      }),
    )

    const processingButton = screen.getByRole("button", {
      name: "common:status.processing",
    })
    expect(processingButton).toBeDisabled()
    expect(processingButton).toHaveAttribute("aria-busy", "true")

    expect(
      screen.getByText("importExport:webdav.rebuildDialog.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "importExport:webdav.rebuildDialog.cancel",
      }),
    ).toBeDisabled()

    fireEvent.click(screen.getByLabelText("common:actions.close"))
    expect(
      screen.getByText("importExport:webdav.rebuildDialog.title"),
    ).toBeInTheDocument()

    resolveUpload()

    await waitFor(() => {
      expect(
        screen.queryByText("importExport:webdav.rebuildDialog.title"),
      ).not.toBeInTheDocument()
    })
  })

  it("closes the rebuild dialog from the modal close button when idle", async () => {
    mockDownloadBackup.mockResolvedValueOnce('{"version":2,"accounts":"')
    mockParseWebdavBackupJson.mockImplementationOnce(() => {
      throw new Error("messages:webdav.invalidBackupJson")
    })

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()
    await clickWebdavAction(WEBDAV_TARGET_IDS.uploadBackup)

    expect(
      await screen.findByText("importExport:webdav.rebuildDialog.title"),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText("common:actions.close"))

    await waitFor(() => {
      expect(
        screen.queryByText("importExport:webdav.rebuildDialog.title"),
      ).not.toBeInTheDocument()
    })
  })

  it("rebuilds a malformed WebDAV backup with a one-time full sync selection after confirmation", async () => {
    mockDownloadBackup.mockResolvedValueOnce('{"version":2,"accounts":"')
    mockParseWebdavBackupJson.mockImplementationOnce(() => {
      throw new Error("messages:webdav.invalidBackupJson")
    })

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()
    fireEvent.click(
      document.getElementById(
        WEBDAV_TARGET_IDS.syncDataPreferences,
      ) as HTMLInputElement,
    )

    await clickWebdavAction(WEBDAV_TARGET_IDS.uploadBackup)

    expect(
      await screen.findByText("importExport:webdav.rebuildDialog.title"),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.rebuildDialog.confirm",
      }),
    )

    await waitFor(() => {
      expect(mockMergeWebdavBackupPayloadBySelection).toHaveBeenCalledWith(
        expect.objectContaining({
          remoteBackup: null,
          selection: {
            accounts: true,
            bookmarks: true,
            apiCredentialProfiles: true,
            preferences: true,
          },
        }),
      )
      expect(mockUploadBackup).toHaveBeenCalled()
    })
    expect(toast.success).toHaveBeenCalledWith(
      "importExport:webdav.uploadSuccess",
    )
    expect(
      document.getElementById(
        WEBDAV_TARGET_IDS.syncDataPreferences,
      ) as HTMLInputElement,
    ).not.toBeChecked()
  })

  it("surfaces the upload failure when fetching the remote backup fails unexpectedly", async () => {
    const downloadError = new Error("download failed")
    mockDownloadBackup.mockRejectedValueOnce(downloadError)
    mockIsWebdavFileNotFoundError.mockReturnValue(false)

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    await clickWebdavAction(WEBDAV_TARGET_IDS.uploadBackup)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("download failed")
    })
    expect(mockUploadBackup).not.toHaveBeenCalled()
  })

  it("surfaces unexpected remote backup parse failures during upload", async () => {
    const parseError = new Error("unexpected parse failure")
    mockDownloadBackup.mockResolvedValueOnce('{"version":2}')
    mockParseWebdavBackupJson.mockImplementationOnce(() => {
      throw parseError
    })

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    await clickWebdavAction(WEBDAV_TARGET_IDS.uploadBackup)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("unexpected parse failure")
    })
    expect(
      screen.queryByText("importExport:webdav.rebuildDialog.title"),
    ).not.toBeInTheDocument()
    expect(mockUploadBackup).not.toHaveBeenCalled()
  })

  it("shows the safe-save failure message when WebDAV upload cannot be committed", async () => {
    mockUploadBackup.mockRejectedValueOnce(
      new Error("messages:webdav.safeCommitFailed"),
    )

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    await clickWebdavAction(WEBDAV_TARGET_IDS.uploadBackup)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "messages:webdav.safeCommitFailed",
      )
    })
  })

  it("updates the editable fields and toggles password visibility in both forms", async () => {
    const user = userEvent.setup()
    mockDownloadBackupRaw.mockResolvedValueOnce("encrypted-payload")
    mockTryParseEncryptedWebdavBackupEnvelope.mockReturnValue(
      ENCRYPTED_BACKUP_ENVELOPE,
    )

    render(<WebDAVSettings />)

    const urlInput = (await screen.findByDisplayValue(
      "https://dav.example.com/backup.json",
    )) as HTMLInputElement
    const usernameInput = screen.getByDisplayValue("alice") as HTMLInputElement
    const webdavPasswordInput = document.getElementById(
      WEBDAV_TARGET_IDS.password,
    ) as HTMLInputElement
    const backupPasswordInput = document.getElementById(
      WEBDAV_TARGET_IDS.encryptionPassword,
    ) as HTMLInputElement

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

    await user.click(
      within(webdavPasswordInput.parentElement!).getByRole("button", {
        name: /importExport:webdav\.(show|hide)Password/,
      }),
    )
    await user.click(
      within(backupPasswordInput.parentElement!).getByRole("button", {
        name: /importExport:webdav\.(show|hide)Password/,
      }),
    )

    expect(webdavPasswordInput).toHaveAttribute("type", "text")
    expect(backupPasswordInput).toHaveAttribute("type", "text")

    fireEvent.change(backupPasswordInput, {
      target: { value: "" },
    })
    await user.click(screen.getByRole("switch"))
    await clickWebdavAction(WEBDAV_TARGET_IDS.downloadImport)

    expect(
      await screen.findByText(
        "importExport:webdav.encryption.decryptDialogTitle",
      ),
    ).toBeInTheDocument()

    await user.click(
      screen.getAllByRole("button", {
        name: /importExport:webdav\.(show|hide)Password/,
      })[2],
    )

    expect(
      document.getElementById("decryptPassword") as HTMLInputElement,
    ).toHaveAttribute("type", "text")
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false")
  })
})
