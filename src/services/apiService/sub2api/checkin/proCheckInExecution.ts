import { executeAuthenticatedSub2ApiRequest } from "~/services/apiService/sub2api/auth/authLifecycle"
import {
  parseSub2ApiProDailyCheckInMutationResponse,
  parseSub2ApiProDailyCheckInStatusResponse,
  SUB2API_PRO_DAILY_CHECK_IN_ENDPOINT,
  SUB2API_PRO_DAILY_CHECK_IN_RESULT_KINDS,
  SUB2API_PRO_DAILY_CHECK_IN_STATUS_ENDPOINT,
  type Sub2ApiProDailyCheckInOperationResult,
} from "~/services/apiService/sub2api/checkin/checkIn"
import {
  createSub2ApiCheckInRecoveryGuard,
  SUB2API_CHECK_IN_RECOVERY_REASONS,
  type Sub2ApiCheckInRecoveryOptions,
} from "~/services/apiService/sub2api/checkin/unauthorizedRecovery"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

const fetchSub2ApiProDailyCheckInStatusWithRequest = async (
  request: ApiServiceRequest,
) => {
  const response = await fetchApiResponse<unknown>(request, {
    endpoint: SUB2API_PRO_DAILY_CHECK_IN_STATUS_ENDPOINT,
    options: { method: "GET", cache: "no-store" },
  })
  return parseSub2ApiProDailyCheckInStatusResponse(response)
}

/** Reads the pinned Sub2API Pro status without reactive GET-side auth replay. */
export async function fetchSub2ApiProDailyCheckInStatus(
  request: ApiServiceRequest,
) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    SUB2API_PRO_DAILY_CHECK_IN_STATUS_ENDPOINT,
    fetchSub2ApiProDailyCheckInStatusWithRequest,
    { proactiveRefresh: false, recoverUnauthorized: false },
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
    return await executeAuthenticatedSub2ApiRequest(
      request,
      SUB2API_PRO_DAILY_CHECK_IN_ENDPOINT,
      async (authenticatedRequest) => {
        const response = await fetchApiResponse<unknown>(authenticatedRequest, {
          endpoint: SUB2API_PRO_DAILY_CHECK_IN_ENDPOINT,
          options: { method: "POST", cache: "no-store" },
        })
        return parseSub2ApiProDailyCheckInMutationResponse(response)
      },
      {
        beforeUnauthorizedRetry: createSub2ApiCheckInRecoveryGuard(
          fetchSub2ApiProDailyCheckInStatusWithRequest,
          options,
          (reason) =>
            new Sub2ApiProRecoveredMutationBlockedError({
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
        ),
      },
    )
  } catch (error) {
    if (error instanceof Sub2ApiProRecoveredMutationBlockedError) {
      return error.result
    }
    throw error
  }
}
