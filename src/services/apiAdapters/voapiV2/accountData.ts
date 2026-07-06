import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { fetchVoApiV2AccountData } from "~/services/apiService/voapiV2"

export const voApiV2AccountData: AccountDataCapability = {
  fetchData: (request) => fetchVoApiV2AccountData(request),
}
