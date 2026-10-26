import { SITE_TYPES } from "~/constants/siteType"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import { createAccountBoundCatalogActionPolicy } from "~/services/modelList/catalogActionPolicy"
import {
  MODEL_CATALOG_SCOPES,
  MODEL_LIST_PRICING_KINDS,
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
  type ModelPricing,
} from "~/services/modelList/pricingModel"
import type { PricingPlan } from "~/services/modelPricing/pricingPlan"
import {
  createModelDisplayLabel,
  MODEL_DISPLAY_FACT_LABELS,
  MODEL_DISPLAY_FACT_TYPES,
  MODEL_DISPLAY_SECTION_LABELS,
  type ModelDisplayFact,
} from "~/services/models/modelDisplayFacts"
import { isRecord } from "~/utils/core/object"

import {
  VERCEL_MODEL_ELIGIBILITY_STATUSES as eligibilityStatuses,
  VERCEL_GATEWAY_ENDPOINTS,
  VERCEL_MODEL_BLOCK_REASONS,
  VERCEL_TEAM_ID_QUERY_PARAM,
} from "./constants"
import { createVercelMeteredPricing } from "./meteredPricing"
import {
  readVercelPrice as readPrice,
  readVercelString as readString,
} from "./parsing"
import {
  createVercelGatewayRequest,
  vercelRequests,
  withVercelQuery,
} from "./request"

const label = createModelDisplayLabel

export type VercelModelEligibility = {
  status: (typeof eligibilityStatuses)[keyof typeof eligibilityStatuses]
  category?: string
  reason?: string
  evaluatedRuntime?: string
}

export type VercelCatalogModel = {
  meteredPricing?: PricingPlan
  requestBlockReason?: string
  id: string
  name: string
  description?: string
  owner: string
  type?: string
  tags: readonly string[]
  contextWindow?: number
  maxTokens?: number
  released?: number
  /** USD per token, as published by the deployment. */
  pricing: {
    input?: number
    output?: number
    cacheRead?: number
    cacheWrite?: number
  }
  eligibility?: VercelModelEligibility
}

/** Inference surface implied by the deployment's own model type. */
const endpointsByType: Readonly<Record<string, readonly string[]>> = {
  language: ["/v1/chat/completions"],
  embedding: ["/v1/embeddings"],
  reranking: ["/v1/rerank"],
  image: ["/v1/images/generations"],
  video: ["/v1/videos"],
  speech: ["/v1/audio/speech"],
  transcription: ["/v1/audio/transcriptions"],
  realtime: ["/v1/realtime"],
  evaluation: [],
}

const readPositiveInt = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined

const readEligibility = (
  value: unknown,
): VercelModelEligibility | undefined => {
  if (!isRecord(value)) return undefined
  const status = readString(value.status)
  if (
    status !== eligibilityStatuses.Eligible &&
    status !== eligibilityStatuses.Ineligible &&
    status !== eligibilityStatuses.Unknown
  ) {
    return undefined
  }
  return {
    status,
    ...(readString(value.category)
      ? { category: readString(value.category)! }
      : {}),
    ...(readString(value.reason) ? { reason: readString(value.reason)! } : {}),
    ...(readString(value.evaluated_runtime)
      ? { evaluatedRuntime: readString(value.evaluated_runtime)! }
      : {}),
  }
}

/** Reads one published catalog row, keeping unknown optional fields absent. */
export function parseVercelCatalogModel(
  value: unknown,
): VercelCatalogModel | null {
  if (!isRecord(value)) return null
  const id = readString(value.id)
  if (!id) return null
  const pricing = isRecord(value.pricing) ? value.pricing : {}
  const tags = Array.isArray(value.tags)
    ? value.tags.filter((tag): tag is string => typeof tag === "string")
    : []
  const input = readPrice(pricing.input)
  const output = readPrice(pricing.output)
  const cacheRead = readPrice(pricing.input_cache_read)
  const cacheWrite = readPrice(pricing.input_cache_write)
  const meteredPricing = createVercelMeteredPricing(value.type, pricing)
  return {
    id,
    name: readString(value.name) ?? id,
    ...(readString(value.description)
      ? { description: readString(value.description)! }
      : {}),
    owner: readString(value.owned_by) ?? "",
    ...(readString(value.type) ? { type: readString(value.type)! } : {}),
    tags,
    ...(readPositiveInt(value.context_window)
      ? { contextWindow: readPositiveInt(value.context_window)! }
      : {}),
    ...(readPositiveInt(value.max_tokens)
      ? { maxTokens: readPositiveInt(value.max_tokens)! }
      : {}),
    ...(readPositiveInt(value.released)
      ? { released: readPositiveInt(value.released)! }
      : {}),
    pricing: {
      ...(input !== undefined ? { input } : {}),
      ...(output !== undefined ? { output } : {}),
      ...(cacheRead !== undefined ? { cacheRead } : {}),
      ...(cacheWrite !== undefined ? { cacheWrite } : {}),
    },
    ...(meteredPricing ? { meteredPricing } : {}),
    ...(readEligibility(value.model_eligibility)
      ? { eligibility: readEligibility(value.model_eligibility)! }
      : {}),
  }
}

/**
 * The deployment publishes per-token USD strings; the product compares per
 * million tokens. Round to 9 decimals so binary artifacts (0.0000002 × 1e6)
 * do not surface as `0.19999999999999998`.
 */
const perMillion = (usdPerToken: number) =>
  Math.round(usdPerToken * 1_000_000 * 1e9) / 1e9

/** Provider-published facts for one model row, independent of pricing. */
function presentation(model: VercelCatalogModel) {
  const summaryFacts: ModelDisplayFact[] = [
    ...(model.type
      ? [
          {
            type: MODEL_DISPLAY_FACT_TYPES.Text,
            label: label("displayFacts.modelKind", "Model type"),
            value: model.type,
          },
        ]
      : []),
    ...(model.contextWindow
      ? [
          {
            type: MODEL_DISPLAY_FACT_TYPES.TokenQuantity,
            label: MODEL_DISPLAY_FACT_LABELS.ContextLimit,
            value: model.contextWindow,
          },
        ]
      : []),
  ]
  const facts: ModelDisplayFact[] = [
    ...(model.owner
      ? [
          {
            type: MODEL_DISPLAY_FACT_TYPES.Text,
            label: label("displayFacts.catalogOwner", "Catalog owner"),
            value: model.owner,
          },
        ]
      : []),
    ...(model.maxTokens
      ? [
          {
            type: MODEL_DISPLAY_FACT_TYPES.TokenQuantity,
            label: MODEL_DISPLAY_FACT_LABELS.MaximumOutputTokens,
            value: model.maxTokens,
          },
        ]
      : []),
    ...(model.released
      ? [
          {
            type: MODEL_DISPLAY_FACT_TYPES.Date,
            label: label("displayFacts.releaseDate", "Release date"),
            value: new Date(model.released * 1000).toISOString(),
          },
        ]
      : []),
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

/** Projects one catalog row into the product's canonical model shape. */
function toVercelModelPricing(model: VercelCatalogModel): ModelPricing {
  const { input, output, cacheRead, cacheWrite } = model.pricing
  const hasTokenPrice =
    !model.meteredPricing && (input !== undefined || output !== undefined)
  const endpoints = model.type ? endpointsByType[model.type] ?? [] : []
  return {
    model_name: model.id,
    display_name: model.name,
    ...(model.description ? { model_description: model.description } : {}),
    ...(model.owner ? { owner_by: model.owner } : {}),
    presentation: presentation(model),
    ...(model.requestBlockReason
      ? {
          availability: {
            available: false,
            reason: model.requestBlockReason,
            ...(model.requestBlockReason ===
            VERCEL_MODEL_BLOCK_REASONS.CustomerVerificationRequired
              ? {
                  reasonLabel: label(
                    "displayFacts.vercelVerificationRequired",
                    "Complete customer verification in the Vercel AI Gateway console before sending requests",
                  ),
                }
              : {}),
          },
        }
      : model.eligibility
        ? {
            availability: {
              available:
                model.eligibility.status === eligibilityStatuses.Unknown
                  ? null
                  : model.eligibility.status === eligibilityStatuses.Eligible,
              ...(model.eligibility.reason
                ? { reason: model.eligibility.reason }
                : {}),
              ...(model.eligibility.status !== eligibilityStatuses.Eligible &&
              model.eligibility.reason ===
                VERCEL_MODEL_BLOCK_REASONS.PlanRestricted
                ? {
                    reasonLabel: label(
                      "displayFacts.planRestricted",
                      "Your current plan does not support this model",
                    ),
                  }
                : {}),
            },
          }
        : {}),
    quota_type: 0,
    model_ratio: 0,
    model_price: 0,
    ...(model.meteredPricing ? { pricingPlan: model.meteredPricing } : {}),
    ...(hasTokenPrice
      ? {
          token_price_usd_per_million: {
            ...(input !== undefined ? { input: perMillion(input) } : {}),
            ...(output !== undefined ? { output: perMillion(output) } : {}),
            ...(cacheRead !== undefined
              ? { cache_read: perMillion(cacheRead) }
              : {}),
            ...(cacheWrite !== undefined
              ? { cache_write: perMillion(cacheWrite) }
              : {}),
          },
        }
      : {}),
    price_metadata:
      hasTokenPrice ||
      (model.meteredPricing && !model.meteredPricing.source.rulesUnavailable)
        ? {
            source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
            precision: MODEL_PRICE_PRECISION_KINDS.EXACT,
            source_url: "https://vercel.com/ai-gateway/models",
          }
        : {
            source: MODEL_PRICE_SOURCE_KINDS.PROVIDER_CATALOG,
            precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
            // Image, video and audio rows price per unit, not per token; the
            // catalog does not publish a token rate this app can compare.
            unavailable_reason:
              MODEL_UNAVAILABLE_PRICE_REASONS.OFFICIAL_PRICE_MISSING,
            source_url: "https://vercel.com/ai-gateway/models",
          },
    completion_ratio: 1,
    enable_groups: [],
    supported_endpoint_types: [...endpoints],
  }
}

/**
 * Reads the AI Gateway catalog. An authenticated request with the team named on
 * it also carries `model_eligibility` and `request_context_availability`.
 */
export async function fetchVercelModelCatalog(
  request: ApiServiceRequest,
  teamId: string,
  options?: { signal?: AbortSignal },
): Promise<VercelCatalogModel[]> {
  const body = await vercelRequests.payload<unknown>(
    {
      ...createVercelGatewayRequest(request),
      ...(options?.signal ? { abortSignal: options.signal } : {}),
    },
    {
      endpoint: withVercelQuery(VERCEL_GATEWAY_ENDPOINTS.Models, {
        include_availability: true,
        [VERCEL_TEAM_ID_QUERY_PARAM]: teamId,
      }),
      options: { method: "GET", cache: "no-store" },
      tempWindowFallback: { statusCodes: [], codes: [] },
    },
  )
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new VercelCatalogError()
  }
  const requestContext = isRecord(body.request_context_availability)
    ? body.request_context_availability
    : undefined
  return body.data
    .map(parseVercelCatalogModel)
    .filter((model): model is VercelCatalogModel => model !== null)
    .map((model) => {
      const runtime =
        model.type === "realtime"
          ? requestContext?.realtime_websocket
          : requestContext?.http
      const requestBlockReason =
        isRecord(runtime) && runtime.status === "unavailable"
          ? readString(runtime.reason)
          : undefined
      return requestBlockReason ? { ...model, requestBlockReason } : model
    })
}

/** The catalog payload did not match the verified OpenAI-style list. */
class VercelCatalogError extends Error {
  constructor() {
    super("vercel_catalog_unreadable")
    this.name = "VercelCatalogError"
  }
}

/** Builds the shared catalog snapshot for the account's own team. */
export function createVercelCatalogSnapshot(
  models: readonly VercelCatalogModel[],
): ModelCatalogSnapshot {
  return {
    data: models.map(toVercelModelPricing),
    groupAccess: { kind: "not-applicable" },
    groupRatios: {},
    success: true,
    model_list_source: {
      kind: MODEL_LIST_SOURCE_KINDS.PROVIDER_CATALOG,
      provider: SITE_TYPES.VERCEL_AI_GATEWAY,
      catalogScope: MODEL_CATALOG_SCOPES.PROVIDER,
      supportsRuntimeModelList: false,
      supportsPricing: true,
      pricingKind: MODEL_LIST_PRICING_KINDS.Currency,
      actionPolicy: createAccountBoundCatalogActionPolicy({
        hasAccountContext: true,
      }),
    },
  }
}
