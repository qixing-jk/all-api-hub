import { fireEvent, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import WebDAVSettings from "~/features/ImportExport/components/WebDAVSettings"
import { WEBDAV_TARGET_IDS } from "~/features/ImportExport/searchTargets"
import toast from "~/lib/notify"
import { LegacyChannelConfigMigrationDeferredError } from "~/services/managedSites/legacyChannelConfigMigration"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"

import {
  clearWebdavSyncDataSelection,
  clickWebdavAction,
  createStalePreferenceWriteResult,
  ENCRYPTED_BACKUP_ENVELOPE,
  mockApplyPreferenceLanguage,
  mockBuildWebdavImportPayloadBySelection,
  mockCompleteProductAnalyticsAction,
  mockDecryptWebdavBackupEnvelope,
  mockDownloadBackupRaw,
  mockImportFromBackupObject,
  mockParseWebdavBackupJson,
  mockTryParseEncryptedWebdavBackupEnvelope,
  mockUserPreferences,
  openManualDecryptDialog,
  render,
  setupWebdavSettingsTestHarness,
} from "./webdavSettingsHarness"

// Register shared module mocks before loading the components under test.
await vi.hoisted(() => import("./webdavSettingsHarness"))

describe("WebDAVSettings Import", () => {
  setupWebdavSettingsTestHarness()
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
    mockCompleteProductAnalyticsAction.mockClear()
    await clickWebdavAction(WEBDAV_TARGET_IDS.downloadImport)

    expect(
      await screen.findByText(
        "importExport:webdav.encryption.decryptDialogTitle",
      ),
    ).toBeInTheDocument()

    expect(
      screen.getByRole("button", {
        name: "importExport:webdav.encryption.decryptAction",
      }),
    ).not.toHaveAttribute("data-analytics-action")

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
      expect(mockApplyPreferenceLanguage).toHaveBeenCalledWith(
        "ja",
        expect.any(Function),
      )
    })
    expect(
      mockUserPreferences.savePreferencesWithResult,
    ).toHaveBeenNthCalledWith(
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

    expect(screen.getByDisplayValue("manual-secret")).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith(
      "importExport:import.importSuccess",
    )
  })

  it("blocks download/import when the sync-data selection is empty", async () => {
    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    clearWebdavSyncDataSelection()

    await clickWebdavAction(WEBDAV_TARGET_IDS.downloadImport)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "importExport:webdav.syncData.selectionRequired",
      )
    })
    expect(mockDownloadBackupRaw).not.toHaveBeenCalled()
  })

  it("imports an unencrypted WebDAV backup without opening the decrypt dialog", async () => {
    mockDownloadBackupRaw.mockResolvedValueOnce('{"version":2,"accounts":[]}')

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    await clickWebdavAction(WEBDAV_TARGET_IDS.downloadImport)

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
      expect(mockApplyPreferenceLanguage).toHaveBeenCalledWith(
        "ja",
        expect.any(Function),
      )
      expect(mockUserPreferences.getPreferences).toHaveBeenCalledTimes(2)
      expect(toast.success).toHaveBeenCalledWith(
        "importExport:import.importSuccess",
      )
    })
    expect(
      screen.queryByText("importExport:webdav.encryption.decryptDialogTitle"),
    ).not.toBeInTheDocument()
  })

  it("shows a stable WebDAV backup error when downloaded backup JSON is malformed", async () => {
    mockDownloadBackupRaw.mockResolvedValueOnce('{"version":2,"accounts":"')
    mockParseWebdavBackupJson.mockImplementationOnce(() => {
      throw new Error("messages:webdav.invalidBackupJson")
    })

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    await clickWebdavAction(WEBDAV_TARGET_IDS.downloadImport)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "messages:webdav.invalidBackupJson",
      )
    })
    expect(mockBuildWebdavImportPayloadBySelection).not.toHaveBeenCalled()
    expect(mockImportFromBackupObject).not.toHaveBeenCalled()
  })

  it("shows the download/import failure message when importing the backup fails", async () => {
    mockImportFromBackupObject.mockRejectedValueOnce(new Error("import failed"))

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    await clickWebdavAction(WEBDAV_TARGET_IDS.downloadImport)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("import failed")
    })
  })

  it("uses the stable download/import fallback when a failure has no message", async () => {
    mockImportFromBackupObject.mockRejectedValueOnce(null)

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()
    await clickWebdavAction(WEBDAV_TARGET_IDS.downloadImport)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "importExport:import.downloadImportFailed",
      )
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

    await clickWebdavAction(WEBDAV_TARGET_IDS.downloadImport)

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
    mockCompleteProductAnalyticsAction.mockClear()
    await clickWebdavAction(WEBDAV_TARGET_IDS.downloadImport)

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

  it("localizes deferred channel-config migration after manual decrypt", async () => {
    render(<WebDAVSettings />)
    await openManualDecryptDialog()
    fireEvent.change(document.getElementById("decryptPassword")!, {
      target: { value: "manual-secret" },
    })
    mockBuildWebdavImportPayloadBySelection.mockRejectedValueOnce(
      new LegacyChannelConfigMigrationDeferredError("inventory-failed"),
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.encryption.decryptAction",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "importExport:import.channelConfigMigrationDeferred",
      )
    })
  })

  it("uses the stable decrypt fallback when a failure has no message", async () => {
    render(<WebDAVSettings />)
    await openManualDecryptDialog()
    fireEvent.change(document.getElementById("decryptPassword")!, {
      target: { value: "manual-secret" },
    })
    mockDecryptWebdavBackupEnvelope.mockRejectedValueOnce(null)

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.encryption.decryptAction",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "importExport:webdav.encryption.decryptFailed",
      )
    })
  })

  it("shows both import success and stale preference guidance when persisting the decrypt password is rejected by the version guard", async () => {
    mockDownloadBackupRaw.mockResolvedValueOnce("encrypted-payload")
    mockTryParseEncryptedWebdavBackupEnvelope.mockReturnValue(
      ENCRYPTED_BACKUP_ENVELOPE,
    )
    const defaultSavePreferencesWithResult =
      mockUserPreferences.savePreferencesWithResult.getMockImplementation()
    mockUserPreferences.savePreferencesWithResult.mockImplementationOnce(
      defaultSavePreferencesWithResult!,
    )
    mockUserPreferences.savePreferencesWithResult.mockResolvedValueOnce(
      createStalePreferenceWriteResult(1, 2),
    )

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    fireEvent.change(screen.getAllByDisplayValue("stored-secret")[0], {
      target: { value: "" },
    })
    mockCompleteProductAnalyticsAction.mockClear()
    await clickWebdavAction(WEBDAV_TARGET_IDS.downloadImport)

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
        "settings:messages.preferencesChangedExternally",
      )
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        expect.objectContaining({
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Persist,
          },
          diagnostics: expect.objectContaining({
            failure: expect.objectContaining({
              category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
              stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Persist,
            }),
          }),
        }),
      )
    })
  })

  it("imports decrypted content without reporting persist failure when save password is disabled", async () => {
    mockDownloadBackupRaw.mockResolvedValueOnce("encrypted-payload")
    mockTryParseEncryptedWebdavBackupEnvelope.mockReturnValue(
      ENCRYPTED_BACKUP_ENVELOPE,
    )

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    fireEvent.change(screen.getAllByDisplayValue("stored-secret")[0], {
      target: { value: "" },
    })
    mockCompleteProductAnalyticsAction.mockClear()
    await clickWebdavAction(WEBDAV_TARGET_IDS.downloadImport)

    await waitFor(() => {
      expect(document.getElementById("decryptPassword")).toBeTruthy()
    })
    const savePasswordCheckbox = screen.getByRole("checkbox", {
      name: "importExport:webdav.encryption.savePassword",
    })
    fireEvent.change(
      document.getElementById("decryptPassword") as HTMLInputElement,
      {
        target: { value: "manual-secret" },
      },
    )
    fireEvent.click(savePasswordCheckbox)
    expect(savePasswordCheckbox).toHaveAttribute("aria-checked", "false")
    mockUserPreferences.savePreferencesWithResult.mockClear()

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.encryption.decryptAction",
      }),
    )

    await waitFor(() => {
      expect(mockImportFromBackupObject).toHaveBeenCalledWith(
        { imported: true },
        { preserveWebdav: true },
      )
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        expect.objectContaining({
          diagnostics: expect.objectContaining({
            outcome: expect.objectContaining({
              successCount: 1,
              failureCount: 0,
            }),
          }),
        }),
      )
    })

    expect(mockUserPreferences.savePreferencesWithResult).toHaveBeenCalledTimes(
      0,
    )
    expect(toast.error).not.toHaveBeenCalledWith(
      "settings:messages.saveSettingsFailed",
    )
  })

  it("persists the decrypt password with the current draft version when the imported backup excludes preferences", async () => {
    mockDownloadBackupRaw.mockResolvedValueOnce("encrypted-payload")
    mockTryParseEncryptedWebdavBackupEnvelope.mockReturnValue(
      ENCRYPTED_BACKUP_ENVELOPE,
    )
    mockImportFromBackupObject.mockResolvedValueOnce({
      allImported: false,
      sections: {
        accounts: true,
      },
    })

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    fireEvent.change(screen.getAllByDisplayValue("stored-secret")[0], {
      target: { value: "" },
    })
    mockCompleteProductAnalyticsAction.mockClear()
    await clickWebdavAction(WEBDAV_TARGET_IDS.downloadImport)

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
      expect(mockImportFromBackupObject).toHaveBeenCalledWith(
        { imported: true },
        { preserveWebdav: true },
      )
      expect(
        mockUserPreferences.savePreferencesWithResult,
      ).toHaveBeenNthCalledWith(
        2,
        {
          webdav: {
            backupEncryptionPassword: "manual-secret",
          },
        },
        {
          expectedLastUpdated: 1,
        },
      )
    })

    expect(mockUserPreferences.getLanguage).not.toHaveBeenCalled()
    expect(mockApplyPreferenceLanguage).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalledWith(
      "importExport:import.importSuccess",
    )
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
    await clickWebdavAction(WEBDAV_TARGET_IDS.downloadImport)

    await waitFor(() => {
      expect(document.getElementById("decryptPassword")).toBeTruthy()
    })

    clearWebdavSyncDataSelection()

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
})
