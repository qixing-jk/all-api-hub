import {
  CHECK_IN_EXECUTION_SKIP_REASONS,
  CHECK_IN_METHOD_EXECUTION_RESULT_KINDS,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
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
import type { AutoCheckinProviderContext } from "~/services/checkin/autoCheckin/providers/contracts"
import type { AutoCheckinProviderResult } from "~/services/checkin/autoCheckin/providers/types"
import {
  markCheckInMethodExecuted,
  replaceCheckInMethodStatus,
} from "~/services/checkin/autoCheckin/state"
import type { SiteAccount } from "~/types"
import type {
  CheckInConfig,
  CheckInExecutionSkipReason,
  CheckInMethodId,
} from "~/types/checkIn"

export {
  discover,
  discoverCheckInMethods,
  setCheckInSelection,
  setSelection,
} from "~/services/checkin/autoCheckin/discovery"

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
    }
  | {
      kind: typeof CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped
      reason: CheckInExecutionSkipReason
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

  let refreshedConfig: CheckInConfig | undefined
  let statusUnavailable = false
  if (registration.provider.getStatus) {
    try {
      const status = await registration.provider.getStatus({
        account: input.account,
        observedAt: Date.now(),
      })
      if (!status) {
        return {
          kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
          reason: CHECK_IN_EXECUTION_SKIP_REASONS.StatusUnavailable,
        }
      }
      refreshedConfig = replaceCheckInMethodStatus({
        config: input.account.checkIn,
        methodId: registration.id,
        status,
      })
      statusUnavailable =
        status.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown
    } catch (error) {
      return {
        kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
        reason: toStatusReadSkipReason(error),
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
  if (statusUnavailable) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: CHECK_IN_EXECUTION_SKIP_REASONS.StatusUnavailable,
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

  return {
    kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Executed,
    methodId: registration.id,
    result: await registration.provider.checkIn(currentAccount, input.context),
  }
}
