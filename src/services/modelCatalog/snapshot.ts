import type {
  ModelListSourceInfo,
  ModelPricing,
} from "~/services/modelList/pricingModel"

/** Evidence about access, independent of prices and the current UI selection. */
export type ModelGroupAccessEvidence =
  | { kind: "not-applicable" }
  | { kind: "authoritative"; usableGroups: string[] }
  | { kind: "compatible-priced-fallback"; candidateGroups: string[] }
  | { kind: "unavailable" }

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
