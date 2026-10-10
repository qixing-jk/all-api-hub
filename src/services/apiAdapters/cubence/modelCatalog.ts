import { SITE_TYPES } from "~/constants/siteType"
import type { ModelCatalogCapability } from "~/services/apiAdapters/contracts/modelCatalog"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { fetchCubenceModels } from "~/services/apiService/cubence/catalog"
import {
  fetchGroups,
  fetchKeys,
  type CubenceGroup,
} from "~/services/apiService/cubence/keys"
import { withCubenceSession } from "~/services/apiService/cubence/session"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import type { ModelPricing } from "~/services/modelList/pricingModel"
import { isRecord } from "~/utils/core/object"

import { getCubenceGroupDisplayName } from "./groupPresentation"

const rate = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined

/**
 * Native USD/M token rates and available share groups. Complex rules remain explicitly unavailable.
 * https://docs.cubence.com/en/docs/guides/pricing: rates exclude group/time/tier effects.
 */
export function buildCubenceCatalog(
  models: readonly Record<string, unknown>[],
  groups: readonly CubenceGroup[],
): ModelCatalogSnapshot {
  const available = groups.filter((group) => group.is_active)
  const data: ModelPricing[] = models
    .filter((model) => model.is_active === true)
    .map((model) => {
      const ids = Array.isArray(model.group_ids) ? model.group_ids : []
      const modelGroups = available.filter((group) => ids.includes(group.id))
      const input = rate(model.input_price),
        output = rate(model.output_price),
        cacheRead = rate(model.cache_read_price),
        cacheWrite = rate(model.cache_write_price)
      const complex =
        !Array.isArray(model.pricing_tiers) ||
        model.pricing_tiers.length > 0 ||
        (Array.isArray(model.groups) &&
          model.groups.some(
            (group) => isRecord(group) && group.schedule_enabled === true,
          ))
      const priced =
        model.billing_mode === "token" &&
        input !== undefined &&
        output !== undefined &&
        cacheRead !== undefined &&
        cacheWrite !== undefined &&
        !complex
      return {
        model_name: String(model.model_name),
        ...(isRecord(model.vendor) && typeof model.vendor.name === "string"
          ? {
              vendorEvidence: {
                kind: "publisher" as const,
                name: model.vendor.name,
              },
            }
          : {}),
        model_description:
          typeof model.description === "string" ? model.description : undefined,
        quota_type: model.billing_mode === "token" ? 0 : 1,
        model_ratio: 0,
        model_price: 0,
        completion_ratio: 1,
        ...(priced
          ? {
              token_price_usd_per_million: {
                input,
                output,
                cache_read: cacheRead,
                cache_write: cacheWrite,
              },
            }
          : {}),
        price_metadata: priced
          ? {
              source: "provider-catalog",
              precision: "estimated",
              source_url: "https://docs.cubence.com/en/docs/guides/pricing",
            }
          : {
              source: "none",
              precision: "unavailable",
              unavailable_reason: "pricing-source-unavailable",
            },
        enable_groups: modelGroups.map((group) => String(group.id)),
        groupDisplayNames: Object.fromEntries(
          modelGroups.map((group) => [
            String(group.id),
            getCubenceGroupDisplayName(group),
          ]),
        ),
        supported_endpoint_types: [],
      }
    })
  return {
    success: true,
    data,
    groupRatios: Object.fromEntries(
      available.map((group) => [String(group.id), group.multiplier]),
    ),
    groupAccess: {
      kind: "authoritative",
      usableGroups: available.map((group) => String(group.id)),
    },
    model_list_source: {
      kind: "user-scoped",
      provider: SITE_TYPES.CUBENCE,
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

/** Load provider-wide prices and the account's current selectable groups together. */
async function loadCatalog(request: ApiServiceRequest) {
  return withCubenceSession(request, async (request) => {
    const [models, groups] = await Promise.all([
      fetchCubenceModels(request),
      fetchGroups(request),
    ])
    return buildCubenceCatalog(models, groups)
  })
}

export const cubenceModelPricing: ModelPricingCapability = {
  runtimeKeyFallback: "account-pricing",
  fetchPricing: loadCatalog,
}

export const cubenceModelCatalog: ModelCatalogCapability = {
  async fetchModels(request, context) {
    if (!context?.accountRequest)
      throw new ApiError(
        "Cubence console context is required",
        undefined,
        undefined,
        API_ERROR_CODES.FEATURE_UNSUPPORTED,
      )
    const accountRequest = {
      ...context.accountRequest,
      abortSignal: request.abortSignal ?? context.accountRequest.abortSignal,
    }
    return withCubenceSession(accountRequest, async (accountRequest) => {
      const key = (await fetchKeys(accountRequest)).find(
        (key) => key.key === request.auth.apiKey,
      )
      if (!key || key.status !== "active")
        throw new ApiError(
          "Cubence key is unavailable",
          undefined,
          undefined,
          API_ERROR_CODES.TOKEN_SECRET_UNAVAILABLE,
        )
      const models = await fetchCubenceModels(accountRequest)
      return models
        .filter(
          (model) =>
            model.is_active === true &&
            Array.isArray(model.group_ids) &&
            model.group_ids.includes(key.share_group_id),
        )
        .map((model) => ({
          id: String(model.model_name),
          ...(isRecord(model.vendor) && typeof model.vendor.name === "string"
            ? {
                vendorEvidence: {
                  kind: "publisher" as const,
                  name: model.vendor.name,
                },
              }
            : {}),
        }))
    })
  },
  async enrichPricing({ accountRequest, models }) {
    const catalog = await loadCatalog(accountRequest)
    const ids = new Set(models.map((model) => model.id))
    return {
      ...catalog,
      data: catalog.data.filter((model) => ids.has(model.model_name)),
    }
  },
}
