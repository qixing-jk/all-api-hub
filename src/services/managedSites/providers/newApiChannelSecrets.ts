import type { ManagedSiteChannelSecretReadOptions } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { requireNumericManagedResourceId } from "~/services/apiAdapters/managedResources/matchingInputs"
import {
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MatchResolutionUnresolvedError,
} from "~/services/managedSites/channelMatch"
import {
  fetchNewApiChannelKey,
  NewApiChannelKeyRequirementError,
} from "~/services/managedSites/providers/newApiSession"
import type { ManagedResourceMatchCandidate } from "~/types/managedResourceMatching"
import type { NewApiConfig } from "~/types/newApiConfig"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

import { userPreferences } from "../../preferences/userPreferences"

const logger = createLogger("NewApiChannelSecrets")

/**
 * Reads a single managed-site channel key using the New API verification flow.
 */
export async function fetchChannelSecretKey(
  config: NewApiConfig,
  channelId: number,
  options: ManagedSiteChannelSecretReadOptions,
): Promise<string> {
  const sessionConfig = await getNewApiManagedSessionConfig(config)

  return await fetchNewApiChannelKey({
    ...sessionConfig,
    channelId,
    protectionBypassExecution: options.protectionBypassExecution,
    signal: options.signal,
  })
}

/**
 * Hydrates hidden New API channel keys so the shared resolver can compare them.
 */
export async function hydrateComparableChannelKeys<
  T extends ManagedResourceMatchCandidate,
>(
  config: NewApiConfig,
  candidates: T[],
  options: ManagedSiteChannelSecretReadOptions,
): Promise<T[]> {
  const sessionConfig = await getNewApiManagedSessionConfig(config)
  const hydratedCandidates: T[] = []

  for (const candidate of candidates) {
    if (candidate.key?.trim()) {
      hydratedCandidates.push(candidate)
      continue
    }

    try {
      const resolvedKey = await fetchNewApiChannelKey({
        ...sessionConfig,
        channelId: requireNumericManagedResourceId(candidate.id),
        protectionBypassExecution: options.protectionBypassExecution,
        signal: options.signal,
      })

      hydratedCandidates.push({
        ...candidate,
        key: resolvedKey,
      })
    } catch (error) {
      if (options.signal?.aborted) {
        throw error
      }
      if (error instanceof NewApiChannelKeyRequirementError) {
        throw new MatchResolutionUnresolvedError(
          MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED,
        )
      }

      logger.warn("Failed to hydrate hidden New API channel key", {
        baseUrl: config.baseUrl,
        channelId: requireNumericManagedResourceId(candidate.id),
        error: getErrorMessage(error),
      })

      throw new MatchResolutionUnresolvedError(
        MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.KEY_RESOLUTION_FAILED,
      )
    }
  }

  return hydratedCandidates
}

/**
 * Reads the optional New API login-assist fields used by the session-backed
 * verification flow without changing the existing admin-token config contract.
 */
export async function getNewApiLoginAssistConfig(): Promise<Pick<
  NewApiConfig,
  "baseUrl" | "username" | "password" | "totpSecret"
> | null> {
  try {
    const prefs = await userPreferences.getPreferences()
    const newApi = prefs?.newApi

    if (!newApi?.baseUrl) {
      return null
    }

    return {
      baseUrl: newApi.baseUrl,
      username: newApi.username ?? "",
      password: newApi.password ?? "",
      totpSecret: newApi.totpSecret ?? "",
    }
  } catch (error) {
    logger.error("Error getting New API login-assist config", error)
    return null
  }
}

const sharesNewApiOrigin = (leftBaseUrl: string, rightBaseUrl: string) => {
  const leftOrigin =
    normalizeUrlForOriginKey(leftBaseUrl, { stripTrailingSlashes: true }) ||
    leftBaseUrl.trim()
  const rightOrigin =
    normalizeUrlForOriginKey(rightBaseUrl, { stripTrailingSlashes: true }) ||
    rightBaseUrl.trim()

  return Boolean(leftOrigin && rightOrigin && leftOrigin === rightOrigin)
}

const getNewApiManagedSessionConfig = async (
  config: Pick<NewApiConfig, "baseUrl" | "userId">,
): Promise<
  Pick<
    NewApiConfig,
    "baseUrl" | "userId" | "username" | "password" | "totpSecret"
  >
> => {
  const loginAssistConfig = await getNewApiLoginAssistConfig()
  const canReuseLoginAssist =
    loginAssistConfig &&
    sharesNewApiOrigin(loginAssistConfig.baseUrl, config.baseUrl)

  return {
    baseUrl: config.baseUrl,
    userId: config.userId?.toString() ?? "",
    username: canReuseLoginAssist ? loginAssistConfig.username ?? "" : "",
    password: canReuseLoginAssist ? loginAssistConfig.password ?? "" : "",
    totpSecret: canReuseLoginAssist ? loginAssistConfig.totpSecret ?? "" : "",
  }
}
