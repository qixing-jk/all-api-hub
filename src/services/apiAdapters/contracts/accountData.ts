import type { AccountData } from "~/services/accountData/model"
import type { ApiServiceAccountRequest } from "~/services/apiService/common/type"

export type AccountDataRequest = ApiServiceAccountRequest

export type AccountDataCapability = {
  fetchData(request: AccountDataRequest): Promise<AccountData>
}
