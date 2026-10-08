import { BACKUP_VERSION } from "~/constants/importExport"
import { accountDataTransfer } from "~/services/accounts/accountStorage/accountDataTransfer"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/storage/profiles"
import {
  featureGuidanceState,
  type FeatureGuidanceState,
} from "~/services/featureGuidance/featureGuidanceState"
import { type BackupFullV2 } from "~/services/importExport/backupContracts"
import { ensureLegacyChannelConfigMigrationReady } from "~/services/managedSites/legacyChannelConfigMigration"
import { type UserPreferences } from "~/services/preferences/preferencesSchema"
import { tagStorage } from "~/services/tags/tagStorage"
import { normalizeWebdavOrderedEntryIds } from "~/services/webdav/webdavEntryProjection"
import {
  type AccountStorageConfig,
  type SiteAccount,
  type SiteBookmark,
  type TagStore,
} from "~/types"
import { type ApiCredentialProfilesConfig } from "~/types/apiCredentialProfiles"
import { type ChannelConfigSnapshot } from "~/types/channelConfig"
import {
  CLOUD_SYNC_PROVIDERS,
  isWebdavSyncDataSelectionEmpty,
  resolveWebdavSyncDataSelection,
  type WebDAVSettings,
} from "~/types/webdav"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import { channelConfigStorage } from "../managedSites/channelConfigStorage"
import { userPreferences } from "../preferences/userPreferences"
import {
  downloadCloudSyncBackup,
  getCloudSyncProvider,
  testCloudSyncConnection,
  uploadCloudSyncBackup,
  type CloudSyncRemote,
} from "./cloudSyncService"
import { parseWebdavBackupJson } from "./webdavBackupValidation"
import { mergeWebdavBackupPayloadBySelection } from "./webdavSelectiveSync"
import { isWebdavFileNotFoundError } from "./webdavService"
import { applyWebdavSyncResult } from "./webdavSyncApply"
import { buildWebdavSyncPlan } from "./webdavSyncPlan"

const logger = createLogger("WebdavAutoSync")

/** Read the local backup sections and one settings snapshot for the entire transaction. */
async function collectLocalSyncSnapshot() {
  const preferences = await userPreferences.getPreferences()
  const syncDataSelection = resolveWebdavSyncDataSelection(
    preferences.webdav.syncData,
  )

  if (isWebdavSyncDataSelectionEmpty(syncDataSelection)) {
    throw new Error(t("messages:webdav.syncDataSelectionRequired"))
  }

  await ensureLegacyChannelConfigMigrationReady()

  const [
    localAccountsConfig,
    localTagStore,
    localPreferences,
    localFeatureGuidance,
    localChannelConfigs,
    localApiCredentialProfiles,
  ] = await Promise.all([
    accountDataTransfer.exportData(),
    tagStorage.exportTagStore(),
    userPreferences.exportPreferencesForBackup(),
    featureGuidanceState.getStateStrict(),
    channelConfigStorage.exportConfigs(),
    apiCredentialProfilesStorage.exportConfig(),
  ])

  return {
    preferences,
    syncDataSelection,
    localAccountsConfig,
    localTagStore,
    localPreferences,
    localFeatureGuidance,
    localChannelConfigs,
    localApiCredentialProfiles,
  }
}

/** Package the planned sections using the canonical backup version. */
function buildBackupExportData(input: {
  accounts: SiteAccount[]
  bookmarks: SiteBookmark[]
  pinnedAccountIds: string[]
  orderedAccountIds: string[]
  deletedEntryRecords?: AccountStorageConfig["deletedEntryRecords"]
  tagStore: TagStore
  preferences: UserPreferences
  featureGuidance: FeatureGuidanceState
  channelConfigs: ChannelConfigSnapshot
  apiCredentialProfiles: ApiCredentialProfilesConfig
}): BackupFullV2 {
  return {
    version: BACKUP_VERSION,
    timestamp: Date.now(),
    accounts: {
      accounts: input.accounts,
      bookmarks: input.bookmarks,
      pinnedAccountIds: input.pinnedAccountIds,
      orderedAccountIds: input.orderedAccountIds,
      deletedEntryRecords: input.deletedEntryRecords || {},
      last_updated: Date.now(),
    },
    tagStore: input.tagStore,
    preferences: input.preferences,
    featureGuidance: input.featureGuidance,
    channelConfigs: input.channelConfigs,
    apiCredentialProfiles: input.apiCredentialProfiles,
  }
}

/** Read a revision-aware remote backup, treating only a missing WebDAV file as empty. */
async function downloadRemoteBackupForWrite(settings: WebDAVSettings): Promise<{
  data: BackupFullV2 | null
  remote?: CloudSyncRemote
}> {
  const provider = getCloudSyncProvider(settings)
  try {
    const result = await downloadCloudSyncBackup(settings, {
      prepareForWrite: true,
    })
    const remoteData = parseWebdavBackupJson<BackupFullV2>(result.content, {
      requireBackupShape: true,
    })
    logger.info("成功下载远程数据", { timestamp: remoteData?.timestamp })
    return { data: remoteData, remote: result.remote }
  } catch (error: any) {
    if (
      provider === CLOUD_SYNC_PROVIDERS.WEBDAV &&
      isWebdavFileNotFoundError(error)
    ) {
      logger.info("远程文件不存在，将创建新备份")
      return { data: null }
    }

    throw error
  }
}

/** Upload selected local sections while preserving unselected remote sections. */
export async function uploadLocalCloudSyncSnapshot() {
  const {
    preferences,
    syncDataSelection,
    localAccountsConfig,
    localTagStore,
    localPreferences,
    localFeatureGuidance,
    localChannelConfigs,
    localApiCredentialProfiles,
  } = await collectLocalSyncSnapshot()

  const localAccounts = localAccountsConfig.accounts
  const localBookmarks = localAccountsConfig.bookmarks || []
  const entryIdSet = new Set<string>([
    ...localAccounts.map((account) => account.id),
    ...localBookmarks.map((bookmark) => bookmark.id),
  ])
  const remoteResult = await downloadRemoteBackupForWrite(preferences.webdav)
  const remoteData = remoteResult.data
  const exportData = buildBackupExportData({
    accounts: localAccounts,
    bookmarks: localBookmarks,
    pinnedAccountIds: (localAccountsConfig.pinnedAccountIds || []).filter(
      (id) => entryIdSet.has(id),
    ),
    orderedAccountIds: normalizeWebdavOrderedEntryIds({
      baseOrderedIds: localAccountsConfig.orderedAccountIds || [],
      entryIdSet,
      accounts: localAccounts,
      bookmarks: localBookmarks,
    }),
    deletedEntryRecords: localAccountsConfig.deletedEntryRecords,
    tagStore: localTagStore,
    preferences: localPreferences,
    featureGuidance: localFeatureGuidance,
    channelConfigs: localChannelConfigs,
    apiCredentialProfiles: localApiCredentialProfiles,
  })

  const payload = mergeWebdavBackupPayloadBySelection({
    backup: exportData,
    selection: syncDataSelection,
    remoteBackup: remoteData,
  })

  await uploadCloudSyncBackup(
    JSON.stringify(payload, null, 2),
    preferences.webdav,
    remoteResult.remote?.revision,
  )
  logger.info("本地快照已尽力上传到云端同步服务")
}

/**
 * 同步数据到WebDAV。
 *
 * 流程：
 * 1. 使用当前用户 WebDAV 配置测试连接。
 * 2. 从远程下载备份并通过 normalizeBackupForMerge 按版本规范化
 *    （兼容 V1 旧结构和 V2/V3/V4 扁平结构，未来版本可扩展）。
 *    - 如果远程备份是加密封套（envelope），downloadBackup 会尝试用
 *      当前 WebDAV 加密密码自动解密；缺失/错误密码会导致本次同步失败。
 * 3. 根据 syncStrategy 决定合并方式：
 *    - "merge": 调用 mergeWebdavSyncData 基于时间戳双向合并本地 / 远程账号与偏好设置。
 *    - "upload_only" 或远程无数据：使用本地数据覆盖远程。
 *    - 默认：优先使用远程数据，否则回退到本地。
 * 4. 将合并后的账号和偏好设置写回本地存储，并上传新的备份（始终使用
 *    BACKUP_VERSION 与扁平结构，包含 channelConfigs 快照）。
 *    - uploadBackup 会根据当前 WebDAV 加密开关决定是否将备份加密后上传。
 *
 * Throws when connection fails or merge/upload errors occur.
 */
export async function executeCloudSyncTransaction({
  applyLocal = applyWebdavSyncResult,
}: {
  applyLocal?: typeof applyWebdavSyncResult
} = {}) {
  const {
    preferences,
    syncDataSelection,
    localAccountsConfig,
    localTagStore,
    localPreferences,
    localFeatureGuidance,
    localChannelConfigs,
    localApiCredentialProfiles,
  } = await collectLocalSyncSnapshot()

  const provider = getCloudSyncProvider(preferences.webdav)

  // 测试连接
  try {
    await testCloudSyncConnection(preferences.webdav)
  } catch (error) {
    logger.error("云端同步服务连接失败", error)
    if (provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST) {
      throw error
    }
    throw new Error(t("messages:webdav.connectionFailed", { status: "N/A" }))
  }

  // 下载远程数据
  const remoteResult = await downloadRemoteBackupForWrite(preferences.webdav)
  const remoteData = remoteResult.data

  const plan = buildWebdavSyncPlan(
    {
      preferences,
      syncDataSelection,
      localAccountsConfig,
      localTagStore,
      localPreferences,
      localFeatureGuidance,
      localChannelConfigs,
      localApiCredentialProfiles,
    },
    remoteData,
  )
  const {
    accountsToSave,
    bookmarksToSave,
    tagStoreToSave,
    preferencesToSave,
    apiCredentialProfilesToSave,
    pinnedAccountIdsToSave,
    orderedAccountIdsToSave,
    deletedEntryRecordsToSave,
    featureGuidanceToSave,
    mergeChannelConfigsOnApply,
    shouldWriteLocal,
  } = plan
  let { channelConfigsToSave } = plan
  if (shouldWriteLocal) {
    channelConfigsToSave = await applyLocal({
      syncDataSelection,
      accountsToSave,
      bookmarksToSave,
      deletedEntryRecordsToSave,
      pinnedAccountIdsToSave,
      orderedAccountIdsToSave,
      tagStoreToSave,
      preferencesToSave,
      featureGuidanceToSave,
      channelConfigsToSave,
      mergeChannelConfigsOnApply,
      apiCredentialProfilesToSave,
      localAccountsConfig,
      localTagStore,
      localPreferences,
      localApiCredentialProfiles,
    })
  }

  // 上传到WebDAV
  const exportData = buildBackupExportData({
    accounts: accountsToSave,
    bookmarks: bookmarksToSave,
    pinnedAccountIds: pinnedAccountIdsToSave,
    orderedAccountIds: orderedAccountIdsToSave,
    deletedEntryRecords: deletedEntryRecordsToSave,
    tagStore: tagStoreToSave,
    preferences: preferencesToSave,
    featureGuidance: featureGuidanceToSave,
    channelConfigs: channelConfigsToSave,
    apiCredentialProfiles: apiCredentialProfilesToSave,
  })

  const payload = mergeWebdavBackupPayloadBySelection({
    backup: exportData,
    selection: syncDataSelection,
    remoteBackup: remoteData,
  })

  await uploadCloudSyncBackup(
    JSON.stringify(payload, null, 2),
    preferences.webdav,
    remoteResult.remote?.revision,
  )
  logger.info("数据已上传到云端同步服务")
}
