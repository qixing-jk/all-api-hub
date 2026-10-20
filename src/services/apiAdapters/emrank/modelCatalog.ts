import { SITE_TYPES } from "~/constants/siteType"
import {
  EMRANK_MODEL_KINDS,
  fetchCatalogModels,
  type EmRankCatalogModel,
} from "~/services/apiService/emrank/catalog"
import { EMRANK_TOKEN_ASSET } from "~/services/apiService/emrank/constants"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import { MODEL_LIST_PRICING_KINDS } from "~/services/modelList/pricingModel"
import {
  QUOTA_COMPARISON_SCOPES,
  QUOTA_ROUNDING_MODES,
} from "~/services/modelPricing/quotaPricing"
import {
  createModelDisplayLabel as label,
  MODEL_DISPLAY_FACT_LABELS,
  MODEL_DISPLAY_FACT_TYPES,
  MODEL_DISPLAY_SECTION_LABELS,
  type ModelDisplayFact,
  type ModelPresentation,
} from "~/services/models/modelDisplayFacts"

/** Keep each native purpose's label and inference endpoint together. */
const modelKinds = {
  [EMRANK_MODEL_KINDS.Embedding]: {
    label: label("displayFacts.modelKinds.embedding", "Embedding"),
    endpoint: "/v1/embeddings",
  },
  [EMRANK_MODEL_KINDS.Reranker]: {
    label: label("displayFacts.modelKinds.reranker", "Reranker"),
    endpoint: "/v1/rerank",
  },
  [EMRANK_MODEL_KINDS.Decision]: {
    label: label("displayFacts.modelKinds.decision", "Decision"),
    endpoint: "/v1/decisions",
  },
} as const

/** Compact long contiguous dimension lists without losing supported choices. */
function dimensionRanges(dimensions: number[]): string {
  const values = [...new Set(dimensions)].sort((a, b) => a - b)
  const ranges: string[] = []
  for (let i = 0; i < values.length; i++) {
    const start = values[i]!
    let end = start
    while (values[i + 1] === end + 1) end = values[++i]!
    ranges.push(start === end ? String(start) : `${start}–${end}`)
  }
  return ranges.join(", ")
}

/** Provider facts use shared model rows and detail sections, without inferring chat support. */
function presentation(
  model: EmRankCatalogModel,
  origin: string,
): ModelPresentation {
  const summaryFacts: ModelDisplayFact[] = [
    {
      type: MODEL_DISPLAY_FACT_TYPES.Text,
      label: label("displayFacts.modelKind", "Model type"),
      value: modelKinds[model.kind].label,
    },
    {
      type: MODEL_DISPLAY_FACT_TYPES.Boolean,
      label: label("displayFacts.providerAvailable", "Available on site"),
      value: model.available,
    },
    ...(model.contextTokens !== null && model.contextTokens > 0
      ? [
          {
            type: MODEL_DISPLAY_FACT_TYPES.TokenQuantity,
            label: MODEL_DISPLAY_FACT_LABELS.ContextLimit,
            value: model.contextTokens,
          },
        ]
      : []),
  ]
  const facts: ModelDisplayFact[] = [
    {
      type: MODEL_DISPLAY_FACT_TYPES.Text,
      label: label("displayFacts.catalogOwner", "Catalog owner"),
      value: model.ownedBy,
    },
    ...(model.supportedDimensions.length
      ? [
          {
            type: MODEL_DISPLAY_FACT_TYPES.Text,
            label: label(
              "displayFacts.supportedDimensions",
              "Supported dimensions",
            ),
            value: dimensionRanges(model.supportedDimensions),
          },
        ]
      : []),
    ...(model.defaultDimensions !== null
      ? [
          {
            type: MODEL_DISPLAY_FACT_TYPES.Number,
            label: label(
              "displayFacts.defaultDimensions",
              "Default dimensions",
            ),
            value: model.defaultDimensions,
          },
        ]
      : []),
    ...(model.supportsImages !== null
      ? [
          {
            type: MODEL_DISPLAY_FACT_TYPES.Boolean,
            label: label("displayFacts.supportsImages", "Image input"),
            value: model.supportsImages,
          },
        ]
      : []),
    ...(model.releasedOn !== null
      ? [
          {
            type: MODEL_DISPLAY_FACT_TYPES.Date,
            label: label("displayFacts.releaseDate", "Release date"),
            value: model.releasedOn,
          },
        ]
      : []),
    {
      type: MODEL_DISPLAY_FACT_TYPES.Link,
      label: label("displayFacts.callExamples", "Call examples"),
      href: `${origin}/models`,
      text: label("displayFacts.viewOnSite", "View on site"),
    },
  ]
  return {
    summaryFacts,
    sections: [
      {
        id: "specifications",
        label: MODEL_DISPLAY_SECTION_LABELS.Specifications,
        facts,
      },
    ],
  }
}

/**
 * EMRank publishes one account-wide catalogue with an input-only multiplier.
 * Successful input tokens consume native quota at the model multiplier, with
 * additional account-level/RPM multipliers; output is free. Preserve the model
 * multipliers separately from monetary pricing: no USD conversion is published.
 * https://docs.emrank.tech/guide/billing.html
 */
export async function fetchEmRankPricing(
  request: Parameters<typeof fetchCatalogModels>[0],
): Promise<ModelCatalogSnapshot> {
  const models = await fetchCatalogModels(request)
  const origin = new URL(request.baseUrl).origin
  return {
    success: true,
    groupAccess: { kind: "not-applicable" },
    groupRatios: {},
    data: models.map((model) => ({
      model_name: model.id,
      owner_by: model.ownedBy,
      presentation: presentation(model, origin),
      quotaPricing: {
        unit: EMRANK_TOKEN_ASSET,
        rates: {
          input: { amount: model.modelRatio, per: 1 },
          output: { amount: 0, per: 1 },
        },
        adjustments: [
          {
            id: "account-level",
            label: { en: "Account level", zh: "用户等级" },
          },
          { id: "rpm", label: { en: "RPM", zh: "RPM" } },
        ],
        comparisonScope: QUOTA_COMPARISON_SCOPES.Source,
        rounding: QUOTA_ROUNDING_MODES.Floor,
        sourceUrl: "https://docs.emrank.tech/guide/billing.html",
      },
      quota_type: 0,
      model_ratio: 0,
      model_price: 0,
      completion_ratio: 1,
      enable_groups: [],
      supported_endpoint_types: [modelKinds[model.kind].endpoint],
      price_metadata: {
        source: "provider-catalog" as const,
        precision: "unavailable" as const,
        unavailable_reason: "official-price-missing" as const,
        source_url: `${origin}/models`,
      },
    })),
    model_list_source: {
      kind: "user-scoped" as const,
      provider: SITE_TYPES.EMRANK,
      supportsPricing: true,
      pricingKind: MODEL_LIST_PRICING_KINDS.Quota,
      actionPolicy: {
        supportsGroupFiltering: false,
        supportsAccountSummary: true,
        supportsTokenCompatibility: true,
        supportsCredentialVerification: false,
        supportsBatchCredentialVerification: false,
        supportsCliVerification: false,
      },
    },
  }
}
