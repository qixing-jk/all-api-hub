import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import {
  fetchApiKeyCasaDailyCheckInStatus,
  performApiKeyCasaDailyCheckIn,
  type CasaBrowserBinding,
} from "~/services/apiService/sub2api/checkin/apiKeyCasaCheckIn"
import { withCheckInResponseConfirmation } from "~/services/checkin/autoCheckin/confirmation"
import { detectWithStatusReadback } from "~/services/checkin/autoCheckin/providers/detection"
import { AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS } from "~/services/checkin/autoCheckin/providers/shared"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"

import type {
  AutoCheckinProvider,
  AutoCheckinProviderContext,
  AutoCheckinProviderReadContext,
} from "./contracts"
import {
  createSub2ApiCheckInMutationRequest,
  createSub2ApiCheckInReadRequest,
  failedSub2ApiCheckIn,
  getSub2ApiCheckInReadiness,
  mapSub2ApiCheckInMutationError,
  toSub2ApiCheckInStatus,
} from "./sub2apiShared"

/** Keep the browser binding from a successful admission for the lifetime of this attempt. */
function createOperations(execution?: AutoCheckinProviderContext) {
  let binding: CasaBrowserBinding | undefined
  const rememberBinding = (authenticated: CasaBrowserBinding) => {
    binding =
      authenticated.fetchContext || authenticated.forceTempWindow
        ? authenticated
        : undefined
  }
  const getStatus = async (context: AutoCheckinProviderReadContext) => {
    // A passive readback can reuse the admitted browser without renewing credentials.
    const request = createSub2ApiCheckInReadRequest(
      context,
      context.authenticationRecovery ?? (binding ? execution : undefined),
    )
    const status = await fetchApiKeyCasaDailyCheckInStatus(
      { ...request, ...binding },
      {
        allowAuthenticationRecovery: Boolean(context.authenticationRecovery),
        onAuthenticatedTransport:
          execution && context.authenticationRecovery
            ? rememberBinding
            : undefined,
      },
    )
    return toSub2ApiCheckInStatus(status, context.observedAt)
  }

  const checkIn: AutoCheckinProvider["checkIn"] = async (account, context) => {
    const status = context.statusProof
    if (
      status?.availability !== CHECK_IN_METHOD_AVAILABILITIES.Enabled ||
      status.today !== CHECK_IN_METHOD_TODAY_STATUSES.NotChecked
    ) {
      return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE)
    }

    try {
      await performApiKeyCasaDailyCheckIn(
        {
          ...createSub2ApiCheckInMutationRequest(
            account as SiteAccount,
            context,
          ),
          ...binding,
        },
        { beforeRecoveredMutation: context.beforeRecoveredMutation },
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
  }
  return { getStatus, checkIn }
}

const operations = createOperations()
export const apiKeyCasaProvider: AutoCheckinProvider = {
  ...operations,
  requiresAuthoritativeStatusBeforeMutation: true,
  getReadiness: getSub2ApiCheckInReadiness,
  forExecution: createOperations,
  detect(context) {
    return detectWithStatusReadback(context, operations.getStatus)
  },
}
