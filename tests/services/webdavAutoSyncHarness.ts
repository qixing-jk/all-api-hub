import { vi } from "vitest"

vi.mock("~/services/managedSites/legacyChannelConfigMigration", () => ({
  ensureLegacyChannelConfigMigrationReady: vi.fn().mockResolvedValue(undefined),
}))

const mockFeatureGuidanceGetStateStrict = vi
  .fn()
  .mockImplementation(async () => ({
    schemaVersion: 1,
    productTour: {},
    gatewayGuidance: { dismissedAtBySurface: {} },
  }))
const mockEnsureLegacyFeatureGuidanceMigration = vi
  .fn()
  .mockResolvedValue(undefined)
const mockFeatureGuidanceTransaction = vi
  .fn()
  .mockImplementation(async (_incoming, work: () => Promise<unknown>) => work())

vi.mock(
  import("~/services/featureGuidance/featureGuidanceState"),
  async (importOriginal) => {
    const actual = await importOriginal()
    Object.assign(actual.featureGuidanceState, {
      ensureLegacyPreferenceMigration: (...args: any[]) =>
        mockEnsureLegacyFeatureGuidanceMigration(...args),
      getStateStrict: (...args: any[]) =>
        mockFeatureGuidanceGetStateStrict(...args),
      withMergedStateTransaction: (...args: any[]) =>
        mockFeatureGuidanceTransaction(...args),
    })
    return {
      ...actual,
      featureGuidanceState: actual.featureGuidanceState,
    }
  },
)

// Basic getErrorMessage passthrough to avoid noisy output
vi.mock("~/utils/core/error", () => ({
  getErrorMessage: (e: unknown) => String(e),
}))

const mockHasAlarmsAPI = vi.fn()
const mockGetAlarm = vi.fn()
const mockCreateAlarm = vi.fn()
const mockClearAlarm = vi.fn()
const mockOnAlarm = vi.fn()

vi.mock(import("~/utils/browser/browserApi"), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    hasAlarmsAPI: (...args: any[]) => mockHasAlarmsAPI(...args),
    getAlarm: (...args: any[]) => mockGetAlarm(...args),
    createAlarm: (...args: any[]) => mockCreateAlarm(...args),
    clearAlarm: (...args: any[]) => mockClearAlarm(...args),
    onAlarm: (...args: any[]) => mockOnAlarm(...args),
  }
})

const mockGetPreferences = vi.fn()
const mockSavePreferences = vi.fn()
const mockExportPreferences = vi.fn()
const mockExportPreferencesForBackup = vi.fn()
const mockImportPreferences = vi.fn()

mockExportPreferencesForBackup.mockImplementation(() => mockExportPreferences())

const preferenceWriteSuccess = () => ({
  ok: true,
  preferences: {},
})

const preferenceWriteFailure = () => ({
  ok: false,
  reason: {
    type: "storage-error",
    error: new Error("Failed to import WebDAV preferences"),
  },
})

vi.mock(
  import("~/services/preferences/userPreferences"),
  async (importOriginal) => {
    const actual = await importOriginal()
    Object.assign(actual.userPreferences, {
      getPreferences: (...args: any[]) => mockGetPreferences(...args),
      savePreferences: (...args: any[]) => mockSavePreferences(...args),
      exportPreferences: (...args: any[]) => mockExportPreferences(...args),
      exportPreferencesForBackup: (...args: any[]) =>
        mockExportPreferencesForBackup(...args),
      importPreferences: (...args: any[]) => mockImportPreferences(...args),
    })
    return {
      ...actual,
      userPreferences: actual.userPreferences,
    }
  },
)

const mockAccountStorageExportData = vi.fn()
const mockAccountStorageImportData = vi.fn()
vi.mock("~/services/accounts/accountStorage/accountDataTransfer", () => ({
  accountDataTransfer: {
    exportData: (...args: any[]) => mockAccountStorageExportData(...args),
    importData: (...args: any[]) => mockAccountStorageImportData(...args),
  },
}))

const mockChannelConfigExport = vi.fn()
const mockChannelConfigImport = vi.fn()
const mockChannelConfigMerge = vi.fn()
vi.mock(
  import("~/services/managedSites/channelConfigStorage"),
  async (importOriginal) => {
    const actual = await importOriginal()
    return {
      ...actual,
      channelConfigStorage: {
        exportConfigs: (...args: any[]) => mockChannelConfigExport(...args),
        importConfigs: (...args: any[]) => mockChannelConfigImport(...args),
        mergeConfigs: (...args: any[]) => mockChannelConfigMerge(...args),
      } as unknown as typeof actual.channelConfigStorage,
    }
  },
)

const mockApiCredentialProfilesExport = vi.fn()
const mockApiCredentialProfilesImport = vi.fn()
vi.mock(
  import("~/services/apiCredentialProfiles/apiCredentialProfilesStorage"),
  async (importOriginal) => {
    const actual = await importOriginal()
    Object.assign(actual.apiCredentialProfilesStorage, {
      exportConfig: (...args: any[]) =>
        mockApiCredentialProfilesExport(...args),
      importConfig: (...args: any[]) =>
        mockApiCredentialProfilesImport(...args),
    })
    return {
      ...actual,
      apiCredentialProfilesStorage: actual.apiCredentialProfilesStorage,
    }
  },
)

const mockTagStoreExport = vi.fn()
const mockTagStoreImport = vi.fn()
vi.mock("~/services/tags/tagStorage", () => ({
  tagStorage: {
    // mergeData only needs this pure helper; tests not concerned with tag semantics.
    mergeTagStoresForSync: (input: any) => ({
      tagStore: input.localTagStore,
      localAccounts: input.localAccounts,
      remoteAccounts: input.remoteAccounts,
      localBookmarks: input.localBookmarks ?? [],
      remoteBookmarks: input.remoteBookmarks ?? [],
      localTaggables: input.localTaggables ?? [],
      remoteTaggables: input.remoteTaggables ?? [],
    }),
    exportTagStore: (...args: any[]) => mockTagStoreExport(...args),
    importTagStore: (...args: any[]) => mockTagStoreImport(...args),
  },
}))

// Mock WebDAV network helpers so syncWithWebdav can be tested in isolation if needed
const mockTestConnection = vi.fn()
const mockDownloadBackup = vi.fn()
const mockUploadBackup = vi.fn()
const mockParseWebdavBackupJson = vi.fn()

vi.mock("~/services/webdav/webdavService", () => ({
  testWebdavConnection: (...args: any[]) => mockTestConnection(...args),
  downloadBackup: (...args: any[]) => mockDownloadBackup(...args),
  parseWebdavBackupJson: (...args: any[]) => mockParseWebdavBackupJson(...args),
  isWebdavFileNotFoundError: (error: any) =>
    error?.code === "WEBDAV_FILE_NOT_FOUND",
  uploadBackup: (...args: any[]) => mockUploadBackup(...args),
}))

export {
  mockAccountStorageExportData,
  mockAccountStorageImportData,
  mockApiCredentialProfilesExport,
  mockApiCredentialProfilesImport,
  mockChannelConfigExport,
  mockChannelConfigImport,
  mockChannelConfigMerge,
  mockClearAlarm,
  mockCreateAlarm,
  mockDownloadBackup,
  mockEnsureLegacyFeatureGuidanceMigration,
  mockExportPreferences,
  mockExportPreferencesForBackup,
  mockFeatureGuidanceGetStateStrict,
  mockFeatureGuidanceTransaction,
  mockGetAlarm,
  mockGetPreferences,
  mockHasAlarmsAPI,
  mockImportPreferences,
  mockOnAlarm,
  mockParseWebdavBackupJson,
  mockSavePreferences,
  mockTagStoreExport,
  mockTagStoreImport,
  mockTestConnection,
  mockUploadBackup,
  preferenceWriteFailure,
  preferenceWriteSuccess,
}
