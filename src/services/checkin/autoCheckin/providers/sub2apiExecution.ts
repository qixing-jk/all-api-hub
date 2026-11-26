import type {
  CheckInBrowserBinding,
  Sub2ApiCheckInStatusAuth,
} from "~/services/apiService/sub2api/checkin/statusAuthentication"
import type { Sub2ApiCheckInRecoveryOptions } from "~/services/apiService/sub2api/checkin/unauthorizedRecovery"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { SiteAccount } from "~/types"

import type {
  AutoCheckinProvider,
  AutoCheckinProviderContext,
  AutoCheckinProviderReadContext,
} from "./contracts"
import {
  createSub2ApiCheckInMutationRequest,
  createSub2ApiCheckInReadRequest,
} from "./sub2apiShared"

type ReadStatus = NonNullable<AutoCheckinProvider["getStatus"]>
type ProviderAccount = Parameters<AutoCheckinProvider["checkIn"]>[0]
interface Sub2ApiCheckInProtocol extends Omit<
  AutoCheckinProvider,
  "getStatus" | "checkIn" | "forExecution"
> {
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

/** An admitted browser session and its single recovery budget belong to this execution only. */
export function withSub2ApiCheckInExecution(
  protocol: Sub2ApiCheckInProtocol,
  options: { bindInitialRead?: boolean } = {},
): AutoCheckinProvider {
  const provider = {
    ...protocol,
    forExecution(
      execution: AutoCheckinProviderContext,
    ): ReturnType<NonNullable<AutoCheckinProvider["forExecution"]>> {
      let binding: CheckInBrowserBinding | undefined
      let recovered = false
      let firstRead = true
      const rememberBinding = (next: CheckInBrowserBinding) => {
        binding = next.fetchContext || next.forceTempWindow ? next : undefined
      }
      const read = (
        context: AutoCheckinProviderReadContext,
        admission: boolean,
      ) => {
        const allowAuthenticationRecovery = admission && firstRead
        firstRead = false
        const request = createSub2ApiCheckInReadRequest(
          context,
          binding || (admission && options.bindInitialRead)
            ? execution
            : undefined,
        )
        return provider.getStatus(
          { ...context, request: { ...request, ...binding } },
          {
            allowAuthenticationRecovery,
            ...(allowAuthenticationRecovery
              ? {
                  prepareRecoveryRequest: (request: ApiServiceRequest) => {
                    recovered = true
                    return createSub2ApiCheckInReadRequest(
                      { ...context, request },
                      execution,
                    )
                  },
                  onAuthenticatedTransport: rememberBinding,
                }
              : {}),
          },
        )
      }
      return {
        getAuthenticatedStatus: (context: AutoCheckinProviderReadContext) =>
          read(context, true),
        getStatus: (context: AutoCheckinProviderReadContext) =>
          read(context, false),
        checkIn: (account, context) =>
          provider.checkIn(account, context, {
            request: {
              ...createSub2ApiCheckInMutationRequest(
                account as SiteAccount,
                context,
              ),
              ...binding,
            },
            recovery: {
              allowAuthenticationRecovery: !recovered,
              onAuthenticatedTransport: rememberBinding,
            },
          }),
      }
    },
  }
  return provider
}
