import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { fetchAccountData } from "~/services/apiService/openrouter"

export const openRouterAccountData: AccountDataCapability = {
  fetchData: (request) => fetchAccountData(request),
}
