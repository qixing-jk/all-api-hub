import { fetchOpenAICompatibleModelIds } from "~/services/aiApi/openaiCompatible"
import {
  sharePendingConfigRead,
  type ScheduledReadOptions,
} from "~/services/apiTransport/requestScheduling"
import type { ManagedSiteChannelDraftSource } from "~/types/managedSiteChannelDraft"
import { createLogger } from "~/utils/core/logger"
import { normalizeList } from "~/utils/core/string"

const logger = createLogger("ManagedSites.fetchManagedSiteImportModels")

type ManagedSiteImportModelsResult = {
  models: string[]
  fetchFailed: boolean
}

const readPendingModels = sharePendingConfigRead(fetchUncachedModels)

/**
 * Shares only in-flight model reads between status checks and exports. Each new
 * read after completion fetches live models for the selected path and credential.
 */
export async function fetchManagedSiteImportModels(
  source: Pick<ManagedSiteChannelDraftSource, "baseUrl" | "apiKey">,
  options: ScheduledReadOptions = {},
): Promise<ManagedSiteImportModelsResult> {
  const result = await readPendingModels(
    { baseUrl: source.baseUrl, apiKey: source.apiKey },
    options,
  )
  return { ...result, models: [...result.models] }
}

/**
 * Fetches live upstream models for the selected API key only.
 *
 * Existing model hints are not live API results. Each destination decides
 * whether to use them as a fallback when preparing its import draft.
 */
async function fetchUncachedModels(
  source: Pick<ManagedSiteChannelDraftSource, "baseUrl" | "apiKey">,
  options: ScheduledReadOptions = {},
): Promise<ManagedSiteImportModelsResult> {
  try {
    const upstreamModels = await fetchOpenAICompatibleModelIds({
      baseUrl: source.baseUrl,
      apiKey: source.apiKey,
      abortSignal: options.signal,
      requestScheduling: options.requestScheduling,
    })
    return {
      models: normalizeList(upstreamModels ?? []),
      fetchFailed: false,
    }
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason
    logger.warn("Failed to fetch upstream models", error)
    return {
      models: [],
      fetchFailed: true,
    }
  }
}
