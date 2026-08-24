import {
  CHECK_IN_EXECUTION_SKIP_REASONS,
  CHECK_IN_METHOD_EXECUTION_RESULT_KINDS,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
} from "~/constants/checkIn"
import type { AccountSiteType } from "~/constants/siteType"
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

/** Adds provider authentication readiness without exposing the provider. */
export function inspectSelectedCheckInCompatibility(input: {
  account: SiteAccount
  globalAutomaticExecutionEnabled: boolean
}) {
  const { state, registration } = resolveSelectedCheckInRegistration({
    account: input.account,
    globalAutomaticExecutionEnabled: input.globalAutomaticExecutionEnabled,
  })
  return {
    state,
    providerAvailable:
      registration?.provider.canCheckIn(input.account) === true,
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
  if (!registration.provider.canCheckIn(input.account)) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: CHECK_IN_EXECUTION_SKIP_REASONS.ProviderNotReady,
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
    } catch {
      return {
        kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
        reason: CHECK_IN_EXECUTION_SKIP_REASONS.StatusUnavailable,
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
  if (!registration.provider.canCheckIn(currentAccount)) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: CHECK_IN_EXECUTION_SKIP_REASONS.ProviderNotReady,
    }
  }

  return {
    kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Executed,
    methodId: registration.id,
    result: await registration.provider.checkIn(currentAccount, input.context),
  }
}
