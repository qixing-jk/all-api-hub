import {
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { isBrowserAutomationCheckInConfigured } from "~/services/checkin/autoCheckin/browserAutomation"
import type {
  AutoCheckinProvider,
  AutoCheckinProviderReadContext,
} from "~/services/checkin/autoCheckin/providers/contracts"
import type { AutoCheckinProviderResult } from "~/services/checkin/autoCheckin/providers/types"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import type { BrowserCheckInExecutionResult } from "~/types/checkinAutomation"
import { tempWindowBrowserCheckIn } from "~/utils/browser/tempWindowFetch"
import { normalizeTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { safeRandomUUID } from "~/utils/core/identifier"

const BROWSER_AUTOMATION_MESSAGE_KEYS = {
  actionTargetNotFound:
    "autoCheckin:providerFallback.browserAutomationActionTargetNotFound",
  identityMismatch:
    "autoCheckin:providerFallback.browserAutomationIdentityMismatch",
  identityMissing:
    "autoCheckin:providerFallback.browserAutomationIdentityMissing",
  invalidRequest:
    "autoCheckin:providerFallback.browserAutomationInvalidRequest",
  timeout: "autoCheckin:providerFallback.browserAutomationTimeout",
  triggerFailed: "autoCheckin:providerFallback.browserAutomationTriggerFailed",
} as const

const getConfiguration = (account: SiteAccount) => {
  const customCheckIn = account.checkIn.customCheckIn
  const browserAutomation = customCheckIn?.browserAutomation
  return customCheckIn &&
    browserAutomation &&
    isBrowserAutomationCheckInConfigured(customCheckIn)
    ? browserAutomation
    : undefined
}

const getReadiness: AutoCheckinProvider["getReadiness"] = (account) =>
  getConfiguration(account)
    ? { ready: true }
    : {
        ready: false,
        reason: CHECK_IN_PROVIDER_READINESS_REASONS.AccountDataMissing,
      }

/** User configuration is the only safe discovery proof for this method. */
const detect = async (context: AutoCheckinProviderReadContext) =>
  context.account && getConfiguration(context.account)
    ? {
        outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched,
        evidence: {
          source: CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.UserConfiguration,
        },
      }
    : {
        outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown,
        reason: "invalid_response" as const,
        attemptedAt: context.observedAt,
      }

/** Maps a bounded execution failure to localized provider feedback. */
function resolveFailureMessageKey(
  result: BrowserCheckInExecutionResult,
): string {
  switch (result.reason) {
    case "identity_missing":
      return BROWSER_AUTOMATION_MESSAGE_KEYS.identityMissing
    case "identity_mismatch":
      return BROWSER_AUTOMATION_MESSAGE_KEYS.identityMismatch
    case "action_target_not_found":
      return BROWSER_AUTOMATION_MESSAGE_KEYS.actionTargetNotFound
    case "invalid_request":
      return BROWSER_AUTOMATION_MESSAGE_KEYS.invalidRequest
    case "timeout":
      return BROWSER_AUTOMATION_MESSAGE_KEYS.timeout
    default:
      return BROWSER_AUTOMATION_MESSAGE_KEYS.triggerFailed
  }
}

/** Maps execution failures to the scheduler's stable reason categories. */
function resolveFailureReasonCode(
  result: BrowserCheckInExecutionResult,
): AutoCheckinProviderResult["reasonCode"] {
  switch (result.reason) {
    case "identity_missing":
    case "identity_mismatch":
      return AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED
    case "timeout":
      return AUTO_CHECKIN_SKIP_REASON.TIMEOUT
    default:
      return undefined
  }
}

/** Converts the browser task result into the common auto-checkin result shape. */
function mapExecutionResult(
  result: BrowserCheckInExecutionResult,
): AutoCheckinProviderResult {
  if (result.success) {
    return {
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      messageKey: "autoCheckin:providerFallback.checkinSuccessful",
      data: result,
    }
  }

  const reasonCode = resolveFailureReasonCode(result)
  return {
    status: CHECKIN_RESULT_STATUS.FAILED,
    messageKey: resolveFailureMessageKey(result),
    ...(reasonCode ? { reasonCode } : {}),
    rawMessage: result.error || undefined,
    data: result,
  }
}

export const browserAutomationProvider: AutoCheckinProvider = {
  getReadiness,
  detect,
  async checkIn(account, context) {
    if (!("site_type" in account)) {
      return {
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DATA_MISSING,
        messageKey: BROWSER_AUTOMATION_MESSAGE_KEYS.invalidRequest,
      }
    }

    const siteAccount = account as SiteAccount
    const configuration = getConfiguration(siteAccount)
    const pageUrl = siteAccount.checkIn.customCheckIn?.url
    if (!configuration || !pageUrl) {
      return {
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DATA_MISSING,
        messageKey: BROWSER_AUTOMATION_MESSAGE_KEYS.invalidRequest,
      }
    }

    try {
      const result = await tempWindowBrowserCheckIn({
        pageUrl,
        requestId: safeRandomUUID(`browser-checkin-${siteAccount.id}`),
        action: configuration.action,
        success: configuration.success,
        ...(configuration.identity ? { identity: configuration.identity } : {}),
        ...(configuration.timeoutMs !== undefined
          ? { timeoutMs: configuration.timeoutMs }
          : {}),
        tempWindowRequestSource: normalizeTempWindowRequestSource(
          context.tempWindowRequestSource,
        ),
        protectionBypassExecution: context.protectionBypassExecution,
      })
      return mapExecutionResult(result)
    } catch (error) {
      return {
        status: CHECKIN_RESULT_STATUS.FAILED,
        messageKey: BROWSER_AUTOMATION_MESSAGE_KEYS.triggerFailed,
        rawMessage: error instanceof Error ? error.message : undefined,
      }
    }
  },
}
