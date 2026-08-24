import {
  AUTO_DETECT_FAILURE_REASONS,
  type AutoDetectFailureReason,
} from "~/constants/autoDetect"
import type { AccountSiteType } from "~/constants/siteType"
import { createPersistedSiteAccount } from "~/services/accounts/accountDefaults"
import { getSiteName } from "~/services/accounts/siteName"
import type { SiteStatusInfo } from "~/services/apiAdapters/contracts/accountBootstrap"
import type {
  AccountCompletionAdapterResult,
  AccountCompletionHelpers,
  AccountCompletionRuntimeContext,
} from "~/services/apiAdapters/contracts/accountCompletion"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiTransport/type"
import type {
  ApiServiceFetchContext,
  ApiServiceRequest,
} from "~/services/apiTransport/type"
import {
  createCompatibilityCheckInConfig,
  getNewAccountAutomaticExecutionDefault,
} from "~/services/checkin/autoCheckin/compatibilityConfig"
import { discoverCheckInMethods } from "~/services/checkin/autoCheckin/discovery"
import type { AutoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers/registry"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { SiteHealthStatus } from "~/types"
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
  cookieAuthSessionCookie?: string
  fetchContext?: ApiServiceFetchContext
  protectionBypassExecution?: ProtectionBypassExecution
}): ApiServiceRequest {
  return {
    baseUrl: params.baseUrl,
    auth: params.auth,
    ...(params.cookieAuthSessionCookie
      ? { cookieAuthSessionCookie: params.cookieAuthSessionCookie }
      : {}),
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
  siteType: AccountSiteType
}) {
  return createCompatibilityCheckInConfig({
    siteType: input.siteType,
    supported: input.supported,
    automaticExecutionEnabled: getNewAccountAutomaticExecutionDefault(
      input.siteType,
    ),
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
  siteType: AccountSiteType
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
    cookieAuthSessionCookie,
    detected,
    autoDetectContext,
    protectionBypassExecution,
  } = request
  const { siteType } = detected
  const autoDetectFetchContext = getAutoDetectFetchContext(detected)
  const completionContext: AccountCompletionRuntimeContext = {
    ...(autoDetectFetchContext ? { fetchContext: autoDetectFetchContext } : {}),
    ...(protectionBypassExecution ? { protectionBypassExecution } : {}),
  }
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
      context: completionContext,
    },
    createAccountCompletionHelpers({
      url,
      siteType,
    }),
  )

  const completedWithDiscovery = await discoverCompletedCheckIn({
    url,
    siteType,
    completed,
    cookieAuthSessionCookie,
    request: createAutoDetectApiRequest({
      baseUrl: url,
      auth: {
        authType: completed.authType,
        userId: completed.userId,
        accessToken: completed.accessToken,
      },
      cookieAuthSessionCookie,
      fetchContext: completionContext.fetchContext,
      protectionBypassExecution: completionContext.protectionBypassExecution,
    }),
  })

  return {
    ...completedWithDiscovery,
    siteType,
    ...(autoDetectFetchContext ? { fetchContext: autoDetectFetchContext } : {}),
    autoDetectContext,
  }
}

/** Runs bounded check-in discovery against the completed account draft. */
export async function discoverCompletedCheckIn(params: {
  url: string
  siteType: AccountSiteType
  completed: AccountCompletionAdapterResult
  cookieAuthSessionCookie?: string
  request?: ApiServiceRequest
  registry?: AutoCheckinMethodRegistry
  observedAt?: number
  perAdapterTimeoutMs?: number
  deadlineMs?: number
}): Promise<AccountCompletionAdapterResult> {
  const account = createPersistedSiteAccount({
    id: `auto-detect:${params.completed.userId}`,
    now: Date.now(),
    account: {
      site_name: params.completed.siteName,
      site_url: params.url,
      site_type: params.siteType,
      exchange_rate: params.completed.exchangeRate ?? 0,
      account_info: {
        id: params.completed.userId,
        access_token: params.completed.accessToken,
        username: params.completed.username,
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
      authType: params.completed.authType,
      ...(params.cookieAuthSessionCookie
        ? { cookieAuth: { sessionCookie: params.cookieAuthSessionCookie } }
        : {}),
      checkIn: params.completed.checkIn,
      health: { status: SiteHealthStatus.Unknown },
      notes: "",
      tagIds: [],
      disabled: false,
      excludeFromTotalBalance: false,
      excludeFromTodayIncome: false,
      last_sync_time: 0,
    },
  })
  const discovery = await discoverCheckInMethods({
    account,
    config: params.completed.checkIn,
    request: params.request,
    registry: params.registry,
    observedAt: params.observedAt,
    perAdapterTimeoutMs: params.perAdapterTimeoutMs,
    deadlineMs: params.deadlineMs,
  })
  return { ...params.completed, checkIn: discovery.config }
}
