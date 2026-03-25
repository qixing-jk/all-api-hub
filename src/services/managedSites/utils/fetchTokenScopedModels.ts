import { fetchOpenAICompatibleModelIds } from "~/services/apiService/openaiCompatible"
import type { AccountToken, ApiToken, DisplaySiteData } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { normalizeList } from "~/utils/core/string"

const logger = createLogger("ManagedSites.fetchTokenScopedModels")

type TokenScopedModelsResult = {
  models: string[]
  fetchFailed: boolean
}

/**
 * Fetches live upstream models for the selected API key only.
 *
 * This intentionally excludes token metadata such as `token.models` /
 * `model_limits`, because those fields describe backend-configured restriction
 * metadata rather than the key's current upstream `/models` result.
 */
export async function fetchTokenScopedModels(
  account: Pick<DisplaySiteData, "baseUrl">,
  token: Pick<ApiToken | AccountToken, "key">,
): Promise<TokenScopedModelsResult> {
  try {
    const upstreamModels = await fetchOpenAICompatibleModelIds({
      baseUrl: account.baseUrl,
      apiKey: token.key,
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
