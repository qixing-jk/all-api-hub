import { RuntimeActionIds } from "~/constants/runtimeActions"
import { createUserCommandProtectionBypassExecution } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_USER_COMMANDS,
  TEMP_CONTEXT_TASK_KINDS,
} from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { executeProtectionBypassTask } from "~/utils/browser/tempWindowFetch"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { safeRandomUUID } from "~/utils/core/identifier"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"

import { runCheckInBrowserScan } from "./browserScanTask"
import { collectCheckInEvidence } from "./scan"
import {
  CHECK_IN_EVIDENCE_SCAN_ERRORS,
  CHECK_IN_EVIDENCE_SCAN_PURPOSES,
  CHECK_IN_EVIDENCE_SCAN_SESSION_TIMEOUT_MS,
  FEEDBACK_SCAN_ISSUES,
  FEEDBACK_SCAN_STATUSES,
  type CheckInEvidence,
  type CheckInEvidenceScanInput,
} from "./scanTypes"

/** Prefers one protected page; direct reads remain a bounded fallback when unavailable. */
export async function collectCheckInEvidenceInBrowser(
  input: CheckInEvidenceScanInput,
  signal: AbortSignal,
): Promise<CheckInEvidence> {
  const origin = tryParseHttpUrl(input.baseUrl)?.origin
  if (!origin || signal.aborted) return collectCheckInEvidence(input, signal)
  const started = Date.now()
  const requestId = safeRandomUUID()
  const nativePage =
    input.purpose === CHECK_IN_EVIDENCE_SCAN_PURPOSES.NativePage
  const auth =
    !nativePage && input.auth?.authType === AuthTypeEnum.AccessToken
      ? {
          authType: AuthTypeEnum.AccessToken,
          accessToken: input.auth.accessToken ?? "",
          ...(input.auth.userId !== undefined
            ? { userId: input.auth.userId }
            : {}),
        }
      : undefined
  try {
    const result = await runCheckInBrowserScan({
      requestId,
      cancelAction: RuntimeActionIds.CancelCheckinFeedbackScan,
      signal,
      execute: () =>
        executeProtectionBypassTask({
          execution: createUserCommandProtectionBypassExecution(
            PROTECTION_BYPASS_USER_COMMANDS.CheckinFeedback,
            getCurrentTempWindowRequestSource(),
          ),
          task: {
            kind: TEMP_CONTEXT_TASK_KINDS.CheckinFeedbackScan,
            params: {
              originUrl: origin,
              requestId,
              input: {
                baseUrl: origin,
                siteType: input.siteType,
                ...(input.nativePagePath
                  ? { nativePagePath: input.nativePagePath }
                  : {}),
                ...(nativePage ? { purpose: input.purpose } : {}),
                ...(auth ? { auth } : {}),
                ...(!nativePage && input.routePaths?.length
                  ? { routePaths: input.routePaths }
                  : {}),
              },
            },
          },
        }),
    })
    if (result.success && result.data) return result.data
  } catch {
    if (signal.aborted) throw new Error(CHECK_IN_EVIDENCE_SCAN_ERRORS.Cancelled)
  }
  const remaining =
    CHECK_IN_EVIDENCE_SCAN_SESSION_TIMEOUT_MS - (Date.now() - started)
  if (remaining <= 0)
    return {
      status: FEEDBACK_SCAN_STATUSES.Empty,
      statusQueries: [],
      routes: [],
      authenticatedQueriesUnavailable: false,
      issues: [FEEDBACK_SCAN_ISSUES.TaskTimeout],
    }
  return collectCheckInEvidence(input, signal, { timeoutMs: remaining })
}
