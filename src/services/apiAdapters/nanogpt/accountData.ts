import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { fetchAccountData } from "~/services/apiService/nanogpt"

export const nanoGptAccountData: AccountDataCapability = {
  fetchData: (request) => fetchAccountData(request),
}
