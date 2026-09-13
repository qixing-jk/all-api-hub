import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { cloneElement, isValidElement, type ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, expect, vi } from "vitest"

import { useProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { UserPreferencesProvider } from "~/contexts/UserPreferencesContext"
import { WEBDAV_TARGET_IDS } from "~/features/ImportExport/searchTargets"
import { IMPORT_EXPORT_TEST_IDS } from "~/features/ImportExport/testIds"
import { resolveProductAnalyticsActionContext } from "~/services/productAnalytics/actionConfig"
import { PRODUCT_ANALYTICS_ERROR_CATEGORIES } from "~/services/productAnalytics/contracts"
import { WebdavAutoSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { testI18n } from "~~/tests/test-utils/i18n"
import {
  createPersistedPreferencesFixture,
  setupMockPreferencePersistence,
} from "~~/tests/test-utils/mockPreferencePersistence"

vi.mock("~/services/managedSites/legacyChannelConfigMigration", () => {
  class LegacyChannelConfigMigrationDeferredError extends Error {
    constructor(readonly reason: string) {
      super(`Legacy channel config migration deferred: ${reason}`)
    }
  }

  return {
    ensureLegacyChannelConfigMigrationReady: vi
      .fn()
      .mockResolvedValue(undefined),
    LegacyChannelConfigMigrationDeferredError,
  }
})

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
  mockCreateCloudSyncBackup,
  mockDownloadCloudSyncBackup,
  mockTestCloudSyncConnection,
  mockUploadCloudSyncBackup,
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
    exportPreferencesForBackup: vi.fn(),
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
  mockCreateCloudSyncBackup: vi.fn(),
  mockDownloadCloudSyncBackup: vi.fn(),
  mockTestCloudSyncConnection: vi.fn(),
  mockUploadCloudSyncBackup: vi.fn(),
  mockImportFromBackupObject: vi.fn(),
  mockSendWebdavAutoSyncMessage: vi.fn(),
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

vi.mock("~/services/accounts/accountStorage/accountDataTransfer", () => ({
  accountDataTransfer: mockAccountStorage,
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

vi.mock("~/services/webdav/cloudSyncService", () => ({
  createCloudSyncBackup: mockCreateCloudSyncBackup,
  downloadCloudSyncBackup: mockDownloadCloudSyncBackup,
  testCloudSyncConnection: mockTestCloudSyncConnection,
  uploadCloudSyncBackup: mockUploadCloudSyncBackup,
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
      asChild = false,
      children,
      leftIcon,
      rightIcon,
      bleed: _bleed,
      loading = false,
      disabled,
      "aria-busy": ariaBusy,
      ...props
    }: any) => {
      const scope = useProductAnalyticsScope()
      const resolvedAction = resolveProductAnalyticsActionContext(
        analyticsAction,
        scope,
      )
      const analyticsProps = {
        "data-analytics-action": resolvedAction
          ? `${resolvedAction.featureId}:${resolvedAction.actionId}:${resolvedAction.surfaceId}:${resolvedAction.entrypoint}`
          : undefined,
      }

      if (asChild && isValidElement(children)) {
        return cloneElement(children, {
          ...props,
          ...analyticsProps,
          "aria-busy": loading ? true : ariaBusy,
        })
      }

      return (
        <button
          type="button"
          disabled={disabled || loading}
          aria-busy={loading ? true : ariaBusy}
          {...analyticsProps}
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

/** Activate a supported backup action and confirm its direction when required. */
async function clickWebdavAction(
  actionId:
    | typeof WEBDAV_TARGET_IDS.testConnection
    | typeof WEBDAV_TARGET_IDS.uploadBackup
    | typeof WEBDAV_TARGET_IDS.downloadImport,
) {
  const user = userEvent.setup()
  const action = await waitFor(() => {
    const element = document.getElementById(actionId)
    if (!element) {
      throw new Error(`Unable to find WebDAV action: ${actionId}`)
    }
    return element
  })
  await user.click(action)

  if (
    actionId === WEBDAV_TARGET_IDS.uploadBackup ||
    actionId === WEBDAV_TARGET_IDS.downloadImport
  ) {
    await user.click(
      await screen.findByTestId(
        IMPORT_EXPORT_TEST_IDS.webdavManualConfirmButton,
      ),
    )
  }
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
  await clickWebdavAction(WEBDAV_TARGET_IDS.downloadImport)

  await screen.findByText("importExport:webdav.encryption.decryptDialogTitle")
  mockCompleteProductAnalyticsAction.mockClear()
}

export function setupWebdavSettingsTestHarness() {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, "", "/")
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
    mockUserPreferences.exportPreferencesForBackup.mockImplementation(() =>
      mockUserPreferences.exportPreferences(),
    )
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
    mockCreateCloudSyncBackup.mockResolvedValue({
      provider: "github_gist",
      gistId: "new-gist",
      htmlUrl: "https://gist.github.com/new-gist",
      revision: "gist-revision-1",
    })
    mockDownloadCloudSyncBackup.mockResolvedValue({
      content: '{"version":2,"accounts":[]}',
      remote: {
        provider: "github_gist",
        gistId: "existing-gist",
        revision: "gist-revision-1",
      },
    })
    mockTestCloudSyncConnection.mockImplementation(async (settings: any) =>
      settings.provider === "github_gist"
        ? {
            gistId: "existing-gist",
            htmlUrl: "https://gist.github.com/existing-gist",
            revision: "gist-revision-1",
          }
        : mockTestWebdavConnection(settings),
    )
    mockUploadCloudSyncBackup.mockImplementation(
      async (content: string, settings: any) => {
        if (settings.provider === "github_gist") {
          return {
            provider: "github_gist",
            gistId: "existing-gist",
            revision: "gist-revision-2",
          }
        }
        await mockUploadBackup(content, settings)
        return { provider: "webdav" }
      },
    )
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
  afterEach(() => {
    window.history.replaceState({}, "", "/")
  })
}
export {
  clearWebdavSyncDataSelection,
  clickWebdavAction,
  createStalePreferenceWriteResult,
  ENCRYPTED_BACKUP_ENVELOPE,
  loggerMocks,
  mockAccountStorage,
  mockApiCredentialProfilesStorage,
  mockApplyPreferenceLanguage,
  mockBuildWebdavImportPayloadBySelection,
  mockChannelConfigStorage,
  mockCompleteProductAnalyticsAction,
  mockCreateCloudSyncBackup,
  mockDecryptWebdavBackupEnvelope,
  mockDownloadBackup,
  mockDownloadBackupRaw,
  mockDownloadCloudSyncBackup,
  mockImportFromBackupObject,
  mockIsWebdavFileNotFoundError,
  mockMergeWebdavBackupPayloadBySelection,
  mockParseWebdavBackupJson,
  mockSendWebdavAutoSyncMessage,
  mockStartProductAnalyticsAction,
  mockTagStorage,
  mockTestCloudSyncConnection,
  mockTestWebdavConnection,
  mockTryParseEncryptedWebdavBackupEnvelope,
  mockUploadBackup,
  mockUploadCloudSyncBackup,
  mockUserPreferences,
  openManualDecryptDialog,
  render,
}
