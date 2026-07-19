import type {
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

export type AccountRefreshSupportRequest = Pick<
  ApiServiceRequest,
  | "baseUrl"
  | "auth"
  | "accountId"
  | "cookieAuthSessionCookie"
  | "tempWindowRequestSource"
>

export type AccountRefreshRequest = ApiServiceAccountRequest

export type AccountRefreshCapability = {
  fetchCheckInSupport?(
    request: AccountRefreshSupportRequest,
  ): Promise<boolean | undefined>
  refreshAccount(request: AccountRefreshRequest): Promise<RefreshAccountResult>
}
