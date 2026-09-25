import { SITE_TYPES } from "~/constants/siteType"
import {
  toOptionalFiniteNumber,
  toOptionalString,
} from "~/services/apiService/rightcode/parsing"
import type {
  RightCodeEffectiveModel,
  RightCodeEffectivePriceConfig,
  RightCodeEffectiveUpstream,
  RightCodeProtocol,
} from "~/services/apiService/rightcode/type"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  type ModelPricing,
} from "~/services/modelList/pricingModel"

/** Right Code's own billing modes for a model entry. */
const RIGHTCODE_BILLING_MODES = {
  Token: "token",
  Tiered: "tiered",
  Request: "request",
} as const

type RightCodeTokenPrices = {
  input?: number
  output?: number
  cache_read?: number
  cache_write?: number
}

const readPositiveNumber = (value: unknown): number | undefined => {
  const parsed = toOptionalFiniteNumber(value)
  return parsed !== undefined && parsed > 0 ? parsed : undefined
}

const readNonNegativeNumber = (value: unknown): number | undefined => {
  const parsed = toOptionalFiniteNumber(value)
  return parsed !== undefined && parsed >= 0 ? parsed : undefined
}

/**
 * Reads the token prices this account actually pays.
 *
 * `effective_price_config` already folds in the channel rate and the account's
 * own rate, so these are USD per million tokens and need no further scaling.
 * Tiered models bill by context length; the first (cheapest) tier is published
 * as the base price and marked estimated.
 */
const readEffectiveTokenPrices = (
  model: RightCodeEffectiveModel,
  config: RightCodeEffectivePriceConfig | null,
): RightCodeTokenPrices => {
  const tiers = Array.isArray(config?.tiers) ? config.tiers : []
  const tier = tiers.find(
    (candidate) => candidate && typeof candidate === "object",
  )
  const source = tier ?? config

  const input =
    readNonNegativeNumber(source?.input_price) ??
    readNonNegativeNumber(model.input_price)
  const output =
    readNonNegativeNumber(source?.output_price) ??
    readNonNegativeNumber(model.output_price)
  const cacheRead =
    readNonNegativeNumber(source?.cache_read_input_price) ??
    readNonNegativeNumber(model.cache_read_input_price)
  const cacheWrite =
    readNonNegativeNumber(source?.cache_creation_input_price) ??
    readNonNegativeNumber(model.cache_creation_input_price)

  return {
    ...(input === undefined ? {} : { input }),
    ...(output === undefined ? {} : { output }),
    ...(cacheRead === undefined ? {} : { cache_read: cacheRead }),
    ...(cacheWrite === undefined ? {} : { cache_write: cacheWrite }),
  }
}

const toModelPricing = (
  model: RightCodeEffectiveModel,
  upstream: RightCodeEffectiveUpstream,
): ModelPricing => {
  const name = toOptionalString(model.name)
  if (!name) {
    throw new Error("invalid_rightcode_model_name")
  }

  const tokenPrices = readEffectiveTokenPrices(
    model,
    model.effective_price_config ?? null,
  )
  const protocols = (upstream.supported_protocols ?? []) as RightCodeProtocol[]
  const billingMode = toOptionalString(model.billing_mode)
  const requestPrice =
    readPositiveNumber(model.effective_price_config?.request_price) ??
    readPositiveNumber(model.request_price)

  if (billingMode === RIGHTCODE_BILLING_MODES.Request && requestPrice) {
    return {
      model_name: name,
      display_name: name,
      quota_type: 1,
      model_ratio: 0,
      model_price: requestPrice,
      price_metadata: {
        source: MODEL_PRICE_SOURCE_KINDS.CHANNEL_PRICING,
        precision: MODEL_PRICE_PRECISION_KINDS.EXACT,
      },
      completion_ratio: 1,
      enable_groups: [],
      supported_endpoint_types: [...protocols],
    }
  }

  const tiered = billingMode === RIGHTCODE_BILLING_MODES.Tiered
  const input = tokenPrices.input ?? 0
  const output = tokenPrices.output ?? 0

  return {
    model_name: name,
    display_name: name,
    quota_type: 0,
    // Right Code publishes direct USD prices, not One/New API ratios. Leaving
    // the ratio at zero keeps the ratio fallback out of the displayed price.
    model_ratio: 0,
    model_price: 0,
    token_price_usd_per_million: tokenPrices,
    price_metadata: {
      source: MODEL_PRICE_SOURCE_KINDS.CHANNEL_PRICING,
      precision: tiered
        ? MODEL_PRICE_PRECISION_KINDS.ESTIMATED
        : MODEL_PRICE_PRECISION_KINDS.EXACT,
    },
    completion_ratio: input > 0 ? output / input : 1,
    enable_groups: [],
    supported_endpoint_types: [...protocols],
  }
}

const priceRank = (upstream: RightCodeEffectiveUpstream): number | undefined =>
  toOptionalFiniteNumber(upstream.effective_upstream_rate)

const compareUpstreamPriceRank = (
  left: RightCodeEffectiveUpstream,
  right: RightCodeEffectiveUpstream,
): number => {
  const rankLeft = priceRank(left)
  const rankRight = priceRank(right)
  if (rankLeft === rankRight) return 0
  if (rankLeft === undefined) return 1
  if (rankRight === undefined) return -1
  return rankLeft - rankRight
}

/**
 * Builds the Model List snapshot from the account's effective channel catalog.
 *
 * The same model can be offered by several channels at different rates. Model
 * List rows are keyed by model name, so channels are folded into one row per
 * model holding the cheapest rate the account could pay; which channel a given
 * key actually uses is visible on the key itself.
 */
export function buildRightCodePricingResponse(
  upstreams: readonly RightCodeEffectiveUpstream[],
): ModelCatalogSnapshot {
  const orderedUpstreams = [...upstreams].sort(compareUpstreamPriceRank)
  const modelsByName = new Map<string, ModelPricing>()

  for (const upstream of orderedUpstreams) {
    for (const model of upstream.models ?? []) {
      if (model?.is_available === false) continue
      const name = toOptionalString(model?.name)
      if (!name || modelsByName.has(name)) continue
      modelsByName.set(name, toModelPricing(model, upstream))
    }
  }

  return {
    success: true,
    data: Array.from(modelsByName.values()),
    groupRatios: {},
    groupAccess: { kind: "not-applicable" },
    model_list_source: {
      kind: MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
      provider: SITE_TYPES.RIGHT_CODE,
      supportsPricing: true,
      actionPolicy: {
        // Right Code offers no user-defined groups: a key binds to one channel.
        supportsGroupFiltering: false,
        supportsAccountSummary: true,
        supportsTokenCompatibility: false,
        supportsCredentialVerification: true,
        supportsBatchCredentialVerification: false,
        supportsCliVerification: false,
      },
    },
  }
}
