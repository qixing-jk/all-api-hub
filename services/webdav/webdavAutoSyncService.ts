import { t } from "i18next"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  BACKUP_VERSION,
  normalizeBackupForMerge,
  type BackupFullV2,
} from "~/entrypoints/options/pages/ImportExport/utils"
import {
  apiCredentialProfilesStorage,
  mergeApiCredentialProfilesConfigs,
} from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { migrateAccountTagsData } from "~/services/configMigration/accountTags/accountTagsDataMigration"
import { tagStorage } from "~/services/tags/tagStorage"
import {
  createDefaultTagStore,
  sanitizeTagStore,
} from "~/services/tags/tagStoreUtils"
import type { SiteAccount, SiteBookmark, TagStore } from "~/types"
import {
  API_CREDENTIAL_PROFILES_CONFIG_VERSION,
  type ApiCredentialProfilesConfig,
} from "~/types/apiCredentialProfiles"
import type { ChannelConfigMap } from "~/types/channelConfig"
import { WEBDAV_SYNC_STRATEGIES, WebDAVSettings } from "~/types/webdav"
import {
  clearAlarm,
  createAlarm,
  getAlarm,
  hasAlarmsAPI,
  onAlarm,
  sendRuntimeMessage,
} from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"

import { accountStorage } from "../accountStorage"
import { channelConfigStorage } from "../channelConfigStorage"
import { userPreferences, type UserPreferences } from "../userPreferences"
import {
  downloadBackup,
  testWebdavConnection,
  uploadBackup,
} from "./webdavService"

const logger = createLogger("WebdavAutoSync")

/**
 * Convert the persisted WebDAV sync interval (seconds) to a safe alarms cadence (minutes).
 *
 * Notes:
 * - `browser.alarms` operates in minutes and generally requires >= 1 minute.
 * - The options UI constrains WebDAV interval to [60..86400] seconds in 60s steps, but we still clamp defensively.
 */
function clampWebdavSyncIntervalMinutes(value: unknown): number {
  const seconds = Number(value)
  const safeSeconds = Number.isFinite(seconds) ? seconds : 3600
  const minutes = Math.trunc(safeSeconds / 60)
  return Math.min(24 * 60, Math.max(1, minutes))
}

/**
 * Manages WebDAV auto-sync in the background.
 * Responsibilities:
 * - Reads WebDAV preferences to decide if/when to sync.
 * - Uses WebExtension alarms (MV3-safe) with an isSyncing guard to avoid overlap.
 * - Merges or uploads backups according to user-selected strategy.
 * - Notifies frontends about sync status/results.
 */
class WebdavAutoSyncService {
  static readonly ALARM_NAME = "webdavAutoSync"

  private static normalizeOrderedEntryIds(input: {
    baseOrderedIds: unknown
    entryIdSet: Set<string>
    accounts: SiteAccount[]
    bookmarks: SiteBookmark[]
  }): string[] {
    const rawIds = Array.isArray(input.baseOrderedIds)
      ? input.baseOrderedIds
      : []

    const ordered: string[] = []
    const seen = new Set<string>()

    for (const id of rawIds) {
      if (typeof id !== "string") continue
      if (!input.entryIdSet.has(id)) continue
      if (seen.has(id)) continue
      seen.add(id)
      ordered.push(id)
    }

    const entries = [
      ...input.accounts.map((account) => ({
        id: account.id,
        createdAt: account.created_at || 0,
      })),
      ...input.bookmarks.map((bookmark) => ({
        id: bookmark.id,
        createdAt: bookmark.created_at || 0,
      })),
    ].sort((a, b) => {
      if (a.createdAt !== b.createdAt) {
        return a.createdAt - b.createdAt
      }
      return a.id.localeCompare(b.id)
    })

    for (const entry of entries) {
      if (!input.entryIdSet.has(entry.id)) continue
      if (seen.has(entry.id)) continue
      seen.add(entry.id)
      ordered.push(entry.id)
    }

    const remaining = Array.from(input.entryIdSet)
      .filter((id) => !seen.has(id))
      .sort((a, b) => a.localeCompare(b))

    ordered.push(...remaining)

    return ordered
  }

  private removeAlarmListener: (() => void) | null = null
  private isInitialized = false
  private isSyncing = false
  private isScheduled = false
  private lastSyncTime = 0
  private lastSyncStatus: "success" | "error" | "idle" = "idle"
  private lastSyncError: string | null = null

  /**
   * Initialize auto-sync (idempotent).
   * Loads preferences and starts alarm schedule when enabled.
   *
   * Safe to call multiple times; returns early if already initialized.
   */
  async initialize() {
    if (this.isInitialized) {
      logger.debug("服务已初始化")
      return
    }

    try {
      // Register alarm listener early. In MV3 service workers, timers are unreliable; alarms are the stable scheduler.
      this.removeAlarmListener = onAlarm(async (alarm) => {
        if (alarm.name !== WebdavAutoSyncService.ALARM_NAME) {
          return
        }

        // Await to keep the MV3 service worker alive for the duration of the sync.
        await this.performBackgroundSync()
      })

      await this.setupAutoSync()
      this.isInitialized = true
      logger.info("服务初始化成功")
    } catch (error) {
      logger.error("服务初始化失败", error)
    }
  }

  /**
   * Start or stop auto-sync based on current preferences.
   * Always reconciles the alarms schedule to prevent duplicate schedules.
   *
   * Reads WebDAV creds and interval from user preferences; skips when config
   * is incomplete or disabled.
   */
  async setupAutoSync() {
    try {
      // 获取用户偏好设置
      const preferences = await userPreferences.getPreferences()

      if (!preferences.webdav.autoSync) {
        await clearAlarm(WebdavAutoSyncService.ALARM_NAME)
        this.isScheduled = false
        logger.info("自动同步已关闭")
        return
      }

      // 检查WebDAV配置是否完整；缺失凭据时跳过自动同步
      if (
        !preferences.webdav.url ||
        !preferences.webdav.username ||
        !preferences.webdav.password
      ) {
        await clearAlarm(WebdavAutoSyncService.ALARM_NAME)
        this.isScheduled = false
        logger.warn("WebDAV配置不完整，无法启动自动同步")
        return
      }

      if (!hasAlarmsAPI()) {
        await clearAlarm(WebdavAutoSyncService.ALARM_NAME)
        this.isScheduled = false
        logger.warn("Alarms API not supported; WebDAV auto-sync is disabled")
        return
      }

      const intervalMinutes = clampWebdavSyncIntervalMinutes(
        preferences.webdav.syncInterval,
      )

      // Preserve a matching alarm when possible so background restarts do not shift the schedule.
      const existingAlarm = await getAlarm(WebdavAutoSyncService.ALARM_NAME)
      if (
        existingAlarm &&
        existingAlarm.periodInMinutes != null &&
        Math.abs(existingAlarm.periodInMinutes - intervalMinutes) < 0.001
      ) {
        this.isScheduled = true
        logger.debug("已存在相同周期的 WebDAV 自动同步 alarm，保持不变", {
          periodInMinutes: existingAlarm.periodInMinutes,
          scheduledTime: existingAlarm.scheduledTime
            ? new Date(existingAlarm.scheduledTime)
            : null,
        })
        return
      }

      await clearAlarm(WebdavAutoSyncService.ALARM_NAME)
      await createAlarm(WebdavAutoSyncService.ALARM_NAME, {
        // Match previous setInterval semantics: first run happens after the full interval.
        delayInMinutes: intervalMinutes,
        periodInMinutes: intervalMinutes,
      })

      this.isScheduled = Boolean(
        await getAlarm(WebdavAutoSyncService.ALARM_NAME),
      )

      logger.info("自动同步已启动", {
        schedule: "alarm",
        intervalSeconds: preferences.webdav.syncInterval || 3600,
        intervalMinutes,
      })
    } catch (error) {
      logger.error("设置自动同步失败", error)
    }
  }

  /**
   * Execute a background sync run.
   * Uses isSyncing flag to skip overlapping executions.
   *
   * Updates lastSyncTime/status and notifies frontend listeners.
   */
  private async performBackgroundSync() {
    if (this.isSyncing) {
      logger.debug("同步正在进行中，跳过本次执行")
      return
    }

    this.isSyncing = true
    try {
      logger.info("开始执行后台同步")

      await this.syncWithWebdav()

      this.lastSyncTime = Date.now()
      this.lastSyncStatus = "success"
      this.lastSyncError = null

      logger.info("后台同步完成")

      // 通知前端更新（如果popup是打开的）
      this.notifyFrontend("sync_completed", {
        timestamp: this.lastSyncTime,
      })
    } catch (error) {
      logger.error("后台同步失败", error)
      this.lastSyncStatus = "error"
      this.lastSyncError = getErrorMessage(error)
      this.notifyFrontend("sync_error", { error: getErrorMessage(error) })
    } finally {
      this.isSyncing = false
    }
  }

  /**
   * 同步数据到WebDAV。
   *
   * 流程：
   * 1. 使用当前用户 WebDAV 配置测试连接。
   * 2. 从远程下载备份并通过 normalizeBackupForMerge 按版本规范化
   *    （兼容 V1 旧结构和当前 V2 扁平结构，未来版本可扩展）。
   *    - 如果远程备份是加密封套（envelope），downloadBackup 会尝试用
   *      当前 WebDAV 加密密码自动解密；缺失/错误密码会导致本次同步失败。
   * 3. 根据 syncStrategy 决定合并方式：
   *    - "merge": 调用 mergeData 基于时间戳双向合并本地 / 远程账号与偏好设置。
   *    - "upload_only" 或远程无数据：使用本地数据覆盖远程。
   *    - 默认：优先使用远程数据，否则回退到本地。
   * 4. 将合并后的账号和偏好设置写回本地存储，并上传新的备份（始终使用
   *    BACKUP_VERSION 与扁平结构，包含 channelConfigs 快照）。
   *    - uploadBackup 会根据当前 WebDAV 加密开关决定是否将备份加密后上传。
   *
   * Throws when connection fails or merge/upload errors occur.
   */
  async syncWithWebdav() {
    const preferences = await userPreferences.getPreferences()

    // 测试连接
    try {
      await testWebdavConnection()
    } catch (error) {
      logger.error("WebDAV连接失败", error)
      throw new Error(t("messages:webdav.connectionFailed", { status: "N/A" }))
    }

    // 下载远程数据
    let remoteData: any | null = null

    try {
      const content = await downloadBackup()
      remoteData = JSON.parse(content)
      logger.info("成功下载远程数据", { timestamp: remoteData?.timestamp })
    } catch (error: any) {
      if (error.message?.includes("404") || error.message?.includes("不存在")) {
        logger.info("远程文件不存在，将创建新备份")
        remoteData = null
      } else {
        throw error
      }
    }

    // 获取本地数据（`accountStorage.exportData()` will ensure legacy tags are migrated）
    const [
      localAccountsConfig,
      localTagStore,
      localPreferences,
      localChannelConfigs,
      localApiCredentialProfiles,
    ] = await Promise.all([
      accountStorage.exportData(),
      tagStorage.exportTagStore(),
      userPreferences.exportPreferences(),
      channelConfigStorage.exportConfigs(),
      apiCredentialProfilesStorage.exportConfig(),
    ])

    const localPinnedAccountIds = localAccountsConfig.pinnedAccountIds || []
    const localOrderedAccountIds = localAccountsConfig.orderedAccountIds || []
    const localBookmarks = localAccountsConfig.bookmarks || []

    const normalizedRemote = normalizeBackupForMerge(
      remoteData,
      localPreferences,
    )

    // 决定同步策略
    const strategy =
      preferences.webdav.syncStrategy || WEBDAV_SYNC_STRATEGIES.MERGE

    let accountsToSave: SiteAccount[] = localAccountsConfig.accounts
    let bookmarksToSave: SiteBookmark[] = localBookmarks
    let tagStoreToSave = localTagStore
    let preferencesToSave: UserPreferences = localPreferences
    let channelConfigsToSave: ChannelConfigMap = localChannelConfigs
    let apiCredentialProfilesToSave: ApiCredentialProfilesConfig =
      localApiCredentialProfiles
    let pinnedAccountIdsToSave: string[] = localPinnedAccountIds
    let orderedAccountIdsToSave: string[] = localOrderedAccountIds

    if (strategy === WEBDAV_SYNC_STRATEGIES.MERGE && remoteData) {
      // 合并策略
      const emptyProfiles: ApiCredentialProfilesConfig = {
        version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
        profiles: [],
        lastUpdated: 0,
      }

      const mergeResult = this.mergeData(
        {
          accounts: localAccountsConfig.accounts,
          bookmarks: localBookmarks,
          accountsTimestamp: localAccountsConfig.last_updated,
          tagStore: localTagStore,
          preferences: localPreferences,
          preferencesTimestamp: localPreferences.lastUpdated,
          channelConfigs: localChannelConfigs,
          apiCredentialProfiles: localApiCredentialProfiles,
        },
        {
          accounts: normalizedRemote.accounts,
          bookmarks: normalizedRemote.bookmarks,
          accountsTimestamp: normalizedRemote.accountsTimestamp,
          tagStore: sanitizeTagStore(
            normalizedRemote.tagStore ?? createDefaultTagStore(),
          ),
          preferences: normalizedRemote.preferences || localPreferences,
          preferencesTimestamp:
            (normalizedRemote.preferences &&
              normalizedRemote.preferences.lastUpdated) ||
            0,
          channelConfigs: normalizedRemote.channelConfigs,
          apiCredentialProfiles:
            normalizedRemote.apiCredentialProfiles ?? emptyProfiles,
        },
      )

      accountsToSave = mergeResult.accounts
      bookmarksToSave = mergeResult.bookmarks
      tagStoreToSave = mergeResult.tagStore
      preferencesToSave = mergeResult.preferences
      channelConfigsToSave = mergeResult.channelConfigs
      apiCredentialProfilesToSave = mergeResult.apiCredentialProfiles

      const entryIdSet = new Set<string>([
        ...accountsToSave.map((account) => account.id),
        ...bookmarksToSave.map((bookmark) => bookmark.id),
      ])

      const mergedPinnedIds = [
        ...normalizedRemote.pinnedAccountIds,
        ...localPinnedAccountIds,
      ]
      const seenPinned = new Set<string>()
      const uniqueMergedPinnedIds: string[] = []
      for (const id of mergedPinnedIds) {
        if (!seenPinned.has(id)) {
          seenPinned.add(id)
          uniqueMergedPinnedIds.push(id)
        }
      }
      pinnedAccountIdsToSave = uniqueMergedPinnedIds.filter((id) =>
        entryIdSet.has(id),
      )

      orderedAccountIdsToSave = WebdavAutoSyncService.normalizeOrderedEntryIds({
        baseOrderedIds:
          normalizedRemote.accountsTimestamp > localAccountsConfig.last_updated
            ? normalizedRemote.orderedAccountIds
            : localOrderedAccountIds,
        entryIdSet,
        accounts: accountsToSave,
        bookmarks: bookmarksToSave,
      })
      logger.info("合并完成", { accountCount: accountsToSave.length })
    } else if (strategy === WEBDAV_SYNC_STRATEGIES.UPLOAD_ONLY || !remoteData) {
      // 覆盖策略或远程无数据
      accountsToSave = localAccountsConfig.accounts
      bookmarksToSave = localBookmarks
      tagStoreToSave = localTagStore
      preferencesToSave = localPreferences
      channelConfigsToSave = localChannelConfigs
      apiCredentialProfilesToSave = localApiCredentialProfiles
      {
        const entryIdSet = new Set<string>([
          ...accountsToSave.map((account) => account.id),
          ...bookmarksToSave.map((bookmark) => bookmark.id),
        ])
        pinnedAccountIdsToSave = localPinnedAccountIds.filter((id) =>
          entryIdSet.has(id),
        )
        orderedAccountIdsToSave =
          WebdavAutoSyncService.normalizeOrderedEntryIds({
            baseOrderedIds: localOrderedAccountIds,
            entryIdSet,
            accounts: accountsToSave,
            bookmarks: bookmarksToSave,
          })
      }
      logger.info("使用本地数据覆盖")
    } else if (strategy === WEBDAV_SYNC_STRATEGIES.DOWNLOAD_ONLY) {
      // 远程优先策略：直接使用远程数据（若存在），否则使用本地
      const remoteStore = sanitizeTagStore(
        normalizedRemote.tagStore ?? createDefaultTagStore(),
      )
      const migratedRemote = migrateAccountTagsData({
        accounts: normalizedRemote.accounts as SiteAccount[],
        tagStore: remoteStore,
      })
      accountsToSave = migratedRemote.accounts
      tagStoreToSave = migratedRemote.tagStore
      bookmarksToSave = normalizedRemote.bookmarks as SiteBookmark[]
      preferencesToSave = normalizedRemote.preferences || localPreferences
      channelConfigsToSave =
        normalizedRemote.channelConfigs || localChannelConfigs
      apiCredentialProfilesToSave =
        normalizedRemote.apiCredentialProfiles || localApiCredentialProfiles
      {
        const entryIdSet = new Set<string>([
          ...accountsToSave.map((account) => account.id),
          ...bookmarksToSave.map((bookmark) => bookmark.id),
        ])
        pinnedAccountIdsToSave = normalizedRemote.pinnedAccountIds.filter(
          (id) => entryIdSet.has(id),
        )
        orderedAccountIdsToSave =
          WebdavAutoSyncService.normalizeOrderedEntryIds({
            baseOrderedIds: normalizedRemote.orderedAccountIds,
            entryIdSet,
            accounts: accountsToSave,
            bookmarks: bookmarksToSave,
          })
      }
      logger.info("使用远程数据")
    } else {
      logger.error("无效的同步策略，将中止本次同步", {
        strategy: String(strategy),
      })
      throw new Error(`Invalid WebDAV sync strategy: ${String(strategy)}`)
    }

    // 保存合并后的数据到本地
    await Promise.all([
      accountStorage.importData({
        accounts: accountsToSave,
        pinnedAccountIds: pinnedAccountIdsToSave,
        orderedAccountIds: orderedAccountIdsToSave,
        bookmarks: bookmarksToSave,
      }),
      tagStorage.importTagStore(tagStoreToSave),
      userPreferences.importPreferences(preferencesToSave, {
        preserveWebdav: true,
      }),
      channelConfigStorage.importConfigs(channelConfigsToSave),
      apiCredentialProfilesStorage.importConfig(apiCredentialProfilesToSave),
    ])

    // 上传到WebDAV
    const exportData: BackupFullV2 = {
      version: BACKUP_VERSION,
      timestamp: Date.now(),
      accounts: {
        accounts: accountsToSave,
        bookmarks: bookmarksToSave,
        pinnedAccountIds: pinnedAccountIdsToSave,
        orderedAccountIds: orderedAccountIdsToSave,
        last_updated: Date.now(),
      },
      tagStore: tagStoreToSave,
      preferences: preferencesToSave,
      channelConfigs: channelConfigsToSave,
      apiCredentialProfiles: apiCredentialProfilesToSave,
    }

    await uploadBackup(JSON.stringify(exportData, null, 2))
    logger.info("数据已上传到WebDAV")
  }

  /**
   * Merge local and remote data based on timestamps (latest wins).
   * Also reconciles channel configs and deduplicates pinned ids.
   * @returns Merged accounts, preferences, and channel configs.
   */
  private mergeData(
    local: {
      accounts: SiteAccount[]
      bookmarks: SiteBookmark[]
      accountsTimestamp: number
      tagStore: TagStore
      preferences: UserPreferences
      preferencesTimestamp: number
      channelConfigs: ChannelConfigMap
      apiCredentialProfiles: ApiCredentialProfilesConfig
    },
    remote: {
      accounts: SiteAccount[]
      bookmarks: SiteBookmark[]
      accountsTimestamp: number
      tagStore: TagStore
      preferences: UserPreferences
      preferencesTimestamp: number
      channelConfigs: ChannelConfigMap | null
      apiCredentialProfiles: ApiCredentialProfilesConfig
    },
  ): {
    accounts: SiteAccount[]
    bookmarks: SiteBookmark[]
    tagStore: TagStore
    preferences: UserPreferences
    channelConfigs: ChannelConfigMap
    apiCredentialProfiles: ApiCredentialProfilesConfig
  } {
    logger.debug("开始合并数据", {
      localAccountCount: local.accounts.length,
      remoteAccountCount: remote.accounts.length,
      localBookmarkCount: local.bookmarks.length,
      remoteBookmarkCount: remote.bookmarks.length,
    })

    // Migrate legacy string tags (if any) into tag ids on both sides.
    const localTagStore = sanitizeTagStore(
      local.tagStore ?? createDefaultTagStore(),
    )
    const remoteTagStore = sanitizeTagStore(
      remote.tagStore ?? createDefaultTagStore(),
    )
    const migratedLocal = migrateAccountTagsData({
      accounts: local.accounts,
      tagStore: localTagStore,
    })
    const migratedRemote = migrateAccountTagsData({
      accounts: remote.accounts,
      tagStore: remoteTagStore,
    })

    // Merge tag stores and remap accounts so tag ids always resolve.
    const tagMerge = tagStorage.mergeTagStoresForSync({
      localTagStore: migratedLocal.tagStore,
      remoteTagStore: migratedRemote.tagStore,
      localAccounts: migratedLocal.accounts,
      remoteAccounts: migratedRemote.accounts,
      localBookmarks: local.bookmarks,
      remoteBookmarks: remote.bookmarks,
      localTaggables: local.apiCredentialProfiles.profiles,
      remoteTaggables: remote.apiCredentialProfiles.profiles,
    })

    // 合并账号数据
    const accountMap = new Map<string, SiteAccount>()

    // 首先添加本地账号
    tagMerge.localAccounts.forEach((account) => {
      accountMap.set(account.id, account)
    })

    // 然后处理远程账号（按 updated_at 选择较新版本）
    tagMerge.remoteAccounts.forEach((remoteAccount) => {
      const localAccount = accountMap.get(remoteAccount.id)

      if (!localAccount) {
        // 远程账号在本地不存在，直接添加
        accountMap.set(remoteAccount.id, remoteAccount)
        logger.debug("添加远程账号", {
          accountId: remoteAccount.id,
          siteName: remoteAccount.site_name,
        })
      } else {
        // 账号在两边都存在，比较时间戳
        const localUpdatedAt = localAccount.updated_at || 0
        const remoteUpdatedAt = remoteAccount.updated_at || 0

        if (remoteUpdatedAt > localUpdatedAt) {
          // 远程更新，使用远程数据
          accountMap.set(remoteAccount.id, remoteAccount)
          logger.debug("使用远程账号（远程更新）", {
            accountId: remoteAccount.id,
            siteName: remoteAccount.site_name,
          })
        } else {
          logger.debug("保留本地账号（本地更新）", {
            accountId: localAccount.id,
            siteName: localAccount.site_name,
          })
        }
      }
    })

    const mergedAccounts = Array.from(accountMap.values())

    const bookmarkMap = new Map<string, SiteBookmark>()
    tagMerge.localBookmarks.forEach((bookmark) => {
      bookmarkMap.set(bookmark.id, bookmark)
    })

    tagMerge.remoteBookmarks.forEach((remoteBookmark) => {
      const localBookmark = bookmarkMap.get(remoteBookmark.id)
      if (!localBookmark) {
        bookmarkMap.set(remoteBookmark.id, remoteBookmark)
        return
      }

      const localUpdatedAt = localBookmark.updated_at || 0
      const remoteUpdatedAt = remoteBookmark.updated_at || 0
      if (remoteUpdatedAt > localUpdatedAt) {
        bookmarkMap.set(remoteBookmark.id, remoteBookmark)
      }
    })

    const mergedBookmarks = Array.from(bookmarkMap.values())

    const apiCredentialProfiles = mergeApiCredentialProfilesConfigs({
      local: {
        ...local.apiCredentialProfiles,
        profiles: tagMerge.localTaggables,
      },
      incoming: {
        ...remote.apiCredentialProfiles,
        profiles: tagMerge.remoteTaggables,
      },
    })

    // 合并偏好设置
    // 比较lastUpdated字段，保留最新的
    const preferences =
      remote.preferencesTimestamp > local.preferencesTimestamp
        ? remote.preferences
        : local.preferences

    // 合并通道配置
    const localChannelConfigs = local.channelConfigs
    const remoteChannelConfigs = remote.channelConfigs
    const mergedChannelConfigs: ChannelConfigMap = { ...localChannelConfigs }

    if (remoteChannelConfigs && typeof remoteChannelConfigs === "object") {
      for (const [key, value] of Object.entries(remoteChannelConfigs)) {
        const channelId = Number(key)
        if (!Number.isFinite(channelId) || channelId <= 0) {
          continue
        }

        const localConfig = localChannelConfigs[channelId]
        const remoteConfig = value as ChannelConfigMap[number]

        if (!localConfig) {
          mergedChannelConfigs[channelId] = remoteConfig
        } else {
          const localUpdatedAt =
            typeof localConfig.updatedAt === "number"
              ? localConfig.updatedAt
              : 0
          const remoteUpdatedAt =
            typeof remoteConfig.updatedAt === "number"
              ? remoteConfig.updatedAt
              : 0

          mergedChannelConfigs[channelId] =
            remoteUpdatedAt > localUpdatedAt ? remoteConfig : localConfig
        }
      }
    }

    logger.info("合并完成", {
      accountCount: mergedAccounts.length,
      preferencesSource:
        remote.preferencesTimestamp > local.preferencesTimestamp
          ? "remote"
          : "local",
      channelConfigCount: Object.keys(mergedChannelConfigs).length,
    })

    return {
      accounts: mergedAccounts,
      bookmarks: mergedBookmarks,
      tagStore: tagMerge.tagStore,
      preferences,
      channelConfigs: mergedChannelConfigs,
      apiCredentialProfiles,
    }
  }

  /**
   * 立即执行一次同步
   * @returns Result with success flag and optional message.
   */
  async syncNow(): Promise<{ success: boolean; message?: string }> {
    if (this.isSyncing) {
      return {
        success: false,
        message: "同步正在进行中，请稍后再试",
      }
    }

    try {
      logger.info("执行立即同步")
      await this.syncWithWebdav()
      this.lastSyncTime = Date.now()
      this.lastSyncStatus = "success"
      this.lastSyncError = null
      logger.info("立即同步完成")
      return {
        success: true,
        message: "同步成功",
      }
    } catch (error) {
      logger.error("立即同步失败", error)
      this.lastSyncStatus = "error"
      this.lastSyncError = getErrorMessage(error)
      return {
        success: false,
        message: getErrorMessage(error),
      }
    }
  }

  /**
   * 停止自动同步
   *
   * Clears the scheduled alarm; idempotent.
   */
  async stopAutoSync() {
    const cleared = await clearAlarm(WebdavAutoSyncService.ALARM_NAME)
    this.isScheduled = false

    if (cleared) {
      logger.info("自动同步已停止")
    } else {
      logger.info("自动同步未运行或已停止")
    }
  }

  /**
   * 更新同步设置
   *
   * Persists partial webdav settings and reconfigures scheduler.
   */
  async updateSettings(settings: {
    autoSync?: boolean
    syncInterval?: number
    syncStrategy?: WebDAVSettings["syncStrategy"]
  }) {
    try {
      // Update the nested webdav object
      await userPreferences.savePreferences({
        webdav: settings,
      })
      await this.setupAutoSync() // 重新设置调度（alarm）
      logger.info("设置已更新", settings)
    } catch (error) {
      logger.error("更新设置失败", error)
    }
  }

  /**
   * 获取当前状态
   * @returns Snapshot of initialization, running, and last-sync info.
   */
  getStatus() {
    return {
      isRunning: this.isScheduled,
      isInitialized: this.isInitialized,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      lastSyncStatus: this.lastSyncStatus,
      lastSyncError: this.lastSyncError,
    }
  }

  /**
   * Notify frontends about sync status updates.
   * Silently ignores missing receivers (popup/options may be closed).
   *
   * Best-effort; errors are logged and swallowed to avoid breaking sync loop.
   */
  private notifyFrontend(type: string, data: any) {
    try {
      // 向所有连接的客户端发送消息
      void sendRuntimeMessage(
        {
          type: "WEBDAV_AUTO_SYNC_UPDATE",
          payload: { type, data },
        },
        { maxAttempts: 1 },
      ).catch((error) => {
        const errorMessage = getErrorMessage(error)

        // 静默处理"没有接收者"的错误（popup可能没打开）
        if (
          /Receiving end does not exist/i.test(errorMessage) ||
          /Could not establish connection/i.test(errorMessage)
        ) {
          logger.debug("前端未打开，跳过通知")
          return
        }

        logger.warn("通知前端失败", error)
      })
    } catch (error) {
      // 静默处理错误，避免影响后台同步
      logger.warn("发送消息异常，可能前端未打开", error)
    }
  }

  /**
   * 销毁服务
   */
  destroy() {
    void this.stopAutoSync()
    this.removeAlarmListener?.()
    this.removeAlarmListener = null
    this.isInitialized = false
    logger.info("服务已销毁")
  }
}

// 创建单例实例
export const webdavAutoSyncService = new WebdavAutoSyncService()

/**
 * Message handler for WebDAV auto-sync actions (setup, syncNow, stop, update).
 * @param request Incoming message with action + payload.
 * @param sendResponse Callback to respond to sender.
 */
export const handleWebdavAutoSyncMessage = async (
  request: any,
  sendResponse: (response: any) => void,
) => {
  try {
    switch (request.action) {
      case RuntimeActionIds.WebdavAutoSyncSetup:
        await webdavAutoSyncService.setupAutoSync()
        sendResponse({ success: true })
        break

      case RuntimeActionIds.WebdavAutoSyncSyncNow: {
        const result = await webdavAutoSyncService.syncNow()
        sendResponse({ success: result.success, message: result.message })
        break
      }

      case RuntimeActionIds.WebdavAutoSyncStop:
        await webdavAutoSyncService.stopAutoSync()
        sendResponse({ success: true })
        break

      case RuntimeActionIds.WebdavAutoSyncUpdateSettings: {
        await webdavAutoSyncService.updateSettings(request.settings)
        sendResponse({ success: true })
        break
      }

      case RuntimeActionIds.WebdavAutoSyncGetStatus: {
        const status = webdavAutoSyncService.getStatus()
        sendResponse({ success: true, data: status })
        break
      }

      default:
        sendResponse({ success: false, error: "未知的操作" })
    }
  } catch (error) {
    logger.error("处理消息失败", error)
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}
