import { getApiService } from "~/services/apiService"
import type { ApiToken, DisplaySiteData } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { normalizeList } from "~/utils/core/string"

import { fetchTokenScopedModels } from "./fetchTokenScopedModels"

const logger = createLogger("ManagedSites.fetchAvailableModels")

type FetchManagedSiteAvailableModelsAccount = Pick<
  DisplaySiteData,
  | "siteType"
  | "baseUrl"
  | "id"
  | "authType"
  | "userId"
  | "token"
  | "cookieAuthSessionCookie"
>

type FetchManagedSiteAvailableModelsOptions = {
  includeAccountFallback?: boolean
}

/**
 * Resolves managed-site model options from live endpoints only.
 *
 * Source order:
 * 1. Selected API key's live upstream `/models` result.
 * 2. Optional account-level fallback such as `/api/user/models`.
 *
 * Token metadata fields like `token.models` / `model_limits` are intentionally
 * excluded because they are restriction metadata, not a live availability probe.
 */
export async function fetchManagedSiteAvailableModels(
  account: FetchManagedSiteAvailableModelsAccount,
  token: Pick<ApiToken, "key">,
  options: FetchManagedSiteAvailableModelsOptions = {},
): Promise<string[]> {
  const { includeAccountFallback = true } = options
  const candidateSources: string[][] = []

  const { models: tokenScopedModels } = await fetchTokenScopedModels(
    account,
    token,
  )
  candidateSources.push(tokenScopedModels)

  if (includeAccountFallback) {
    try {
      const fallbackModels = await getApiService(
        account.siteType,
      ).fetchAccountAvailableModels({
        baseUrl: account.baseUrl,
        accountId: account.id,
        auth: {
          authType: account.authType,
          userId: account.userId,
          accessToken: account.token,
          cookie: account.cookieAuthSessionCookie,
        },
      })

      if (fallbackModels && fallbackModels.length > 0) {
        candidateSources.push(fallbackModels)
      }
    } catch (error) {
      logger.warn("Failed to fetch fallback models", error)
    }
  }

  return normalizeList(candidateSources.flat())
}
