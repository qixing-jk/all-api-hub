import {
  parseSub2ApiProDailyCheckInMutationResponse,
  parseSub2ApiProDailyCheckInStatusResponse,
  SUB2API_PRO_DAILY_CHECK_IN_ENDPOINT,
  SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS,
  SUB2API_PRO_DAILY_CHECK_IN_STATUS_ENDPOINT,
  type Sub2ApiProDailyCheckInOperationResult,
} from "~/services/apiService/sub2api/checkin/checkIn"
import { postSub2ApiCheckIn } from "~/services/apiService/sub2api/checkin/mutationRequest"
import {
  executeSub2ApiCheckInWithRecovery,
  SUB2API_CHECK_IN_RECOVERY_REASONS,
  type Sub2ApiCheckInRecoveryOptions,
} from "~/services/apiService/sub2api/checkin/unauthorizedRecovery"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

import {
  readAuthenticatedCheckInStatus,
  type Sub2ApiCheckInStatusAuth,
} from "./statusAuthentication"

const fetchSub2ApiProDailyCheckInStatusWithRequest = async (
  request: ApiServiceRequest,
) => {
  const response = await fetchApiResponse<unknown>(request, {
    endpoint: SUB2API_PRO_DAILY_CHECK_IN_STATUS_ENDPOINT,
    options: { method: "GET", cache: "no-store" },
  })
  return parseSub2ApiProDailyCheckInStatusResponse(response)
}

/** Reads the pinned Sub2API Pro status using the caller's recovery policy. */
export async function fetchSub2ApiProDailyCheckInStatus(
  request: ApiServiceRequest,
  auth?: Sub2ApiCheckInStatusAuth,
) {
  return readAuthenticatedCheckInStatus(
    request,
    SUB2API_PRO_DAILY_CHECK_IN_STATUS_ENDPOINT,
    fetchSub2ApiProDailyCheckInStatusWithRequest,
    auth,
  )
}

class Sub2ApiProRecoveredMutationBlockedError extends Error {
  constructor(
    public readonly result: Exclude<
      Sub2ApiProDailyCheckInOperationResult,
      { kind: typeof SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS.Applied }
    >,
  ) {
    super("Sub2API Pro recovered mutation blocked by status readback")
    this.name = "Sub2ApiProRecoveredMutationBlockedError"
  }
}

/**
 * Executes one mutation after the caller's initial status proof, and guards one
 * middleware-401 recovery with a fresh status readback.
 */
export async function performSub2ApiProDailyCheckIn(
  request: ApiServiceRequest,
  options: Sub2ApiCheckInRecoveryOptions = {},
): Promise<Sub2ApiProDailyCheckInOperationResult> {
  try {
    return await executeSub2ApiCheckInWithRecovery(
      request,
      SUB2API_PRO_DAILY_CHECK_IN_ENDPOINT,
      async (authenticatedRequest) => {
        const response = await postSub2ApiCheckIn(
          authenticatedRequest,
          SUB2API_PRO_DAILY_CHECK_IN_ENDPOINT,
        )
        return parseSub2ApiProDailyCheckInMutationResponse(response)
      },
      fetchSub2ApiProDailyCheckInStatusWithRequest,
      options,
      (reason, statusObservation) =>
        new Sub2ApiProRecoveredMutationBlockedError({
          ...(statusObservation ? { statusObservation } : {}),
          kind: {
            [SUB2API_CHECK_IN_RECOVERY_REASONS.AlreadyChecked]:
              SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked,
            [SUB2API_CHECK_IN_RECOVERY_REASONS.Disabled]:
              SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS.Disabled,
            [SUB2API_CHECK_IN_RECOVERY_REASONS.StatusUnavailable]:
              SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS.RecoveryStatusUnavailable,
            [SUB2API_CHECK_IN_RECOVERY_REASONS.PreconditionFailed]:
              SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS.RecoveryPreconditionFailed,
          }[reason],
        }),
    )
  } catch (error) {
    if (error instanceof Sub2ApiProRecoveredMutationBlockedError) {
      return error.result
    }
    throw error
  }
}
