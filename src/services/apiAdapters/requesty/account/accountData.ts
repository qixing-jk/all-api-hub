import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { fetchAccountData } from "~/services/apiService/requesty"

export const requestyAccountData: AccountDataCapability = {
  fetchData: (request) => fetchAccountData(request),
}
