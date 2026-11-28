import type {
  ModelListSourceInfo,
  ModelPricing,
} from "~/services/modelList/pricingModel"

/** Runtime discriminants for provider group-access evidence. */
export const MODEL_GROUP_ACCESS_EVIDENCE_KINDS = {
  NOT_APPLICABLE: "not-applicable",
  AUTHORITATIVE: "authoritative",
  COMPATIBLE_PRICED_FALLBACK: "compatible-priced-fallback",
  UNAVAILABLE: "unavailable",
} as const

/** Evidence about access, independent of prices and the current UI selection. */
export type ModelGroupAccessEvidence =
  | { kind: typeof MODEL_GROUP_ACCESS_EVIDENCE_KINDS.NOT_APPLICABLE }
  | {
      kind: typeof MODEL_GROUP_ACCESS_EVIDENCE_KINDS.AUTHORITATIVE
      usableGroups: string[]
    }
  | {
      kind: typeof MODEL_GROUP_ACCESS_EVIDENCE_KINDS.COMPATIBLE_PRICED_FALLBACK
      candidateGroups: string[]
    }
  | { kind: typeof MODEL_GROUP_ACCESS_EVIDENCE_KINDS.UNAVAILABLE }

export interface ModelCatalogModel extends ModelPricing {
  /** A producer may have different access evidence for an individual model. */
  groupAccess?: ModelGroupAccessEvidence
}

/** Product facts returned by catalog producers; no selected/effective groups. */
export interface ModelCatalogSnapshot {
  data: ModelCatalogModel[]
  groupAccess: ModelGroupAccessEvidence
  groupRatios: Record<string, number>
  success: boolean
  model_list_source?: ModelListSourceInfo
}
