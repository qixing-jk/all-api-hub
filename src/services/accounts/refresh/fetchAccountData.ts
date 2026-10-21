import type { AccountSiteType } from "~/constants/siteType"
import type { ApiServiceAccountRequest } from "~/services/accounts/accountDataModel"
import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { refreshSelectedStatus } from "~/services/checkin/autoCheckin/scheduling/refresh"

/** Fetches an onboarding/edit snapshot; the caller owns its eventual persistence. */
export async function fetchAccountDataWithCheckInStatus(
  capability: AccountDataCapability,
  request: ApiServiceAccountRequest & { siteType: AccountSiteType },
) {
  const data = await capability.fetchData(request)
  return {
    ...data,
    checkIn: await refreshSelectedStatus({
      config: data.checkIn,
      siteType: request.siteType,
      request,
    }),
  }
}
