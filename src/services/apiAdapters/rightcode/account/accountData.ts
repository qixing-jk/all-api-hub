import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { fetchAccountData } from "~/services/apiService/rightcode"

export const rightCodeAccountData: AccountDataCapability = {
  fetchData: (request) => fetchAccountData(request),
}
