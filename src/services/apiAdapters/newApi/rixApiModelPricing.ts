import { defaultModelPricingImplementation } from "~/services/apiService/newApiFamily/default/modelPricing"
import {
  resolveRixApiDialect,
  RIX_API_DIALECT_KEYS,
} from "~/services/apiService/newApiFamily/variants/rixApiDialects"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  normalizeGroupNames,
  normalizeGroupRatios,
} from "~/services/modelCatalog/groupFacts"
import type {
  ModelCatalogModel,
  ModelCatalogSnapshot,
} from "~/services/modelCatalog/snapshot"
import {
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
} from "~/services/modelList/pricingModel"
import {
  PRICE_RATE_UNITS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_ISSUE_CODES,
  PRICING_METERS,
  PRICING_SOURCE_KINDS,
  PRICING_USAGE_MODES,
} from "~/services/modelPricing/pricingConstants"
import type {
  PriceRate,
  PricingPlan,
} from "~/services/modelPricing/pricingPlan"
import { MODEL_VENDOR_EVIDENCE_KINDS } from "~/services/models/modelDescriptor"
import { AuthTypeEnum } from "~/types"
import { isPlainObject, isRecord } from "~/utils/core/object"

import { applyFamilyGroupEvidence } from "./groupEvidence"
import { normalizeNewApiModelPricingResponse } from "./modelPricingDto"

const fetchDefaultModelPricing =
  defaultModelPricingImplementation.fetchModelPricing

const INVALID_RESPONSE_MESSAGE = "Invalid Rix API model pricing response"
const TOKENS_PER_MILLION = 1_000_000

/** Which auth mode the public pricing endpoint accepts from this account. */
const RIX_API_PRICING_AUTH_MODES = {
  Credential: "credential",
  Anonymous: "anonymous",
} as const

/** Currencies a plan rate may carry, matching the shared rate contract. */
const PRICE_CURRENCIES = ["USD", "CNY"] as const
type RixApiPriceCurrency = (typeof PRICE_CURRENCIES)[number]
/** Published prices are USD unless the row names one of the known currencies. */
const DEFAULT_CURRENCY: RixApiPriceCurrency = "USD"

/**
 * Narrows a row currency to one the shared rate contract accepts.
 */
const isPriceCurrency = (value: string): value is RixApiPriceCurrency =>
  PRICE_CURRENCIES.some((known) => known === value)

/**
 * Reads the currency a price object is denominated in.
 *
 * Rix API prices some model families (image and video generation) in CNY and the
 * rest in USD, so the rate keeps the row's own currency instead of assuming one.
 */
const readCurrency = (value: unknown): RixApiPriceCurrency => {
  const currency = readNonBlankString(value)

  return currency && isPriceCurrency(currency) ? currency : DEFAULT_CURRENCY
}

/**
 * Rix API publishes one price object per billing quota type. The keys below are
 * the metered ones this product can express; everything else in a price object
 * is either envelope metadata or a charge with no equivalent meter.
 * Observed 2026-09-26 at https://platform.ephone.ai/api/pricing (688 rows).
 */
const TOKEN_PRICE_METERS = {
  input_token_price: PRICING_METERS.INPUT,
  output_token_price: PRICING_METERS.OUTPUT,
  cache_read_token_price: PRICING_METERS.CACHE_READ,
  cache_create_token_price: PRICING_METERS.CACHE_WRITE,
  cache_create_1h_token_price: PRICING_METERS.CACHE_WRITE1H,
  image_token_price: PRICING_METERS.IMAGE_INPUT,
  image_output_token_price: PRICING_METERS.IMAGE_OUTPUT,
  audio_token_price: PRICING_METERS.AUDIO_INPUT,
  audio_completion_token_price: PRICING_METERS.AUDIO_OUTPUT,
  audio_cache_read_token_price: PRICING_METERS.AUDIO_CACHE,
  video_output_token_price: PRICING_METERS.VIDEO_OUTPUT,
} as const

/** Price-object keys that are labels, switches or already mapped above. */
const PRICE_METADATA_KEYS = new Set([
  "quota_type",
  "currency",
  "model_price",
  "per_second_price",
  "call_unit",
  "call_unit_en",
  // Per-group ratio override: ratios arrive as group evidence, not as charges.
  "ratio_override",
])

const RIX_API_QUOTA_TYPES = {
  TOKEN: "token",
  CALL: "call",
  TIME: "time",
} as const

type RixApiQuotaType =
  (typeof RIX_API_QUOTA_TYPES)[keyof typeof RIX_API_QUOTA_TYPES]

const readNonNegativeAmount = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined

const readNonBlankString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined

/** Reads the quota type of a price object, defaulting to token billing. */
const readQuotaType = (value: unknown): RixApiQuotaType =>
  value === RIX_API_QUOTA_TYPES.CALL || value === RIX_API_QUOTA_TYPES.TIME
    ? value
    : RIX_API_QUOTA_TYPES.TOKEN

/** Reads the first priced condition, which is the deployment's headline price. */
/** Reads the first priced condition, which is the deployment's headline price. */
const readPrimaryCondition = (
  row: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  const priceConfig = row.price_config
  if (isPlainObject(priceConfig)) {
    const originalPrice = priceConfig.original_price
    if (isPlainObject(originalPrice)) {
      const [condition] = Array.isArray(originalPrice.conditions)
        ? originalPrice.conditions
        : []
      if (isPlainObject(condition) && isPlainObject(condition.price)) {
        return condition.price
      }
    }
  }

  // 5.x fallback: row.price_info (ratio-based per-group dictionary)
  const priceInfo = row.price_info
  if (isPlainObject(priceInfo)) {
    const candidateGroups = [
      "default",
      ...(Array.isArray(row.enable_groups) ? row.enable_groups : []),
      ...Object.keys(priceInfo),
    ]
    let entry: Record<string, unknown> | undefined
    for (const g of candidateGroups) {
      if (typeof g === "string" && isPlainObject(priceInfo[g])) {
        const val = priceInfo[g] as Record<string, unknown>
        entry = isPlainObject(val.default)
          ? (val.default as Record<string, unknown>)
          : val
        break
      }
    }

    if (entry) {
      const modelRatio = readNonNegativeAmount(entry.model_ratio) ?? 0
      const modelPrice = readNonNegativeAmount(entry.model_price) ?? 0
      const isCall =
        modelPrice > 0 && (modelRatio === 0 || entry.quota_type === 0)

      if (isCall) {
        return {
          quota_type: RIX_API_QUOTA_TYPES.CALL,
          model_price: modelPrice,
          model_ratio: 0,
          currency: DEFAULT_CURRENCY,
        }
      }

      if (modelRatio > 0 || entry.quota_type === 1) {
        const completionRatio =
          readNonNegativeAmount(entry.model_completion_ratio) ?? 1
        const cacheReadRatio = readNonNegativeAmount(entry.model_cache_ratio)
        const cacheCreateRatio = readNonNegativeAmount(
          entry.model_create_cache_ratio,
        )
        const inputPrice = modelRatio * 2
        const outputPrice = modelRatio * 2 * completionRatio

        return {
          quota_type: RIX_API_QUOTA_TYPES.TOKEN,
          model_ratio: modelRatio,
          input_token_price: inputPrice,
          output_token_price: outputPrice,
          ...(cacheReadRatio !== undefined
            ? { cache_read_token_price: modelRatio * 2 * cacheReadRatio }
            : {}),
          ...(cacheCreateRatio !== undefined
            ? { cache_create_token_price: modelRatio * 2 * cacheCreateRatio }
            : {}),
          currency: DEFAULT_CURRENCY,
        }
      }
    }
  }

  return undefined
}

/** Counts the published price conditions, which is what bounds precision. */
const countPublishedConditions = (row: Record<string, unknown>): number => {
  const priceConfig = row.price_config
  if (isPlainObject(priceConfig)) {
    const originalPrice = priceConfig.original_price
    if (isPlainObject(originalPrice)) {
      const conditions = Array.isArray(originalPrice.conditions)
        ? originalPrice.conditions
        : []
      const hasPromptTiers =
        isPlainObject(conditions[0]) &&
        Array.isArray(
          (conditions[0] as Record<string, unknown>).prompt_tiers,
        ) &&
        ((conditions[0] as Record<string, unknown>).prompt_tiers as unknown[])
          .length > 1

      return conditions.length + (hasPromptTiers ? 1 : 0)
    }
  }

  if (isPlainObject(row.price_info)) {
    return Object.keys(row.price_info).length
  }

  return 0
}

/**
 * Builds the pricing plan for one Rix API price object.
 *
 * Token prices are published per one million tokens in the deployment's own
 * currency, per-call prices are a flat request fee and per-second prices bill
 * video time directly. Charges with no equivalent meter are reported as issues
 * rather than dropped silently.
 */
function buildPricingPlan(
  price: Record<string, unknown>,
  quotaType: RixApiQuotaType,
): PricingPlan {
  const currency = readCurrency(price.currency)
  const rates: Partial<Record<string, PriceRate>> = {}
  let hasUnpricedCharges = false

  for (const [priceKey, amount] of Object.entries(price)) {
    const meter =
      TOKEN_PRICE_METERS[priceKey as keyof typeof TOKEN_PRICE_METERS]
    if (meter) {
      const tokenAmount = readNonNegativeAmount(amount)
      if (tokenAmount !== undefined) {
        rates[meter] = {
          amount: tokenAmount,
          currency,
          unit: PRICE_RATE_UNITS.TOKEN,
          per: TOKENS_PER_MILLION,
        }
      }
      continue
    }

    if (PRICE_METADATA_KEYS.has(priceKey)) continue
    if ((readNonNegativeAmount(amount) ?? 0) > 0) hasUnpricedCharges = true
  }

  if (quotaType === RIX_API_QUOTA_TYPES.CALL) {
    const requestAmount = readNonNegativeAmount(price.model_price)
    if (requestAmount !== undefined) {
      rates[PRICING_METERS.REQUEST] = {
        amount: requestAmount,
        currency,
        unit: PRICE_RATE_UNITS.REQUEST,
        per: 1,
      }
    }
  }

  if (quotaType === RIX_API_QUOTA_TYPES.TIME) {
    const secondAmount = readNonNegativeAmount(price.per_second_price)
    if (secondAmount !== undefined) {
      rates[PRICING_METERS.VIDEO_SECONDS] = {
        amount: secondAmount,
        currency,
        unit: PRICE_RATE_UNITS.SECOND,
        per: 1,
      }
    }
  }

  return {
    rates,
    ...(quotaType === RIX_API_QUOTA_TYPES.TIME
      ? { comparison: { meter: PRICING_METERS.VIDEO_SECONDS } }
      : {}),
    usageMode:
      quotaType === RIX_API_QUOTA_TYPES.CALL
        ? PRICING_USAGE_MODES.REQUEST
        : quotaType === RIX_API_QUOTA_TYPES.TIME
          ? PRICING_USAGE_MODES.VIDEO
          : PRICING_USAGE_MODES.TOKENS,
    rules: [],
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.PENDING,
    source: {
      kind: PRICING_SOURCE_KINDS.ACCOUNT,
      ...(hasUnpricedCharges ? { hasUnpricedCharges } : {}),
    },
    issues: hasUnpricedCharges
      ? [{ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE }]
      : [],
  }
}

/** Builds the direct USD-per-million prices this product displays for tokens. */
function buildDirectTokenPrices(
  price: Record<string, unknown>,
  currency: RixApiPriceCurrency,
): ModelCatalogModel["token_price_usd_per_million"] | undefined {
  if (currency !== DEFAULT_CURRENCY) return undefined

  const input = readNonNegativeAmount(price.input_token_price)
  const output = readNonNegativeAmount(price.output_token_price)
  const cacheRead = readNonNegativeAmount(price.cache_read_token_price)
  const cacheWrite = readNonNegativeAmount(price.cache_create_token_price)
  if (
    input === undefined &&
    output === undefined &&
    cacheRead === undefined &&
    cacheWrite === undefined
  ) {
    return undefined
  }

  return {
    ...(input === undefined ? {} : { input }),
    ...(output === undefined ? {} : { output }),
    ...(cacheRead === undefined ? {} : { cache_read: cacheRead }),
    ...(cacheWrite === undefined ? {} : { cache_write: cacheWrite }),
  }
}

/** Builds the deployment's own vendor registry from the row's vendor id. */
function buildVendorRegistry(value: unknown): Map<number, string> {
  const vendorsById = new Map<number, string>()
  if (!Array.isArray(value)) return vendorsById

  for (const vendor of value) {
    if (
      !isPlainObject(vendor) ||
      typeof vendor.id !== "number" ||
      !Number.isInteger(vendor.id) ||
      typeof vendor.name !== "string"
    ) {
      continue
    }

    const name = vendor.name.trim()
    if (name) vendorsById.set(vendor.id, name)
  }

  return vendorsById
}

/** Projects the group definitions onto the ratio record the snapshot carries. */
const projectGroupRatios = (value: unknown): Record<string, number> => {
  if (!isRecord(value)) return {}

  const ratios: Record<string, number> = {}
  for (const [groupId, definition] of Object.entries(value)) {
    if (!isPlainObject(definition)) continue

    const ratio = readNonNegativeAmount(definition.GroupRatio)
    if (ratio !== undefined) ratios[groupId] = ratio
  }

  return ratios
}

/**
 * Reads the groups the account's own level allows.
 *
 * Rix API answers this per level rather than per account, and only an
 * authenticated request carries the level, so an anonymous pricing read has no
 * authoritative group evidence.
 */
function readLevelAllowedGroups(
  userInfo: unknown,
  levelInfo: unknown,
): string[] | undefined {
  if (!isPlainObject(userInfo) || !isRecord(levelInfo)) return undefined

  const level = readNonBlankString(userInfo.level)
  if (!level) return undefined

  const definition = levelInfo[level]
  if (!isPlainObject(definition)) return undefined

  const allowedGroups = definition.AllowedGroups
  if (!Array.isArray(allowedGroups)) return undefined

  return normalizeGroupNames(
    allowedGroups.filter((group): group is string => typeof group === "string"),
  )
}

/**
 * Builds one catalog model from a Rix API pricing row.
 */
function buildCatalogModel(
  row: Record<string, unknown>,
  vendorsById: Map<number, string>,
): ModelCatalogModel | undefined {
  const modelName = readNonBlankString(row.model_name)
  if (!modelName) return undefined

  const price = readPrimaryCondition(row)
  if (!price) return undefined

  const quotaType = readQuotaType(price.quota_type)
  const currency = readCurrency(price.currency)
  const inputPrice = readNonNegativeAmount(price.input_token_price)
  const outputPrice = readNonNegativeAmount(price.output_token_price)
  const description = readNonBlankString(row.description)
  const descriptionEn = readNonBlankString(row.description_en)
  const conditionCount = countPublishedConditions(row)
  const vendorId = row.vendor_id
  const vendorName =
    typeof vendorId === "number" && Number.isInteger(vendorId)
      ? vendorsById.get(vendorId)
      : undefined
  const pricingPlan = buildPricingPlan(price, quotaType)
  const directTokenPrices = buildDirectTokenPrices(price, currency)

  const model: ModelCatalogModel = {
    model_name: modelName,
    ...(readNonBlankString(row.display_name)
      ? { display_name: readNonBlankString(row.display_name) }
      : {}),
    ...(description || descriptionEn
      ? {
          model_descriptions: {
            ...(description ? { zh: description } : {}),
            ...(descriptionEn ? { en: descriptionEn } : {}),
          },
        }
      : {}),
    // Rix API publishes direct prices instead of One/New API ratios, so the
    // ratio stays zero and the ratio fallback never reaches the display.
    quota_type: quotaType === RIX_API_QUOTA_TYPES.TOKEN ? 0 : 1,
    model_ratio: readNonNegativeAmount(price.model_ratio) ?? 0,
    model_price:
      quotaType === RIX_API_QUOTA_TYPES.CALL
        ? readNonNegativeAmount(price.model_price) ?? 0
        : quotaType === RIX_API_QUOTA_TYPES.TIME
          ? readNonNegativeAmount(price.per_second_price) ?? 0
          : 0,
    ...(directTokenPrices
      ? { token_price_usd_per_million: directTokenPrices }
      : {}),
    completion_ratio:
      inputPrice !== undefined && inputPrice > 0 && outputPrice !== undefined
        ? outputPrice / inputPrice
        : 1,
    price_metadata: {
      source: MODEL_PRICE_SOURCE_KINDS.CHANNEL_PRICING,
      precision:
        Object.keys(pricingPlan.rates).length === 0
          ? MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE
          : conditionCount > 1
            ? MODEL_PRICE_PRECISION_KINDS.ESTIMATED
            : MODEL_PRICE_PRECISION_KINDS.EXACT,
    },
    enable_groups: normalizeGroupNames(
      Array.isArray(row.enable_groups)
        ? row.enable_groups.filter(
            (group): group is string => typeof group === "string",
          )
        : isPlainObject(row.price_info)
          ? Object.keys(row.price_info)
          : [],
    ),
    // Pricing rows do not declare protocol support; the deployment publishes
    // that on `/v1/models` instead, so admission stays empty rather than guessed.
    supported_endpoint_types: [],
    pricingPlan,
  }

  if (vendorName !== undefined) {
    model.vendorEvidence = {
      kind: MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory,
      name: vendorName,
      externalId: String(vendorId),
    }
  }

  return model
}

/**
 * Read the Rix API pricing payload, falling back to an anonymous read.
 *
 * `/api/pricing` is public — verified 2026-09-26 on https://platform.ephone.ai:
 * an unauthenticated read returns the whole catalog — while an authenticated read
 * additionally reports the caller's level, the only authoritative group-access
 * evidence. A deployment that refuses the account credential therefore still
 * yields a catalog, just without authoritative group access; which of the two
 * reads answers is remembered per deployment so the credential is not offered
 * again on every catalog load.
 */
export async function fetchRixApiModelPricing(
  request: ApiServiceRequest,
): Promise<unknown> {
  if (request.auth.authType === AuthTypeEnum.None) {
    return await fetchDefaultModelPricing(request)
  }

  return await resolveRixApiDialect(
    request.baseUrl,
    RIX_API_DIALECT_KEYS.PricingAuth,
    [
      RIX_API_PRICING_AUTH_MODES.Credential,
      RIX_API_PRICING_AUTH_MODES.Anonymous,
    ],
    (authMode) =>
      fetchDefaultModelPricing(
        authMode === RIX_API_PRICING_AUTH_MODES.Anonymous
          ? {
              ...request,
              auth: { ...request.auth, authType: AuthTypeEnum.None },
            }
          : request,
      ),
  )
}

/**
 * Normalizes a Rix API pricing payload into the shared catalog snapshot.
 *
 * Rix API replaced the New API pricing envelope with `model_info` rows plus its
 * own vendor, group and level registries, so deployments on its 6.x generation
 * cannot be read by the New API-shaped parser:
 * https://github.com/RixAPI/Rix-API. The shared transport unwraps
 * `{ success, message, data }` before this runs, so the Rix body arrives as the
 * object carrying `model_info` and only a deployment that omits `message` still
 * hands over the wrapper. A New API-shaped payload is delegated to the shared
 * normalizer so older Rix generations keep working unchanged.
 */
export function normalizeRixApiModelPricingResponse(
  value: unknown,
): ModelCatalogSnapshot {
  if (!isPlainObject(value)) {
    throw new TypeError(INVALID_RESPONSE_MESSAGE)
  }

  if (Array.isArray(value.data)) {
    return normalizeNewApiModelPricingResponse(value)
  }

  const data = isPlainObject(value.data) ? value.data : value
  if (!Array.isArray(data.model_info)) {
    throw new TypeError(INVALID_RESPONSE_MESSAGE)
  }

  const vendorsById = buildVendorRegistry(data.vendor_info)
  const models = data.model_info
    .filter(isPlainObject)
    .map((row) => buildCatalogModel(row, vendorsById))
    .filter((model): model is ModelCatalogModel => model !== undefined)

  const groupRatios = normalizeGroupRatios(projectGroupRatios(data.group_info))
  const usableGroups = readLevelAllowedGroups(data.user_info, data.level_info)

  return applyFamilyGroupEvidence({
    data: models,
    success: value.success !== false,
    groupRatios,
    groupAccess:
      usableGroups && usableGroups.length
        ? { kind: "authoritative", usableGroups }
        : Object.keys(groupRatios).length
          ? {
              kind: "compatible-priced-fallback",
              candidateGroups: Object.keys(groupRatios),
            }
          : { kind: "authoritative", usableGroups: [] },
  })
}
