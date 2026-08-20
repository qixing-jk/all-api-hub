import { TEMP_CONTEXT_MODES } from "~/constants/tempContextMode"
import {
  API_ERROR_CODES,
  type ApiErrorCode,
} from "~/services/apiTransport/errors"
import { hasCookieInterceptorPermissions } from "~/services/permissions/permissionManager"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
  type TempWindowFallbackPreferences,
} from "~/services/preferences/userPreferences"
import { PRODUCT_ANALYTICS_PROTECTION_BYPASS_DENIAL_CLASSIFICATION } from "~/services/productAnalytics/contracts"
import {
  recordProtectionBypassDecision,
  type ProtectionBypassDecisionSummary,
} from "~/services/productAnalytics/shieldBypassSummary"
import {
  getTempContextTaskMetadata,
  isProtectionBypassExecution,
  isProtectionBypassTaskPermitted,
  isTempContextTask,
  PROTECTION_BYPASS_CAPABILITY_KINDS,
  PROTECTION_BYPASS_DECISION_RESULTS,
  PROTECTION_BYPASS_DENIED_REASONS,
  PROTECTION_BYPASS_EXECUTION_KINDS,
  PROTECTION_BYPASS_EXECUTION_VERSION,
  PROTECTION_BYPASS_USER_COMMAND_FEATURES,
  TEMP_CONTEXT_TASK_KINDS,
  type ProtectionBypassExecuteRequest,
  type ProtectionBypassExecutionResolutionFailure,
  type ProtectionBypassSurface,
  type ResolvedProtectionBypassExecution,
  type TempContextTask,
  type TempContextTaskResult,
} from "~/services/protectionBypass/contracts"
import {
  evaluateProtectionBypassPolicy,
  type ProtectionBypassCapability,
  type ProtectionBypassPolicyState,
} from "~/services/protectionBypass/policy"
import { readProtectionBypassPolicy } from "~/services/protectionBypass/preferencePolicy"
import { hasWindowsAPI } from "~/utils/browser/browserApi"
import { isProtectionBypassFirefoxEnv } from "~/utils/browser/protectionBypass"
import { t } from "~/utils/i18n/core"

import {
  validateProtectionBypassTaskResource,
  type ValidateProtectionBypassTaskResource,
} from "./protectionBypassResourceValidation"
import {
  executeAuthorizedTempContextTask,
  type AuthorizedTempContextOutcome,
  type AuthorizeTempContextAtAcquire,
} from "./tempWindowPool"

type ExecuteAuthorizedTask = (
  task: TempContextTask,
  presentationSource: ProtectionBypassSurface,
  authorizeAtAcquire: AuthorizeTempContextAtAcquire,
  sendResponse: (response?: any) => void,
  reportOutcome: (outcome: AuthorizedTempContextOutcome) => void,
) => Promise<void>

const executeCoordinatorAuthorizedTask: ExecuteAuthorizedTask =
  executeAuthorizedTempContextTask

export { getProtectionBypassDecisionErrorCode } from "~/services/protectionBypass/decisionErrorCode"

/** Builds the operation-specific failure response used at runtime boundaries. */
function buildTaskFailure(
  task: TempContextTask | undefined,
  code: ApiErrorCode,
) {
  const error = t("messages:background.tempWindowPolicyContextInvalid")
  if (task?.kind === TEMP_CONTEXT_TASK_KINDS.TurnstileFetch) {
    return {
      success: false,
      error,
      code,
      turnstile: { status: "error", hasTurnstile: false },
    }
  }
  if (task?.kind === TEMP_CONTEXT_TASK_KINDS.NativePageAction) {
    return { success: false, reason: "trigger_failed", error, code }
  }
  return { success: false, error, code }
}

/** Reads the current persisted policy without converting storage failures to defaults. */
async function readCurrentPolicy(): Promise<ProtectionBypassPolicyState> {
  return await readProtectionBypassPolicy(async () => {
    const preferences = await userPreferences.getPreferencesStrict()
    return {
      ...(DEFAULT_PREFERENCES.tempWindowFallback as TempWindowFallbackPreferences),
      ...(preferences.tempWindowFallback as
        | TempWindowFallbackPreferences
        | undefined),
    }
  })
}

/** Resolves browser support only after current policy has been read. */
async function resolveCurrentCapability(
  policy: ProtectionBypassPolicyState,
): Promise<ProtectionBypassCapability> {
  if ("kind" in policy) {
    return { kind: PROTECTION_BYPASS_CAPABILITY_KINDS.AdapterUnavailable }
  }
  if (
    isProtectionBypassFirefoxEnv() &&
    !(await hasCookieInterceptorPermissions())
  ) {
    return { kind: PROTECTION_BYPASS_CAPABILITY_KINDS.PermissionRequired }
  }
  return {
    kind: PROTECTION_BYPASS_CAPABILITY_KINDS.Available,
    adapter:
      policy.preferredMode === TEMP_CONTEXT_MODES.Tab || hasWindowsAPI()
        ? policy.preferredMode
        : TEMP_CONTEXT_MODES.Tab,
  }
}

/** Resolves plain invocation intent without consulting runtime grant state. */
export function resolveProtectionBypassExecution(
  execution: unknown,
):
  | ResolvedProtectionBypassExecution
  | ProtectionBypassExecutionResolutionFailure {
  if (execution === undefined) {
    return {
      kind: "invalid",
      reason: PROTECTION_BYPASS_DENIED_REASONS.MissingExecution,
    }
  }
  if (!isProtectionBypassExecution(execution)) {
    return {
      kind: "invalid",
      reason: PROTECTION_BYPASS_DENIED_REASONS.InvalidExecution,
    }
  }
  if (execution.kind === PROTECTION_BYPASS_EXECUTION_KINDS.Automatic) {
    return Object.freeze({ ...execution }) as Extract<
      ResolvedProtectionBypassExecution,
      { kind: typeof PROTECTION_BYPASS_EXECUTION_KINDS.Automatic }
    >
  }
  return Object.freeze({
    version: PROTECTION_BYPASS_EXECUTION_VERSION,
    kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
    command:
      execution.command as keyof typeof PROTECTION_BYPASS_USER_COMMAND_FEATURES,
    feature:
      PROTECTION_BYPASS_USER_COMMAND_FEATURES[
        execution.command as keyof typeof PROTECTION_BYPASS_USER_COMMAND_FEATURES
      ],
    surface: execution.surface,
  })
}

/** Creates the background coordinator for plain protection-bypass intent. */
export function createProtectionBypassCoordinator({
  readPolicy = readCurrentPolicy,
  resolveCapability = resolveCurrentCapability,
  executeAuthorizedTask = executeCoordinatorAuthorizedTask,
  recordDecision = recordProtectionBypassDecision,
  validateTaskResource = validateProtectionBypassTaskResource,
}: {
  readPolicy?: () => Promise<ProtectionBypassPolicyState>
  resolveCapability?: (
    policy: ProtectionBypassPolicyState,
  ) => Promise<ProtectionBypassCapability>
  executeAuthorizedTask?: ExecuteAuthorizedTask
  recordDecision?: (summary: ProtectionBypassDecisionSummary) => Promise<void>
  validateTaskResource?: ValidateProtectionBypassTaskResource
} = {}) {
  return {
    /** Validates and executes one protected task through acquire-time policy. */
    async execute<TTask extends TempContextTask>(
      request: ProtectionBypassExecuteRequest<TTask>,
    ): Promise<TempContextTaskResult<TTask>> {
      const task = isTempContextTask(request.task) ? request.task : undefined
      if (!task) {
        return buildTaskFailure(
          task,
          API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
        ) as TempContextTaskResult<TTask>
      }

      const resolvedExecution = resolveProtectionBypassExecution(
        request.execution,
      )
      const authorizedTask = task

      if (resolvedExecution.kind === "invalid") {
        return buildTaskFailure(
          authorizedTask,
          API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
        ) as TempContextTaskResult<TTask>
      }

      if (
        !isProtectionBypassTaskPermitted(
          resolvedExecution.feature,
          authorizedTask.kind,
        )
      ) {
        const summary: ProtectionBypassDecisionSummary = {
          feature: resolvedExecution.feature,
          invocationKind: resolvedExecution.kind,
          ...(resolvedExecution.kind ===
          PROTECTION_BYPASS_EXECUTION_KINDS.Automatic
            ? { automaticTrigger: resolvedExecution.trigger }
            : {}),
          operation: getTempContextTaskMetadata(authorizedTask).operation,
          decision: PROTECTION_BYPASS_DECISION_RESULTS.Denied,
          denialReason: PROTECTION_BYPASS_DENIED_REASONS.TaskNotPermitted,
        }
        try {
          void recordDecision(summary).catch(() => {
            // Telemetry is best effort and must never change policy outcomes.
          })
        } catch {
          // Dependency failures may also throw before returning a promise.
        }
        return buildTaskFailure(
          authorizedTask,
          API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
        ) as TempContextTaskResult<TTask>
      }

      let finalDecision:
        | ReturnType<typeof evaluateProtectionBypassPolicy>
        | undefined
      let hasRecordedDecision = false

      const authorizeAtAcquire: AuthorizeTempContextAtAcquire = async () => {
        let policy: ProtectionBypassPolicyState
        try {
          policy = await readPolicy()
        } catch {
          policy = { kind: PROTECTION_BYPASS_DECISION_RESULTS.Unavailable }
        }
        let capability: ProtectionBypassCapability
        try {
          capability = await resolveCapability(policy)
        } catch {
          capability = {
            kind: PROTECTION_BYPASS_CAPABILITY_KINDS.AdapterUnavailable,
          }
        }

        let resourceIsCurrent = false
        try {
          resourceIsCurrent = await validateTaskResource(
            authorizedTask,
            resolvedExecution,
          )
        } catch {
          resourceIsCurrent = false
        }

        finalDecision = evaluateProtectionBypassPolicy({
          execution: resolvedExecution,
          task: authorizedTask,
          policy,
          capability,
          resourceIsCurrent,
        })
        return finalDecision
      }

      const reportOutcome = (outcome: AuthorizedTempContextOutcome) => {
        if (hasRecordedDecision || !finalDecision) return
        hasRecordedDecision = true
        const summary: ProtectionBypassDecisionSummary = {
          feature: resolvedExecution.feature,
          invocationKind: resolvedExecution.kind,
          ...(resolvedExecution.kind ===
          PROTECTION_BYPASS_EXECUTION_KINDS.Automatic
            ? { automaticTrigger: resolvedExecution.trigger }
            : {}),
          operation: getTempContextTaskMetadata(authorizedTask).operation,
          decision:
            outcome.kind === PROTECTION_BYPASS_DECISION_RESULTS.Allowed
              ? PROTECTION_BYPASS_DECISION_RESULTS.Allowed
              : outcome.kind === PROTECTION_BYPASS_DECISION_RESULTS.Unavailable
                ? PROTECTION_BYPASS_DECISION_RESULTS.Unavailable
                : finalDecision.kind ===
                    PROTECTION_BYPASS_DECISION_RESULTS.Denied
                  ? PRODUCT_ANALYTICS_PROTECTION_BYPASS_DENIAL_CLASSIFICATION[
                      finalDecision.reason
                    ]
                  : PROTECTION_BYPASS_DECISION_RESULTS.Unavailable,
          ...(outcome.kind === PROTECTION_BYPASS_DECISION_RESULTS.Denied &&
          finalDecision.kind === PROTECTION_BYPASS_DECISION_RESULTS.Denied
            ? { denialReason: finalDecision.reason }
            : {}),
          ...(outcome.kind === PROTECTION_BYPASS_DECISION_RESULTS.Allowed
            ? { adapter: outcome.adapter }
            : {}),
        }
        try {
          void recordDecision(summary).catch(() => {
            // Telemetry is best effort and must never change policy outcomes.
          })
        } catch {
          // Dependency failures may also throw before returning a promise.
        }
      }

      return await new Promise<TempContextTaskResult<TTask>>(
        (resolve, reject) => {
          let responded = false
          const sendResponse = (response?: unknown) => {
            if (responded) return
            responded = true
            if (response === undefined) {
              reject(new Error("Protected task handler returned no response"))
              return
            }
            resolve(response as TempContextTaskResult<TTask>)
          }

          void executeAuthorizedTask(
            authorizedTask,
            resolvedExecution.surface,
            authorizeAtAcquire,
            sendResponse,
            reportOutcome,
          ).then(() => {
            if (!responded) {
              reject(
                new Error("Protected task handler completed without response"),
              )
            }
          }, reject)
        },
      )
    },
  }
}

export const protectionBypassCoordinator = createProtectionBypassCoordinator()
