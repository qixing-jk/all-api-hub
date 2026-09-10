import { fetchOpenAICompatibleModelIds } from "~/services/aiApi/openaiCompatible"
import type { ManagedSiteChannelDraftSource } from "~/types/managedSiteChannelDraft"
import { createLogger } from "~/utils/core/logger"
import { normalizeList } from "~/utils/core/string"

const logger = createLogger("ManagedSites.fetchManagedSiteImportModels")

type ManagedSiteImportModelsResult = {
  models: string[]
  fetchFailed: boolean
}

/**
 * Fetches live upstream models for the selected API key only.
 *
 * Existing model hints are not live API results. Each destination decides
 * whether to use them as a fallback when preparing its import draft.
 */
export async function fetchManagedSiteImportModels(
  source: Pick<ManagedSiteChannelDraftSource, "baseUrl" | "apiKey">,
): Promise<ManagedSiteImportModelsResult> {
  try {
    const upstreamModels = await fetchOpenAICompatibleModelIds({
      baseUrl: source.baseUrl,
      apiKey: source.apiKey,
    })
    return {
      models: normalizeList(upstreamModels ?? []),
      fetchFailed: false,
    }
  } catch (error) {
    logger.warn("Failed to fetch upstream models", error)
    return {
      models: [],
      fetchFailed: true,
    }
  }
}
