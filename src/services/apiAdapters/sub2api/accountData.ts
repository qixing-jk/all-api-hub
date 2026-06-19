import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { fetchAccountData } from "~/services/apiService/sub2api"

export const sub2ApiAccountData: AccountDataCapability = {
  fetchData: (request) => fetchAccountData(request),
}
