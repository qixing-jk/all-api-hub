import { normalizeGroupNames } from "~/services/modelCatalog/groupFacts"
import type {
  ModelCatalogModel,
  ModelGroupAccessEvidence,
} from "~/services/modelCatalog/snapshot"

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

/** Only explicit group-access denial can hide a catalog row. */
export function isModelKnownUnavailable(context: ModelGroupContext): boolean {
  // Group names (including `all`) are literal access identities. New API's
  // pricing controller lets `all` through its catalog filter, but channel
  // selection still matches the actual group; catalog visibility grants no access.
  // https://github.com/QuantumNous/new-api/blob/v0.12.4/model/channel_cache.go
  // Preserve missing-support metadata conservatively.
  return (
    context.accessState === MODEL_GROUP_ACCESS_STATES.KNOWN &&
    context.usableGroups.length === 0 &&
    context.supportedGroups.length > 0
  )
}

interface ResolveActiveModelGroupContextParams {
  context: ModelGroupContext
  candidateGroups?: readonly string[]
  effectiveGroup?: string
}

/** Index source facts once, then project each model without price/access inference. */
export function createModelGroupResolver(params: {
  groupSemantics: ModelListGroupSemantics
  groupAccess: ModelGroupAccessEvidence
  groupRatios: Readonly<Record<string, number>>
}) {
  const groupsForEvidence = (evidence: ModelGroupAccessEvidence) =>
    new Set(
      evidence.kind === "authoritative"
        ? normalizeGroupNames(evidence.usableGroups)
        : evidence.kind === "compatible-priced-fallback"
          ? normalizeGroupNames(evidence.candidateGroups)
          : [],
    )
  const sourceUsable = groupsForEvidence(params.groupAccess)
  const priced = new Set(Object.keys(params.groupRatios))
  return (
    model: Pick<
      ModelCatalogModel,
      "enable_groups" | "price_metadata" | "groupAccess"
    >,
  ): ModelGroupContext => {
    const evidence = model.groupAccess ?? params.groupAccess
    const usable =
      evidence === params.groupAccess
        ? sourceUsable
        : groupsForEvidence(evidence)
    const supportedGroups = normalizeGroupNames(model.enable_groups)
    if (
      params.groupSemantics === MODEL_LIST_GROUP_SEMANTICS.NOT_APPLICABLE ||
      evidence.kind === "not-applicable"
    ) {
      return {
        accessState: MODEL_GROUP_ACCESS_STATES.NOT_APPLICABLE,
        supportedGroups,
        usableGroups: [],
        priceableGroups: [],
      }
    }
    const usableGroups = supportedGroups.filter((group) => usable.has(group))
    return {
      accessState:
        evidence.kind === "unavailable"
          ? MODEL_GROUP_ACCESS_STATES.UNKNOWN
          : evidence.kind === "compatible-priced-fallback" &&
              usableGroups.length > 0
            ? MODEL_GROUP_ACCESS_STATES.COMPATIBLE_PRICED_FALLBACK
            : MODEL_GROUP_ACCESS_STATES.KNOWN,
      supportedGroups,
      usableGroups,
      priceableGroups: usableGroups.filter((group) => priced.has(group)),
    }
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
