import { RuntimeActionIds } from "~/constants/runtimeActions"
import { createUserCommandProtectionBypassExecution } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_USER_COMMANDS,
  TEMP_CONTEXT_TASK_KINDS,
} from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { executeProtectionBypassTask } from "~/utils/browser/tempWindowFetch"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { safeRandomUUID } from "~/utils/core/identifier"

import { getFeedbackOrigin } from "./report"
import { collectCheckInFeedbackClues } from "./scan"
import {
  FEEDBACK_SCAN_SESSION_TIMEOUT_MS,
  type CheckInFeedbackClues,
  type CheckInFeedbackScanInput,
} from "./scanTypes"

/** Prefers one protected page; direct reads remain a bounded fallback when unavailable. */
export async function collectFeedbackCluesInBrowser(
  input: CheckInFeedbackScanInput,
  signal: AbortSignal,
): Promise<CheckInFeedbackClues> {
  const origin = getFeedbackOrigin(input.baseUrl)
  if (!origin || signal.aborted)
    return collectCheckInFeedbackClues(input, signal)
  const started = Date.now()
  const requestId = safeRandomUUID()
  let cancel!: () => void
  const cancelled = new Promise<never>((_resolve, reject) => {
    cancel = () => {
      void sendRuntimeMessage({
        action: RuntimeActionIds.CancelCheckinFeedbackScan,
        requestId,
      }).catch(() => undefined)
      reject(new Error("scan_cancelled"))
    }
  })
  signal.addEventListener("abort", cancel, { once: true })
  const timer = setTimeout(cancel, FEEDBACK_SCAN_SESSION_TIMEOUT_MS)
  const auth =
    input.auth?.authType === AuthTypeEnum.AccessToken
      ? {
          authType: AuthTypeEnum.AccessToken,
          accessToken: input.auth.accessToken ?? "",
          ...(input.auth.userId !== undefined
            ? { userId: input.auth.userId }
            : {}),
        }
      : undefined
  try {
    const result = await Promise.race([
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
              ...(auth ? { auth } : {}),
            },
          },
        },
      }),
      cancelled,
    ])
    if (result.success && result.data) return result.data
  } catch {
    if (signal.aborted) throw new Error("scan_cancelled")
  } finally {
    clearTimeout(timer)
    signal.removeEventListener("abort", cancel)
  }
  const remaining = FEEDBACK_SCAN_SESSION_TIMEOUT_MS - (Date.now() - started)
  if (remaining <= 0)
    return {
      status: "empty",
      statusQueries: [],
      routes: [],
      authenticatedQueriesUnavailable: false,
      issues: ["task_timeout"],
    }
  return collectCheckInFeedbackClues(input, signal, { timeoutMs: remaining })
}
