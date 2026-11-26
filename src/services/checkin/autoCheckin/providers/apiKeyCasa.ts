import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import {
  fetchApiKeyCasaDailyCheckInStatus,
  performApiKeyCasaDailyCheckIn,
} from "~/services/apiService/sub2api/checkin/apiKeyCasaCheckIn"
import { API_KEY_CASA_CHECK_IN_RESET_TIME_ZONE } from "~/services/apiService/sub2api/checkin/apiKeyCasaCheckInProtocol"
import type { Sub2ApiCheckInStatusAuth } from "~/services/apiService/sub2api/checkin/statusAuthentication"
import { withCheckInResponseConfirmation } from "~/services/checkin/autoCheckin/confirmation"
import { detectWithStatusReadback } from "~/services/checkin/autoCheckin/providers/detection"
import { AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS } from "~/services/checkin/autoCheckin/providers/shared"
import { readDayStableCheckInObservation } from "~/services/checkin/statusObservation"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"

import {
  CHECK_IN_STATUS_DAY_GUARD_OWNERS,
  type AutoCheckinProviderReadContext,
} from "./contracts"
import { withSub2ApiCheckInExecution } from "./sub2apiExecution"
import {
  createSub2ApiCheckInMutationRequest,
  createSub2ApiCheckInReadRequest,
  failedSub2ApiCheckIn,
  getSub2ApiCheckInReadiness,
  mapSub2ApiCheckInMutationError,
  toSub2ApiCheckInStatus,
} from "./sub2apiShared"

const readStatus = async (
  context: AutoCheckinProviderReadContext,
  auth: Sub2ApiCheckInStatusAuth = { allowAuthenticationRecovery: false },
) => {
  const request = createSub2ApiCheckInReadRequest(context)
  const read = () => fetchApiKeyCasaDailyCheckInStatus(request, auth)
  if (context.dayBoundaryGuardOwner === CHECK_IN_STATUS_DAY_GUARD_OWNERS.Caller)
    return toSub2ApiCheckInStatus(await read(), Date.now())
  const stable = await readDayStableCheckInObservation(
    read,
    API_KEY_CASA_CHECK_IN_RESET_TIME_ZONE,
  )
  return stable && toSub2ApiCheckInStatus(stable.observation, stable.observedAt)
}

export const apiKeyCasaProvider = withSub2ApiCheckInExecution(
  {
    getStatus: readStatus,
    requiresAuthoritativeStatusBeforeMutation: true,
    getReadiness: getSub2ApiCheckInReadiness,
    detect(context) {
      return detectWithStatusReadback(context, readStatus)
    },
    async checkIn(account, context, attempt) {
      const status = context.statusProof
      if (
        status?.availability !== CHECK_IN_METHOD_AVAILABILITIES.Enabled ||
        !("observedAt" in status.evidence) ||
        status.today !== CHECK_IN_METHOD_TODAY_STATUSES.NotChecked
      ) {
        return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE)
      }

      try {
        await performApiKeyCasaDailyCheckIn(
          attempt?.request ??
            createSub2ApiCheckInMutationRequest(
              account as SiteAccount,
              context,
            ),
          {
            beforeRecoveredMutation: context.beforeRecoveredMutation,
            statusObservedAt: status.evidence.observedAt,
          },
        )
        // `reward` is the configured daily amount, not a receipt for this claim.
        return withCheckInResponseConfirmation(account as SiteAccount, {
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          messageKey:
            AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
        })
      } catch (error) {
        return mapSub2ApiCheckInMutationError(
          error,
          context,
          account as SiteAccount,
        )
      }
    },
  },
  { bindInitialRead: true },
)
