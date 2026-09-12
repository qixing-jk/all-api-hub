import { fireEvent, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import WebDAVSettings from "~/features/ImportExport/components/WebDAVSettings"
import { WEBDAV_TARGET_IDS } from "~/features/ImportExport/searchTargets"
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

import {
  clearWebdavSyncDataSelection,
  clickWebdavAction,
  createStalePreferenceWriteResult,
  ENCRYPTED_BACKUP_ENVELOPE,
  loggerMocks,
  mockCompleteProductAnalyticsAction,
  mockDecryptWebdavBackupEnvelope,
  mockDownloadBackupRaw,
  mockImportFromBackupObject,
  mockStartProductAnalyticsAction,
  mockTestWebdavConnection,
  mockTryParseEncryptedWebdavBackupEnvelope,
  mockUploadBackup,
  mockUserPreferences,
  openManualDecryptDialog,
  render,
  setupWebdavSettingsTestHarness,
} from "./webdavSettingsHarness"

// Register shared module mocks before loading the components under test.
await vi.hoisted(() => import("./webdavSettingsHarness"))

describe("WebDAVSettings Analytics", () => {
  setupWebdavSettingsTestHarness()
  it("does not declare button analytics metadata for WebDAV actions with manual async spans", async () => {
    render(<WebDAVSettings />)

    expect(
      await screen.findByRole("button", {
        name: "importExport:webdav.uploadBackup",
      }),
    ).not.toHaveAttribute("data-analytics-action")
    expect(
      screen.getByRole("button", {
        name: "importExport:webdav.downloadImport",
      }),
    ).not.toHaveAttribute("data-analytics-action")
  })

  it("completes WebDAV config save analytics as success", async () => {
    render(<WebDAVSettings />)

    const username = await screen.findByDisplayValue("alice")
    fireEvent.change(username, { target: { value: "bob" } })
    fireEvent.blur(username)

    await waitFor(() => {
      expect(mockStartProductAnalyticsAction).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebDavSync,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.UpdateWebDavConfig,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsWebDavSettings,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    })
  })

  it("completes WebDAV config save analytics as unknown failure when persistence rejects the update", async () => {
    mockUserPreferences.savePreferencesWithResult.mockResolvedValue(
      createStalePreferenceWriteResult(1, 2),
    )

    render(<WebDAVSettings />)

    const username = await screen.findByDisplayValue("alice")
    fireEvent.change(username, { target: { value: "bob" } })
    fireEvent.blur(username)

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        expect.objectContaining({
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Persist,
          },
        }),
      )
    })
  })

  it("completes WebDAV config save analytics with persist stage when persistence throws", async () => {
    const persistenceError = new Error("storage unavailable")
    mockUserPreferences.savePreferencesWithResult.mockRejectedValueOnce(
      persistenceError,
    )

    render(<WebDAVSettings />)

    const username = await screen.findByDisplayValue("alice")
    fireEvent.change(username, { target: { value: "bob" } })
    fireEvent.blur(username)

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Persist,
          },
        },
      )
    })
    expect(loggerMocks.error).toHaveBeenCalledWith(
      "Failed to save WebDAV settings",
      expect.objectContaining({
        cause: persistenceError,
      }),
    )
  })

  it("completes WebDAV connection test analytics as success", async () => {
    render(<WebDAVSettings />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "importExport:webdav.testConnection",
      }),
    )

    await waitFor(() => {
      expect(mockStartProductAnalyticsAction).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebDavSync,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.VerifyWebDavConnection,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsWebDavSettings,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith("success")
    })
  })

  it("completes WebDAV connection test analytics as failure when validation fails", async () => {
    mockUserPreferences.savePreferencesWithResult.mockResolvedValue(
      createStalePreferenceWriteResult(1, 2),
    )

    render(<WebDAVSettings />)

    fireEvent.change(await screen.findByDisplayValue("alice"), {
      target: { value: "bob" },
    })
    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.testConnection",
      }),
    )

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        "failure",
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Persist,
          },
        },
      )
    })
  })

  it("completes WebDAV connection test analytics with persist stage when persistence throws", async () => {
    mockUserPreferences.savePreferencesWithResult.mockRejectedValueOnce(
      new Error("storage unavailable"),
    )

    render(<WebDAVSettings />)

    fireEvent.change(await screen.findByDisplayValue("alice"), {
      target: { value: "bob" },
    })
    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.testConnection",
      }),
    )

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Persist,
          },
        },
      )
    })
    expect(mockTestWebdavConnection).not.toHaveBeenCalled()
  })

  it("completes WebDAV connection test analytics with execute stage when the connection check fails", async () => {
    mockTestWebdavConnection.mockRejectedValueOnce(
      new Error("connection failed"),
    )

    render(<WebDAVSettings />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "importExport:webdav.testConnection",
      }),
    )

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
          },
        },
      )
    })
  })

  it("completes WebDAV upload analytics as success after the backup is uploaded", async () => {
    render(<WebDAVSettings />)

    await clickWebdavAction(WEBDAV_TARGET_IDS.uploadBackup)

    await waitFor(() => {
      expect(mockUploadBackup).toHaveBeenCalled()
      expect(mockStartProductAnalyticsAction).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebDavSync,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.UploadWebDavBackup,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsWebDavSettings,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        expect.objectContaining({
          diagnostics: expect.objectContaining({
            context: {
              sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
              mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavUploadOnly,
            },
            outcome: {
              itemCount: 1,
              successCount: 1,
              failureCount: 0,
              skippedCount: 0,
            },
          }),
        }),
      )
    })
  })

  it("completes WebDAV upload analytics as validation failure when sync data is empty", async () => {
    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    clearWebdavSyncDataSelection()

    await clickWebdavAction(WEBDAV_TARGET_IDS.uploadBackup)

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Validation,
          },
          diagnostics: {
            context: {
              sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
              mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavUploadOnly,
            },
            outcome: {
              itemCount: 0,
              successCount: 0,
              failureCount: 1,
              skippedCount: 0,
            },
            failure: {
              category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
              stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Validation,
              reason: PRODUCT_ANALYTICS_FAILURE_REASONS.MissingSelection,
            },
          },
        },
      )
    })
    expect(mockUploadBackup).not.toHaveBeenCalled()
  })

  it("completes WebDAV upload analytics as unknown failure when upload work fails", async () => {
    mockUploadBackup.mockRejectedValueOnce(new Error("upload failed"))

    render(<WebDAVSettings />)

    await clickWebdavAction(WEBDAV_TARGET_IDS.uploadBackup)

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
          },
          diagnostics: {
            context: {
              sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
              mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavUploadOnly,
            },
            outcome: {
              itemCount: 1,
              successCount: 0,
              failureCount: 1,
              skippedCount: 0,
            },
            failure: {
              category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
              stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
              reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
            },
          },
        },
      )
    })
  })

  it("completes WebDAV upload analytics with persist stage when persistence throws", async () => {
    mockUserPreferences.savePreferencesWithResult.mockRejectedValueOnce(
      new Error("storage unavailable"),
    )

    render(<WebDAVSettings />)

    fireEvent.change(await screen.findByDisplayValue("alice"), {
      target: { value: "bob" },
    })
    await clickWebdavAction(WEBDAV_TARGET_IDS.uploadBackup)

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        expect.objectContaining({
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Persist,
          },
          diagnostics: expect.objectContaining({
            context: {
              sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
              mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavUploadOnly,
            },
            outcome: {
              itemCount: 1,
              successCount: 0,
              failureCount: 1,
              skippedCount: 0,
            },
            failure: expect.objectContaining({
              category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
              stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Persist,
              reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
            }),
          }),
        }),
      )
    })
    expect(mockUploadBackup).not.toHaveBeenCalled()
  })

  it("completes WebDAV download/import analytics as success after import finishes", async () => {
    render(<WebDAVSettings />)

    await clickWebdavAction(WEBDAV_TARGET_IDS.downloadImport)

    await waitFor(() => {
      expect(mockImportFromBackupObject).toHaveBeenCalled()
      expect(mockStartProductAnalyticsAction).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebDavSync,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.DownloadImportWebDavBackup,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsWebDavSettings,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        expect.objectContaining({
          diagnostics: expect.objectContaining({
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
          }),
        }),
      )
    })
  })

  it("completes WebDAV download/import analytics as skipped when handing off to the decrypt prompt", async () => {
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
      expect(
        screen.getByText("importExport:webdav.encryption.decryptDialogTitle"),
      ).toBeInTheDocument()
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Skipped,
        {
          diagnostics: {
            context: {
              sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
              mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavDownloadOnly,
            },
            execution: {
              retryAttempted: true,
              retryCount: 1,
            },
            outcome: {
              itemCount: 1,
              successCount: 0,
              failureCount: 0,
              skippedCount: 1,
            },
          },
        },
      )
    })
  })

  it("completes WebDAV download/import analytics as validation failure when sync data is empty", async () => {
    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    clearWebdavSyncDataSelection()

    await clickWebdavAction(WEBDAV_TARGET_IDS.downloadImport)

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        expect.objectContaining({
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Validation,
          },
        }),
      )
    })
    expect(mockDownloadBackupRaw).not.toHaveBeenCalled()
  })

  it("completes WebDAV download/import analytics as unknown failure when import fails", async () => {
    mockImportFromBackupObject.mockRejectedValueOnce(new Error("import failed"))

    render(<WebDAVSettings />)

    await clickWebdavAction(WEBDAV_TARGET_IDS.downloadImport)

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        expect.objectContaining({
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
          },
        }),
      )
    })
  })

  it("completes WebDAV download/import analytics with persist stage when persistence throws", async () => {
    mockUserPreferences.savePreferencesWithResult.mockRejectedValueOnce(
      new Error("storage unavailable"),
    )

    render(<WebDAVSettings />)

    fireEvent.change(await screen.findByDisplayValue("alice"), {
      target: { value: "bob" },
    })
    await clickWebdavAction(WEBDAV_TARGET_IDS.downloadImport)

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        expect.objectContaining({
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Persist,
          },
        }),
      )
    })
    expect(mockDownloadBackupRaw).not.toHaveBeenCalled()
  })

  it("starts and completes manual decrypt/import analytics only when the user confirms decrypt", async () => {
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

    expect(
      await screen.findByText(
        "importExport:webdav.encryption.decryptDialogTitle",
      ),
    ).toBeInTheDocument()

    mockStartProductAnalyticsAction.mockClear()
    mockCompleteProductAnalyticsAction.mockClear()

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
      expect(mockImportFromBackupObject).toHaveBeenCalled()
      expect(mockStartProductAnalyticsAction).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebDavSync,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.DecryptImportWebDavBackup,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsWebDavDecryptPasswordDialog,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        expect.objectContaining({
          diagnostics: expect.objectContaining({
            context: {
              sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
              mode: PRODUCT_ANALYTICS_MODE_IDS.WebDavDownloadOnly,
            },
          }),
        }),
      )
    })
  })

  it("completes manual decrypt/import analytics as validation failure when decrypt fails", async () => {
    render(<WebDAVSettings />)

    await openManualDecryptDialog()

    mockDecryptWebdavBackupEnvelope.mockRejectedValueOnce(
      new Error("manual decrypt failed"),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.encryption.decryptAction",
      }),
    )

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        expect.objectContaining({
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Validation,
          },
        }),
      )
    })
  })

  it("completes manual decrypt/import analytics as validation failure when sync data becomes empty", async () => {
    render(<WebDAVSettings />)

    await openManualDecryptDialog()

    clearWebdavSyncDataSelection()

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.encryption.decryptAction",
      }),
    )

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        expect.objectContaining({
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Validation,
          },
        }),
      )
    })
    expect(mockDecryptWebdavBackupEnvelope).not.toHaveBeenCalled()
  })

  it("completes manual decrypt/import analytics with execute stage when import fails after decrypt", async () => {
    mockImportFromBackupObject.mockRejectedValueOnce(new Error("import failed"))

    render(<WebDAVSettings />)

    await openManualDecryptDialog()

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
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        expect.objectContaining({
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
          },
        }),
      )
    })
  })
})
