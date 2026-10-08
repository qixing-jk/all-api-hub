import { logger } from "~/services/checkin/autoCheckin/diagnostics"
import {
  isExpectedCheckinCommandExecution,
  isUiOpenCheckinExecution,
} from "~/services/checkin/autoCheckin/execution/executionIntent"
import {
  onAutoCheckinMessage,
  type AutoCheckinDebugScheduleDailyAlarmForTodayRequest,
  type AutoCheckinGetAccountInfoRequest,
  type AutoCheckinPretriggerDailyOnUiOpenRequest,
  type AutoCheckinRunNowRequest,
  type AutoCheckinUpdateSettingsRequest,
} from "~/services/checkin/autoCheckin/messaging"
import { autoCheckinScheduler } from "~/services/checkin/autoCheckin/scheduling/schedulerCore"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import {
  INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
  isProtectionBypassExecution,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import { AutoCheckinMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { AUTO_CHECKIN_RUN_TYPE } from "~/types/autoCheckin"
import {
  TEMP_WINDOW_REQUEST_SOURCES,
  type TempWindowRequestSource,
} from "~/types/tempWindowFetch"
import { normalizeTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { isDevelopmentMode, isTestMode } from "~/utils/core/environment"
import { getErrorMessage } from "~/utils/core/error"
import { t } from "~/utils/i18n/core"

/**
 * Normalizes an optional `accountIds` payload into a unique list of account IDs.
 * Returns an error when the payload is present but invalid.
 */
function parseTargetAccountIds(accountIds: unknown):
  | {
      success: true
      targetAccountIds: string[] | undefined
    }
  | {
      success: false
      error: string
    } {
  if (accountIds === undefined) {
    return { success: true, targetAccountIds: undefined }
  }

  if (!Array.isArray(accountIds)) {
    return {
      success: false,
      error: "Invalid payload: accountIds must be a non-empty string[]",
    }
  }

  const normalized = accountIds
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0)

  if (normalized.length === 0 || normalized.length !== accountIds.length) {
    return {
      success: false,
      error: "Invalid payload: accountIds must be a non-empty string[]",
    }
  }

  return { success: true, targetAccountIds: Array.from(new Set(normalized)) }
}

/**
 * Run auto check-in immediately for all or selected accounts.
 */
export async function runAutoCheckinNow(
  data: AutoCheckinRunNowRequest = {},
  verifiedTempWindowRequestSource?: TempWindowRequestSource,
) {
  const targetIdsResult = parseTargetAccountIds(data.accountIds)
  if (!targetIdsResult.success) {
    return { success: false as const, error: targetIdsResult.error }
  }
  const tempWindowRequestSource =
    verifiedTempWindowRequestSource ??
    data.protectionBypassExecution?.surface ??
    TEMP_WINDOW_REQUEST_SOURCES.Background
  if (
    !isExpectedCheckinCommandExecution(
      data.protectionBypassExecution,
      PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
    )
  ) {
    return {
      success: false as const,
      error: INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
    }
  }

  try {
    await autoCheckinScheduler.runCheckins({
      runType: AUTO_CHECKIN_RUN_TYPE.MANUAL,
      targetAccountIds: targetIdsResult.targetAccountIds,
      tempWindowRequestSource,
      protectionBypassExecution: data.protectionBypassExecution,
    })
    return { success: true as const }
  } catch (e) {
    logger.error("Manual run failed", e)
    return { success: false as const, error: getErrorMessage(e) }
  } finally {
    try {
      await autoCheckinScheduler.scheduleNextRun({
        preserveExisting: true,
      })
    } catch (error) {
      logger.warn("Failed to reschedule after manual run", error)
    }
  }
}

/**
 * Reject debug-only auto check-in actions outside development and test modes.
 */
function ensureAutoCheckinDebugAvailable(action: string) {
  if (!isDevelopmentMode() && !isTestMode()) {
    return {
      success: false as const,
      error: `Debug action is only available in development/test mode (${action})`,
    }
  }
  return null
}

/**
 * Trigger the daily auto check-in alarm immediately in debug contexts.
 */
export async function triggerAutoCheckinDailyAlarmNow() {
  const unavailable = ensureAutoCheckinDebugAvailable(
    AutoCheckinMessageTypes.DebugTriggerDailyAlarmNow,
  )
  if (unavailable) return unavailable
  await autoCheckinScheduler.debugTriggerDailyAlarmNow()
  return { success: true as const }
}

/**
 * Trigger the retry auto check-in alarm immediately in debug contexts.
 */
export async function triggerAutoCheckinRetryAlarmNow() {
  const unavailable = ensureAutoCheckinDebugAvailable(
    AutoCheckinMessageTypes.DebugTriggerRetryAlarmNow,
  )
  if (unavailable) return unavailable
  await autoCheckinScheduler.debugTriggerRetryAlarmNow()
  return { success: true as const }
}

/**
 * Clear the stored last daily-run day in debug contexts.
 */
export async function resetAutoCheckinLastDailyRunDay() {
  const unavailable = ensureAutoCheckinDebugAvailable(
    AutoCheckinMessageTypes.DebugResetLastDailyRunDay,
  )
  if (unavailable) return unavailable
  await autoCheckinScheduler.debugResetLastDailyRunDay()
  return { success: true as const }
}

/**
 * Schedule today's daily auto check-in alarm in debug contexts.
 */
export async function scheduleAutoCheckinDailyAlarmForToday(
  data: AutoCheckinDebugScheduleDailyAlarmForTodayRequest = {},
) {
  const unavailable = ensureAutoCheckinDebugAvailable(
    AutoCheckinMessageTypes.DebugScheduleDailyAlarmForToday,
  )
  if (unavailable) return unavailable
  const scheduledTime =
    await autoCheckinScheduler.debugScheduleDailyAlarmForToday({
      minutesFromNow: data.minutesFromNow,
    })
  return { success: true as const, scheduledTime }
}

/**
 * Pretrigger the daily auto check-in flow when the UI opens.
 */
export async function pretriggerAutoCheckinDailyOnUiOpen(
  data: AutoCheckinPretriggerDailyOnUiOpenRequest = {},
  verifiedTempWindowRequestSource?: TempWindowRequestSource,
) {
  const tempWindowRequestSource =
    verifiedTempWindowRequestSource ??
    data.protectionBypassExecution?.surface ??
    TEMP_WINDOW_REQUEST_SOURCES.Background
  if (
    !isUiOpenCheckinExecution(
      data.protectionBypassExecution,
      tempWindowRequestSource,
    )
  ) {
    return {
      success: false as const,
      error: INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
    }
  }
  const result = await autoCheckinScheduler.pretriggerDailyOnUiOpen({
    requestId: data.requestId,
    dryRun: data.dryRun,
    debug: data.debug,
    tempWindowRequestSource,
    protectionBypassExecution: data.protectionBypassExecution,
  })
  return { success: true as const, ...result }
}

/**
 * Retry auto check-in for one failed account.
 */
export async function retryAutoCheckinAccount(
  accountId?: string,
  tempWindowRequestSource?: unknown,
  protectionBypassExecution?: unknown,
  verifiedTempWindowRequestSource?: TempWindowRequestSource,
) {
  if (!accountId) {
    return { success: false as const, error: "Missing accountId" }
  }
  if (
    !isExpectedCheckinCommandExecution(
      protectionBypassExecution,
      PROTECTION_BYPASS_USER_COMMANDS.RetryCheckinAccount,
    )
  ) {
    return {
      success: false as const,
      error: INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
    }
  }
  const outcome = await autoCheckinScheduler.retryAccount(
    accountId,
    verifiedTempWindowRequestSource ??
      normalizeTempWindowRequestSource(tempWindowRequestSource),
    protectionBypassExecution,
  )
  return {
    success: true as const,
    ...(outcome?.result ? { result: outcome.result } : {}),
  }
}

/** Verify a selected method's current status without issuing a check-in POST. */
async function verifyAutoCheckinAccountStatus(accountId?: string) {
  if (!accountId) {
    return { success: false as const, error: "Missing accountId" }
  }
  const result = await autoCheckinScheduler.verifyAccountStatus(accountId)
  if (result.outcome === "verified") {
    if (result.verifiedStatus === "unknown") {
      return {
        success: false as const,
        outcome: "unknown" as const,
        error: t("autoCheckin:messages.error.statusVerificationFailed"),
      }
    }
    return {
      success: true as const,
      outcome: result.outcome,
      ...(result.verifiedStatus
        ? { verifiedStatus: result.verifiedStatus }
        : {}),
    }
  }
  return {
    success: false as const,
    outcome: result.outcome,
    error: result.error,
  }
}

/**
 * Load display data for one account before opening manual check-in pages.
 */
export async function getAutoCheckinAccountInfo(
  data: AutoCheckinGetAccountInfoRequest,
) {
  if (!data.accountId) {
    return { success: false as const, error: "Missing accountId" }
  }
  const displayData = await autoCheckinScheduler.getAccountDisplayData(
    data.accountId,
    { includeDisabled: data.includeDisabled === true },
  )
  return { success: true as const, data: displayData }
}

/**
 * Load the latest persisted auto check-in status.
 */
export async function getAutoCheckinStatus() {
  const status = await autoCheckinStorage.getStatus()
  return { success: true as const, data: status }
}

/**
 * Persist auto check-in scheduler settings.
 */
export async function updateAutoCheckinSettings(
  settings: AutoCheckinUpdateSettingsRequest["settings"],
) {
  await autoCheckinScheduler.updateSettings(settings)
  return { success: true as const }
}

/**
 * Convert auto check-in listener errors into runtime responses.
 */
function toAutoCheckinFailure(error: unknown) {
  logger.error("Message handling failed", error)
  return { success: false as const, error: getErrorMessage(error) }
}

/** Validates plain execution intent before forwarding a typed check-in request. */
async function resolveVerifiedAutoCheckinMessage<T>(
  execution: unknown,
  resolve: (tempWindowRequestSource: TempWindowRequestSource) => Promise<T>,
) {
  if (!isProtectionBypassExecution(execution)) {
    return {
      success: false as const,
      error: INVALID_PROTECTION_BYPASS_EXECUTION_ERROR,
    }
  }
  return await resolve(execution.surface)
}

let autoCheckinMessagingCleanup: (() => void)[] | null = null

/**
 * Register typed background listeners for auto check-in runtime messages.
 */
export function setupAutoCheckinMessagingListeners() {
  if (autoCheckinMessagingCleanup) {
    return
  }

  autoCheckinMessagingCleanup = [
    onAutoCheckinMessage(AutoCheckinMessageTypes.RunNow, async ({ data }) => {
      try {
        return await resolveVerifiedAutoCheckinMessage(
          data?.protectionBypassExecution,
          (tempWindowRequestSource) =>
            runAutoCheckinNow(data, tempWindowRequestSource),
        )
      } catch (error) {
        return toAutoCheckinFailure(error)
      }
    }),
    onAutoCheckinMessage(
      AutoCheckinMessageTypes.DebugTriggerDailyAlarmNow,
      async () => {
        try {
          return await triggerAutoCheckinDailyAlarmNow()
        } catch (error) {
          return toAutoCheckinFailure(error)
        }
      },
    ),
    onAutoCheckinMessage(
      AutoCheckinMessageTypes.DebugTriggerRetryAlarmNow,
      async () => {
        try {
          return await triggerAutoCheckinRetryAlarmNow()
        } catch (error) {
          return toAutoCheckinFailure(error)
        }
      },
    ),
    onAutoCheckinMessage(
      AutoCheckinMessageTypes.DebugResetLastDailyRunDay,
      async () => {
        try {
          return await resetAutoCheckinLastDailyRunDay()
        } catch (error) {
          return toAutoCheckinFailure(error)
        }
      },
    ),
    onAutoCheckinMessage(
      AutoCheckinMessageTypes.DebugScheduleDailyAlarmForToday,
      async ({ data }) => {
        try {
          return await scheduleAutoCheckinDailyAlarmForToday(data)
        } catch (error) {
          return toAutoCheckinFailure(error)
        }
      },
    ),
    onAutoCheckinMessage(
      AutoCheckinMessageTypes.PretriggerDailyOnUiOpen,
      async ({ data }) => {
        try {
          return await resolveVerifiedAutoCheckinMessage(
            data?.protectionBypassExecution,
            (tempWindowRequestSource) =>
              pretriggerAutoCheckinDailyOnUiOpen(data, tempWindowRequestSource),
          )
        } catch (error) {
          return toAutoCheckinFailure(error)
        }
      },
    ),
    onAutoCheckinMessage(
      AutoCheckinMessageTypes.RetryAccount,
      async ({ data }) => {
        try {
          return await resolveVerifiedAutoCheckinMessage(
            data?.protectionBypassExecution,
            (tempWindowRequestSource) =>
              retryAutoCheckinAccount(
                data.accountId,
                data.protectionBypassExecution?.surface,
                data.protectionBypassExecution,
                tempWindowRequestSource,
              ),
          )
        } catch (error) {
          return toAutoCheckinFailure(error)
        }
      },
    ),
    onAutoCheckinMessage(
      AutoCheckinMessageTypes.VerifyAccountStatus,
      async ({ data }) => {
        try {
          return await verifyAutoCheckinAccountStatus(data.accountId)
        } catch (error) {
          return toAutoCheckinFailure(error)
        }
      },
    ),
    onAutoCheckinMessage(
      AutoCheckinMessageTypes.GetAccountInfo,
      async ({ data }) => {
        try {
          return await getAutoCheckinAccountInfo(data)
        } catch (error) {
          return toAutoCheckinFailure(error)
        }
      },
    ),
    onAutoCheckinMessage(AutoCheckinMessageTypes.GetStatus, async () => {
      try {
        return await getAutoCheckinStatus()
      } catch (error) {
        return toAutoCheckinFailure(error)
      }
    }),
    onAutoCheckinMessage(
      AutoCheckinMessageTypes.UpdateSettings,
      async ({ data }) => {
        try {
          return await updateAutoCheckinSettings(data.settings)
        } catch (error) {
          return toAutoCheckinFailure(error)
        }
      },
    ),
  ]
}
