import { executeAuthenticatedSub2ApiRequest } from "~/services/apiService/sub2api/auth/authLifecycle"
import { notifyApiTransportObserver } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  readDayStableCheckInObservation,
  type CheckInStatusObservation,
} from "~/services/checkin/statusObservation"

export type Sub2ApiCheckInRecoveryObservation = CheckInStatusObservation<{
  enabled: boolean
  checkedInToday: boolean
}> & { siteUrl: string; userId: string }

export const SUB2API_CHECK_IN_RECOVERY_REASONS = {
  AlreadyChecked: "already_checked",
  Disabled: "disabled",
  StatusUnavailable: "status_unavailable",
  PreconditionFailed: "precondition_failed",
} as const

export type Sub2ApiCheckInRecoveryReason =
  (typeof SUB2API_CHECK_IN_RECOVERY_REASONS)[keyof typeof SUB2API_CHECK_IN_RECOVERY_REASONS]

export class Sub2ApiCheckInRecoveryBlockedError extends Error {
  constructor(
    public readonly reason: Sub2ApiCheckInRecoveryReason,
    public readonly statusObservation?: Sub2ApiCheckInRecoveryObservation,
  ) {
    super(`Sub2API recovered check-in blocked: ${reason}`)
    this.name = "Sub2ApiCheckInRecoveryBlockedError"
  }
}

export interface Sub2ApiCheckInRecoveryOptions {
  beforeRecoveredMutation?: () => Promise<boolean>
}

/** Reuse native status/eligibility while guarding only authentication recovery. */
function createSub2ApiCheckInRecoveryGuard(
  readStatus: (
    request: ApiServiceRequest,
  ) => Promise<{ enabled: boolean; checkedInToday: boolean }>,
  blocked: (
    reason: Sub2ApiCheckInRecoveryReason,
    observation?: Sub2ApiCheckInRecoveryObservation,
  ) => Error,
) {
  return async (request: ApiServiceRequest) => {
    const read = await readDayStableCheckInObservation(() =>
      readStatus(request),
    ).catch(() => {
      throw blocked(SUB2API_CHECK_IN_RECOVERY_REASONS.StatusUnavailable)
    })
    if (!read)
      throw blocked(SUB2API_CHECK_IN_RECOVERY_REASONS.StatusUnavailable)
    const status = read.observation
    if (status.checkedInToday)
      throw blocked(SUB2API_CHECK_IN_RECOVERY_REASONS.AlreadyChecked, {
        ...read,
        siteUrl: request.baseUrl,
        userId: String(request.auth.userId),
      })
    if (!status.enabled)
      throw blocked(SUB2API_CHECK_IN_RECOVERY_REASONS.Disabled)
    // A read must not become evidence that the recovered mutation was dispatched.
    notifyApiTransportObserver(request.observer, "onPreHandlerUnauthorized")
  }
}

/** Network loss and business errors never enter the middleware-401 retry path. */
export function executeSub2ApiCheckInWithRecovery<T>(
  request: ApiServiceRequest,
  endpoint: string,
  runner: (request: ApiServiceRequest) => Promise<T>,
  readStatus: (
    request: ApiServiceRequest,
  ) => Promise<{ enabled: boolean; checkedInToday: boolean }>,
  options: Sub2ApiCheckInRecoveryOptions = {},
  blocked: (
    reason: Sub2ApiCheckInRecoveryReason,
    observation?: Sub2ApiCheckInRecoveryObservation,
  ) => Error = (reason, observation) =>
    new Sub2ApiCheckInRecoveryBlockedError(reason, observation),
) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    endpoint,
    async (authenticatedRequest) => {
      // Authentication may await refresh or browser recovery before either POST.
      if (
        options.beforeRecoveredMutation &&
        !(await options.beforeRecoveredMutation())
      ) {
        throw blocked(SUB2API_CHECK_IN_RECOVERY_REASONS.PreconditionFailed)
      }
      return runner(authenticatedRequest)
    },
    {
      beforeUnauthorizedRetry: createSub2ApiCheckInRecoveryGuard(
        readStatus,
        blocked,
      ),
    },
  )
}
