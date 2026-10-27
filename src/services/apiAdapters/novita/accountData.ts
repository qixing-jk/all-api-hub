import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { fetchAccountData } from "~/services/apiService/novita/accountData"

export const novitaAccountData: AccountDataCapability = {
  fetchData: (request) => fetchAccountData(request),
}
