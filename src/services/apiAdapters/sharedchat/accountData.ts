import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { fetchAccountData } from "~/services/apiService/sharedchat"

export const sharedChatAccountData: AccountDataCapability = {
  fetchData: (request) => fetchAccountData(request),
}
