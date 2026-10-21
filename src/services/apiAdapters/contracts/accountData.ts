import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"

export type AccountDataRequest = ApiServiceAccountRequest

/** Dashboard data only. Shared account services own check-in status queries. */
export type AccountDataCapability = {
  fetchData(request: AccountDataRequest): Promise<AccountData>
}
