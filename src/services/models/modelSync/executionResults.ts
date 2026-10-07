import type { ExecutionResult } from "~/types/managedSiteModelSync"

import { collectModelsFromExecution } from "./modelCollection"
import { managedSiteModelSyncStorage } from "./storage"

/** Persist each run and refresh nonempty upstream options only for a full sync. */
export async function saveModelSyncExecution(
  result: ExecutionResult,
  isFullSync: boolean,
) {
  await managedSiteModelSyncStorage.saveLastExecution(result)
  if (isFullSync) {
    const collectedModels = collectModelsFromExecution(result)
    if (collectedModels.length > 0)
      await managedSiteModelSyncStorage.saveChannelUpstreamModelOptions(
        collectedModels,
      )
  }
}
