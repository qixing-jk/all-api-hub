import { normalizeGroupNames } from "~/services/modelCatalog/groupFacts"
import type { ModelCatalogSnapshot } from "~/services/modelCatalog/snapshot"
import { MODEL_PRICE_PRECISION_KINDS } from "~/services/modelList/pricingModel"

/**
 * Preserve family compatibility evidence at admission. Empty usable-group maps
 * historically use matching ratios; unpriced rows with neither remain unknown.
 * This convention is deliberately not a Model List selection policy.
 */
export function applyFamilyGroupEvidence(
  catalog: ModelCatalogSnapshot,
): ModelCatalogSnapshot {
  if (
    catalog.groupAccess.kind === "authoritative" &&
    catalog.groupAccess.usableGroups.length > 0
  )
    return catalog
  const priced = new Set(Object.keys(catalog.groupRatios))
  const data = catalog.data.map((model) => {
    const insufficient =
      (model.price_metadata?.precision ===
        MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE ||
        catalog.model_list_source?.supportsPricing === false) &&
      !normalizeGroupNames(model.enable_groups ?? []).some((group) =>
        priced.has(group),
      )
    return insufficient
      ? { ...model, groupAccess: { kind: "unavailable" as const } }
      : model
  })
  const isEmptyUnpricedCatalog =
    catalog.data.length === 0 &&
    catalog.model_list_source?.supportsPricing === false
  if (
    data.every((model, index) => model === catalog.data[index]) &&
    !isEmptyUnpricedCatalog
  )
    return catalog
  return {
    ...catalog,
    data,
    ...(isEmptyUnpricedCatalog
      ? { groupAccess: { kind: "unavailable" as const } }
      : {}),
  }
}
