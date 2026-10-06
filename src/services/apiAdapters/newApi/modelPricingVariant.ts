import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type {
  ModelPricingCapability,
  ModelPricingRequest,
} from "~/services/apiAdapters/contracts/modelPricing"
import * as modelPricing from "~/services/apiService/newApiFamily/default/modelPricing"
import * as apiyi from "~/services/apiService/newApiFamily/variants/apiyi"
import * as oneHub from "~/services/apiService/newApiFamily/variants/oneHub"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"

import { normalizeApiYiModelPricingResponse } from "./apiyiModelPricing"
import { applyFamilyGroupEvidence } from "./groupEvidence"
import {
  normalizeNewApiModelPricingResponse,
  normalizeVApiModelPricingResponse,
} from "./modelPricingDto"
import {
  fetchRixApiModelPricing,
  normalizeRixApiModelPricingResponse,
} from "./rixApiModelPricing"

type FetchPricing = ModelPricingCapability["fetchPricing"]

/** Binds a native transport to the parser that admits its canonical catalog. */
function bindModelPricing<T>(
  fetchNative: (request: ModelPricingRequest) => Promise<T>,
  normalize: (response: T) => ModelCatalogSnapshot,
): FetchPricing {
  return async (request) => normalize(await fetchNative(request))
}

const fetchDefaultModelPricing =
  modelPricing.defaultModelPricingImplementation.fetchModelPricing

const defaultPricing = bindModelPricing(
  fetchDefaultModelPricing,
  normalizeNewApiModelPricingResponse,
)

// LaoZhang v31.1.5 shares APIyi's pricing envelope and conditional-rate
// schema, including sibling group/vendor facts: https://api2.laozhang.ai/api/pricing
const apiyiPricing = bindModelPricing(
  apiyi.fetchModelPricing,
  ({ pricing, status }) =>
    applyFamilyGroupEvidence(
      normalizeApiYiModelPricingResponse(pricing, status),
    ),
)

// Each entry is a complete canonical operation; transport and admission cannot
// be selected independently by the capability factory.
const overrides: Partial<Record<AccountSiteType, FetchPricing>> = {
  [SITE_TYPES.ONE_HUB]: bindModelPricing(
    (request) => oneHub.fetchModelPricing(request, false),
    applyFamilyGroupEvidence,
  ),
  [SITE_TYPES.DONE_HUB]: bindModelPricing(
    (request) => oneHub.fetchModelPricing(request, true),
    applyFamilyGroupEvidence,
  ),
  [SITE_TYPES.APIYI]: apiyiPricing,
  [SITE_TYPES.LAOZHANG]: apiyiPricing,
  [SITE_TYPES.V_API]: bindModelPricing(
    fetchDefaultModelPricing,
    normalizeVApiModelPricingResponse,
  ),
  [SITE_TYPES.RIX_API]: bindModelPricing(
    fetchRixApiModelPricing,
    normalizeRixApiModelPricingResponse,
  ),
}

/** Resolves a bound native pricing operation that returns product-owned facts. */
export function resolveNewApiModelPricingVariant(
  siteType: AccountSiteType,
): FetchPricing {
  return overrides[siteType] ?? defaultPricing
}
