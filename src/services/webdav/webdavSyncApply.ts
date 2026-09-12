import { accountDataTransfer } from "~/services/accounts/accountStorage/accountDataTransfer"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import {
  featureGuidanceState,
  type FeatureGuidanceState,
} from "~/services/featureGuidance/featureGuidanceState"
import { tagStorage } from "~/services/tags/tagStorage"
import {
  type AccountStorageConfig,
  type SiteAccount,
  type SiteBookmark,
  type TagStore,
} from "~/types"
import { type ApiCredentialProfilesConfig } from "~/types/apiCredentialProfiles"
import { type ChannelConfigSnapshot } from "~/types/channelConfig"
import { type WebDAVSyncDataSelection } from "~/types/webdav"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { STORAGE_LOCKS } from "../core/storageKeys"
import { withExtensionStorageWriteLock } from "../core/storageWriteLock"
import { channelConfigStorage } from "../managedSites/channelConfigStorage"
import {
  userPreferences,
  type UserPreferences,
} from "../preferences/userPreferences"

const logger = createLogger("WebdavAutoSync")

/** Turn rejected preference writes into transaction failures so prior writes are rolled back. */
async function importPreferencesOrThrow(preferences: UserPreferences) {
  const writeResult = await userPreferences.importPreferences(preferences, {
    preserveWebdav: true,
  })

  if (!writeResult.ok) {
    throw new Error(
      writeResult.reason.type === "storage-error"
        ? getErrorMessage(writeResult.reason.error)
        : "Failed to import WebDAV preferences",
    )
  }
}

/** Commit selected storage domains in order and roll back completed writes on failure. */
export async function applyWebdavSyncResult(input: {
  syncDataSelection: WebDAVSyncDataSelection
  accountsToSave: SiteAccount[]
  bookmarksToSave: SiteBookmark[]
  deletedEntryRecordsToSave?: AccountStorageConfig["deletedEntryRecords"]
  pinnedAccountIdsToSave: string[]
  orderedAccountIdsToSave: string[]
  tagStoreToSave: TagStore
  preferencesToSave: UserPreferences
  featureGuidanceToSave: FeatureGuidanceState
  channelConfigsToSave: ChannelConfigSnapshot
  mergeChannelConfigsOnApply: boolean
  apiCredentialProfilesToSave: ApiCredentialProfilesConfig
  localAccountsConfig: {
    accounts: SiteAccount[]
    bookmarks?: SiteBookmark[]
    pinnedAccountIds?: string[]
    orderedAccountIds?: string[]
    deletedEntryRecords?: AccountStorageConfig["deletedEntryRecords"]
  }
  localTagStore: TagStore
  localPreferences: UserPreferences
  localApiCredentialProfiles: ApiCredentialProfilesConfig
}) {
  const rollbackSteps: Array<() => Promise<void>> = []

  return await withExtensionStorageWriteLock(
    STORAGE_LOCKS.WEBDAV_SYNC_APPLY,
    async () => {
      try {
        if (
          input.syncDataSelection.accounts ||
          input.syncDataSelection.bookmarks
        ) {
          await accountDataTransfer.importData({
            accounts: input.accountsToSave,
            pinnedAccountIds: input.pinnedAccountIdsToSave,
            orderedAccountIds: input.orderedAccountIdsToSave,
            bookmarks: input.bookmarksToSave,
            deletedEntryRecords: input.deletedEntryRecordsToSave,
          })

          rollbackSteps.push(async () => {
            await accountDataTransfer.importData({
              accounts: input.localAccountsConfig.accounts,
              bookmarks: input.localAccountsConfig.bookmarks || [],
              pinnedAccountIds:
                input.localAccountsConfig.pinnedAccountIds || [],
              orderedAccountIds:
                input.localAccountsConfig.orderedAccountIds || [],
              deletedEntryRecords:
                input.localAccountsConfig.deletedEntryRecords,
            })
          })
        }

        if (
          input.syncDataSelection.accounts ||
          input.syncDataSelection.bookmarks ||
          input.syncDataSelection.apiCredentialProfiles
        ) {
          await tagStorage.importTagStore(input.tagStoreToSave)

          rollbackSteps.push(async () => {
            await tagStorage.importTagStore(input.localTagStore)
          })
        }

        if (input.syncDataSelection.preferences) {
          await importPreferencesOrThrow(input.preferencesToSave)

          rollbackSteps.push(async () => {
            await importPreferencesOrThrow(input.localPreferences)
          })
        }

        if (input.syncDataSelection.apiCredentialProfiles) {
          await apiCredentialProfilesStorage.importConfig(
            input.apiCredentialProfilesToSave,
          )

          rollbackSteps.push(async () => {
            await apiCredentialProfilesStorage.importConfig(
              input.localApiCredentialProfiles,
            )
          })
        }

        // Apply channel configs last so a failure in another storage domain
        // never requires replacing concurrent channel edits during rollback.
        const applyChannelConfigs = async () => {
          if (input.mergeChannelConfigsOnApply) {
            return await channelConfigStorage.mergeConfigs(
              input.channelConfigsToSave,
            )
          }

          await channelConfigStorage.importConfigs(input.channelConfigsToSave)
          return input.channelConfigsToSave
        }

        if (input.syncDataSelection.preferences) {
          return await featureGuidanceState.withMergedStateTransaction(
            input.featureGuidanceToSave,
            applyChannelConfigs,
          )
        }

        return await applyChannelConfigs()
      } catch (error) {
        for (const rollback of rollbackSteps.reverse()) {
          try {
            await rollback()
          } catch (rollbackError) {
            logger.error(
              "Failed to rollback partially applied WebDAV sync writes",
              rollbackError,
            )
          }
        }

        throw error
      }
    },
  )
}
