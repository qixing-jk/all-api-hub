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

import { useProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { UserPreferencesProvider } from "~/contexts/UserPreferencesContext"
import WebDAVAutoSyncSettings from "~/features/ImportExport/components/WebDAVAutoSyncSettings"
import WebDAVSettings from "~/features/ImportExport/components/WebDAVSettings"
import { WEBDAV_TARGET_IDS } from "~/features/ImportExport/searchTargets"
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
import { testI18n } from "~~/tests/test-utils/i18n"
import {
  createPersistedPreferencesFixture,
  setupMockPreferencePersistence,
} from "~~/tests/test-utils/mockPreferencePersistence"

const createStalePreferenceWriteResult = (
  expectedLastUpdated: number,
  actualLastUpdated = expectedLastUpdated + 1,
) => ({
  ok: false as const,
  reason: {
    type: "stale" as const,
    expectedLastUpdated,
    actualLastUpdated,
  },
})

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
  mockParseWebdavBackupJson,
  mockIsWebdavFileNotFoundError,
  mockStartProductAnalyticsAction,
  mockCompleteProductAnalyticsAction,
  mockTestWebdavConnection,
  mockUploadBackup,
  mockImportFromBackupObject,
  mockSendWebdavAutoSyncMessage,
  loggerMocks,
} = vi.hoisted(() => ({
  mockApplyPreferenceLanguage: vi.fn(),
  mockUserPreferences: {
    getPreferences: vi.fn(),
    getLanguage: vi.fn(),
    savePreferences: vi.fn(),
    savePreferencesWithResult: vi.fn(),
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
  mockParseWebdavBackupJson: vi.fn(),
  mockIsWebdavFileNotFoundError: vi.fn(),
  mockStartProductAnalyticsAction: vi.fn(),
  mockCompleteProductAnalyticsAction: vi.fn(),
  mockTestWebdavConnection: vi.fn(),
  mockUploadBackup: vi.fn(),
  mockImportFromBackupObject: vi.fn(),
  mockSendWebdavAutoSyncMessage: vi.fn(),
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
  parseWebdavBackupJson: mockParseWebdavBackupJson,
  isWebdavFileNotFoundError: mockIsWebdavFileNotFoundError,
  testWebdavConnection: mockTestWebdavConnection,
  uploadBackup: mockUploadBackup,
}))

vi.mock("~/utils/browser/browserApi", () => ({}))

vi.mock("~/services/webdav/webdavAutoSyncMessaging", () => ({
  sendWebdavAutoSyncMessage: mockSendWebdavAutoSyncMessage,
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  resolveProductAnalyticsErrorCategoryFromError: (error: unknown) =>
    error &&
    typeof error === "object" &&
    (error as { statusCode?: unknown }).statusCode === 401
      ? PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth
      : PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
  startProductAnalyticsAction: (...args: unknown[]) =>
    mockStartProductAnalyticsAction(...args),
}))

vi.mock("~/features/ImportExport/utils", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/features/ImportExport/utils")>()
  return {
    ...actual,
    importFromBackupObject: mockImportFromBackupObject,
  }
})

vi.mock("~/components/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/components/ui")>()

  return {
    ...actual,
    Button: ({
      analyticsAction,
      children,
      leftIcon,
      rightIcon,
      bleed: _bleed,
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

const ENCRYPTED_BACKUP_ENVELOPE = {
  version: 1,
  algorithm: "aes-gcm",
  salt: "salt",
  iv: "iv",
  ciphertext: "cipher",
} as const

function clickWebdavAction(actionId: string) {
  fireEvent.click(document.getElementById(actionId) as HTMLButtonElement)
}

function clearWebdavSyncDataSelection() {
  ;[
    WEBDAV_TARGET_IDS.syncDataAccounts,
    WEBDAV_TARGET_IDS.syncDataBookmarks,
    WEBDAV_TARGET_IDS.syncDataApiCredentialProfiles,
    WEBDAV_TARGET_IDS.syncDataPreferences,
  ].forEach((id) =>
    fireEvent.click(document.getElementById(id) as HTMLInputElement),
  )
}

async function openManualDecryptDialog() {
  mockDownloadBackupRaw.mockResolvedValueOnce("encrypted-payload")
  mockTryParseEncryptedWebdavBackupEnvelope.mockReturnValue(
    ENCRYPTED_BACKUP_ENVELOPE,
  )

  expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

  fireEvent.change(screen.getAllByDisplayValue("stored-secret")[0], {
    target: { value: "" },
  })
  clickWebdavAction("webdav-download-import")

  await screen.findByText("importExport:webdav.encryption.decryptDialogTitle")
  mockCompleteProductAnalyticsAction.mockClear()
}

describe("WebDAVSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const preferencePersistence = setupMockPreferencePersistence(
      mockUserPreferences,
      createPersistedPreferencesFixture({
        showTodayCashflow: true,
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
      }),
    )
    const savePreferencesWithResult =
      mockUserPreferences.savePreferencesWithResult.getMockImplementation()
    mockUserPreferences.savePreferencesWithResult.mockImplementation(
      async (updates, options) => {
        const expectedLastUpdated = options?.expectedLastUpdated
        if (
          typeof expectedLastUpdated === "number" &&
          preferencePersistence.getPersistedPreferences().lastUpdated !==
            expectedLastUpdated
        ) {
          return createStalePreferenceWriteResult(
            expectedLastUpdated,
            preferencePersistence.getPersistedPreferences().lastUpdated,
          )
        }

        return await savePreferencesWithResult?.(updates, options)
      },
    )
    mockUserPreferences.getLanguage.mockResolvedValue("ja")
    mockUserPreferences.exportPreferences.mockResolvedValue({
      themeMode: "dark",
    })
    mockAccountStorage.exportData.mockResolvedValue([{ id: "acc-1" }])
    mockTagStorage.exportTagStore.mockResolvedValue({ tags: [] })
    mockChannelConfigStorage.exportConfigs.mockResolvedValue([{ id: 1 }])
    mockApiCredentialProfilesStorage.exportConfig.mockResolvedValue([{ id: 2 }])
    mockDownloadBackup.mockResolvedValue('{"version":2,"accounts":[]}')
    mockDownloadBackupRaw.mockResolvedValue('{"version":2}')
    mockParseWebdavBackupJson.mockImplementation((content: string) =>
      JSON.parse(content),
    )
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
    mockSendWebdavAutoSyncMessage.mockImplementation(async (type: string) => {
      switch (type) {
        case WebdavAutoSyncMessageTypes.GetStatus:
          return {
            success: true,
            data: {
              isSyncing: false,
              lastSyncTime: 0,
              lastSyncStatus: "idle",
              lastSyncError: null,
            },
          }
        case WebdavAutoSyncMessageTypes.SyncNow: {
          const latestPreferences =
            preferencePersistence.getPersistedPreferences()
          preferencePersistence.setPersistedPreferences({
            ...latestPreferences,
            lastUpdated: latestPreferences.lastUpdated + 1,
          })
          return { success: true, data: { message: "custom sync ok" } }
        }
        default:
          return { success: true }
      }
    })
    mockStartProductAnalyticsAction.mockReturnValue({
      complete: mockCompleteProductAnalyticsAction,
    })
  })

  it("does not declare button analytics metadata for WebDAV actions with manual async spans", async () => {
    render(<WebDAVSettings />)

    expect(
      await screen.findByRole("button", {
        name: "importExport:webdav.saveConfig",
      }),
    ).not.toHaveAttribute("data-analytics-action")
    expect(
      screen.getByRole("button", {
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

    fireEvent.click(
      await screen.findByRole("button", {
        name: "importExport:webdav.saveConfig",
      }),
    )

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

    fireEvent.click(
      await screen.findByRole("button", {
        name: "importExport:webdav.saveConfig",
      }),
    )

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

    fireEvent.click(
      await screen.findByRole("button", {
        name: "importExport:webdav.saveConfig",
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
        name: "importExport:webdav.testConnectionWithSave",
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
        name: "importExport:webdav.testConnectionWithSave",
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

    fireEvent.click(
      await screen.findByRole("button", {
        name: "importExport:webdav.uploadBackup",
      }),
    )

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

    clickWebdavAction("webdav-upload-backup")

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

    fireEvent.click(
      await screen.findByRole("button", {
        name: "importExport:webdav.uploadBackup",
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
    clickWebdavAction("webdav-upload-backup")

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

    fireEvent.click(
      await screen.findByRole("button", {
        name: "importExport:webdav.downloadImport",
      }),
    )

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
    clickWebdavAction("webdav-download-import")

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

    clickWebdavAction("webdav-download-import")

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

    fireEvent.click(
      await screen.findByRole("button", {
        name: "importExport:webdav.downloadImport",
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

  it("completes WebDAV download/import analytics with persist stage when persistence throws", async () => {
    mockUserPreferences.savePreferencesWithResult.mockRejectedValueOnce(
      new Error("storage unavailable"),
    )

    render(<WebDAVSettings />)

    fireEvent.change(await screen.findByDisplayValue("alice"), {
      target: { value: "bob" },
    })
    clickWebdavAction("webdav-download-import")

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
    clickWebdavAction("webdav-download-import")

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
      expect(
        mockUserPreferences.savePreferencesWithResult,
      ).toHaveBeenCalledWith(
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

    clickWebdavAction("webdav-upload-backup")
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

    clickWebdavAction("webdav-test-connection")

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

  it("explains when manual WebDAV actions will save draft changes first", async () => {
    render(<WebDAVSettings />)

    expect(
      (
        await screen.findByText("importExport:webdav.actionState.saved")
      ).closest('[role="alert"]'),
    ).toBeInTheDocument()
    expect(
      screen
        .getByText("importExport:webdav.actionState.saved")
        .closest('[role="alert"]')
        ?.querySelector("svg"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "importExport:webdav.testConnection",
      }),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue("alice"), {
      target: { value: "bob" },
    })

    expect(
      (
        await screen.findByText("importExport:webdav.actionState.unsaved")
      ).closest('[role="alert"]'),
    ).toBeInTheDocument()
    expect(
      screen
        .getByText("importExport:webdav.actionState.unsaved")
        .closest('[role="alert"]')
        ?.querySelector("svg"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "importExport:webdav.testConnectionWithSave",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "importExport:webdav.uploadBackupWithSave",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "importExport:webdav.downloadImportWithSave",
      }),
    ).toBeInTheDocument()
  })

  it("blocks upload when the sync-data selection is empty", async () => {
    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    clearWebdavSyncDataSelection()

    clickWebdavAction("webdav-upload-backup")

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
    mockCompleteProductAnalyticsAction.mockClear()
    clickWebdavAction("webdav-download-import")

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
      expect(mockApplyPreferenceLanguage).toHaveBeenCalledWith("ja")
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

    fireEvent.click(
      screen.getByRole("button", { name: "importExport:webdav.saveConfig" }),
    )

    await waitFor(() => {
      expect(
        mockUserPreferences.savePreferencesWithResult,
      ).toHaveBeenLastCalledWith(
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

  it("surfaces stale preference guidance when saving the WebDAV config is rejected by the version guard", async () => {
    mockUserPreferences.savePreferencesWithResult.mockResolvedValue(
      createStalePreferenceWriteResult(1, 2),
    )

    render(<WebDAVSettings />)

    expect(
      await screen.findByDisplayValue("https://dav.example.com/backup.json"),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", { name: "importExport:webdav.saveConfig" }),
    )

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

    clickWebdavAction("webdav-test-connection")

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

    clickWebdavAction("webdav-upload-backup")

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "settings:messages.preferencesChangedExternally",
      )
    })
    expect(mockUploadBackup).not.toHaveBeenCalled()
  })

  it("blocks download/import when the sync-data selection is empty", async () => {
    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    clearWebdavSyncDataSelection()

    clickWebdavAction("webdav-download-import")

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

    clickWebdavAction("webdav-upload-backup")

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

    clickWebdavAction("webdav-upload-backup")

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

  it("keeps the rebuild dialog open while a forced rebuild is pending", async () => {
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
    clickWebdavAction("webdav-upload-backup")

    expect(
      await screen.findByText("importExport:webdav.rebuildDialog.title"),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "importExport:webdav.rebuildDialog.confirm",
      }),
    )

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
    clickWebdavAction("webdav-upload-backup")

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

    clickWebdavAction("webdav-upload-backup")

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

    clickWebdavAction("webdav-upload-backup")

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

    clickWebdavAction("webdav-upload-backup")

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

    clickWebdavAction("webdav-upload-backup")

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "messages:webdav.safeCommitFailed",
      )
    })
  })

  it("imports an unencrypted WebDAV backup without opening the decrypt dialog", async () => {
    mockDownloadBackupRaw.mockResolvedValueOnce('{"version":2,"accounts":[]}')

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    clickWebdavAction("webdav-download-import")

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

  it("shows a stable WebDAV backup error when downloaded backup JSON is malformed", async () => {
    mockDownloadBackupRaw.mockResolvedValueOnce('{"version":2,"accounts":"')
    mockParseWebdavBackupJson.mockImplementationOnce(() => {
      throw new Error("messages:webdav.invalidBackupJson")
    })

    render(<WebDAVSettings />)

    expect(await screen.findByDisplayValue("alice")).toBeInTheDocument()

    clickWebdavAction("webdav-download-import")

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

    clickWebdavAction("webdav-download-import")

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

    clickWebdavAction("webdav-download-import")

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
    clickWebdavAction("webdav-download-import")

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
    clickWebdavAction("webdav-download-import")

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
    clickWebdavAction("webdav-download-import")

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
    clickWebdavAction("webdav-download-import")

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
    clickWebdavAction("webdav-download-import")

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
    fireEvent.click(screen.getByRole("switch"))
    clickWebdavAction("webdav-download-import")

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
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false")
  })
})
