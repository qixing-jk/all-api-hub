import { executeAuthenticatedSub2ApiRequest } from "~/services/apiService/sub2api/auth/authLifecycle"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

export const PASSIVE_CHECK_IN_AUTH = {
  proactiveRefresh: false,
  recoverMissingAccessToken: false,
  recoverUnauthorized: false,
} as const

export type CheckInBrowserBinding = Pick<
  ApiServiceRequest,
  "fetchContext" | "forceTempWindow" | "currentTabFallback"
>

export interface Sub2ApiCheckInStatusAuth {
  allowAuthenticationRecovery?: boolean
  prepareRecoveryRequest?: (request: ApiServiceRequest) => ApiServiceRequest
  onAuthenticatedTransport?: (binding: CheckInBrowserBinding) => void
}

/** Discovery and follow-up reads are passive unless the operation explicitly authorizes recovery. */
export function readAuthenticatedCheckInStatus<T>(
  request: ApiServiceRequest,
  endpoint: string,
  read: (request: ApiServiceRequest) => Promise<T>,
  auth?: Sub2ApiCheckInStatusAuth,
) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    endpoint,
    async (authenticated) => {
      const result = await read(authenticated)
      const { fetchContext, forceTempWindow, currentTabFallback } =
        authenticated
      auth?.onAuthenticatedTransport?.({
        fetchContext,
        forceTempWindow,
        currentTabFallback,
      })
      return result
    },
    auth?.allowAuthenticationRecovery
      ? {
          singleRecovery: true,
          prepareRecoveryRequest: auth.prepareRecoveryRequest,
        }
      : PASSIVE_CHECK_IN_AUTH,
  )
}
