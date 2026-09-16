import { SITE_TYPES } from "~/constants/siteType"
import type { AccountKeyResourceRef } from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  loadSub2ApiDashboardEstimateData,
  type Sub2ApiPriceGroup as ResolvedSub2ApiPriceGroup,
} from "~/services/apiAdapters/sub2api/dashboardEstimates"
import {
  applySub2ApiStationPrice,
  type Sub2ApiPricingCatalogs,
} from "~/services/apiAdapters/sub2api/stationPricing"
import { parseSub2ApiGroupRates } from "~/services/apiService/sub2api/parsing"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
  type ModelPricing,
} from "~/services/modelList/pricingModel"
import { buildModelListCatalogPricingResponse } from "~/services/modelList/pricingResponse"
import {
  loadModelPriceTable,
  type ModelPriceTable,
} from "~/services/modelPricing/modelPriceTable"
import { PRICING_GROUP_MULTIPLIERS } from "~/services/modelPricing/pricingConstants"
import { scalePricingRates } from "~/services/modelPricing/pricingRates"
import type { ModelDescriptor } from "~/services/models/modelDescriptor"
import { isAbortError } from "~/services/verification/aiApiVerification/utils"
import { AuthTypeEnum } from "~/types"

interface ApplySub2ApiPriceEstimatesParams {
  models: readonly ModelDescriptor[]
  group: ResolvedSub2ApiPriceGroup | null
  groupRates: Record<string, number>
  priceTable: ModelPriceTable
  pricingCatalogs?: Sub2ApiPricingCatalogs
}

interface LoadSub2ApiEstimatedPricingResponseParams {
  request: ApiServiceRequest
  selectedRef: AccountKeyResourceRef
  resolvedKey: string
  runtimeModels: readonly ModelDescriptor[]
}

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
    ...(officialPrice?.pricingPlan
      ? {
          pricingPlan: {
            ...officialPrice.pricingPlan,
            rates: scalePricingRates(
              officialPrice.pricingPlan.rates,
              effectiveRate,
            ),
            rules: officialPrice.pricingPlan.rules.map((rule) => ({
              ...rule,
              rates: scalePricingRates(rule.rates, effectiveRate),
            })),
            groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
          },
        }
      : {}),
    token_price_usd_per_million: {
      input: input * effectiveRate,
      output: output * effectiveRate,
      ...(hasFinitePrice(cacheRead)
        ? { cache_read: cacheRead * effectiveRate }
        : {}),
      ...(hasFinitePrice(cacheWrite)
        ? { cache_write: cacheWrite * effectiveRate }
        : {}),
    },
    price_metadata: {
      source: MODEL_PRICE_SOURCE_KINDS.OFFICIAL_RATE_ESTIMATE,
      ...(/^https?:\/\//i.test(priceTable.source)
        ? { source_url: priceTable.source }
        : {}),
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
): ModelCatalogSnapshot {
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
    groupRatios: {
      [group.groupName]: effectiveRate,
    },
    groupAccess: { kind: "authoritative", usableGroups: [group.groupName] },
    model_list_source: {
      kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
      provider: SITE_TYPES.SUB2API,
      supportsRuntimeModelList: true,
      supportsPricing: true,
    },
    data: response.data.map(
      (model) =>
        applySub2ApiStationPrice(
          model,
          group.groupId,
          group.groupName,
          effectiveRate,
          params.pricingCatalogs,
        ) ??
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
): ModelCatalogSnapshot {
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

export const loadSub2ApiEstimatedPricingResponse = async (
  params: LoadSub2ApiEstimatedPricingResponseParams,
): Promise<ModelCatalogSnapshot> => {
  if (
    params.request.auth.authType !== AuthTypeEnum.AccessToken ||
    typeof params.request.auth.accessToken !== "string" ||
    !params.request.auth.accessToken.trim()
  ) {
    return buildSub2ApiRuntimePricingResponse(params.runtimeModels)
  }

  try {
    const [dashboardEstimateData, priceTable] = await Promise.all([
      loadSub2ApiDashboardEstimateData(params.request, {
        ref: params.selectedRef,
        resolvedKey: params.resolvedKey,
      }),
      loadModelPriceTable(params.request.abortSignal).catch((error) => {
        if (isAbortError(error, params.request.abortSignal)) throw error
        return { source: "unavailable", models: {} }
      }),
    ])
    const { group, groupRates } = dashboardEstimateData

    return applySub2ApiPriceEstimates({
      models: params.runtimeModels,
      group,
      groupRates,
      priceTable,
      pricingCatalogs: dashboardEstimateData.pricingCatalogs,
    })
  } catch (error) {
    if (isAbortError(error, params.request.abortSignal)) {
      throw error
    }

    return buildSub2ApiRuntimePricingResponse(
      params.runtimeModels,
      MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_SOURCE_UNAVAILABLE,
    )
  }
}
