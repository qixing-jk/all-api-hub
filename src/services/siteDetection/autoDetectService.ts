import {
  AUTO_DETECT_BROWSER_OUTCOMES,
  AUTO_DETECT_DIAGNOSTIC_EVENTS,
  AUTO_DETECT_FAILURE_REASONS,
  AUTO_DETECT_SOURCE_REASONS,
  AUTO_DETECT_STRATEGIES,
} from "~/constants/autoDetect"
import { findAccountSiteProfileForHostname } from "~/services/accounts/accountSiteProfile/urls"
import {
  ACCOUNT_DETECTION_OUTCOMES,
  createAccountDetectionDiagnostics,
  type AccountDetectionDiagnostics,
} from "~/services/accountSiteOnboarding/diagnostics"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { t } from "~/utils/i18n/core"

import type { AutoDetectRequest, AutoDetectResult } from "./autoDetectContracts"
import { detectFromBrowser } from "./autoDetectSources"
import { autoDetectDirect } from "./sources/direct"
import { recordAutoDetectStrategyResult } from "./sources/resultAssembly"

/**
 * Identifies the generic "no user data found" outcome so we only replace it
 * with the reload hint when more specific downstream errors are unavailable.
 */
function isGenericUserDataMissingError(error?: string): boolean {
  return !error || error === t("messages:operations.detection.getUserIdFailed")
}

/**
 * Resolves the detection origin only for profiles that opt into hostname inference.
 */
function resolveAutoDetectUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return (
      findAccountSiteProfileForHostname(parsed.hostname)?.urls
        .autoDetectOrigin ?? url
    )
  } catch {
    return url
  }
}

/** Selects browser sources before the final API fallback, preserving specific failures. */
async function runAutoDetectSmart(
  request: AutoDetectRequest,
): Promise<AutoDetectResult> {
  const browserOutcome = await detectFromBrowser(request)
  if (browserOutcome.status === AUTO_DETECT_BROWSER_OUTCOMES.Detected)
    return browserOutcome.result

  const directResult = await autoDetectDirect(request)
  recordAutoDetectStrategyResult({
    strategy: AUTO_DETECT_STRATEGIES.DirectApi,
    result: directResult,
    diagnostics: request.diagnostics,
  })

  if (
    browserOutcome.reloadHint &&
    !directResult.success &&
    isGenericUserDataMissingError(directResult.error)
  ) {
    return browserOutcome.reloadHint
  }
  return directResult
}

/** Correlates strategy diagnostics while keeping the public detection result unchanged. */
export async function autoDetectSmart(
  url: string,
  protectionBypassExecution?: ProtectionBypassExecution,
  diagnostics?: AccountDetectionDiagnostics,
): Promise<AutoDetectResult> {
  const trace = diagnostics ?? createAccountDetectionDiagnostics()
  trace.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.DetectionStarted)
  try {
    const result = await runAutoDetectSmart({
      url: resolveAutoDetectUrl(url),
      protectionBypassExecution,
      diagnostics: trace,
    })
    const details = {
      success: result.success,
      strategy: result.autoDetectContext?.strategy,
      reason:
        result.errorCode ??
        (result.success
          ? undefined
          : AUTO_DETECT_FAILURE_REASONS.UserDataMissing),
    }
    if (diagnostics)
      trace.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.SiteDetectionFinished, details)
    else
      trace.finish(
        result.success
          ? ACCOUNT_DETECTION_OUTCOMES.Success
          : ACCOUNT_DETECTION_OUTCOMES.Failed,
        details,
      )
    return result
  } catch (error) {
    if (diagnostics)
      trace.record(AUTO_DETECT_DIAGNOSTIC_EVENTS.SiteDetectionFinished, {
        success: false,
        reason: AUTO_DETECT_SOURCE_REASONS.Exception,
      })
    else
      trace.finish(ACCOUNT_DETECTION_OUTCOMES.Failed, {
        reason: AUTO_DETECT_SOURCE_REASONS.Exception,
      })
    throw error
  }
}
