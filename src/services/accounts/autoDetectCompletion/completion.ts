import {
  AUTO_DETECT_FAILURE_REASONS,
  type AutoDetectFailureReason,
} from "~/constants/autoDetect"
import { getSiteName } from "~/services/accounts/siteName"
import type { SiteStatusInfo } from "~/services/apiAdapters/contracts/accountBootstrap"
import type {
  AccountCompletionHelpers,
  AccountCompletionRuntimeContext,
} from "~/services/apiAdapters/contracts/accountCompletion"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiTransport/type"
import type {
  ApiServiceFetchContext,
  ApiServiceRequest,
} from "~/services/apiTransport/type"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/compatibilityConfig"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
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
  protectionBypassExecution?: ProtectionBypassExecution
}): ApiServiceRequest {
  return {
    baseUrl: params.baseUrl,
    auth: params.auth,
    ...(params.fetchContext ? { fetchContext: params.fetchContext } : {}),
    ...(params.protectionBypassExecution
      ? { protectionBypassExecution: params.protectionBypassExecution }
      : {}),
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
  supported: boolean
  automaticExecutionEnabled: boolean
  siteType: string
}) {
  return createCompatibilityCheckInConfig({
    siteType: input.siteType as AutoDetectCompletionData["siteType"],
    supported: input.supported,
    automaticExecutionEnabled: input.automaticExecutionEnabled,
    customCheckIn: {
      url: "",
      redeemUrl: "",
      openRedeemWithCheckIn: true,
      isCheckedInToday: false,
    },
  })
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
    context: AccountCompletionRuntimeContext
  }) {
    return createAutoDetectApiRequest({
      baseUrl: input.baseUrl,
      auth: input.auth,
      fetchContext: input.context.fetchContext,
      protectionBypassExecution: input.context.protectionBypassExecution,
    })
  },
  fetchSiteName(siteStatus: SiteStatusInfo | null) {
    return getSiteName(params.url, params.siteType, siteStatus)
  },
  createCompletionError,
  trimString,
  createInitialCheckInConfig(input) {
    return createInitialCheckInConfig({ ...input, siteType: params.siteType })
  },
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
  const {
    url,
    requestedAuthType,
    detected,
    autoDetectContext,
    protectionBypassExecution,
  } = request
  const { siteType } = detected
  const autoDetectFetchContext = getAutoDetectFetchContext(detected)
  const accountCompletion =
    getSiteTypeCapabilities(siteType).account?.completion
  if (!accountCompletion) {
    throw new AutoDetectCompletionError(
      AUTO_DETECT_FAILURE_REASONS.UnexpectedException,
      createMissingAccountCompletionCapabilityError(siteType),
    )
  }

  const completed = await accountCompletion.complete(
    {
      url,
      requestedAuthType,
      detected,
      autoDetectContext,
      context: {
        ...(autoDetectFetchContext
          ? { fetchContext: autoDetectFetchContext }
          : {}),
        ...(protectionBypassExecution ? { protectionBypassExecution } : {}),
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
