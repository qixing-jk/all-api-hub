import {
  MODEL_PRICE_PRECISION_KINDS,
  type ModelListSourceInfo,
  type ModelPricing,
  type PricingResponse,
} from "~/services/modelList/pricingModel"

import { normalizeGroupNames } from "./groupNormalization"
import {
  MODEL_LIST_GROUP_SEMANTICS,
  type ModelListGroupSemantics,
} from "./modelManagementSources"

export const MODEL_GROUP_ACCESS_STATES = {
  KNOWN: "known",
  COMPATIBLE_PRICED_FALLBACK: "compatible-priced-fallback",
  UNKNOWN: "unknown",
  NOT_APPLICABLE: "not-applicable",
} as const

export type ModelGroupAccessState =
  (typeof MODEL_GROUP_ACCESS_STATES)[keyof typeof MODEL_GROUP_ACCESS_STATES]

export interface ModelGroupContext {
  accessState: ModelGroupAccessState
  supportedGroups: string[]
  usableGroups: string[]
  priceableGroups: string[]
}

export interface ActiveModelGroupContext {
  activeUsableGroups: string[]
  activePriceableGroups: string[]
  actionGroups: string[]
}

interface ResolveModelGroupContextParams {
  groupSemantics: ModelListGroupSemantics
  model: Pick<ModelPricing, "enable_groups" | "price_metadata">
  usableGroup: PricingResponse["usable_group"]
  groupRatios: PricingResponse["group_ratio"]
  modelListSource?: ModelListSourceInfo
}

interface ResolveActiveModelGroupContextParams {
  context: ModelGroupContext
  candidateGroups?: readonly string[]
  effectiveGroup?: string
}

/** Returns whether a ratio can safely participate in price calculations. */
function isFiniteRatio(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/** Normalizes valid group-ratio entries without prototype-key collisions. */
export function normalizeGroupRatios(
  groupRatios: Readonly<Record<string, number>>,
): Record<string, number> {
  const entries: Array<[string, number]> = []
  const seen = new Set<string>()

  for (const [rawGroup, ratio] of Object.entries(groupRatios)) {
    const group = rawGroup.trim()
    if (!group || !isFiniteRatio(ratio) || seen.has(group)) continue
    seen.add(group)
    entries.push([group, ratio])
  }

  return Object.fromEntries(entries)
}

/**
 * New API exposes `enable_groups` as global model/channel support, while
 * `usable_group` and `group_ratio` are scoped to the current viewer.
 * https://github.com/QuantumNous/new-api/blob/a63364d156cf2a64f1c3d1ee4923d73d5f3222a1/model/pricing.go
 * https://github.com/QuantumNous/new-api/blob/a63364d156cf2a64f1c3d1ee4923d73d5f3222a1/controller/pricing.go
 */
export function resolveModelGroupContext(
  params: ResolveModelGroupContextParams,
): ModelGroupContext {
  const supportedGroups = normalizeGroupNames(params.model.enable_groups)

  if (params.groupSemantics === MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE) {
    return {
      accessState: MODEL_GROUP_ACCESS_STATES.NOT_APPLICABLE,
      supportedGroups,
      usableGroups: [],
      priceableGroups: [],
    }
  }

  const usableKeySet = new Set(
    normalizeGroupNames(Object.keys(params.usableGroup)),
  )
  const normalizedGroupRatios = normalizeGroupRatios(params.groupRatios)
  const pricedKeySet = new Set(Object.keys(normalizedGroupRatios))
  const usableGroups = supportedGroups.filter((group) =>
    usableKeySet.has(group),
  )
  const pricedGroups = supportedGroups.filter((group) =>
    pricedKeySet.has(group),
  )

  if (usableKeySet.size > 0) {
    return {
      accessState: MODEL_GROUP_ACCESS_STATES.KNOWN,
      supportedGroups,
      usableGroups,
      priceableGroups: usableGroups.filter((group) => pricedKeySet.has(group)),
    }
  }

  if (pricedGroups.length > 0) {
    return {
      accessState: MODEL_GROUP_ACCESS_STATES.COMPATIBLE_PRICED_FALLBACK,
      supportedGroups,
      usableGroups: pricedGroups,
      priceableGroups: pricedGroups,
    }
  }

  const pricingUnavailable =
    params.model.price_metadata?.precision ===
      MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE ||
    params.modelListSource?.supportsPricing === false

  return {
    accessState: pricingUnavailable
      ? MODEL_GROUP_ACCESS_STATES.UNKNOWN
      : MODEL_GROUP_ACCESS_STATES.KNOWN,
    supportedGroups,
    usableGroups: [],
    priceableGroups: [],
  }
}

/** Resolves the current selection's usable, priceable, and action groups. */
export function resolveActiveModelGroupContext(
  params: ResolveActiveModelGroupContextParams,
): ActiveModelGroupContext {
  const candidates =
    params.candidateGroups === undefined
      ? null
      : new Set(normalizeGroupNames(params.candidateGroups))
  const activeUsableGroups = candidates
    ? params.context.usableGroups.filter((group) => candidates.has(group))
    : [...params.context.usableGroups]
  const priceable = new Set(params.context.priceableGroups)
  const activePriceableGroups = activeUsableGroups.filter((group) =>
    priceable.has(group),
  )
  const effectiveGroup = params.effectiveGroup?.trim()
  const actionGroups =
    effectiveGroup && activePriceableGroups.includes(effectiveGroup)
      ? [effectiveGroup]
      : activeUsableGroups

  return { activeUsableGroups, activePriceableGroups, actionGroups }
}
