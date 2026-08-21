import {
  CHECK_IN_EXECUTION_SKIP_REASONS,
  CHECK_IN_METHOD_EXECUTION_RESULT_KINDS,
} from "~/constants/checkIn"
import type { AccountSiteType } from "~/constants/siteType"
import {
  inspectAccountCheckIn,
  resolveSelectedCheckInMethod,
} from "~/services/checkin/autoCheckin/inspection"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import type { AutoCheckinProviderContext } from "~/services/checkin/autoCheckin/providers/contracts"
import type { AutoCheckinProviderResult } from "~/services/checkin/autoCheckin/providers/types"
import { markCheckInMethodExecuted } from "~/services/checkin/autoCheckin/state"
import type { SiteAccount } from "~/types"
import type {
  CheckInConfig,
  CheckInExecutionSkipReason,
  CheckInMethodId,
} from "~/types/checkIn"

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
}): Promise<ExecuteSelectedCheckInResult> {
  const { state, registration } = resolveSelectedCheckInRegistration({
    account: input.account,
    globalAutomaticExecutionEnabled: input.globalAutomaticExecutionEnabled,
  })
  if (!state.executionEligibility.eligible) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: state.executionEligibility.skipReason,
    }
  }
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

  return {
    kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Executed,
    methodId: registration.id,
    result: await registration.provider.checkIn(input.account, input.context),
  }
}
