import {
  mergeFeatureGuidanceStates,
  type FeatureGuidanceState,
} from "~/services/featureGuidance/featureGuidanceState"
import { normalizeBackupForMerge } from "~/services/importExport/backupCodec"
import type { RawBackupData } from "~/services/importExport/backupContracts"
import { type UserPreferences } from "~/services/preferences/preferencesSchema"
import {
  getSharedPreferencesLastUpdated,
  restoreWebdavLocalOnlyPreferences,
} from "~/services/preferences/webdavSharedPreferences"
import { migrateAccountTagsData } from "~/services/tags/migrations/accountTagsDataMigration"
import { tagStorage } from "~/services/tags/tagStorage"
import {
  createDefaultTagStore,
  sanitizeTagStore,
} from "~/services/tags/tagStoreUtils"
import { detectWebdavBackupPresence } from "~/services/webdav/webdavBackupFacts"
import { normalizeWebdavOrderedEntryIds } from "~/services/webdav/webdavEntryProjection"
import {
  type AccountStorageConfig,
  type SiteAccount,
  type SiteBookmark,
  type TagStore,
} from "~/types"
import {
  API_CREDENTIAL_PROFILES_CONFIG_VERSION,
  type ApiCredentialProfilesConfig,
} from "~/types/apiCredentialProfiles"
import {
  CHANNEL_CONFIG_SNAPSHOT_VERSION,
  type ChannelConfigSnapshot,
} from "~/types/channelConfig"
import type { WebDAVSyncDataSelection } from "~/types/webdav"
import { WEBDAV_SYNC_STRATEGIES } from "~/types/webdav"
import { createLogger } from "~/utils/core/logger"

import { mergeWebdavSyncData } from "./webdavSyncMerge"

const logger = createLogger("WebdavAutoSync")

export type WebdavSyncSnapshot = {
  preferences: UserPreferences
  syncDataSelection: WebDAVSyncDataSelection
  localAccountsConfig: AccountStorageConfig
  localTagStore: TagStore
  localPreferences: UserPreferences
  localFeatureGuidance: FeatureGuidanceState
  localChannelConfigs: ChannelConfigSnapshot
  localApiCredentialProfiles: ApiCredentialProfilesConfig
}

/** Compute selected-domain merge and restore facts before performing storage writes. */
export function buildWebdavSyncPlan(
  snapshot: WebdavSyncSnapshot,
  remoteData: RawBackupData | null,
) {
  const {
    preferences,
    syncDataSelection,
    localAccountsConfig,
    localTagStore,
    localPreferences,
    localFeatureGuidance,
    localChannelConfigs,
    localApiCredentialProfiles,
  } = snapshot
  const localPinnedAccountIds = localAccountsConfig.pinnedAccountIds || []
  const localOrderedAccountIds = localAccountsConfig.orderedAccountIds || []
  const localBookmarks = localAccountsConfig.bookmarks || []

  const remotePresence = detectWebdavBackupPresence(remoteData)
  const normalizedRemote = normalizeBackupForMerge(remoteData, localPreferences)
  const remotePreferences =
    remotePresence.hasPreferences && normalizedRemote.preferences
      ? restoreWebdavLocalOnlyPreferences(
          normalizedRemote.preferences as UserPreferences,
          localPreferences,
        )
      : localPreferences

  // 决定同步策略
  const strategy =
    preferences.webdav.syncStrategy || WEBDAV_SYNC_STRATEGIES.MERGE
  const featureGuidanceToSave =
    remoteData &&
    syncDataSelection.preferences &&
    strategy !== WEBDAV_SYNC_STRATEGIES.UPLOAD_ONLY
      ? mergeFeatureGuidanceStates(
          localFeatureGuidance,
          normalizedRemote.featureGuidance,
        )
      : localFeatureGuidance
  // An absent remote section contributes no incoming configs. The atomic
  // merge reads the latest local state, including concurrent deletions.
  const incomingChannelConfigs =
    remotePresence.hasChannelConfigs && normalizedRemote.channelConfigs
      ? normalizedRemote.channelConfigs
      : { schemaVersion: CHANNEL_CONFIG_SNAPSHOT_VERSION, configs: {} }
  const mergeChannelConfigsOnApply =
    strategy === WEBDAV_SYNC_STRATEGIES.MERGE ||
    !remotePresence.hasChannelConfigs

  const emptyProfiles: ApiCredentialProfilesConfig = {
    version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
    profiles: [],
    links: [],
    linkTombstones: [],
    lastUpdated: 0,
  }

  let accountsToSave: SiteAccount[] = localAccountsConfig.accounts
  let bookmarksToSave: SiteBookmark[] = localBookmarks
  let tagStoreToSave = localTagStore
  let preferencesToSave: UserPreferences = localPreferences
  let channelConfigsToSave: ChannelConfigSnapshot = localChannelConfigs
  let apiCredentialProfilesToSave: ApiCredentialProfilesConfig =
    localApiCredentialProfiles
  let pinnedAccountIdsToSave: string[] = localPinnedAccountIds
  let orderedAccountIdsToSave: string[] = localOrderedAccountIds
  let deletedEntryRecordsToSave = localAccountsConfig.deletedEntryRecords

  if (strategy === WEBDAV_SYNC_STRATEGIES.MERGE && remoteData) {
    // 合并策略
    const remotePreferencesTimestamp = remotePresence.hasPreferences
      ? getSharedPreferencesLastUpdated(normalizedRemote.preferences as any)
      : 0

    const mergeResult = mergeWebdavSyncData(
      {
        accounts: localAccountsConfig.accounts,
        bookmarks: localBookmarks,
        deletedEntryRecords: localAccountsConfig.deletedEntryRecords,
        accountsTimestamp: localAccountsConfig.last_updated,
        tagStore: localTagStore,
        preferences: localPreferences,
        preferencesTimestamp: getSharedPreferencesLastUpdated(localPreferences),
        apiCredentialProfiles: localApiCredentialProfiles,
      },
      {
        accounts: normalizedRemote.accounts,
        bookmarks: normalizedRemote.bookmarks,
        deletedEntryRecords: normalizedRemote.deletedEntryRecords,
        accountsTimestamp: normalizedRemote.accountsTimestamp,
        tagStore: sanitizeTagStore(
          normalizedRemote.tagStore ?? createDefaultTagStore(),
        ),
        preferences: remotePreferences,
        preferencesTimestamp: remotePreferencesTimestamp,
        apiCredentialProfiles:
          (remotePresence.hasApiCredentialProfiles &&
            normalizedRemote.apiCredentialProfiles) ||
          emptyProfiles,
      },
      syncDataSelection,
    )

    accountsToSave = mergeResult.accounts
    bookmarksToSave = mergeResult.bookmarks
    tagStoreToSave = mergeResult.tagStore
    preferencesToSave = mergeResult.preferences
    // Atomic merge must receive only remote incoming data. Including the
    // startup-time local snapshot could resurrect entries deleted meanwhile.
    channelConfigsToSave = incomingChannelConfigs
    apiCredentialProfilesToSave = mergeResult.apiCredentialProfiles
    deletedEntryRecordsToSave = mergeResult.deletedEntryRecords

    const entryIdSet = new Set<string>([
      ...accountsToSave.map((account) => account.id),
      ...bookmarksToSave.map((bookmark) => bookmark.id),
    ])

    if (syncDataSelection.accounts || syncDataSelection.bookmarks) {
      const selectedIdSet = new Set<string>([
        ...(syncDataSelection.accounts
          ? accountsToSave.map((account) => account.id)
          : []),
        ...(syncDataSelection.bookmarks
          ? bookmarksToSave.map((bookmark) => bookmark.id)
          : []),
      ])

      const remotePinnedIds = remotePresence.hasPinnedAccountIds
        ? normalizedRemote.pinnedAccountIds
        : []

      const mergedPinnedIds = [
        ...remotePinnedIds.filter((id) => selectedIdSet.has(id)),
        ...localPinnedAccountIds.filter((id) => selectedIdSet.has(id)),
      ]
      const seenPinned = new Set<string>()
      const pinnedSelected: string[] = []
      for (const id of mergedPinnedIds) {
        if (seenPinned.has(id)) continue
        seenPinned.add(id)
        pinnedSelected.push(id)
      }

      const pinnedUnselected = localPinnedAccountIds.filter(
        (id) => !selectedIdSet.has(id),
      )

      pinnedAccountIdsToSave = [...pinnedSelected, ...pinnedUnselected].filter(
        (id) => entryIdSet.has(id),
      )

      const selectedOrderSource =
        remotePresence.hasOrderedAccountIds &&
        normalizedRemote.accountsTimestamp > localAccountsConfig.last_updated
          ? normalizedRemote.orderedAccountIds
          : localOrderedAccountIds

      const baseOrderedIds = [
        ...selectedOrderSource.filter((id) => selectedIdSet.has(id)),
        ...localOrderedAccountIds.filter((id) => !selectedIdSet.has(id)),
      ]

      orderedAccountIdsToSave = normalizeWebdavOrderedEntryIds({
        baseOrderedIds,
        entryIdSet,
        accounts: accountsToSave,
        bookmarks: bookmarksToSave,
      })
    }
    logger.info("合并完成", { accountCount: accountsToSave.length })
  } else if (strategy === WEBDAV_SYNC_STRATEGIES.DOWNLOAD_ONLY && remoteData) {
    // 远程优先策略：仅对选中的数据域应用远程数据；缺失的远程 section 不会覆盖本地
    const remoteStore = sanitizeTagStore(
      normalizedRemote.tagStore ?? createDefaultTagStore(),
    )
    const localStore = sanitizeTagStore(
      localTagStore ?? createDefaultTagStore(),
    )

    const migratedLocal = migrateAccountTagsData({
      accounts: localAccountsConfig.accounts,
      tagStore: localStore,
    })
    const migratedRemote = migrateAccountTagsData({
      accounts: normalizedRemote.accounts as SiteAccount[],
      tagStore: remoteStore,
    })

    const remoteApiCredentialProfilesForTags =
      normalizedRemote.apiCredentialProfiles ?? emptyProfiles

    const tagMerge = tagStorage.mergeTagStoresForSync({
      localTagStore: migratedLocal.tagStore,
      remoteTagStore: migratedRemote.tagStore,
      localAccounts: migratedLocal.accounts,
      remoteAccounts: migratedRemote.accounts,
      localBookmarks,
      remoteBookmarks: normalizedRemote.bookmarks as SiteBookmark[],
      localTaggables: localApiCredentialProfiles.profiles,
      remoteTaggables: remoteApiCredentialProfilesForTags.profiles,
    })

    const useRemoteAccounts =
      syncDataSelection.accounts && remotePresence.hasAccountsList
    const useRemoteBookmarks =
      syncDataSelection.bookmarks && remotePresence.hasBookmarksList

    accountsToSave = useRemoteAccounts
      ? tagMerge.remoteAccounts
      : tagMerge.localAccounts
    bookmarksToSave = useRemoteBookmarks
      ? tagMerge.remoteBookmarks
      : tagMerge.localBookmarks

    tagStoreToSave =
      syncDataSelection.accounts ||
      syncDataSelection.bookmarks ||
      syncDataSelection.apiCredentialProfiles
        ? tagMerge.tagStore
        : localTagStore

    preferencesToSave =
      syncDataSelection.preferences && remotePresence.hasPreferences
        ? remotePreferences
        : localPreferences

    channelConfigsToSave = incomingChannelConfigs

    apiCredentialProfilesToSave =
      syncDataSelection.apiCredentialProfiles &&
      remotePresence.hasApiCredentialProfiles &&
      normalizedRemote.apiCredentialProfiles
        ? {
            ...normalizedRemote.apiCredentialProfiles,
            profiles: tagMerge.remoteTaggables,
          }
        : localApiCredentialProfiles

    {
      const entryIdSet = new Set<string>([
        ...accountsToSave.map((account) => account.id),
        ...bookmarksToSave.map((bookmark) => bookmark.id),
      ])

      const selectedIdSet = new Set<string>([
        ...(useRemoteAccounts
          ? accountsToSave.map((account) => account.id)
          : []),
        ...(useRemoteBookmarks
          ? bookmarksToSave.map((bookmark) => bookmark.id)
          : []),
      ])

      const remotePinnedIds = remotePresence.hasPinnedAccountIds
        ? normalizedRemote.pinnedAccountIds
        : []
      const remoteOrderedIds = remotePresence.hasOrderedAccountIds
        ? normalizedRemote.orderedAccountIds
        : []

      if (remotePresence.hasPinnedAccountIds) {
        const mergedPinnedIds = [
          ...remotePinnedIds.filter((id) => selectedIdSet.has(id)),
          ...localPinnedAccountIds.filter((id) => !selectedIdSet.has(id)),
        ]
        const seenPinned = new Set<string>()
        const uniquePinnedIds: string[] = []
        for (const id of mergedPinnedIds) {
          if (seenPinned.has(id)) continue
          seenPinned.add(id)
          uniquePinnedIds.push(id)
        }
        pinnedAccountIdsToSave = uniquePinnedIds.filter((id) =>
          entryIdSet.has(id),
        )
      } else {
        pinnedAccountIdsToSave = localPinnedAccountIds.filter((id) =>
          entryIdSet.has(id),
        )
      }

      const baseOrderedIds = remotePresence.hasOrderedAccountIds
        ? [
            ...remoteOrderedIds.filter((id) => selectedIdSet.has(id)),
            ...localOrderedAccountIds.filter((id) => !selectedIdSet.has(id)),
          ]
        : localOrderedAccountIds

      orderedAccountIdsToSave = normalizeWebdavOrderedEntryIds({
        baseOrderedIds,
        entryIdSet,
        accounts: accountsToSave,
        bookmarks: bookmarksToSave,
      })
    }

    logger.info("使用远程数据（已应用选择）")
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
      orderedAccountIdsToSave = normalizeWebdavOrderedEntryIds({
        baseOrderedIds: localOrderedAccountIds,
        entryIdSet,
        accounts: accountsToSave,
        bookmarks: bookmarksToSave,
      })
    }
    logger.info("使用本地数据覆盖")
  } else {
    logger.error("无效的同步策略，将中止本次同步", {
      strategy: String(strategy),
    })
    throw new Error(`Invalid WebDAV sync strategy: ${String(strategy)}`)
  }

  const shouldWriteLocal =
    Boolean(remoteData) && strategy !== WEBDAV_SYNC_STRATEGIES.UPLOAD_ONLY

  return {
    accountsToSave,
    bookmarksToSave,
    tagStoreToSave,
    preferencesToSave,
    channelConfigsToSave,
    apiCredentialProfilesToSave,
    pinnedAccountIdsToSave,
    orderedAccountIdsToSave,
    deletedEntryRecordsToSave,
    featureGuidanceToSave,
    mergeChannelConfigsOnApply,
    shouldWriteLocal,
  }
}
