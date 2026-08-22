import { CHECK_IN_SELECTION_STATUSES } from "~/constants/checkIn"
import type { AccountSiteType } from "~/constants/siteType"
import { inspectCheckInMethods } from "~/services/checkin/autoCheckin/domain"
import { getAutoCheckinCandidateMethodIds } from "~/services/checkin/autoCheckin/providers/registry"
import type {
  CheckInAccountState,
  CheckInConfig,
  CheckInMethodId,
} from "~/types/checkIn"

/** Derives the canonical check-in projection without loading providers. */
export function inspectAccountCheckIn(input: {
  config: CheckInConfig
  siteType: AccountSiteType
  accountDisabled?: boolean
  globalAutomaticExecutionEnabled?: boolean
}): CheckInAccountState {
  return inspectCheckInMethods({
    config: input.config,
    candidateMethodIds: getAutoCheckinCandidateMethodIds(input.siteType),
    accountDisabled: input.accountDisabled,
    globalAutomaticExecutionEnabled: input.globalAutomaticExecutionEnabled,
  })
}

/**
 * Returns whether an enabled account has automatic execution intent and a
 * usable selected registration. Provider readiness and daily Status remain
 * separate projections.
 */
export function isAutomaticCheckInConfiguredForAccount(input: {
  config: CheckInConfig
  siteType: AccountSiteType
  accountDisabled?: boolean
}): boolean {
  const selectionState = inspectAccountCheckIn(input).selectionState
  return (
    input.accountDisabled !== true &&
    input.config.automaticExecutionEnabled &&
    selectionState.status === CHECK_IN_SELECTION_STATUSES.Selected
  )
}

/** Returns the selected registered method without applying execution intent. */
export function resolveSelectedCheckInMethod(input: {
  config: CheckInConfig
  siteType: AccountSiteType
}): CheckInMethodId | null {
  const selection = inspectAccountCheckIn(input).selectionState
  return selection.status === CHECK_IN_SELECTION_STATUSES.Selected
    ? selection.methodId
    : null
}

/** Projects the selected method's persisted Status for ordinary consumers. */
export function getSelectedCheckInStatus(input: {
  config: CheckInConfig
  siteType: AccountSiteType
}) {
  const methodId = resolveSelectedCheckInMethod(input)
  return methodId
    ? input.config.methodKnowledge.methods[methodId]?.status
    : null
}
