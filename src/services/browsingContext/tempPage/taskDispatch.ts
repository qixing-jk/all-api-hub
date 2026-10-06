import {
  OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES,
  OPENROUTER_BOOTSTRAP_MUTATION_STATES,
} from "~/constants/openRouterBootstrap"
import { executeTempCheckinFeedbackScan } from "~/services/browsingContext/tempPage/checkinFeedbackScan"
import { handleTempWindowOpenRouterManagementKeyAction } from "~/services/browsingContext/tempPage/openrouterManagementKeyAction"
import {
  TEMP_CONTEXT_TASK_KINDS,
  type ProtectionBypassSurface,
  type TempContextTask,
} from "~/services/protectionBypass/contracts"
import {
  TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS,
  TEMP_WINDOW_TURNSTILE_STATUSES,
} from "~/types/tempWindowFetch"
import {
  resolveTempWindowRequestPolicy,
  type TEMP_WINDOW_REQUEST_BLOCKED_REASONS,
} from "~/utils/browser/tempWindowRequestSource"
import { t } from "~/utils/i18n/core"

import { executeTempWindowCheckinPageAction } from "./checkinTask"
import {
  type AuthorizeTempContextAtAcquire,
  type ReportAuthorizedTempContextOutcome,
} from "./contracts"
import { reportAuthorizedTempContextOutcome } from "./failures"
import {
  executeTempWindowFetch,
  executeTempWindowTurnstileFetch,
} from "./fetchTasks"
import { tempWindowBackgroundRuntime } from "./runtime"
import {
  executeAutoDetectSite,
  executeNewApiSessionRead,
  executeOpenTempContext,
  executeTempWindowGetRenderedTitle,
  getOctopusCookieContextPageUrl,
} from "./sessionTasks"

/**
 * Single protected pool adapter. Scheduler admission happens before the
 * executor reaches the same-origin acquire lock and invokes authorization.
 */
function resolveAuthorizedTaskPresentation(
  task: TempContextTask,
  presentationSource: ProtectionBypassSurface,
):
  | {
      kind: "ready"
      source: ProtectionBypassSurface
      suppressMinimize: boolean
    }
  | {
      kind: "blocked"
      reason: typeof TEMP_WINDOW_REQUEST_BLOCKED_REASONS.FirefoxPopupUnsupported
    } {
  const policy = resolveTempWindowRequestPolicy({
    tempWindowRequestSource: presentationSource,
    suppressMinimize:
      "suppressMinimize" in task.params
        ? task.params.suppressMinimize
        : undefined,
  })
  return policy.blockedReason
    ? { kind: "blocked", reason: policy.blockedReason }
    : {
        kind: "ready",
        source: policy.tempWindowRequestSource,
        suppressMinimize: policy.suppressMinimize,
      }
}

/** Builds the task-shaped failure returned when presentation is unavailable. */
function buildPresentationFailure(task: TempContextTask, error: string) {
  if (task.kind === TEMP_CONTEXT_TASK_KINDS.TurnstileFetch) {
    return {
      success: false,
      error,
      turnstile: {
        status: TEMP_WINDOW_TURNSTILE_STATUSES.Error,
        hasTurnstile: false,
      },
    }
  }
  if (task.kind === TEMP_CONTEXT_TASK_KINDS.NativePageAction) {
    return {
      success: false,
      reason: TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.TriggerFailed,
      error,
    }
  }
  if (task.kind === TEMP_CONTEXT_TASK_KINDS.OpenRouterManagementKeyAction) {
    return {
      requestId: task.params.requestId,
      operation: task.params.operation.kind,
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
      label: task.params.operation.label,
    } as const
  }
  return { success: false, error }
}

/** Resolves presentation once, then dispatches one authorized temp-context task. */
export async function executeAuthorizedTempContextTask(
  task: TempContextTask,
  presentationSource: ProtectionBypassSurface,
  authorizeAtAcquire: AuthorizeTempContextAtAcquire,
  sendResponse: (response?: any) => void,
  reportOutcome?: ReportAuthorizedTempContextOutcome,
) {
  authorizeAtAcquire.reportOutcome = reportOutcome
  const presentation = resolveAuthorizedTaskPresentation(
    task,
    presentationSource,
  )
  if (presentation.kind === "blocked") {
    reportAuthorizedTempContextOutcome(authorizeAtAcquire, {
      kind: "unavailable",
      reason: presentation.reason,
    })
    sendResponse(
      buildPresentationFailure(
        task,
        t("settings:refresh.shieldPopupFirefoxNote"),
      ),
    )
    return
  }
  const { suppressMinimize } = presentation

  if (task.kind === TEMP_CONTEXT_TASK_KINDS.CheckinFeedbackScan) {
    await executeTempCheckinFeedbackScan(
      task.params,
      suppressMinimize,
      authorizeAtAcquire,
      sendResponse,
    )
    return
  }
  if (task.kind === TEMP_CONTEXT_TASK_KINDS.OpenRouterManagementKeyAction) {
    await handleTempWindowOpenRouterManagementKeyAction(
      task.params,
      suppressMinimize,
      sendResponse,
      authorizeAtAcquire,
    )
    return
  }
  const url =
    task.kind === TEMP_CONTEXT_TASK_KINDS.OctopusApiFetch
      ? getOctopusCookieContextPageUrl(task.params.originUrl)
      : task.kind === TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead
        ? task.params.origin
        : task.kind === TEMP_CONTEXT_TASK_KINDS.SessionRead ||
            task.kind === TEMP_CONTEXT_TASK_KINDS.OpenContext
          ? task.params.url
          : task.kind === TEMP_CONTEXT_TASK_KINDS.TurnstileFetch ||
              task.kind === TEMP_CONTEXT_TASK_KINDS.NativePageAction
            ? task.params.pageUrl || task.params.originUrl
            : task.params.originUrl
  const incognito =
    "useIncognito" in task.params && Boolean(task.params.useIncognito)

  await tempWindowBackgroundRuntime.run(url, { incognito }, async () => {
    switch (task.kind) {
      case TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch:
      case TEMP_CONTEXT_TASK_KINDS.ExplicitPageFetch:
      case TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch:
        await executeTempWindowFetch(
          task.params,
          suppressMinimize,
          sendResponse,
          authorizeAtAcquire,
        )
        return
      case TEMP_CONTEXT_TASK_KINDS.OctopusApiFetch:
        await executeTempWindowFetch(
          task.params,
          suppressMinimize,
          sendResponse,
          authorizeAtAcquire,
          { contextPageUrl: url },
        )
        return
      case TEMP_CONTEXT_TASK_KINDS.TurnstileFetch:
        await executeTempWindowTurnstileFetch(
          task.params,
          suppressMinimize,
          sendResponse,
          authorizeAtAcquire,
        )
        return
      case TEMP_CONTEXT_TASK_KINDS.NativePageAction:
        await executeTempWindowCheckinPageAction(
          task.params,
          suppressMinimize,
          sendResponse,
          authorizeAtAcquire,
        )
        return
      case TEMP_CONTEXT_TASK_KINDS.RenderedTitle:
        await executeTempWindowGetRenderedTitle(
          task.params,
          suppressMinimize,
          sendResponse,
          authorizeAtAcquire,
        )
        return
      case TEMP_CONTEXT_TASK_KINDS.SessionRead:
        await executeAutoDetectSite(
          task.params,
          suppressMinimize,
          sendResponse,
          authorizeAtAcquire,
        )
        return
      case TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead:
        await executeNewApiSessionRead(
          task.params,
          suppressMinimize,
          sendResponse,
          authorizeAtAcquire,
        )
        return
      case TEMP_CONTEXT_TASK_KINDS.OpenContext:
        await executeOpenTempContext(
          task,
          suppressMinimize,
          authorizeAtAcquire,
          sendResponse,
        )
    }
  })
}
