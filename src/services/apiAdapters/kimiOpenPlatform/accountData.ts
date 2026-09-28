import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { fetchKimiAccountData } from "~/services/apiService/kimiOpenPlatform"

export const kimiOpenPlatformAccountData: AccountDataCapability = {
  fetchData: (request) => fetchKimiAccountData(request),
}
