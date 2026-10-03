import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { fetchAccountData } from "~/services/apiService/grsai"

export const grsaiAccountData: AccountDataCapability = {
  fetchData: (request) => fetchAccountData(request),
}
