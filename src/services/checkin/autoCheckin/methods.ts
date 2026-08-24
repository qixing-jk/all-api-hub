import {
  CHECK_IN_EXECUTION_SKIP_REASONS,
  CHECK_IN_METHOD_EXECUTION_RESULT_KINDS,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import type { AccountSiteType } from "~/constants/siteType"
import {
  AUTO_CHECKIN_ERROR_CATEGORIES,
  classifyAutoCheckinError,
} from "~/services/checkin/autoCheckin/errors"
import {
  inspectAccountCheckIn,
  resolveSelectedCheckInMethod,
} from "~/services/checkin/autoCheckin/inspection"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import type {
  AutoCheckinMutationLifecycle,
  AutoCheckinProvider,
  AutoCheckinProviderContext,
} from "~/services/checkin/autoCheckin/providers/contracts"
import { AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS } from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderResult } from "~/services/checkin/autoCheckin/providers/types"
import {
  markCheckInMethodExecuted,
  replaceCheckInMethodStatus,
} from "~/services/checkin/autoCheckin/state"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RECONCILIATION_OUTCOME,
  CHECKIN_RESULT_STATUS,
  type AutoCheckinSkipReason,
} from "~/types/autoCheckin"
import type {
  CheckInConfig,
  CheckInExecutionSkipReason,
  CheckInMethodId,
} from "~/types/checkIn"

export { setCheckInSelection } from "~/services/checkin/autoCheckin/discovery"

/** Marks the selected method checked using execution evidence. */
export function markSelectedCheckInExecuted(input: {
  config: CheckInConfig
  siteType: AccountSiteType
  observedAt: number
}): CheckInConfig {
  const methodId = resolveSelectedCheckInMethod(input)
  if (!methodId) return input.config
  return markCheckInMethodExecuted({
    config: input.config,
    methodId,
    observedAt: input.observedAt,
  })
}

type ExecuteSelectedCheckInResult =
  | {
      kind: typeof CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Executed
      methodId: CheckInMethodId
      result: AutoCheckinProviderResult
      /** Whether a later attempt can safely begin with authoritative readback. */
      retryable: boolean
    }
  | {
      kind: typeof CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped
      reason: CheckInExecutionSkipReason
      /** Whether a bounded retry can safely repeat this pre-mutation check. */
      retryable?: boolean
    }

const resolveSelectedCheckInRegistration = (input: {
  account: SiteAccount
  globalAutomaticExecutionEnabled: boolean
}) => {
  const state = inspectAccountCheckIn({
    config: input.account.checkIn,
    siteType: input.account.site_type,
    accountDisabled: input.account.disabled,
    globalAutomaticExecutionEnabled: input.globalAutomaticExecutionEnabled,
  })
  const registration = state.executionEligibility.eligible
    ? autoCheckinMethodRegistry.resolveById(state.executionEligibility.methodId)
    : null

  return { state, registration }
}

const toProviderReadinessSkipReason = (
  reason:
    | typeof CHECK_IN_PROVIDER_READINESS_REASONS.AccountDataMissing
    | typeof CHECK_IN_PROVIDER_READINESS_REASONS.CredentialsMissing,
): CheckInExecutionSkipReason =>
  reason === CHECK_IN_PROVIDER_READINESS_REASONS.CredentialsMissing
    ? CHECK_IN_EXECUTION_SKIP_REASONS.CredentialsMissing
    : CHECK_IN_EXECUTION_SKIP_REASONS.AccountDataMissing

const toStatusReadSkipReason = (error: unknown): CheckInExecutionSkipReason => {
  switch (classifyAutoCheckinError(error)) {
    case AUTO_CHECKIN_ERROR_CATEGORIES.AuthenticationRequired:
      return CHECK_IN_EXECUTION_SKIP_REASONS.AuthenticationRequired
    case AUTO_CHECKIN_ERROR_CATEGORIES.Network:
      return CHECK_IN_EXECUTION_SKIP_REASONS.NetworkError
    case AUTO_CHECKIN_ERROR_CATEGORIES.PermissionDenied:
      return CHECK_IN_EXECUTION_SKIP_REASONS.PermissionDenied
    case AUTO_CHECKIN_ERROR_CATEGORIES.SourceUnavailable:
      return CHECK_IN_EXECUTION_SKIP_REASONS.SourceUnavailable
    case AUTO_CHECKIN_ERROR_CATEGORIES.Timeout:
      return CHECK_IN_EXECUTION_SKIP_REASONS.Timeout
    default:
      return CHECK_IN_EXECUTION_SKIP_REASONS.StatusUnavailable
  }
}

const NON_RETRYABLE_PROVIDER_FAILURE_REASONS: ReadonlySet<AutoCheckinSkipReason> =
  new Set([
    AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
    AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED,
  ])

const canSafelyRetryProviderResult = (
  result: AutoCheckinProviderResult,
  hasStatusReadback: boolean,
): boolean =>
  result.status === CHECKIN_RESULT_STATUS.FAILED &&
  hasStatusReadback &&
  !(
    result.reasonCode &&
    NON_RETRYABLE_PROVIDER_FAILURE_REASONS.has(result.reasonCode)
  )

const canRetryStatusConfirmationFailure = (
  reason: CheckInExecutionSkipReason,
): boolean =>
  reason !== CHECK_IN_EXECUTION_SKIP_REASONS.AuthenticationRequired &&
  reason !== CHECK_IN_EXECUTION_SKIP_REASONS.PermissionDenied

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
  }
  return lifecycle
}

const reconcileUncertainResult = async (input: {
  account: SiteAccount
  providerResult: AutoCheckinProviderResult
  getStatus?: NonNullable<AutoCheckinProvider["getStatus"]>
}): Promise<AutoCheckinProviderResult> => {
  if (!input.getStatus) {
    return {
      ...input.providerResult,
      retryable: false,
      reconciliation: CHECKIN_RECONCILIATION_OUTCOME.UNAVAILABLE,
    }
  }

  try {
    const status = await input.getStatus({
      account: input.account,
      observedAt: Date.now(),
    })
    if (status?.outcome !== CHECK_IN_METHOD_STATUS_OUTCOMES.Known) {
      return {
        ...input.providerResult,
        retryable: false,
        reconciliation: status
          ? CHECKIN_RECONCILIATION_OUTCOME.UNKNOWN
          : CHECKIN_RECONCILIATION_OUTCOME.UNAVAILABLE,
      }
    }
    if (status.today === CHECK_IN_METHOD_TODAY_STATUSES.Checked) {
      return {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        messageKey:
          AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
        data: input.providerResult.data,
        retryable: false,
        reconciliation: CHECKIN_RECONCILIATION_OUTCOME.CHECKED,
      }
    }
    if (status.today !== CHECK_IN_METHOD_TODAY_STATUSES.NotChecked) {
      return {
        ...input.providerResult,
        retryable: false,
        reconciliation: CHECKIN_RECONCILIATION_OUTCOME.UNKNOWN,
      }
    }
    return {
      ...input.providerResult,
      retryable: false,
      reconciliation: CHECKIN_RECONCILIATION_OUTCOME.NOT_CHECKED,
    }
  } catch {
    return {
      ...input.providerResult,
      retryable: false,
      reconciliation: CHECKIN_RECONCILIATION_OUTCOME.UNAVAILABLE,
    }
  }
}

/** Adds provider authentication readiness without exposing the provider. */
export function inspectSelectedCheckInCompatibility(input: {
  account: SiteAccount
  globalAutomaticExecutionEnabled: boolean
}) {
  const { state, registration } = resolveSelectedCheckInRegistration({
    account: input.account,
    globalAutomaticExecutionEnabled: input.globalAutomaticExecutionEnabled,
  })
  const providerReadiness = registration?.provider.getReadiness(input.account)
  return {
    state,
    providerReadiness: providerReadiness ?? null,
    providerAvailable: providerReadiness?.ready === true,
  }
}

/** Compatibility execution entrance used by the scheduler. */
export async function executeSelectedCheckIn(input: {
  account: SiteAccount
  globalAutomaticExecutionEnabled: boolean
  context: AutoCheckinProviderContext
  revalidateAccount?: (
    refreshedConfig?: CheckInConfig,
  ) => Promise<SiteAccount | null>
  /**
   * Retry safety guard: a provider with readback must confirm current status
   * before another mutation. Initial daily/manual runs keep best-effort
   * readback so a transient GET failure does not suppress the day's check-in.
   */
  requireStatusConfirmationBeforeMutation?: boolean
}): Promise<ExecuteSelectedCheckInResult> {
  const initialState = inspectAccountCheckIn({
    config: input.account.checkIn,
    siteType: input.account.site_type,
    accountDisabled: input.account.disabled,
    globalAutomaticExecutionEnabled: input.globalAutomaticExecutionEnabled,
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
    config: input.account.checkIn,
    siteType: input.account.site_type,
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
  const initialReadiness = registration.provider.getReadiness(input.account)
  if (!initialReadiness.ready) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: toProviderReadinessSkipReason(initialReadiness.reason),
    }
  }
  if (
    input.requireStatusConfirmationBeforeMutation &&
    !registration.provider.getStatus
  ) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: CHECK_IN_EXECUTION_SKIP_REASONS.StatusUnavailable,
      retryable: false,
    }
  }

  let refreshedConfig: CheckInConfig | undefined
  if (registration.provider.getStatus) {
    try {
      const status = await registration.provider.getStatus({
        account: input.account,
        observedAt: Date.now(),
      })
      if (status) {
        if (
          input.requireStatusConfirmationBeforeMutation &&
          status.outcome !== CHECK_IN_METHOD_STATUS_OUTCOMES.Known
        ) {
          return {
            kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
            reason: CHECK_IN_EXECUTION_SKIP_REASONS.StatusUnavailable,
            retryable: true,
          }
        }
        refreshedConfig = replaceCheckInMethodStatus({
          config: input.account.checkIn,
          methodId: registration.id,
          status,
        })
      } else if (input.requireStatusConfirmationBeforeMutation) {
        return {
          kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
          reason: CHECK_IN_EXECUTION_SKIP_REASONS.StatusUnavailable,
          retryable: true,
        }
      }
    } catch (error) {
      const reason = toStatusReadSkipReason(error)
      if (
        input.requireStatusConfirmationBeforeMutation ||
        reason === CHECK_IN_EXECUTION_SKIP_REASONS.AuthenticationRequired ||
        reason === CHECK_IN_EXECUTION_SKIP_REASONS.PermissionDenied
      ) {
        return {
          kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
          reason,
          retryable:
            input.requireStatusConfirmationBeforeMutation &&
            canRetryStatusConfirmationFailure(reason),
        }
      }
    }
  }

  let currentAccount: SiteAccount | null = refreshedConfig
    ? { ...input.account, checkIn: refreshedConfig }
    : input.account
  if (input.revalidateAccount) {
    try {
      currentAccount = await input.revalidateAccount(refreshedConfig)
    } catch {
      currentAccount = null
    }
  }
  if (!currentAccount) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: CHECK_IN_EXECUTION_SKIP_REASONS.AccountUnavailable,
    }
  }
  const currentState = inspectAccountCheckIn({
    config: currentAccount.checkIn,
    siteType: currentAccount.site_type,
    accountDisabled: currentAccount.disabled,
    globalAutomaticExecutionEnabled: input.globalAutomaticExecutionEnabled,
  })
  if (!currentState.executionEligibility.eligible) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: currentState.executionEligibility.skipReason,
    }
  }
  if (currentState.executionEligibility.methodId !== registration.id) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: CHECK_IN_EXECUTION_SKIP_REASONS.MethodNotMatched,
    }
  }
  const currentReadiness = registration.provider.getReadiness(currentAccount)
  if (!currentReadiness.ready) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: toProviderReadinessSkipReason(currentReadiness.reason),
    }
  }

  const mutationLifecycle = createMutationLifecycle()
  const providerResult = await registration.provider.checkIn(currentAccount, {
    ...input.context,
    mutationLifecycle,
  })
  const result =
    providerResult.status === CHECKIN_RESULT_STATUS.UNCERTAIN
      ? await reconcileUncertainResult({
          account: currentAccount,
          providerResult,
          getStatus: registration.provider.getStatus,
        })
      : providerResult.status === CHECKIN_RESULT_STATUS.FAILED
        ? {
            ...providerResult,
            retryable: canSafelyRetryProviderResult(
              providerResult,
              Boolean(registration.provider.getStatus),
            ),
          }
        : providerResult
  return {
    kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Executed,
    methodId: registration.id,
    result,
    retryable:
      result.status === CHECKIN_RESULT_STATUS.FAILED
        ? result.retryable === true
        : false,
  }
}
