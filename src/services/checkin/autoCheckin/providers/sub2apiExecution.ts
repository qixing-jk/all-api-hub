import type {
  CheckInBrowserBinding,
  Sub2ApiCheckInStatusAuth,
} from "~/services/apiService/sub2api/checkin/statusAuthentication"
import type { Sub2ApiCheckInRecoveryOptions } from "~/services/apiService/sub2api/checkin/unauthorizedRecovery"
import {
  API_TRANSPORT_FETCH_CONTEXT_KINDS,
  type ApiServiceRequest,
} from "~/services/apiTransport/type"
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
import { detectWithStatusReadback } from "./detection"
import {
  createSub2ApiCheckInMutationRequest,
  createSub2ApiCheckInReadRequest,
} from "./sub2apiShared"

type ReadStatus = NonNullable<AutoCheckinProvider["getStatus"]>

/** Native check-in actions open a default temporary page, outside a specific tab or partition. */
export function getBoundCheckInPageHandoff(
  request: ApiServiceRequest | undefined,
  checkInUrl: string,
) {
  const context = request?.fetchContext
  if (
    context?.kind === API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB ||
    context?.incognito ||
    context?.cookieStoreId
  ) {
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
      messageKey: "autoCheckin:skipReasons.manual_verification_required",
      messageParams: { checkInUrl },
    }
  }
}

type ProviderAccount = Parameters<AutoCheckinProvider["checkIn"]>[0]
interface Sub2ApiCheckInProtocol extends Omit<
  AutoCheckinProvider,
  "detect" | "getStatus" | "checkIn" | "forExecution"
> {
  detect?(
    context: AutoCheckinProviderReadContext,
    auth?: Sub2ApiCheckInStatusAuth,
  ): ReturnType<NonNullable<AutoCheckinProvider["detect"]>>
  getStatus(
    context: AutoCheckinProviderReadContext,
    auth?: Sub2ApiCheckInStatusAuth,
  ): ReturnType<ReadStatus>
  checkIn(
    account: ProviderAccount,
    context: AutoCheckinProviderContext,
    attempt?: {
      request: ApiServiceRequest
      recovery: Sub2ApiCheckInRecoveryOptions
    },
  ): ReturnType<AutoCheckinProvider["checkIn"]>
}

/** Use the same protocol evidence for passive discovery and authenticated selected-method confirmation. */
export const createSub2ApiStatusDetector =
  (
    read: Sub2ApiCheckInProtocol["getStatus"],
    isAbsent?: (error: unknown) => boolean,
  ): NonNullable<Sub2ApiCheckInProtocol["detect"]> =>
  (context, auth) =>
    detectWithStatusReadback(
      context,
      (context) => read(context, auth),
      undefined,
      isAbsent,
    )

/** Only the first admission read can renew credentials. Later requests reuse its browser binding. */
export function withSub2ApiCheckInExecution(
  protocol: Sub2ApiCheckInProtocol,
  options: { bindInitialRead?: boolean } = {},
): AutoCheckinProvider {
  const provider = {
    ...protocol,
    detect: protocol.detect ?? createSub2ApiStatusDetector(protocol.getStatus),
    forExecution(
      execution: AutoCheckinProviderContext,
    ): ReturnType<NonNullable<AutoCheckinProvider["forExecution"]>> {
      let binding: CheckInBrowserBinding | undefined
      let firstRead = true
      const rememberBinding = (next: CheckInBrowserBinding) => {
        binding = next.fetchContext || next.forceTempWindow ? next : undefined
      }
      const read = <T>(
        context: AutoCheckinProviderReadContext,
        admission: boolean,
        operation: (
          context: AutoCheckinProviderReadContext,
          auth: Sub2ApiCheckInStatusAuth,
        ) => Promise<T>,
      ) => {
        const allowAuthenticationRecovery = admission && firstRead
        firstRead = false
        const request = createSub2ApiCheckInReadRequest(
          context,
          binding || (admission && options.bindInitialRead)
            ? execution
            : undefined,
        )
        return operation(
          { ...context, request: { ...request, ...binding } },
          {
            allowAuthenticationRecovery,
            ...(allowAuthenticationRecovery
              ? {
                  prepareRecoveryRequest: (request: ApiServiceRequest) =>
                    createSub2ApiCheckInReadRequest(
                      { ...context, request },
                      execution,
                    ),
                  onAuthenticatedTransport: rememberBinding,
                }
              : {}),
          },
        )
      }
      return {
        detect: (context) => read(context, true, provider.detect),
        getAuthenticatedStatus: (context: AutoCheckinProviderReadContext) =>
          read(context, true, provider.getStatus),
        getStatus: (context: AutoCheckinProviderReadContext) =>
          read(context, false, provider.getStatus),
        checkIn: (account, context) =>
          provider.checkIn(account, context, {
            request: {
              ...createSub2ApiCheckInMutationRequest(
                account as SiteAccount,
                context,
              ),
              ...binding,
            },
            recovery: { allowAuthenticationRecovery: false },
          }),
      }
    },
  }
  return provider
}
