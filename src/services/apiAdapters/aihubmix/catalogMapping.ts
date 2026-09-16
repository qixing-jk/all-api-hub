import { SITE_TYPES } from "~/constants/siteType"
import {
  buildAIHubMixAudioDurationPlan,
  buildAIHubMixCharacterPlan,
  buildAIHubMixFixedImagePlan,
  buildAIHubMixImageQualityPlan,
  buildAIHubMixLegacyVideoPlan,
  buildAIHubMixMeasuredOutputPlan,
  buildAIHubMixReferenceVideoPlan,
  checkAIHubMixVideoPriceEvidence,
} from "~/services/apiAdapters/aihubmix/meteredPricing"
import { buildAIHubMixPricingPlan } from "~/services/apiAdapters/aihubmix/pricingPlan"
import {
  buildAIHubMixWebsitePricingPlan,
  getAIHubMixPricingSource,
} from "~/services/apiAdapters/aihubmix/websitePricing"
import type {
  AIHubMixModelCatalogItem,
  AIHubMixWebsiteModel,
} from "~/services/apiService/aihubmix/modelCatalog"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import {
  MODEL_CATALOG_SCOPES,
  MODEL_LIST_SOURCE_KINDS,
  type ModelPricing,
} from "~/services/modelList/pricingModel"
import { PRICING_ISSUE_CODES } from "~/services/modelPricing/pricingConstants"
import {
  MODEL_VENDOR_EVIDENCE_KINDS,
  normalizeModelDescriptors,
  type ModelVendorEvidence,
} from "~/services/models/modelDescriptor"

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

const normalizeStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

export const getAIHubMixCatalogModelId = (
  model: AIHubMixModelCatalogItem,
): string => {
  const candidate = model.model_id ?? model.id ?? model.name ?? ""
  return typeof candidate === "string" ? candidate.trim() : ""
}

const getNonEmptyCatalogString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined
  const normalized = value.trim()
  return normalized || undefined
}

const getDeveloperExternalId = (value: unknown): string | undefined => {
  if (typeof value === "string") return getNonEmptyCatalogString(value)
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return undefined
}

const buildAIHubMixVendorEvidence = (
  modelId: string,
  catalogItem?: AIHubMixModelCatalogItem,
): ModelVendorEvidence | undefined => {
  const developerName =
    getNonEmptyCatalogString(catalogItem?.developer_name) ??
    getNonEmptyCatalogString(catalogItem?.developer)
  const routingOwner = getNonEmptyCatalogString(catalogItem?.owner_by)
  const externalId = developerName
    ? getDeveloperExternalId(catalogItem?.developer_id)
    : undefined

  // Official Models API docs describe only legacy `owned_by` as Developer.
  // Optional `developer_name`, `developer`, and `owner_by` names are used only
  // when present; the current public ID-only shape intentionally emits no
  // evidence because a standalone `developer_id` is opaque.
  // https://docs.aihubmix.com/en/api/Models-API.md
  const candidate = developerName
    ? {
        kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
        name: developerName,
        ...(externalId === undefined ? {} : { externalId }),
      }
    : routingOwner
      ? {
          kind: MODEL_VENDOR_EVIDENCE_KINDS.RoutingProvider,
          name: routingOwner,
        }
      : undefined

  return normalizeModelDescriptors([
    {
      id: modelId,
      ...(candidate === undefined ? {} : { vendorEvidence: candidate }),
    },
  ])[0]?.vendorEvidence
}

const buildAIHubMixModelPricing = (
  modelId: string,
  catalogItem?: AIHubMixModelCatalogItem,
  websiteModel?: AIHubMixWebsiteModel,
): ModelPricing => {
  const inputPrice = toFiniteNumber(catalogItem?.pricing?.input)
  const outputPrice = toFiniteNumber(catalogItem?.pricing?.output)
  const cacheReadPrice = toFiniteNumber(catalogItem?.pricing?.cache_read)
  const hasTokenPricing = inputPrice > 0 || outputPrice > 0
  const vendorEvidence = buildAIHubMixVendorEvidence(modelId, catalogItem)
  let pricingPlan = buildAIHubMixPricingPlan(
    catalogItem?.pricing,
    catalogItem?.promotion,
  )
  const hasWebsiteRules =
    websiteModel?.billing_config != null && websiteModel.billing_config !== ""
  if (hasWebsiteRules) {
    pricingPlan = buildAIHubMixWebsitePricingPlan(
      modelId,
      websiteModel.billing_config,
      catalogItem?.promotion,
    )
  } else if (pricingPlan) {
    pricingPlan.source = getAIHubMixPricingSource(modelId)
    // The simplified API omits conditional billing. Missing website evidence
    // must not certify its single rate as a complete quote.
    if (
      !websiteModel ||
      websiteModel.display_input ||
      websiteModel.display_output
    ) {
      pricingPlan.source.rulesUnavailable = true
      pricingPlan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
    }
  }
  if (!hasWebsiteRules && catalogItem?.promotion == null) {
    const characterPlan = buildAIHubMixCharacterPlan(
      websiteModel?.display_input,
      getAIHubMixPricingSource(modelId),
    )
    const videoPlan = buildAIHubMixLegacyVideoPlan(
      websiteModel?.img_price_config,
      websiteModel?.display_input,
      getAIHubMixPricingSource(modelId),
    )
    const referenceVideoPlan = buildAIHubMixReferenceVideoPlan(
      websiteModel?.img_price_config,
      websiteModel?.display_input,
      getAIHubMixPricingSource(modelId),
    )
    const fixedImagePlan = buildAIHubMixFixedImagePlan(
      websiteModel?.img_price_config,
      websiteModel?.display_input,
      getAIHubMixPricingSource(modelId),
    )
    const audioPlan = normalizeStringList(catalogItem?.types).includes("stt")
      ? buildAIHubMixAudioDurationPlan(
          websiteModel?.display_input,
          getAIHubMixPricingSource(modelId),
        )
      : undefined
    const taskPlan =
      characterPlan ??
      videoPlan ??
      referenceVideoPlan ??
      fixedImagePlan ??
      buildAIHubMixMeasuredOutputPlan(
        websiteModel?.img_price_config,
        websiteModel?.display_input,
        getAIHubMixPricingSource(modelId),
      ) ??
      buildAIHubMixImageQualityPlan(
        websiteModel?.img_price_config,
        websiteModel?.display_input,
        getAIHubMixPricingSource(modelId),
      ) ??
      audioPlan
    if (taskPlan) pricingPlan = taskPlan
  }
  if (pricingPlan) {
    pricingPlan = checkAIHubMixVideoPriceEvidence(
      pricingPlan,
      websiteModel?.display_input,
    )
    // Website display_output is Chinese; display_input is English (index-Cx6RE_vc.js).
    if (pricingPlan.source.rulesUnavailable)
      pricingPlan.source.pricingDescription = {
        en: getNonEmptyCatalogString(websiteModel?.display_input),
        zh: getNonEmptyCatalogString(websiteModel?.display_output),
      }
  }
  const chineseDescription = getNonEmptyCatalogString(websiteModel?.desc)
  const englishDescription = getNonEmptyCatalogString(websiteModel?.desc_en)

  return {
    model_name: modelId,
    pricingPlan,
    ...(chineseDescription || englishDescription
      ? {
          model_descriptions: {
            zh: chineseDescription,
            en: englishDescription,
          },
        }
      : {}),
    ...(vendorEvidence === undefined ? {} : { vendorEvidence }),
    model_description:
      typeof catalogItem?.desc === "string"
        ? catalogItem.desc
        : typeof catalogItem?.description === "string"
          ? catalogItem.description
          : "",
    quota_type: 0,
    model_ratio: 0,
    model_price: 0,
    // AIHubMix /api/v1/models pricing fields are direct USD-per-1M-token prices.
    // Do not route them through the New API ratio formula where ratio 1 maps to $2/M.
    token_price_usd_per_million:
      hasTokenPricing && !hasWebsiteRules
        ? {
            cache_read: cacheReadPrice,
            input: inputPrice,
            output: outputPrice,
          }
        : undefined,
    owner_by:
      typeof catalogItem?.developer_name === "string"
        ? catalogItem.developer_name
        : typeof catalogItem?.developer === "string"
          ? catalogItem.developer
          : typeof catalogItem?.owner_by === "string"
            ? catalogItem.owner_by
            : catalogItem?.developer_id != null
              ? String(catalogItem.developer_id)
              : undefined,
    completion_ratio: 0,
    enable_groups: [],
    supported_endpoint_types: normalizeStringList(catalogItem?.endpoints),
  }
}

export const buildAIHubMixPricingResponse = (params: {
  catalog: AIHubMixModelCatalogItem[]
  userScopedModelIds: string[] | null
  websiteModels: Map<string, AIHubMixWebsiteModel>
}): ModelCatalogSnapshot => {
  const catalogByModelId = new Map<string, AIHubMixModelCatalogItem>()

  for (const item of params.catalog) {
    const modelId = getAIHubMixCatalogModelId(item)
    if (modelId && !catalogByModelId.has(modelId)) {
      catalogByModelId.set(modelId, item)
    }
  }

  const modelIds =
    params.userScopedModelIds === null
      ? Array.from(catalogByModelId.keys())
      : params.userScopedModelIds

  return {
    success: true,
    groupRatios: {},
    groupAccess: { kind: "not-applicable" },
    model_list_source: {
      kind:
        params.userScopedModelIds === null
          ? MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK
          : MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
      provider: SITE_TYPES.AIHUBMIX,
      catalogScope:
        params.userScopedModelIds === null
          ? MODEL_CATALOG_SCOPES.PROVIDER
          : MODEL_CATALOG_SCOPES.PERSONALIZED,
      supportsPricing: true,
      // Saved AIHubMix keys may be masked (https://docs.aihubmix.com/en/api/Cli).
      // Publish this restriction here so display code never infers it from a site name.
      actionPolicy: {
        supportsGroupFiltering: false,
        supportsAccountSummary: params.userScopedModelIds !== null,
        supportsTokenCompatibility: false,
        supportsCredentialVerification: false,
        supportsBatchCredentialVerification: false,
        supportsCliVerification: false,
      },
    },
    data: modelIds.map((modelId) =>
      buildAIHubMixModelPricing(
        modelId,
        catalogByModelId.get(modelId),
        params.websiteModels.get(modelId),
      ),
    ),
  }
}
