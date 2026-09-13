import type {
  ActiveModelGroupContext,
  ModelGroupContext,
} from "~/features/ModelList/groupContext"
import {
  MODEL_MANAGEMENT_SOURCE_KINDS,
  type ModelListSourceIdentity,
  type ModelManagementItemSource,
} from "~/features/ModelList/modelManagementSources"
import type { PricingResponse } from "~/services/modelList/pricingModel"
import type { ComparableModelIdentity } from "~/services/models/modelMetadata/modelIdentityIndex"
import type {
  ModelMetadata,
  ResolvedModelVendor,
} from "~/services/models/modelMetadata/types"
import type { calculateModelPrice } from "~/services/models/utils/modelPricing"

export interface AccountGroupOption {
  name: string
  ratio?: number
}

export type CalculatedModelItem = {
  model: PricingResponse["data"][number]
  calculatedPrice: ReturnType<typeof calculateModelPrice>
  source: ModelManagementItemSource
  sourceIdentity?: ModelListSourceIdentity
  groupRatios: Record<string, number>
  groupContext: ModelGroupContext
  activeGroupContext: ActiveModelGroupContext
  effectiveGroup?: string
  modelMetadata?: ModelMetadata
  comparableModelIdentity: ComparableModelIdentity
  resolvedVendor: ResolvedModelVendor
  hasUniquelyOptimalGroup?: boolean
  isLowestPrice?: boolean
  isPriceComparable?: boolean
}

/** Resolves the row identity used for source-scoped model-list comparisons. */
export function getModelListSourceIdentityKey(params: {
  source: ModelManagementItemSource
  sourceIdentity?: ModelListSourceIdentity
}) {
  return (
    params.sourceIdentity?.id ??
    (params.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
      ? params.source.account.id
      : params.source.profile.id)
  )
}

/** Creates a stable identifier for a calculated model item. */
export function getModelItemKey(
  item: Pick<CalculatedModelItem, "model" | "source" | "sourceIdentity">,
) {
  const sourceId = getModelListSourceIdentityKey({
    source: item.source,
    sourceIdentity: item.sourceIdentity,
  })

  return `${item.source.kind}:${sourceId}:${item.model.model_name}`
}
