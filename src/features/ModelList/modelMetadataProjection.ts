import type { ModelListItem } from "~/features/ModelList/modelListItems"
import type { PreparedModelListItem } from "~/features/ModelList/sourcePreparation"
import {
  resolveComparableModelIdentity,
  resolveModelIdentity,
  type ModelIdentityIndex,
} from "~/services/models/modelMetadata/modelIdentityIndex"
import type { ModelVendorCandidate } from "~/services/models/modelMetadata/types"
import {
  aggregateModelVendors,
  resolveModelVendorCandidate,
} from "~/services/models/modelVendor"

type CandidateModelListItem = Omit<ModelListItem, "resolvedVendor"> & {
  vendorCandidate: ModelVendorCandidate
}

/** Resolves identities and vendors across the complete source inventory, before filtering. */
export function projectModelListMetadata(
  items: readonly PreparedModelListItem[],
  modelMetadataIndex: ModelIdentityIndex,
): ModelListItem[] {
  const attachVendorCandidate = (
    item: PreparedModelListItem,
  ): CandidateModelListItem => {
    const lookupResult = resolveModelIdentity(
      modelMetadataIndex,
      item.model.model_name,
    )

    return {
      ...item,
      modelMetadata:
        lookupResult.state === "resolved" ? lookupResult.metadata : undefined,
      comparableModelIdentity: resolveComparableModelIdentity(
        modelMetadataIndex,
        item.model.model_name,
      ),
      vendorCandidate: resolveModelVendorCandidate(
        {
          id: item.model.model_name,
          vendorEvidence: item.model.vendorEvidence,
        },
        lookupResult,
      ),
    }
  }

  const candidateItems = items.map(attachVendorCandidate)
  const { resolved } = aggregateModelVendors(
    candidateItems.map((item) => item.vendorCandidate),
  )
  return candidateItems.flatMap(
    ({ vendorCandidate: _candidate, ...item }, index) => {
      const resolvedVendor = resolved[index]
      return resolvedVendor === undefined ? [] : [{ ...item, resolvedVendor }]
    },
  )
}
