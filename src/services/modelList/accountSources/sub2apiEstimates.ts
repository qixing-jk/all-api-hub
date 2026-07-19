import { SITE_TYPES } from "~/constants/siteType"
import {
  isMaskedApiTokenKey,
  normalizeApiTokenKeyValue,
} from "~/services/accountTokens/apiTokenKey"
import { loadSub2ApiDashboardEstimateData } from "~/services/apiAdapters/sub2api/dashboardEstimates"
import { parseSub2ApiGroupRates } from "~/services/apiService/sub2api/parsing"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
  type ModelPricing,
  type PricingResponse,
} from "~/services/modelList/pricingModel"
import { buildModelListCatalogPricingResponse } from "~/services/modelList/pricingResponse"
import {
  loadModelPriceTable,
  type ModelPriceTable,
} from "~/services/modelPricing/modelPriceTable"
import type { ModelDescriptor } from "~/services/models/modelDescriptor"
import { isAbortError } from "~/services/verification/aiApiVerification/utils"
import { AuthTypeEnum, type ApiToken, type DisplaySiteData } from "~/types"

interface Sub2ApiGroupLike {
  id?: number | string | null
  name?: string | null
  rate_multiplier?: number | string | null
}

interface ResolvedSub2ApiPriceGroup {
  groupId: string
  groupName: string
  rate_multiplier?: number
}

interface ResolveSub2ApiKeyGroupParams {
  selectedToken: ApiToken
  resolvedKey: string
  accountTokens: ApiToken[]
  groups: unknown[]
}

interface ApplySub2ApiPriceEstimatesParams {
  models: readonly ModelDescriptor[]
  group: ResolvedSub2ApiPriceGroup | null
  groupRates: Record<string, number>
  priceTable: ModelPriceTable
}

type Sub2ApiEstimateAccount = Pick<
  DisplaySiteData,
  | "siteType"
  | "baseUrl"
  | "id"
  | "authType"
  | "userId"
  | "token"
  | "cookieAuthSessionCookie"
>

interface LoadSub2ApiEstimatedPricingResponseParams {
  account: Sub2ApiEstimateAccount
  selectedToken: ApiToken
  resolvedKey: string
  runtimeModels: readonly ModelDescriptor[]
  abortSignal?: AbortSignal
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

    if (matchedToken) {
      return (
        findGroupByStableId(groups, matchedToken.sub2api_group_id) ??
        findSingleGroupByName(groups, matchedToken.group)
      )
    }
  }

  return findSingleGroupByName(groups, params.selectedToken.group)
}

const hasFinitePrice = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value)

const createEstimatedModel = (
  model: ModelPricing,
  group: ResolvedSub2ApiPriceGroup,
  effectiveRate: number,
  priceTable: ModelPriceTable,
): ModelPricing => {
  const officialPrice = priceTable.models[model.model_name]
  const input = toFiniteNumber(officialPrice?.input)
  const output = toFiniteNumber(officialPrice?.output)
  const cacheRead = toFiniteNumber(officialPrice?.cache_read)
  const cacheWrite = toFiniteNumber(officialPrice?.cache_write)

  if (!hasFinitePrice(input) || !hasFinitePrice(output)) {
    return model
  }

  return {
    ...model,
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
  if (!params.group) {
    return buildSub2ApiRuntimePricingResponse(
      params.models,
      MODEL_UNAVAILABLE_PRICE_REASONS.KEY_GROUP_UNKNOWN,
    )
  }

  const group = params.group
  const groupRates = parseSub2ApiGroupRates(params.groupRates, "sub2api-rates")
  const effectiveRate =
    groupRates[group.groupId] ?? toSafeRateMultiplier(group.rate_multiplier)
  const response = buildSub2ApiRuntimePricingResponse(
    params.models,
    MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
  )

  return {
    ...response,
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
    data: response.data.map((model) =>
      createEstimatedModel(model, group, effectiveRate, params.priceTable),
    ),
  }
}

/**
 * Build a Sub2API runtime-key model catalog where model visibility is known
 * but no JWT/group pricing estimate has been applied yet.
 */
export function buildSub2ApiRuntimePricingResponse(
  models: readonly ModelDescriptor[],
  unavailableReason: (typeof MODEL_UNAVAILABLE_PRICE_REASONS)[keyof typeof MODEL_UNAVAILABLE_PRICE_REASONS] = MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
): PricingResponse {
  return buildModelListCatalogPricingResponse({
    models,
    unavailableReason,
    source: {
      kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
      provider: SITE_TYPES.SUB2API,
      supportsRuntimeModelList: true,
      supportsPricing: false,
    },
  })
}

const hasSub2ApiDashboardAuth = (account: Sub2ApiEstimateAccount): boolean => {
  return (
    account.authType === AuthTypeEnum.AccessToken &&
    typeof account.token === "string" &&
    account.token.trim().length > 0
  )
}

const createSub2ApiDashboardRequest = (
  account: Sub2ApiEstimateAccount,
  abortSignal?: AbortSignal,
): ApiServiceRequest => ({
  baseUrl: account.baseUrl,
  accountId: account.id,
  abortSignal,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: account.userId,
    accessToken: account.token,
    cookie: account.cookieAuthSessionCookie,
  },
})

export const loadSub2ApiEstimatedPricingResponse = async (
  params: LoadSub2ApiEstimatedPricingResponseParams,
): Promise<PricingResponse> => {
  if (!hasSub2ApiDashboardAuth(params.account)) {
    return buildSub2ApiRuntimePricingResponse(params.runtimeModels)
  }

  try {
    const dashboardRequest = createSub2ApiDashboardRequest(
      params.account,
      params.abortSignal,
    )
    const [dashboardEstimateData, priceTable] = await Promise.all([
      loadSub2ApiDashboardEstimateData(dashboardRequest),
      loadModelPriceTable(params.abortSignal),
    ])
    const { groups, groupRates, accountTokens } = dashboardEstimateData
    const group = resolveSub2ApiKeyGroupForPriceEstimation({
      selectedToken: params.selectedToken,
      resolvedKey: params.resolvedKey,
      accountTokens,
      groups,
    })

    return applySub2ApiPriceEstimates({
      models: params.runtimeModels,
      group,
      groupRates,
      priceTable,
    })
  } catch (error) {
    if (isAbortError(error, params.abortSignal)) {
      throw error
    }

    return buildSub2ApiRuntimePricingResponse(
      params.runtimeModels,
      MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_SOURCE_UNAVAILABLE,
    )
  }
}
