import { coerceApiCredentialProfilesConfig } from "~/services/apiCredentialProfiles/storage/configCodec"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/storage/profiles"
import {
  IMPORT_SECTION_STRATEGIES,
  type BackupFullV2,
  type BackupV2,
  type ImportWriteStrategy,
} from "~/services/importExport/backupContracts"
import { tagStorage } from "~/services/tags/tagStorage"
import type { ApiCredentialProfilesConfig } from "~/types/apiCredentialProfiles"

/** Imports V2 API credential profiles using either merge or replace semantics. */
export async function importV2ApiCredentialProfiles(
  data: BackupV2,
  strategy: ImportWriteStrategy,
  options: {
    reconcileTags: boolean
    remoteApiCredentialProfiles?: ApiCredentialProfilesConfig["profiles"]
  },
) {
  const incoming = coerceApiCredentialProfilesConfig(
    (data as BackupFullV2).apiCredentialProfiles,
  )

  if (options.remoteApiCredentialProfiles) {
    const config = {
      ...incoming,
      profiles: options.remoteApiCredentialProfiles,
    }

    if (strategy === IMPORT_SECTION_STRATEGIES.Replace) {
      await apiCredentialProfilesStorage.importConfig(config)
    } else {
      await apiCredentialProfilesStorage.mergeConfig(config)
    }
    return
  }

  if (
    options.reconcileTags &&
    "tagStore" in (data as any) &&
    (data as any).tagStore
  ) {
    const tagMerge = tagStorage.mergeTagStoresForSync({
      localTagStore: await tagStorage.exportTagStore(),
      remoteTagStore: (data as any).tagStore,
      localAccounts: [],
      remoteAccounts: [],
      localBookmarks: [],
      remoteBookmarks: [],
      localTaggables: [],
      remoteTaggables: incoming.profiles,
    })

    await tagStorage.importTagStore(tagMerge.tagStore)

    const config = {
      ...incoming,
      profiles: tagMerge.remoteTaggables,
    }

    if (strategy === IMPORT_SECTION_STRATEGIES.Replace) {
      await apiCredentialProfilesStorage.importConfig(config)
    } else {
      await apiCredentialProfilesStorage.mergeConfig(config)
    }
    return
  }

  if (strategy === IMPORT_SECTION_STRATEGIES.Replace) {
    await apiCredentialProfilesStorage.importConfig(incoming)
  } else {
    await apiCredentialProfilesStorage.mergeConfig(incoming)
  }
}
