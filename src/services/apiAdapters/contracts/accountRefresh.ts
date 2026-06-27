import type {
  ApiServiceAccountRequest,
  ApiServiceRequest,
  RefreshAccountResult,
} from "~/services/apiService/common/type"

export type AccountRefreshSupportRequest = Pick<
  ApiServiceRequest,
  "baseUrl" | "auth" | "accountId" | "cookieAuthSessionCookie"
>

export type AccountRefreshRequest = ApiServiceAccountRequest

export type AccountRefreshCapability = {
  fetchCheckInSupport?(
    request: AccountRefreshSupportRequest,
  ): Promise<boolean | undefined>
  refreshAccount(request: AccountRefreshRequest): Promise<RefreshAccountResult>
}
