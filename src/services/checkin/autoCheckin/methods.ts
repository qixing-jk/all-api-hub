import {
  CHECK_IN_EXECUTION_SKIP_REASONS,
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_EXECUTION_RESULT_KINDS,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES,
  CHECK_IN_SELECTION_STATUSES,
} from "~/constants/checkIn"
import { ApiError } from "~/services/apiTransport/errors"
import {
  CHECK_IN_CONFIRMATION_KINDS,
  confirmCheckInAttempt,
  type CheckInConfirmation,
} from "~/services/checkin/autoCheckin/confirmation"
import { logger } from "~/services/checkin/autoCheckin/diagnostics"
import {
  inspectAccountCheckIn,
  resolveSelectedCheckInMethod,
  shouldAutomaticallyDiscoverAccountCheckIn,
} from "~/services/checkin/autoCheckin/discovery/inspection"
import {
  CheckInExecutionError,
  getCheckInMethodUnknownReason,
} from "~/services/checkin/autoCheckin/errors"
import {
  hasSameCheckInAccountIdentity,
  inspectCheckInMutationAdmission,
  toProviderReadinessSkipReason,
} from "~/services/checkin/autoCheckin/execution/checkInMutationAdmission"
import { canAutomaticallyRetryCheckinResult } from "~/services/checkin/autoCheckin/execution/resultPolicy"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import {
  CHECK_IN_STATUS_DAY_GUARD_OWNERS,
  type AutoCheckinMutationLifecycle,
  type AutoCheckinProvider,
  type AutoCheckinProviderContext,
} from "~/services/checkin/autoCheckin/providers/contracts"
import { readProviderDetectResult } from "~/services/checkin/autoCheckin/providers/detection"
import {
  getCheckInResetTimeZone,
  isCheckInMethodId,
  NON_REPEAT_SAFE_CHECKIN_METHOD_IDS,
  type AutoCheckinMethodRegistration,
} from "~/services/checkin/autoCheckin/providers/registry"
import type {
  AutoCheckinProviderOutcome,
  AutoCheckinProviderResult,
} from "~/services/checkin/autoCheckin/providers/types"
import { canConfirmSelectedCheckInMethod } from "~/services/checkin/autoCheckin/skipReasons"
import {
  isPersistableInitialCheckInDetection,
  replaceCheckInMethodDetection,
  replaceCheckInMethodStatus,
} from "~/services/checkin/autoCheckin/state"
import { readDayStableCheckInObservation } from "~/services/checkin/statusObservation"
import { createKeyedTaskQueue } from "~/services/core/keyedTaskQueue"
import { PROTECTION_BYPASS_EXECUTION_KINDS } from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import type {
  CheckInConfig,
  CheckInExecutionSkipReason,
  CheckInMethodDetection,
  CheckInMethodId,
  CheckInMethodStatus,
  CheckInMethodUnknownReason,
} from "~/types/checkIn"
import { safeRandomUUID } from "~/utils/core/identifier"

/**
 * A provider outcome plus the retry decision the policy derived from it. The
 * decision deliberately lives outside the provider result: providers cannot set
 * it, and the retry queue reads the persisted copy this produces.
 */
type DecidedCheckInResult = AutoCheckinProviderResult & { retryable: boolean }

type ExecuteSelectedCheckInResult =
  | {
      kind: typeof CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Executed
      methodId: CheckInMethodId
      result: AutoCheckinProviderResult
      confirmation: CheckInConfirmation
      /** Whether a later attempt can safely begin with authoritative readback. */
      retryable: boolean
      /**
       * Protocol completion time when supplied; otherwise the observation time.
       * `confirmation.observedAt` determines freshness, including for waiters.
       */
      completedAt?: number
      /** Identifies this local execution independently of upstream award events. */
      executionReceiptId?: string
      /** A waiter observed this attempt without executing another mutation. */
      reused?: true
    }
  | {
      kind: typeof CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped
      reason: CheckInExecutionSkipReason
    }
  | {
      /** Execution or local state recovery failed; persisted as an existing failed result. */
      kind: typeof CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Blocked
      reason: CheckInExecutionSkipReason
      retryable: boolean
      completedAt?: number
      reused?: true
    }

const resolveSelectedCheckInRegistration = (input: {
  account: SiteAccount
  globalAutomaticExecutionEnabled: boolean
  loginProviderClaimedByAnother?: boolean
}) => {
  const state = inspectAccountCheckIn({
    config: input.account.checkIn,
    siteType: input.account.site_type,
    siteUrl: input.account.site_url,
    accountDisabled: input.account.disabled,
    globalAutomaticExecutionEnabled: input.globalAutomaticExecutionEnabled,
    loginProviderClaimedByAnother: input.loginProviderClaimedByAnother,
  })
  const registration = state.executionEligibility.eligible
    ? autoCheckinMethodRegistry.resolveById(state.executionEligibility.methodId)
    : null

  return { state, registration }
}

const toStatusReadSkipReason = (
  error: unknown,
  classifyStatusError: NonNullable<
    AutoCheckinProvider["classifyStatusError"]
  > = getCheckInMethodUnknownReason,
): CheckInExecutionSkipReason => {
  if (
    error instanceof ApiError &&
    (error.statusCode === 404 || error.statusCode === 405)
  ) {
    return CHECK_IN_EXECUTION_SKIP_REASONS.MethodUnsupported
  }
  return toUnknownStatusSkipReason(classifyStatusError(error))
}

const canRetryStatusConfirmationFailure = (
  reason: CheckInExecutionSkipReason,
): boolean =>
  reason === CHECK_IN_EXECUTION_SKIP_REASONS.NetworkError ||
  reason === CHECK_IN_EXECUTION_SKIP_REASONS.Timeout ||
  reason === CHECK_IN_EXECUTION_SKIP_REASONS.SourceUnavailable ||
  reason === CHECK_IN_EXECUTION_SKIP_REASONS.StatusUnavailable

const statusReadFailure = (
  reason: CheckInExecutionSkipReason,
): ExecuteSelectedCheckInResult =>
  reason === CHECK_IN_EXECUTION_SKIP_REASONS.AuthenticationRequired ||
  reason === CHECK_IN_EXECUTION_SKIP_REASONS.PermissionDenied
    ? { kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped, reason }
    : {
        kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Blocked,
        reason,
        retryable: canRetryStatusConfirmationFailure(reason),
        completedAt: Date.now(),
      }

const isAccountAccessFailure = (reason: CheckInExecutionSkipReason) =>
  reason === CHECK_IN_EXECUTION_SKIP_REASONS.AuthenticationRequired ||
  reason === CHECK_IN_EXECUTION_SKIP_REASONS.PermissionDenied ||
  reason === CHECK_IN_EXECUTION_SKIP_REASONS.AccountUnavailable

const toUnknownStatusSkipReason = (
  reason: CheckInMethodUnknownReason,
): CheckInExecutionSkipReason => {
  switch (reason) {
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.AuthenticationRequired:
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.IdentityMismatch:
      return CHECK_IN_EXECUTION_SKIP_REASONS.AuthenticationRequired
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.PermissionDenied:
      return CHECK_IN_EXECUTION_SKIP_REASONS.PermissionDenied
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.CredentialPersistenceFailed:
      return CHECK_IN_EXECUTION_SKIP_REASONS.AccountUnavailable
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.Network:
      return CHECK_IN_EXECUTION_SKIP_REASONS.NetworkError
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.Timeout:
      return CHECK_IN_EXECUTION_SKIP_REASONS.Timeout
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.SourceUnavailable:
      return CHECK_IN_EXECUTION_SKIP_REASONS.SourceUnavailable
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.InvalidResponse:
      return CHECK_IN_EXECUTION_SKIP_REASONS.StatusUnavailable
  }
}

const accountStateWriteFailure = (): ExecuteSelectedCheckInResult => ({
  kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Blocked,
  reason: CHECK_IN_EXECUTION_SKIP_REASONS.AccountUnavailable,
  retryable: false,
  completedAt: Date.now(),
})

const createMutationLifecycle = (): AutoCheckinMutationLifecycle => {
  const lifecycle: AutoCheckinMutationLifecycle = {
    dispatched: false,
    responseReceived: false,
    onDispatch() {
      lifecycle.dispatched = true
    },
    onResponse() {
      lifecycle.responseReceived = true
    },
    onPreHandlerUnauthorized() {
      lifecycle.dispatched = false
      lifecycle.responseReceived = false
    },
  }
  return lifecycle
}

type RevalidateCheckInAccount = (
  refreshedConfig?: CheckInConfig,
) => Promise<SiteAccount | null>

/** Saves authoritative capability loss through the account-state merge used by status readback. */
const persistUnsupportedMethod = async (
  account: SiteAccount,
  methodId: CheckInMethodId,
  revalidateAccount?: RevalidateCheckInAccount,
): Promise<boolean> => {
  if (!revalidateAccount) return true
  try {
    return (
      (await revalidateAccount(
        replaceCheckInMethodDetection({
          config: account.checkIn,
          methodId,
          detection: {
            outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported,
            evidence: {
              source: CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe,
              observedAt: Date.now(),
            },
          },
        }),
      )) !== null
    )
  } catch {
    return false
  }
}

/** Rechecks account identity, intent, selection, and readiness before a recovered POST. */
const createRecoveredMutationGuard = (input: {
  currentAccount: SiteAccount
  refreshedConfig?: CheckInConfig
  globalAutomaticExecutionEnabled: boolean
  registration: AutoCheckinMethodRegistration
  revalidateAccount?: RevalidateCheckInAccount
  isAutomaticExecutionEnabled?: () => Promise<boolean>
}): (() => Promise<boolean>) | undefined => {
  const revalidateAccount = input.revalidateAccount
  if (!revalidateAccount) return undefined

  return async () => {
    let latestAccount: SiteAccount | null
    try {
      latestAccount = await revalidateAccount(input.refreshedConfig)
    } catch {
      return false
    }
    const admission = await inspectCheckInMutationAdmission({
      expectedAccount: input.currentAccount,
      account: latestAccount,
      registration: input.registration,
      globalAutomaticExecutionEnabled: input.globalAutomaticExecutionEnabled,
      isAutomaticExecutionEnabled: input.isAutomaticExecutionEnabled,
    })
    return admission.eligible
  }
}

const withAutomaticRetry = (
  result: AutoCheckinProviderResult,
  methodId: AutoCheckinMethodRegistration["id"],
): DecidedCheckInResult => ({
  ...result,
  retryable: canAutomaticallyRetryCheckinResult(result, methodId),
})

/** Gather final evidence without taking over provider-owned login sessions. */
const reconcileProviderResult = async (input: {
  account: SiteAccount
  methodId: AutoCheckinMethodRegistration["id"]
  providerResult: AutoCheckinProviderOutcome
  startedAt: number
  getStatus?: NonNullable<AutoCheckinProvider["getStatus"]>
}): Promise<{
  result: DecidedCheckInResult
  confirmation: CheckInConfirmation
}> => {
  const execution = await confirmCheckInAttempt({
    account: input.account,
    timeZone: getCheckInResetTimeZone(input.methodId),
    result: input.providerResult,
    startedAt: input.startedAt,
    readStatus: input.getStatus
      ? async () => {
          const status = await input.getStatus!({
            account: input.account,
            observedAt: Date.now(),
            dayBoundaryGuardOwner: CHECK_IN_STATUS_DAY_GUARD_OWNERS.Caller,
          })
          return status ? { status } : undefined
        }
      : undefined,
  })
  return {
    result: withAutomaticRetry(execution.result, input.methodId),
    confirmation: execution.confirmation,
  }
}

/** Adds provider authentication readiness without exposing the provider. */
export function inspectSelectedCheckInCompatibility(input: {
  account: SiteAccount
  globalAutomaticExecutionEnabled: boolean
  loginProviderClaimedByAnother?: boolean
}) {
  const { state } = resolveSelectedCheckInRegistration({
    account: input.account,
    globalAutomaticExecutionEnabled: input.globalAutomaticExecutionEnabled,
    loginProviderClaimedByAnother: input.loginProviderClaimedByAnother,
  })
  // Routine execution skips do not make a confirmed method's credentials unusable.
  const registration =
    state.selectionState.status === CHECK_IN_SELECTION_STATUSES.Selected
      ? autoCheckinMethodRegistry.resolveById(state.selectionState.methodId)
      : null
  const providerReadiness = registration?.provider.getReadiness(input.account)
  return {
    state,
    providerReadiness: providerReadiness ?? null,
    providerAvailable: providerReadiness?.ready === true,
  }
}

/** Records confirmed evidence for the selected method without changing selection. */
const recordConfirmedMethodProbe = (input: {
  config: CheckInConfig
  methodId: CheckInMethodId
  detection: CheckInMethodDetection
  status?: CheckInMethodStatus
}): CheckInConfig => {
  const previous = input.config.methodKnowledge.methods[input.methodId]
  if (
    previous?.detection?.outcome === CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched
  )
    return input.config
  return {
    ...input.config,
    methodKnowledge: {
      ...input.config.methodKnowledge,
      methods: {
        ...input.config.methodKnowledge.methods,
        [input.methodId]: {
          ...previous,
          detection: input.detection,
          ...(input.status ? { status: input.status } : {}),
        },
      },
    },
  }
}

/** Confirms one selected method with that provider's own request timing. */
const probeSelectedMethod = async (
  registration: AutoCheckinMethodRegistration,
  account: SiteAccount,
  attempt?: ReturnType<NonNullable<AutoCheckinProvider["forExecution"]>>,
): Promise<
  | { detection: CheckInMethodDetection; status?: CheckInMethodStatus }
  | undefined
> => {
  if (!registration.provider.detect) return undefined
  try {
    const detect = attempt?.detect
    if (detect) {
      const stable = await readDayStableCheckInObservation(
        () =>
          detect({
            account,
            observedAt: Date.now(),
            dayBoundaryGuardOwner: CHECK_IN_STATUS_DAY_GUARD_OWNERS.Caller,
          }),
        getCheckInResetTimeZone(registration.id),
      )
      return stable && readProviderDetectResult(stable.observation)
    }
    return readProviderDetectResult(
      await registration.provider.detect({
        account,
        observedAt: Date.now(),
      }),
    )
  } catch {
    return undefined
  }
}

/**
 * Both selection modes confirm the same selected method before execution.
 * Background runs prepare stale evidence through the persistent cooldown;
 * explicit execution can reconfirm immediately. Uncertain probes do not
 * replace saved evidence or permit mutation.
 */
const SELECTED_METHOD_CONFIRMATION_OUTCOMES = {
  Continue: "continue",
  Finished: "finished",
} as const

const confirmSelectedCheckInMethod = async (input: {
  account: SiteAccount
  confirmAfterDiscovery?: CheckInMethodId
  context: AutoCheckinProviderContext
  globalAutomaticExecutionEnabled: boolean
  loginProviderClaimedByAnother?: boolean
  revalidateAccount?: RevalidateCheckInAccount
  isAutomaticExecutionEnabled?: () => Promise<boolean>
}): Promise<
  | {
      outcome: typeof SELECTED_METHOD_CONFIRMATION_OUTCOMES.Continue
      account: SiteAccount
      attempt?: ReturnType<NonNullable<AutoCheckinProvider["forExecution"]>>
    }
  | {
      outcome: typeof SELECTED_METHOD_CONFIRMATION_OUTCOMES.Finished
      result: ExecuteSelectedCheckInResult
    }
> => {
  const selection = input.account.checkIn.selection
  const methodId = selection.methodId
  if (
    !isCheckInMethodId(methodId) ||
    input.account.checkIn.methodKnowledge.methods[methodId]?.detection
      ?.outcome === CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched ||
    (input.isAutomaticExecutionEnabled &&
      input.confirmAfterDiscovery !== methodId &&
      (input.account.checkIn.methodKnowledge.methods[methodId]?.detection ||
        !shouldAutomaticallyDiscoverAccountCheckIn(input.account)))
  ) {
    return {
      outcome: SELECTED_METHOD_CONFIRMATION_OUTCOMES.Continue,
      account: input.account,
    }
  }

  const state = inspectAccountCheckIn({
    config: input.account.checkIn,
    siteType: input.account.site_type,
    siteUrl: input.account.site_url,
    accountDisabled: input.account.disabled,
    globalAutomaticExecutionEnabled: input.globalAutomaticExecutionEnabled,
    loginProviderClaimedByAnother: input.loginProviderClaimedByAnother,
  })
  if (
    state.executionEligibility.eligible ||
    !canConfirmSelectedCheckInMethod(state.executionEligibility.skipReason)
  ) {
    return {
      outcome: SELECTED_METHOD_CONFIRMATION_OUTCOMES.Continue,
      account: input.account,
    }
  }

  const registration = autoCheckinMethodRegistry.resolveById(methodId)
  if (!registration) {
    return {
      outcome: SELECTED_METHOD_CONFIRMATION_OUTCOMES.Continue,
      account: input.account,
    }
  }
  const attempt = registration.provider.forExecution?.(input.context)
  const probed = await probeSelectedMethod(registration, input.account, attempt)
  if (
    attempt?.detect &&
    probed?.detection.outcome === CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown
  ) {
    const reason = toUnknownStatusSkipReason(probed.detection.reason)
    if (isAccountAccessFailure(reason)) {
      return {
        outcome: SELECTED_METHOD_CONFIRMATION_OUTCOMES.Finished,
        result: statusReadFailure(reason),
      }
    }
  }
  if (!probed || !isPersistableInitialCheckInDetection(probed.detection)) {
    return {
      outcome: SELECTED_METHOD_CONFIRMATION_OUTCOMES.Continue,
      account: input.account,
      attempt,
    }
  }

  const updatedConfig = recordConfirmedMethodProbe({
    config: input.account.checkIn,
    methodId,
    detection: probed.detection,
    status: probed.status,
  })
  let account = { ...input.account, checkIn: updatedConfig }
  if (input.revalidateAccount) {
    try {
      const persisted = await input.revalidateAccount(updatedConfig)
      if (!persisted) {
        return {
          outcome: SELECTED_METHOD_CONFIRMATION_OUTCOMES.Finished,
          result: accountStateWriteFailure(),
        }
      }
      if (!hasSameCheckInAccountIdentity(input.account, persisted)) {
        return {
          outcome: SELECTED_METHOD_CONFIRMATION_OUTCOMES.Finished,
          result: {
            kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
            reason: CHECK_IN_EXECUTION_SKIP_REASONS.AccountUnavailable,
          },
        }
      }
      if (
        persisted.checkIn.selection.methodId !== methodId ||
        persisted.checkIn.selection.mode !== selection.mode
      ) {
        // The reloaded selection owns its own admission and browser binding.
        return {
          outcome: SELECTED_METHOD_CONFIRMATION_OUTCOMES.Continue,
          account: persisted,
        }
      }
      account = persisted
    } catch {
      return {
        outcome: SELECTED_METHOD_CONFIRMATION_OUTCOMES.Finished,
        result: accountStateWriteFailure(),
      }
    }
  }
  if (
    probed.detection.outcome === CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported
  ) {
    return {
      outcome: SELECTED_METHOD_CONFIRMATION_OUTCOMES.Finished,
      result: {
        kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
        reason: CHECK_IN_EXECUTION_SKIP_REASONS.MethodUnsupported,
      },
    }
  }
  return {
    outcome: SELECTED_METHOD_CONFIRMATION_OUTCOMES.Continue,
    account,
    attempt,
  }
}

type ExecuteSelectedCheckInInput = {
  account: SiteAccount
  /** This daily run completed passive discovery and the selected protocol required authentication. */
  confirmAfterDiscovery?: CheckInMethodId
  globalAutomaticExecutionEnabled: boolean
  context: AutoCheckinProviderContext
  revalidateAccount?: RevalidateCheckInAccount
  /** Rechecks unattended-run intent immediately before an initial or recovered POST. */
  isAutomaticExecutionEnabled?: () => Promise<boolean>
  /**
   * Resolved cross-account fact: another enabled account already owns the
   * browser login provider this account claims. Unset keeps the run unblocked.
   */
  loginProviderClaimedByAnother?: boolean
  /**
   * Retry safety guard: a method with readback must confirm current status
   * before another mutation. A method without readback is not blocked by it and
   * submits directly; providers may also require this for initial runs through
   * `requiresAuthoritativeStatusBeforeMutation`.
   */
  requireStatusConfirmationBeforeMutation?: boolean
}

type ActiveAccountExecution = {
  input: ExecuteSelectedCheckInInput
  promise: Promise<ExecuteSelectedCheckInResult>
}

type AccountExecutionGroup = {
  pendingCallers: number
  /** The last actual attempt; a skipped waiter must not erase its outcome. */
  attempt?: ActiveAccountExecution
}

const accountExecutionQueue = createKeyedTaskQueue()
const activeAccountExecutions = new Map<string, AccountExecutionGroup>()

/**
 * Reuse an overlapping attempt instead of replaying a successful or uncertain
 * write. A manual command may recover an automatic failure, but only with its
 * own authority and fresh authoritative readback from a repeat-safe method.
 */
async function continueAfterAccountExecution(
  input: ExecuteSelectedCheckInInput,
  previous: ActiveAccountExecution,
  execute: (
    input: ExecuteSelectedCheckInInput,
  ) => Promise<ExecuteSelectedCheckInResult>,
): Promise<ExecuteSelectedCheckInResult> {
  const result = await previous.promise.catch((error: unknown) => {
    if (!(error instanceof CheckInExecutionError)) throw error
    throw new CheckInExecutionError(error.cause, error.completedAt, true)
  })
  let latestAccount = input.account
  if (input.revalidateAccount) {
    try {
      const latest = await input.revalidateAccount()
      if (!latest)
        return {
          kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
          reason: CHECK_IN_EXECUTION_SKIP_REASONS.AccountUnavailable,
        }
      latestAccount = latest
    } catch {
      return accountStateWriteFailure()
    }
  }
  if (!hasSameCheckInAccountIdentity(input.account, latestAccount)) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: CHECK_IN_EXECUTION_SKIP_REASONS.AccountUnavailable,
    }
  }
  const methodId = resolveSelectedCheckInMethod({
    config: latestAccount.checkIn,
    siteType: latestAccount.site_type,
    siteUrl: latestAccount.site_url,
  })
  const registration = methodId
    ? autoCheckinMethodRegistry.resolveById(methodId)
    : null
  const isManualFollowingAutomatic =
    input.context.protectionBypassExecution.kind ===
      PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand &&
    previous.input.context.protectionBypassExecution.kind ===
      PROTECTION_BYPASS_EXECUTION_KINDS.Automatic
  const canRecoverAutomaticallyStartedAttempt =
    isManualFollowingAutomatic &&
    registration?.provider.getStatus &&
    !NON_REPEAT_SAFE_CHECKIN_METHOD_IDS.has(registration.id) &&
    (result.kind !== CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Executed ||
      result.result.status === CHECKIN_RESULT_STATUS.FAILED)
  const hasMutationOutcomeToReuse =
    result.kind === CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Executed &&
    result.result.status !== CHECKIN_RESULT_STATUS.FAILED
  if (registration) {
    const admission = await inspectCheckInMutationAdmission({
      expectedAccount: input.account,
      account: latestAccount,
      registration,
      globalAutomaticExecutionEnabled: input.globalAutomaticExecutionEnabled,
      loginProviderClaimedByAnother: input.loginProviderClaimedByAnother,
      isAutomaticExecutionEnabled: input.isAutomaticExecutionEnabled,
    })
    // Disabling future execution cannot erase an already completed attempt for
    // this identity and method. No new read or mutation is admitted here.
    if (
      !admission.eligible &&
      hasMutationOutcomeToReuse &&
      methodId === result.methodId &&
      hasSameCheckInAccountIdentity(previous.input.account, latestAccount) &&
      (admission.reason === CHECK_IN_EXECUTION_SKIP_REASONS.AccountDisabled ||
        admission.reason ===
          CHECK_IN_EXECUTION_SKIP_REASONS.AutomaticExecutionDisabled ||
        admission.reason ===
          CHECK_IN_EXECUTION_SKIP_REASONS.GlobalAutomaticExecutionDisabled)
    ) {
      return { ...result, reused: true }
    }
    if (
      !admission.eligible &&
      !(
        (canRecoverAutomaticallyStartedAttempt || hasMutationOutcomeToReuse) &&
        (admission.reason === CHECK_IN_EXECUTION_SKIP_REASONS.MethodDisabled ||
          admission.reason === CHECK_IN_EXECUTION_SKIP_REASONS.AlreadyChecked)
      )
    ) {
      return {
        kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
        reason: admission.reason,
      }
    }
  }
  const previousMethodId =
    result.kind === CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Executed
      ? result.methodId
      : resolveSelectedCheckInMethod({
          config: previous.input.account.checkIn,
          siteType: previous.input.account.site_type,
          siteUrl: previous.input.account.site_url,
        })
  if (
    !hasSameCheckInAccountIdentity(previous.input.account, latestAccount) ||
    methodId !== previousMethodId
  ) {
    return execute({ ...input, account: latestAccount })
  }
  if (
    result.kind === CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Executed &&
    (result.result.status === CHECKIN_RESULT_STATUS.SUCCESS ||
      result.result.status === CHECKIN_RESULT_STATUS.ALREADY_CHECKED)
  ) {
    return { ...result, reused: true }
  }
  // The global switch stopped the automatic attempt before mutation. The
  // explicit command can start even when replaying a mutation would be unsafe.
  if (
    isManualFollowingAutomatic &&
    result.kind === CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped &&
    result.reason ===
      CHECK_IN_EXECUTION_SKIP_REASONS.GlobalAutomaticExecutionDisabled
  ) {
    return execute({ ...input, account: latestAccount })
  }
  if (canRecoverAutomaticallyStartedAttempt) {
    return execute({
      ...input,
      account: latestAccount,
      requireStatusConfirmationBeforeMutation: true,
    })
  }
  return result.kind !== CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped
    ? { ...result, reused: true }
    : result
}

/** Coordinate overlapping status/mutation sequences for one saved account in this worker. */
export async function executeSelectedCheckIn(
  input: ExecuteSelectedCheckInInput,
): Promise<ExecuteSelectedCheckInResult> {
  const group = activeAccountExecutions.get(input.account.id) ?? {
    pendingCallers: 0,
  }
  group.pendingCallers++
  activeAccountExecutions.set(input.account.id, group)
  if (group.pendingCallers > 1) {
    logger.debug("Queued concurrent check-in", {
      accountId: input.account.id,
      pendingCallers: group.pendingCallers,
    })
  }
  const execute = (next: ExecuteSelectedCheckInInput) => {
    const executionReceiptId = safeRandomUUID("checkin-execution")
    const attempt = {
      input: next,
      promise: executeSelectedCheckInOnce(next)
        .then((result) =>
          result.kind === CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Executed
            ? { ...result, executionReceiptId }
            : result,
        )
        .catch((error) => {
          throw new CheckInExecutionError(error)
        }),
    }
    group.attempt = attempt
    return attempt.promise
  }
  try {
    return await accountExecutionQueue.run(input.account.id, () =>
      group.attempt
        ? continueAfterAccountExecution(input, group.attempt, execute)
        : execute(input),
    )
  } finally {
    // Keep the last attempt (including a rejection) until every overlapping
    // caller has observed it. A later independent command starts a new group.
    group.pendingCallers--
    if (group.pendingCallers === 0) {
      activeAccountExecutions.delete(input.account.id)
    }
  }
}

/** Execute after this account's preceding status/mutation sequence has settled. */
async function executeSelectedCheckInOnce(
  input: ExecuteSelectedCheckInInput,
): Promise<ExecuteSelectedCheckInResult> {
  const prepared = await confirmSelectedCheckInMethod(input)
  if (prepared.outcome === SELECTED_METHOD_CONFIRMATION_OUTCOMES.Finished)
    return prepared.result
  const account = prepared.account
  const initialState = inspectAccountCheckIn({
    config: account.checkIn,
    siteType: account.site_type,
    siteUrl: account.site_url,
    accountDisabled: account.disabled,
    globalAutomaticExecutionEnabled: input.globalAutomaticExecutionEnabled,
    loginProviderClaimedByAnother: input.loginProviderClaimedByAnother,
  })
  const canRefreshCachedStatus =
    !initialState.executionEligibility.eligible &&
    (initialState.executionEligibility.skipReason ===
      CHECK_IN_EXECUTION_SKIP_REASONS.MethodDisabled ||
      initialState.executionEligibility.skipReason ===
        CHECK_IN_EXECUTION_SKIP_REASONS.AlreadyChecked)
  if (!initialState.executionEligibility.eligible && !canRefreshCachedStatus) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: initialState.executionEligibility.skipReason,
    }
  }

  const selectedMethodId = resolveSelectedCheckInMethod({
    config: account.checkIn,
    siteType: account.site_type,
    siteUrl: account.site_url,
  })
  const registration = selectedMethodId
    ? autoCheckinMethodRegistry.resolveById(selectedMethodId)
    : null
  if (!registration) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: CHECK_IN_EXECUTION_SKIP_REASONS.NoProvider,
    }
  }
  const initialReadiness = registration.provider.getReadiness(account)
  if (!initialReadiness.ready) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: toProviderReadinessSkipReason(initialReadiness.reason),
    }
  }
  const requiresAuthoritativeStatus =
    input.requireStatusConfirmationBeforeMutation === true ||
    registration.provider.requiresAuthoritativeStatusBeforeMutation === true
  const ownsStatusAdmission =
    registration.provider.ownsStatusAdmission?.(account) === true
  let refreshedConfig: CheckInConfig | undefined
  let statusProof: AutoCheckinProviderContext["statusProof"]
  const attempt =
    prepared.attempt ?? registration.provider.forExecution?.(input.context)
  const operations = attempt ?? registration.provider
  const getAuthenticatedStatus =
    attempt?.getAuthenticatedStatus ?? operations.getStatus
  if (getAuthenticatedStatus && !ownsStatusAdmission) {
    try {
      const stable = await readDayStableCheckInObservation(
        () =>
          getAuthenticatedStatus({
            account,
            observedAt: Date.now(),
            dayBoundaryGuardOwner: CHECK_IN_STATUS_DAY_GUARD_OWNERS.Caller,
            // Standalone providers (including Chatflows) use this context
            // directly. Sub2API execution attempts handle renewal themselves.
            ...(!attempt
              ? {
                  authenticationRecovery: {
                    tempWindowRequestSource:
                      input.context.tempWindowRequestSource,
                    protectionBypassExecution:
                      input.context.protectionBypassExecution,
                  },
                }
              : {}),
          }),
        getCheckInResetTimeZone(registration.id),
      )
      const status = stable?.observation
      if (status) {
        if (status.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown) {
          const reason = toUnknownStatusSkipReason(status.reason)
          if (requiresAuthoritativeStatus || isAccountAccessFailure(reason)) {
            return statusReadFailure(reason)
          }
        }
        if (status.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known) {
          if (
            requiresAuthoritativeStatus &&
            status.availability !== CHECK_IN_METHOD_AVAILABILITIES.Disabled &&
            status.today === undefined
          ) {
            return statusReadFailure(
              CHECK_IN_EXECUTION_SKIP_REASONS.StatusUnavailable,
            )
          }
          statusProof = status
        }
        refreshedConfig = replaceCheckInMethodStatus({
          config: account.checkIn,
          methodId: registration.id,
          status,
        })
      } else if (requiresAuthoritativeStatus) {
        return statusReadFailure(
          CHECK_IN_EXECUTION_SKIP_REASONS.StatusUnavailable,
        )
      }
    } catch (error) {
      const reason = toStatusReadSkipReason(
        error,
        registration.provider.classifyStatusError,
      )
      if (reason === CHECK_IN_EXECUTION_SKIP_REASONS.MethodUnsupported) {
        if (
          !(await persistUnsupportedMethod(
            account,
            registration.id,
            input.revalidateAccount,
          ))
        ) {
          return accountStateWriteFailure()
        }
        return { kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped, reason }
      }
      if (
        requiresAuthoritativeStatus ||
        reason === CHECK_IN_EXECUTION_SKIP_REASONS.AuthenticationRequired ||
        reason === CHECK_IN_EXECUTION_SKIP_REASONS.PermissionDenied
      ) {
        return statusReadFailure(reason)
      }
    }
  }

  let currentAccount: SiteAccount | null = refreshedConfig
    ? { ...account, checkIn: refreshedConfig }
    : account
  if (input.revalidateAccount) {
    try {
      currentAccount = await input.revalidateAccount(refreshedConfig)
    } catch {
      currentAccount = null
    }
  }
  const admission = await inspectCheckInMutationAdmission({
    expectedAccount: account,
    account: currentAccount,
    registration,
    globalAutomaticExecutionEnabled: input.globalAutomaticExecutionEnabled,
    isAutomaticExecutionEnabled: input.isAutomaticExecutionEnabled,
  })
  if (!admission.eligible) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: admission.reason,
    }
  }
  currentAccount = admission.account

  const mutationLifecycle = createMutationLifecycle()
  const beforeRecoveredMutation = createRecoveredMutationGuard({
    currentAccount,
    refreshedConfig,
    globalAutomaticExecutionEnabled: input.globalAutomaticExecutionEnabled,
    registration,
    revalidateAccount: input.revalidateAccount,
    isAutomaticExecutionEnabled: input.isAutomaticExecutionEnabled,
  })
  const startedAt = Date.now()
  const providerResult = await operations.checkIn(currentAccount, {
    ...input.context,
    mutationLifecycle,
    ...(statusProof ? { statusProof } : {}),
    ...(beforeRecoveredMutation ? { beforeRecoveredMutation } : {}),
  })
  if (
    providerResult.status === CHECKIN_RESULT_STATUS.FAILED &&
    providerResult.reasonCode === AUTO_CHECKIN_SKIP_REASON.METHOD_UNSUPPORTED
  ) {
    if (
      !(await persistUnsupportedMethod(
        currentAccount,
        registration.id,
        input.revalidateAccount,
      ))
    ) {
      return accountStateWriteFailure()
    }
  }
  const execution = await reconcileProviderResult({
    account: currentAccount,
    methodId: registration.id,
    providerResult,
    startedAt,
    getStatus: operations.getStatus,
  })
  return {
    kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Executed,
    methodId: registration.id,
    result: execution.result,
    confirmation: execution.confirmation,
    retryable: execution.result.retryable,
    completedAt:
      execution.confirmation.kind === CHECK_IN_CONFIRMATION_KINDS.Response
        ? (execution.confirmation.completedAt ??
          execution.confirmation.observedAt)
        : execution.confirmation.observedAt,
  }
}
