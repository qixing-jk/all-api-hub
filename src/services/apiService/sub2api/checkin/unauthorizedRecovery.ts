import { executeAuthenticatedSub2ApiRequest } from "~/services/apiService/sub2api/auth/authLifecycle"
import { notifyApiTransportObserver } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

export const SUB2API_CHECK_IN_RECOVERY_REASONS = {
  AlreadyChecked: "already_checked",
  Disabled: "disabled",
  StatusUnavailable: "status_unavailable",
  PreconditionFailed: "precondition_failed",
} as const

export type Sub2ApiCheckInRecoveryReason =
  (typeof SUB2API_CHECK_IN_RECOVERY_REASONS)[keyof typeof SUB2API_CHECK_IN_RECOVERY_REASONS]

export class Sub2ApiCheckInRecoveryBlockedError extends Error {
  constructor(public readonly reason: Sub2ApiCheckInRecoveryReason) {
    super(`Sub2API recovered check-in blocked: ${reason}`)
    this.name = "Sub2ApiCheckInRecoveryBlockedError"
  }
}

export interface Sub2ApiCheckInRecoveryOptions {
  beforeRecoveredMutation?: () => Promise<boolean>
}

/** Reuse native status/eligibility while guarding only authentication recovery. */
export function createSub2ApiCheckInRecoveryGuard(
  readStatus: (
    request: ApiServiceRequest,
  ) => Promise<{ enabled: boolean; checkedInToday: boolean }>,
  options: Sub2ApiCheckInRecoveryOptions = {},
  blocked: (reason: Sub2ApiCheckInRecoveryReason) => Error = (reason) =>
    new Sub2ApiCheckInRecoveryBlockedError(reason),
) {
  return async (request: ApiServiceRequest) => {
    const status = await readStatus(request).catch(() => {
      throw blocked(SUB2API_CHECK_IN_RECOVERY_REASONS.StatusUnavailable)
    })
    if (status.checkedInToday)
      throw blocked(SUB2API_CHECK_IN_RECOVERY_REASONS.AlreadyChecked)
    if (!status.enabled)
      throw blocked(SUB2API_CHECK_IN_RECOVERY_REASONS.Disabled)
    if (
      options.beforeRecoveredMutation &&
      !(await options.beforeRecoveredMutation())
    ) {
      throw blocked(SUB2API_CHECK_IN_RECOVERY_REASONS.PreconditionFailed)
    }
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
) {
  return executeAuthenticatedSub2ApiRequest(request, endpoint, runner, {
    beforeUnauthorizedRetry: createSub2ApiCheckInRecoveryGuard(
      readStatus,
      options,
    ),
  })
}
