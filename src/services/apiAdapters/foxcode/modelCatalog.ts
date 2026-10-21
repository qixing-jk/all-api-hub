import { SITE_TYPES } from "~/constants/siteType"
import type { ModelCatalogCapability } from "~/services/apiAdapters/contracts/modelCatalog"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { fetchUserInfo } from "~/services/apiService/foxcode"
import {
  fetchChannels,
  findFoxCodeChannel,
  type FoxCodeChannel,
} from "~/services/apiService/foxcode/catalog"
import { FOXCODE_ENDPOINTS } from "~/services/apiService/foxcode/constants"
import { fetchNativeKeys } from "~/services/apiService/foxcode/keys"
import {
  FOXCODE_CONSOLE_ORIGIN,
  invalidFoxCodeResponse,
  readFoxCode,
  withFoxCodeSession,
} from "~/services/apiService/foxcode/transport"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import type {
  PriceRate,
  PricingPlan,
} from "~/services/modelPricing/pricingPlan"
import { isRecord } from "~/utils/core/object"

const rate = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined
const priceUrl = `${FOXCODE_CONSOLE_ORIGIN}/model-square`

/** Channel quota multipliers divide the provider's base USD prices; native tiers stay unavailable. */
function buildCatalog(
  channels: FoxCodeChannel[],
  pricing: Record<string, unknown>,
): ModelCatalogSnapshot {
  const available = channels.filter((channel) => channel.enabled)
  const names = Object.fromEntries(
    available.map((channel) => [channel.key, channel.name]),
  )
  const ratios = Object.fromEntries(
    available
      .filter((channel) => channel.quotaMultiplier !== undefined)
      .map((channel) => [channel.key, 1 / channel.quotaMultiplier!]),
  )
  const ids = [...new Set(available.flatMap((channel) => channel.models))]
  return {
    success: true,
    groupAccess: {
      kind: "authoritative",
      usableGroups: available.map((channel) => channel.key),
    },
    groupRatios: ratios,
    data: ids.map((id) => {
      const native = pricing[id],
        groups = available.filter((channel) => channel.models.includes(id))
      const price = isRecord(native) ? native : {}
      const perCall = price.times === true
      const input = rate(price.input),
        output = rate(price.output),
        cacheRead = rate(price.cacheRead),
        cacheWrite = rate(price.cacheWrite),
        call = rate(price.perCall)
      const understood =
        Object.keys(price).every((key) =>
          [
            "times",
            "input",
            "output",
            "cacheRead",
            "cacheWrite",
            "perCall",
          ].includes(key),
        ) &&
        groups.every(
          (channel) =>
            !channel.complexPricing && channel.quotaMultiplier !== undefined,
        ) &&
        (perCall
          ? call !== undefined
          : price.times === false &&
            input !== undefined &&
            output !== undefined)
      const rates: PricingPlan["rates"] = {}
      const tokenRate = (amount: number): PriceRate => ({
        amount,
        currency: "USD",
        unit: "token",
        per: 1_000_000,
      })
      if (understood) {
        if (perCall)
          rates.request = {
            amount: call!,
            currency: "USD",
            unit: "request",
            per: 1,
          }
        else {
          rates.input = tokenRate(input!)
          rates.output = tokenRate(output!)
          if (cacheRead !== undefined) rates.cacheRead = tokenRate(cacheRead)
          if (cacheWrite !== undefined) rates.cacheWrite = tokenRate(cacheWrite)
        }
      }
      return {
        model_name: id,
        quota_type: perCall ? 1 : 0,
        model_ratio: 0,
        model_price: 0,
        completion_ratio: 1,
        enable_groups: groups.map((channel) => channel.key),
        groupDisplayNames: names,
        supported_endpoint_types: [
          ...new Set(groups.flatMap((channel) => channel.protocols)),
        ],
        ...(understood
          ? {
              pricingPlan: {
                rates,
                rules: [],
                usageMode: perCall ? ("request" as const) : ("tokens" as const),
                source: { kind: "catalog" as const, url: priceUrl },
                groupMultiplier: "pending" as const,
                issues: [],
              },
            }
          : {}),
        price_metadata: understood
          ? {
              source: "provider-catalog" as const,
              precision: "exact" as const,
              source_url: priceUrl,
            }
          : {
              source: "none" as const,
              precision: "unavailable" as const,
              unavailable_reason: "pricing-source-unavailable" as const,
            },
      }
    }),
    model_list_source: {
      kind: "provider-catalog",
      provider: SITE_TYPES.FOXCODE,
      supportsPricing: true,
      actionPolicy: {
        supportsGroupFiltering: true,
        supportsAccountSummary: true,
        supportsTokenCompatibility: true,
        supportsCredentialVerification: true,
        supportsBatchCredentialVerification: false,
        supportsCliVerification: true,
      },
    },
  }
}
/** Join published base prices with native channel billing multipliers. */
async function loadCatalog(request: ApiServiceRequest) {
  return withFoxCodeSession(request, async (request) => {
    await fetchUserInfo(request)
    const [channels, data] = await Promise.all([
      fetchChannels(request),
      readFoxCode(request, FOXCODE_ENDPOINTS.Pricing),
    ])
    if (!isRecord(data.pricing))
      throw invalidFoxCodeResponse(FOXCODE_ENDPOINTS.Pricing)
    return buildCatalog(channels, data.pricing)
  })
}
export const foxCodeModelPricing: ModelPricingCapability = {
  runtimeKeyFallback: "account-pricing",
  fetchPricing: loadCatalog,
}

export const foxCodeModelCatalog: ModelCatalogCapability = {
  async fetchModels(request, context) {
    if (!context?.accountRequest)
      throw new ApiError(
        "FoxCode console context is required",
        undefined,
        undefined,
        API_ERROR_CODES.FEATURE_UNSUPPORTED,
      )
    const accountRequest = {
      ...context.accountRequest,
      abortSignal: request.abortSignal ?? context.accountRequest.abortSignal,
    }
    const key = (await fetchNativeKeys(accountRequest)).find(
      (key) => key.key === request.auth.apiKey,
    )
    if (!key || !key.isActive)
      throw new ApiError(
        "FoxCode key is unavailable",
        undefined,
        undefined,
        API_ERROR_CODES.TOKEN_SECRET_UNAVAILABLE,
      )
    const channels = await fetchChannels(accountRequest)
    const channel = findFoxCodeChannel(channels, key.channelKey)
    const ids =
      key.channelKey === null
        ? [
            ...new Set(
              channels
                .filter((channel) => channel.enabled)
                .flatMap((channel) => channel.models),
            ),
          ]
        : channel?.models ?? []
    return ids.map((id) => ({ id }))
  },
  async enrichPricing({ accountRequest, runtimeKey, models }) {
    const catalog = await loadCatalog(accountRequest)
    const ids = new Set(models.map((model) => model.id))
    const groups = runtimeKey.modelAccess.groups ?? []
    const bound = new Set(groups)
    return {
      ...catalog,
      data: catalog.data
        .filter((model) => ids.has(model.model_name))
        .map((model) => ({
          ...model,
          enable_groups: groups.length
            ? model.enable_groups.filter((group) => bound.has(group))
            : model.enable_groups,
        })),
      groupAccess: groups.length
        ? { kind: "authoritative", usableGroups: [...groups] }
        : catalog.groupAccess,
      model_list_source: { ...catalog.model_list_source!, kind: "user-scoped" },
    }
  },
}
