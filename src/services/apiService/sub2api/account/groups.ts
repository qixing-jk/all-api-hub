import { fetchSub2ApiData } from "~/services/apiService/sub2api/account/dashboardRequest"
import {
  buildSub2ApiGroupDescriptors,
  parseSub2ApiGroupRates,
} from "~/services/apiService/sub2api/parsing"
import { getSafeErrorMessage } from "~/services/apiService/sub2api/redaction"
import {
  SUB2API_AVAILABLE_GROUPS_ENDPOINT,
  SUB2API_GROUP_RATES_ENDPOINT,
  type Sub2ApiGroupDescriptor,
} from "~/services/apiService/sub2api/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to Sub2API site API overrides.
 */
const logger = createLogger("ApiService.Sub2API")

const fetchAvailableGroupsInternal = async (request: ApiServiceRequest) =>
  fetchSub2ApiData<unknown[]>(request, SUB2API_AVAILABLE_GROUPS_ENDPOINT, {
    method: "GET",
    cache: "no-store",
  })

const fetchGroupRatesInternal = async (request: ApiServiceRequest) =>
  fetchSub2ApiData<unknown>(request, SUB2API_GROUP_RATES_ENDPOINT, {
    method: "GET",
    cache: "no-store",
  }).then((rates) =>
    parseSub2ApiGroupRates(rates, SUB2API_GROUP_RATES_ENDPOINT),
  )

export const fetchSub2ApiAvailableGroups = fetchAvailableGroupsInternal

export const fetchSub2ApiGroupRates = fetchGroupRatesInternal

/**
 * Source: https://github.com/Wei-Shaw/sub2api
 * Available groups expose numeric IDs, while group rates are keyed by those
 * IDs. Display names are disclosure only and are not round-tripped as identity.
 */
export async function fetchSub2ApiGroupDescriptors(
  request: ApiServiceRequest,
): Promise<Sub2ApiGroupDescriptor[]> {
  try {
    const [groups, rates] = await Promise.all([
      fetchAvailableGroupsInternal(request),
      fetchGroupRatesInternal(request),
    ])

    return buildSub2ApiGroupDescriptors(groups, rates, {
      groups: SUB2API_AVAILABLE_GROUPS_ENDPOINT,
      rates: SUB2API_GROUP_RATES_ENDPOINT,
    })
  } catch (error) {
    logger.error("Failed to fetch Sub2API group descriptors", {
      accountId: request.accountId,
      error: getSafeErrorMessage(error),
    })
    throw error
  }
}
