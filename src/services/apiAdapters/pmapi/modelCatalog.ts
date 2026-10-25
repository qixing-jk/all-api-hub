import { SITE_TYPES } from "~/constants/siteType"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { PMAPI_ENDPOINTS } from "~/services/apiService/pmapi/constants"
import { fetchPmApiTokenGroups } from "~/services/apiService/pmapi/keys"
import {
  fetchPmApiData,
  invalidPmApiResponse,
} from "~/services/apiService/pmapi/transport"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import {
  MODEL_CATALOG_SCOPES,
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/modelList/pricingModel"
import {
  PRICE_RATE_UNITS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_METERS,
  PRICING_SOURCE_KINDS,
  PRICING_USAGE_MODES,
} from "~/services/modelPricing/pricingConstants"
import type {
  PriceRate,
  PricingPlan,
} from "~/services/modelPricing/pricingPlan"
import { isRecord } from "~/utils/core/object"

type PmApiPricingRow = {
  billing: string
  input_per_m?: unknown
  output_per_m?: unknown
  price?: unknown
}

/** Only per-token rows use token rates; other billing strings retain the per-call fallback. */
const PMAPI_BILLING_MODES = { PerToken: "per_token" } as const

const usdPerMillionTokens = (amount: number): PriceRate => ({
  amount,
  currency: "USD",
  unit: PRICE_RATE_UNITS.TOKEN,
  per: 1_000_000,
})

const usdPerCall = (amount: number): PriceRate => ({
  amount,
  currency: "USD",
  unit: PRICE_RATE_UNITS.REQUEST,
  per: 1,
})

/**
 * Builds the published schedule without a group multiplier, mirroring the
 * console's own pricing page formulas: token rows bill `input_per_m` /
 * `output_per_m` per million and per-request rows `price` per call, each
 * multiplied by the selected group's ratio at quote time.
 */
function buildPricingPlan(
  row: PmApiPricingRow,
  pricingSourceUrl: string,
): PricingPlan | undefined {
  const nonnegative = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
  if (row.billing === PMAPI_BILLING_MODES.PerToken) {
    if (!nonnegative(row.input_per_m) || !nonnegative(row.output_per_m))
      return undefined
    return {
      usageMode: PRICING_USAGE_MODES.TOKENS,
      rates: {
        [PRICING_METERS.INPUT]: usdPerMillionTokens(row.input_per_m),
        [PRICING_METERS.OUTPUT]: usdPerMillionTokens(row.output_per_m),
        [PRICING_METERS.REQUEST]: usdPerCall(0),
      },
      rules: [],
      // The published rates exclude group effects; the quote multiplies by
      // the selected group's ratio (PENDING = not included yet).
      groupMultiplier: PRICING_GROUP_MULTIPLIERS.PENDING,
      source: { kind: PRICING_SOURCE_KINDS.CATALOG, url: pricingSourceUrl },
      issues: [],
    }
  }
  if (!nonnegative(row.price)) return undefined
  return {
    usageMode: PRICING_USAGE_MODES.REQUEST,
    rates: { [PRICING_METERS.REQUEST]: usdPerCall(row.price) },
    rules: [],
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.PENDING,
    source: { kind: PRICING_SOURCE_KINDS.CATALOG, url: pricingSourceUrl },
    issues: [],
  }
}

export const pmApiModelPricing: ModelPricingCapability = {
  runtimeKeyFallback: "account-pricing",
  async fetchPricing(request): Promise<ModelCatalogSnapshot> {
    const endpoint = PMAPI_ENDPOINTS.Pricing
    const data = await fetchPmApiData(request, endpoint)
    if (!isRecord(data) || !Array.isArray(data.models))
      return invalidPmApiResponse(endpoint)
    const groupRows = Array.isArray(data.groups) ? data.groups : []
    const groupDisplayNames: Record<string, string> = {}
    const groupRatios: Record<string, number> = {}
    for (const group of groupRows) {
      if (!isRecord(group) || typeof group.name !== "string" || !group.name)
        return invalidPmApiResponse(endpoint)
      if (typeof group.desc === "string" && group.desc.trim())
        groupDisplayNames[group.name] = group.desc.trim()
      if (typeof group.ratio === "number" && Number.isFinite(group.ratio))
        groupRatios[group.name] = group.ratio
    }
    const url = `${new URL(request.baseUrl).origin}/#/pricing`
    // `/api/token-groups` is the account's own usable-group evidence (the
    // console's token form offers exactly these groups); a probe failure
    // degrades to candidate groups from the published ratios.
    let groupAccess: ModelCatalogSnapshot["groupAccess"]
    try {
      const usableGroups = (await fetchPmApiTokenGroups(request)).map(
        (group) => group.name,
      )
      groupAccess = { kind: "authoritative", usableGroups }
    } catch {
      const candidateGroups = Object.keys(groupRatios)
      groupAccess = candidateGroups.length
        ? { kind: "compatible-priced-fallback", candidateGroups }
        : { kind: "unavailable" }
    }
    return {
      success: true,
      groupAccess,
      groupRatios,
      data: data.models.map((row): ModelCatalogSnapshot["data"][number] => {
        if (
          !isRecord(row) ||
          typeof row.model !== "string" ||
          !row.model.trim() ||
          typeof row.available !== "boolean" ||
          typeof row.billing !== "string" ||
          !Array.isArray(row.groups) ||
          !row.groups.every((group) => typeof group === "string") ||
          typeof row.vendor !== "string"
        )
          return invalidPmApiResponse(endpoint)
        const perToken = row.billing === PMAPI_BILLING_MODES.PerToken
        const plan = buildPricingPlan(
          {
            billing: row.billing,
            input_per_m: row.input_per_m,
            output_per_m: row.output_per_m,
            price: row.price,
          },
          url,
        )
        const completionRatio =
          typeof row.completion_ratio === "number" &&
          Number.isFinite(row.completion_ratio)
            ? row.completion_ratio
            : 1
        return {
          model_name: row.model.trim(),
          owner_by: row.vendor,
          // The console's `available` is its verdict for the caller's own
          // group only (site pricing page shows it as the 其他分组 tag, not a
          // dead model), so it never becomes card-level unavailability; the
          // row's own groups stay the access evidence.
          quota_type: perToken ? 0 : 1,
          model_ratio: 0,
          model_price: 0,
          completion_ratio: completionRatio,
          enable_groups: [...row.groups],
          groupDisplayNames,
          supported_endpoint_types: ["/v1/chat/completions"],
          ...(plan ? { pricingPlan: plan } : {}),
          price_metadata: {
            source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
            precision: plan
              ? MODEL_PRICE_PRECISION_KINDS.EXACT
              : MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
            ...(!plan
              ? {
                  unavailable_reason:
                    MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
                }
              : {}),
            source_url: url,
          },
        }
      }),
      model_list_source: {
        kind: MODEL_LIST_SOURCE_KINDS.PROVIDER_CATALOG,
        provider: SITE_TYPES.PMAPI,
        catalogScope: MODEL_CATALOG_SCOPES.PROVIDER,
        supportsPricing: true,
        actionPolicy: {
          supportsGroupFiltering: true,
          supportsAccountSummary: false,
          // Row actions ride the generic OpenAI-compatible probes against the
          // same-origin /v1 mount with recoverable key secrets.
          supportsTokenCompatibility: true,
          supportsCredentialVerification: true,
          supportsBatchCredentialVerification: true,
          supportsCliVerification: true,
        },
      },
    }
  },
}
