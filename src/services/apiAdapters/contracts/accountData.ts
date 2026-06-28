import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"

export type AccountDataRequest = ApiServiceAccountRequest

export type AccountDataCapability = {
  fetchData(request: AccountDataRequest): Promise<AccountData>
}
