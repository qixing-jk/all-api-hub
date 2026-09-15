import {
  hasUsableApiTokenKey,
  normalizeApiTokenKeyValue,
} from "~/services/accountTokens/apiTokenKey"
import type { AccountKeyResourceRef } from "~/services/apiAdapters/contracts/accountKeyResource"
import type { Sub2ApiPricingCatalogs } from "~/services/apiAdapters/sub2api/stationPricing"
import {
  fetchSub2ApiAvailableGroups,
  fetchSub2ApiGroupRates,
  fetchSub2ApiKeys,
  fetchSub2ApiPricingCatalogs,
} from "~/services/apiService/sub2api"
import type { Sub2ApiNativeKey } from "~/services/apiService/sub2api/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

export interface Sub2ApiPriceGroup {
  groupId: string
  groupName: string
  rate_multiplier?: number
}

interface Sub2ApiDashboardEstimateData {
  group: Sub2ApiPriceGroup | null
  groupRates: Record<string, number>
  pricingCatalogs?: Sub2ApiPricingCatalogs
}

/** Resolves native key identity before using a unique, unmasked secret as read-only fallback evidence. */
export function resolveSub2ApiKeyGroupForPriceEstimation(params: {
  resourceId: string
  resolvedKey: string
  keys: readonly Sub2ApiNativeKey[]
  groups: unknown[]
}): Sub2ApiPriceGroup | null {
  const groups = params.groups.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return []
    const group = raw as {
      id?: unknown
      name?: unknown
      rate_multiplier?: unknown
    }
    const id = Number(group.id)
    const name = typeof group.name === "string" ? group.name.trim() : ""
    if (!Number.isSafeInteger(id) || id <= 0 || !name) return []
    const ratio = Number(group.rate_multiplier)
    return [
      {
        groupId: String(id),
        groupName: name,
        rate_multiplier: Number.isFinite(ratio) && ratio > 0 ? ratio : 1,
      },
    ]
  })
  let key = params.keys.find(
    (candidate) => String(candidate.id) === params.resourceId,
  )
  if (!key && hasUsableApiTokenKey(params.resolvedKey)) {
    const secret = normalizeApiTokenKeyValue(params.resolvedKey)
    const matches = params.keys.filter(
      (candidate) =>
        hasUsableApiTokenKey(candidate.key) &&
        normalizeApiTokenKeyValue(candidate.key) === secret,
    )
    if (matches.length === 1) key = matches[0]
  }
  if (!key) return null
  const byId = groups.find((group) => group.groupId === String(key.group_id))
  if (byId) return byId
  const byName = groups.filter(
    (group) => group.groupName === key.group_name.trim(),
  )
  return byName.length === 1 ? byName[0] : null
}

/** Dashboard DTOs stay within Sub2API; pricing consumers receive only the selected price group. */
export const loadSub2ApiDashboardEstimateData = async (
  request: ApiServiceRequest,
  selection: { ref: AccountKeyResourceRef; resolvedKey: string },
): Promise<Sub2ApiDashboardEstimateData> => {
  if (
    selection.ref.accountId !== request.accountId ||
    selection.ref.siteType !== "sub2api" ||
    selection.ref.scopeKey !== "account"
  ) {
    throw new Error("Invalid Sub2API key scope")
  }
  const [groups, groupRates, keys, pricingCatalogs] = await Promise.all([
    fetchSub2ApiAvailableGroups(request),
    fetchSub2ApiGroupRates(request),
    fetchSub2ApiKeys(request),
    fetchSub2ApiPricingCatalogs(request),
  ])
  return {
    group: resolveSub2ApiKeyGroupForPriceEstimation({
      resourceId: selection.ref.resourceId,
      resolvedKey: selection.resolvedKey,
      keys,
      groups,
    }),
    groupRates,
    pricingCatalogs,
  }
}
