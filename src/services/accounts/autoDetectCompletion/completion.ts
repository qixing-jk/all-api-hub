import {
  AUTO_DETECT_FAILURE_REASONS,
  type AutoDetectFailureReason,
} from "~/constants/autoDetect"
import type { SiteStatusInfo } from "~/services/accountBootstrap/model"
import { getSiteName } from "~/services/accounts/siteName"
import type { AccountCompletionHelpers } from "~/services/apiAdapters/contracts/accountCompletion"
import { getSiteAdapter } from "~/services/apiAdapters/registry"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiTransport/type"
import type {
  ApiServiceFetchContext,
  ApiServiceRequest,
} from "~/services/apiTransport/type"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import {
  AutoDetectCompletionError,
  type AutoDetectCompletionData,
  type AutoDetectCompletionRequest,
  type DetectedAccountIdentity,
} from "./types"

export { AutoDetectCompletionError }

const logger = createLogger("AccountAutoDetectCompletion")

/**
 * Resolves the most specific auto-detect completion reason available for analytics.
 */
export function getAutoDetectCompletionFailureReason(
  error: unknown,
): AutoDetectFailureReason {
  return error instanceof AutoDetectCompletionError
    ? error.reason
    : AUTO_DETECT_FAILURE_REASONS.UnexpectedException
}

/**
 * Keeps only auto-detect fetch contexts that are safe to reuse in service calls.
 */
function getAutoDetectFetchContext(
  detected: DetectedAccountIdentity,
): ApiServiceFetchContext | undefined {
  const fetchContext = detected.fetchContext
  if (fetchContext?.kind === API_SERVICE_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT) {
    return fetchContext
  }

  if (fetchContext?.kind === API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB) {
    if (
      typeof fetchContext.tabId === "number" &&
      typeof fetchContext.origin === "string" &&
      fetchContext.origin.trim()
    ) {
      return fetchContext
    }
  }

  if (fetchContext?.incognito === true || fetchContext?.cookieStoreId) {
    return fetchContext
  }

  return undefined
}

/**
 * Builds the shared service request shape used by completion probes.
 */
function createAutoDetectApiRequest(params: {
  baseUrl: string
  auth: ApiServiceRequest["auth"]
  fetchContext?: ApiServiceFetchContext
}): ApiServiceRequest {
  return {
    baseUrl: params.baseUrl,
    auth: params.auth,
    ...(params.fetchContext ? { fetchContext: params.fetchContext } : {}),
  }
}

/**
 * Normalizes optional service and detected string fields.
 */
function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/**
 * Creates the persisted check-in shape used by auto-detected accounts.
 */
function createInitialCheckInConfig(input: {
  enableDetection: boolean
  autoCheckInEnabled: boolean
}) {
  return {
    enableDetection: input.enableDetection,
    autoCheckInEnabled: input.autoCheckInEnabled,
    siteStatus: {
      isCheckedInToday: false,
    },
    customCheckIn: {
      url: "",
      redeemUrl: "",
      openRedeemWithCheckIn: true,
      isCheckedInToday: false,
    },
  }
}

const createMissingAccountCompletionCapabilityError = (siteType: string) =>
  new Error(`accountCompletion is not implemented for ${siteType}`)

const createCompletionError = (
  reason: AutoDetectFailureReason,
  cause: unknown,
) => new AutoDetectCompletionError(reason, cause)

const createAccountCompletionHelpers = (params: {
  url: string
  siteType: string
}): AccountCompletionHelpers => ({
  createServiceRequest(input: {
    baseUrl: string
    auth: ApiServiceRequest["auth"]
    context: {
      fetchContext?: ApiServiceFetchContext
    }
  }) {
    return createAutoDetectApiRequest({
      baseUrl: input.baseUrl,
      auth: input.auth,
      fetchContext: input.context.fetchContext,
    })
  },
  fetchSiteName(siteStatus: SiteStatusInfo | null) {
    return getSiteName(params.url, params.siteType, siteStatus)
  },
  createCompletionError,
  trimString,
  createInitialCheckInConfig,
  handleCheckInSupportFetchFailure(error: unknown) {
    logger.warn("Auto-detect check-in support probe failed", {
      siteType: params.siteType,
      error: getErrorMessage(error),
    })
    return false as const
  },
})

/**
 * Completes a detected identity with service-backed token, status, and defaults.
 */
export async function completeAutoDetectedAccount(
  request: AutoDetectCompletionRequest,
): Promise<AutoDetectCompletionData> {
  const { url, requestedAuthType, detected, autoDetectContext } = request
  const { siteType } = detected
  const autoDetectFetchContext = getAutoDetectFetchContext(detected)
  const adapter = getSiteAdapter(siteType)
  if (!adapter.accountCompletion) {
    throw new AutoDetectCompletionError(
      AUTO_DETECT_FAILURE_REASONS.UnexpectedException,
      createMissingAccountCompletionCapabilityError(siteType),
    )
  }

  const completed = await adapter.accountCompletion.complete(
    {
      url,
      requestedAuthType,
      detected,
      autoDetectContext,
      context: {
        ...(autoDetectFetchContext
          ? { fetchContext: autoDetectFetchContext }
          : {}),
      },
    },
    createAccountCompletionHelpers({
      url,
      siteType,
    }),
  )

  return {
    ...completed,
    siteType,
    ...(autoDetectFetchContext ? { fetchContext: autoDetectFetchContext } : {}),
    autoDetectContext,
  }
}
