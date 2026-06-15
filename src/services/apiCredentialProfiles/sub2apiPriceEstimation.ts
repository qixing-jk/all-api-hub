import { SITE_TYPES } from "~/constants/siteType"
import type { ModelPriceTable } from "~/services/apiCredentialProfiles/modelPriceTable"
import {
  isMaskedApiTokenKey,
  normalizeApiTokenKeyValue,
} from "~/services/apiService/common/apiKey"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
  type ModelPricing,
  type PricingResponse,
} from "~/services/apiService/common/type"
import { parseSub2ApiGroupRates } from "~/services/apiService/sub2api/parsing"
import type { ApiToken } from "~/types"

type Sub2ApiGroupLike = {
  id?: number | string | null
  name?: string | null
  rate_multiplier?: number | string | null
}

type ResolvedSub2ApiPriceGroup = {
  groupId: string
  groupName: string
  rate_multiplier?: number
}

type ResolveSub2ApiKeyGroupParams = {
  selectedToken: ApiToken
  resolvedKey: string
  accountTokens: ApiToken[]
  groups: unknown[]
}

type ApplySub2ApiPriceEstimatesParams = {
  modelIds: string[]
  group: ResolvedSub2ApiPriceGroup | null
  groupRates: Record<string, number>
  priceTable: ModelPriceTable
}

const toTrimmedString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

const toSafeRateMultiplier = (value: unknown): number => {
  const parsed = toFiniteNumber(value)
  return parsed && parsed > 0 ? parsed : 1
}

const toFiniteGroupId = (value: unknown): number | undefined => {
  const parsed = toFiniteNumber(value)
  return typeof parsed === "number" && Number.isInteger(parsed)
    ? parsed
    : undefined
}

const normalizeGroup = (
  group: Sub2ApiGroupLike,
): ResolvedSub2ApiPriceGroup | null => {
  const id = toFiniteGroupId(group.id)
  const name = toTrimmedString(group.name)
  if (id === undefined || !name) return null

  return {
    groupId: String(id),
    groupName: name,
    rate_multiplier: toSafeRateMultiplier(group.rate_multiplier),
  }
}

const normalizeGroups = (
  groups: Sub2ApiGroupLike[],
): ResolvedSub2ApiPriceGroup[] =>
  groups
    .map(normalizeGroup)
    .filter((group): group is ResolvedSub2ApiPriceGroup => Boolean(group))

const findGroupByStableId = (
  groups: ResolvedSub2ApiPriceGroup[],
  groupId: unknown,
): ResolvedSub2ApiPriceGroup | null => {
  const normalizedGroupId = toFiniteGroupId(groupId)
  if (normalizedGroupId === undefined) return null

  return (
    groups.find((group) => group.groupId === String(normalizedGroupId)) ?? null
  )
}

const findSingleGroupByName = (
  groups: ResolvedSub2ApiPriceGroup[],
  groupName: string | undefined,
): ResolvedSub2ApiPriceGroup | null => {
  const normalizedGroupName = toTrimmedString(groupName)
  if (!normalizedGroupName) return null

  const matches = groups.filter(
    (group) => group.groupName === normalizedGroupName,
  )
  return matches.length === 1 ? matches[0] : null
}

const findExactUnmaskedTokenMatch = (
  accountTokens: ApiToken[],
  resolvedKey: string,
): ApiToken | null => {
  const normalizedResolvedKey = normalizeApiTokenKeyValue(resolvedKey)
  if (!normalizedResolvedKey || isMaskedApiTokenKey(normalizedResolvedKey)) {
    return null
  }

  return (
    accountTokens.find((token) => {
      const normalizedTokenKey = normalizeApiTokenKeyValue(token.key ?? "")
      return (
        normalizedTokenKey === normalizedResolvedKey &&
        !isMaskedApiTokenKey(normalizedTokenKey)
      )
    }) ?? null
  )
}

/**
 * Resolve the selected Sub2API key's stable group for optional price estimation.
 */
export function resolveSub2ApiKeyGroupForPriceEstimation(
  params: ResolveSub2ApiKeyGroupParams,
): ResolvedSub2ApiPriceGroup | null {
  const groups = normalizeGroups(params.groups as Sub2ApiGroupLike[])

  const selectedStableGroup = findGroupByStableId(
    groups,
    params.selectedToken.sub2api_group_id,
  )
  if (selectedStableGroup) return selectedStableGroup

  if (params.accountTokens.length > 0) {
    const matchedToken = findExactUnmaskedTokenMatch(
      params.accountTokens,
      params.resolvedKey,
    )
    if (!matchedToken) return null

    return (
      findGroupByStableId(groups, matchedToken.sub2api_group_id) ??
      findSingleGroupByName(groups, matchedToken.group)
    )
  }

  return findSingleGroupByName(groups, params.selectedToken.group)
}

const normalizeModelIds = (modelIds: string[]): string[] =>
  Array.from(
    new Set(
      modelIds
        .map((modelId) => modelId.trim())
        .filter((modelId) => modelId.length > 0),
    ),
  )

const createUnavailableModel = (
  modelId: string,
  reason: (typeof MODEL_UNAVAILABLE_PRICE_REASONS)[keyof typeof MODEL_UNAVAILABLE_PRICE_REASONS],
): ModelPricing => ({
  model_name: modelId,
  quota_type: 0,
  model_ratio: 0,
  model_price: 0,
  price_metadata: {
    source: MODEL_PRICE_SOURCE_KINDS.NONE,
    precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
    unavailable_reason: reason,
  },
  completion_ratio: 1,
  enable_groups: [],
  supported_endpoint_types: [],
})

const hasFinitePrice = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value)

const createEstimatedModel = (
  modelId: string,
  group: ResolvedSub2ApiPriceGroup,
  effectiveRate: number,
  priceTable: ModelPriceTable,
): ModelPricing => {
  const officialPrice = priceTable.models[modelId]
  const input = toFiniteNumber(officialPrice?.input)
  const output = toFiniteNumber(officialPrice?.output)
  const cacheRead = toFiniteNumber(officialPrice?.cache_read)
  const cacheWrite = toFiniteNumber(officialPrice?.cache_write)

  if (!hasFinitePrice(input) || !hasFinitePrice(output)) {
    return createUnavailableModel(
      modelId,
      MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
    )
  }

  return {
    model_name: modelId,
    quota_type: 0,
    model_ratio: 0,
    model_price: 0,
    token_price_usd_per_million: {
      ...(hasFinitePrice(input) ? { input: input * effectiveRate } : {}),
      ...(hasFinitePrice(output) ? { output: output * effectiveRate } : {}),
      ...(hasFinitePrice(cacheRead)
        ? { cache_read: cacheRead * effectiveRate }
        : {}),
      ...(hasFinitePrice(cacheWrite)
        ? { cache_write: cacheWrite * effectiveRate }
        : {}),
    },
    price_metadata: {
      source: MODEL_PRICE_SOURCE_KINDS.OFFICIAL_RATE_ESTIMATE,
      precision: MODEL_PRICE_PRECISION_KINDS.ESTIMATED,
      ...(priceTable.source_date
        ? { source_date: priceTable.source_date }
        : {}),
    },
    completion_ratio: 0,
    enable_groups: [group.groupName],
    supported_endpoint_types: [],
  }
}

/**
 * Build a Sub2API runtime-model pricing response using official prices and the key's group rate.
 */
export function applySub2ApiPriceEstimates(
  params: ApplySub2ApiPriceEstimatesParams,
): PricingResponse {
  const modelIds = normalizeModelIds(params.modelIds)

  if (!params.group) {
    return {
      success: true,
      group_ratio: {},
      usable_group: {},
      model_list_source: {
        kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
        provider: SITE_TYPES.SUB2API,
        supportsRuntimeModelList: true,
        supportsPricing: false,
      },
      data: modelIds.map((modelId) =>
        createUnavailableModel(
          modelId,
          MODEL_UNAVAILABLE_PRICE_REASONS.KEY_GROUP_UNKNOWN,
        ),
      ),
    }
  }

  const group = params.group
  const groupRates = parseSub2ApiGroupRates(params.groupRates, "sub2api-rates")
  const effectiveRate =
    groupRates[group.groupId] ?? toSafeRateMultiplier(group.rate_multiplier)

  return {
    success: true,
    group_ratio: {
      [group.groupName]: effectiveRate,
    },
    usable_group: {
      [group.groupName]: group.groupName,
    },
    model_list_source: {
      kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
      provider: SITE_TYPES.SUB2API,
      supportsRuntimeModelList: true,
      supportsPricing: true,
    },
    data: modelIds.map((modelId) =>
      createEstimatedModel(modelId, group, effectiveRate, params.priceTable),
    ),
  }
}
