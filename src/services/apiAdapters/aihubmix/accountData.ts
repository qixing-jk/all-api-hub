import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { fetchAccountData } from "~/services/apiService/aihubmix"

export const aihubmixAccountData: AccountDataCapability = {
  fetchData: (request) => fetchAccountData(request),
}
