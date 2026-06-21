import {
  fetchAccountTokens,
  fetchSub2ApiAvailableGroups,
  fetchSub2ApiGroupRates,
} from "~/services/apiService/sub2api"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ApiToken } from "~/types"

type Sub2ApiDashboardEstimateData = {
  groups: unknown[]
  groupRates: Record<string, number>
  accountTokens: ApiToken[]
}

export const loadSub2ApiDashboardEstimateData = async (
  request: ApiServiceRequest,
): Promise<Sub2ApiDashboardEstimateData> => {
  const [groups, groupRates, accountTokens] = await Promise.all([
    fetchSub2ApiAvailableGroups(request),
    fetchSub2ApiGroupRates(request),
    fetchAccountTokens(request),
  ])

  return {
    groups,
    groupRates,
    accountTokens,
  }
}
