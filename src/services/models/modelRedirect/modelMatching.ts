import { extractCoreModelIdentity } from "~/services/models/modelMetadata/modelIdentityIndex"
import {
  removeDateSuffix,
  toModelTokenKey,
} from "~/services/models/utils/modelName"

import { extractActualModel, renameModel } from "./modelNormalization"

const hasDateSuffix = (rawModelId: string): boolean => {
  const coreIdentity = extractCoreModelIdentity(rawModelId)
  return removeDateSuffix(coreIdentity) !== coreIdentity
}

/**
 * Build an order-insensitive token key by:
 * - Lowercasing
 * - Stripping date suffixes
 * - Treating dots and hyphens/underscores as the same separator
 * - Comparing as an unordered token set to align variants like
 *   "claude-4.5-sonnet" and "claude-sonnet-4-5".
 */
export const toVersionAgnosticKey = (modelName: string): string | null => {
  return toModelTokenKey(modelName)
}

/**
 * Generate model mapping for a single channel
 * Returns an object of standardModel -> actualModel mappings
 * Uses multi-stage extraction pipeline with deduplication
 * @param standardModels List of canonical standard model ids.
 * @param actualModels Models exposed by the channel (raw).
 * @returns Mapping of standard model id to best-matching actual model.
 */
export function generateModelMappingForChannel(
  standardModels: string[],
  actualModels: string[],
): Record<string, string> {
  const mapping: Record<string, string> = {}
  const usedActualModels = new Set<string>()
  const actualModelSet = new Set<string>()

  const normalizedActualMap = new Map<string, string[]>()
  const versionKeyToActualMap = new Map<string, string[]>()

  // traverse actual models to build lookup maps
  for (const rawActual of actualModels) {
    const actualModel = rawActual.trim()
    if (!actualModel) continue
    actualModelSet.add(actualModel)

    // A dated model is only compatible with the same exact raw identity.
    // Keep it in the exact-match set, but never expose a date-stripped alias.
    if (hasDateSuffix(actualModel)) continue

    // Normalize actual model name
    const normalizedModelName = renameModel(actualModel, false)?.trim()
    if (!normalizedModelName) continue

    // Build normalized map for deduplication
    if (!normalizedActualMap.has(normalizedModelName)) {
      normalizedActualMap.set(normalizedModelName, [])
    }
    normalizedActualMap.get(normalizedModelName)!.push(actualModel)

    // Build version-agnostic map for fuzzy matching
    const versionKey = toVersionAgnosticKey(normalizedModelName)
    if (versionKey) {
      if (!versionKeyToActualMap.has(versionKey)) {
        versionKeyToActualMap.set(versionKey, [])
      }
      versionKeyToActualMap.get(versionKey)!.push(actualModel)
    }
  }

  // Match standard models to actual models
  for (const rawStandard of standardModels) {
    const standardModel = rawStandard.trim()
    if (!standardModel) continue

    // Skip if already mapped or exact match
    if (actualModelSet.has(standardModel)) {
      continue
    }
    if (hasDateSuffix(standardModel)) {
      continue
    }
    if (mapping[standardModel]) {
      continue
    }

    // normalize standard model name
    const normalizedStandardModelName = renameModel(
      standardModel,
      false,
    )?.trim()
    if (!normalizedStandardModelName) continue

    // Find candidates from both normalized and version-agnostic maps
    const candidates = normalizedActualMap.get(normalizedStandardModelName)
    const versionKey = toVersionAgnosticKey(normalizedStandardModelName)
    const versionCandidates =
      versionKey && versionKeyToActualMap.get(versionKey)
    const standardCandidateKey = toModelTokenKey(
      extractActualModel(standardModel),
    )
    if (!standardCandidateKey) continue

    // Filter out already used actual models
    const availableCandidate = [
      ...(candidates ?? []),
      ...(versionCandidates ?? []),
    ].find((candidate) => {
      if (usedActualModels.has(candidate)) return false

      const candidateKey = toModelTokenKey(extractActualModel(candidate))
      return Boolean(candidateKey && standardCandidateKey === candidateKey)
    })

    // Map the standard model to the first available candidate
    if (availableCandidate) {
      mapping[standardModel] = availableCandidate
      usedActualModels.add(availableCandidate)
    }
  }

  return mapping
}
