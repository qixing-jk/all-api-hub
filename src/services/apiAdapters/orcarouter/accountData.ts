import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { fetchAccountData } from "~/services/apiService/orcarouter"

export const orcaRouterAccountData: AccountDataCapability = {
  fetchData: (request) => fetchAccountData(request),
}
