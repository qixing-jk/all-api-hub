import { coerceBaseUrlToPathSuffix } from "~/utils/core/url"

export interface ProviderCatalogExportInput {
  selectionId: string
  name: string
  baseUrl: string
  /** Defaults to /v1. Use null when the target owns an exact protocol URL. */
  baseUrlPathSuffix?: string | null
  apiKey: string
  discoveredModelIds: readonly unknown[]
  manualModelId?: unknown
  manualModelIds?: readonly unknown[]
}

interface PreparedProviderCatalogExportItem {
  selectionId: string
  name: string
  baseUrl: string
  apiKey: string
  modelIds: string[]
}

interface PreparedProviderCatalogExport {
  providers: PreparedProviderCatalogExportItem[]
  providerCount: number
  modelCount: number
}

/** Produce a deterministic FNV-1a digest for a provider catalog value. */
export function hashProviderCatalogValue(value: string) {
  let hash = 0x811c9dc5
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

/** Compare model IDs using deterministic Unicode code-point order. */
function compareModelIds(left: string, right: string) {
  if (left === right) return 0
  const leftCodePoints = Array.from(left, (value) => value.codePointAt(0)!)
  const rightCodePoints = Array.from(right, (value) => value.codePointAt(0)!)
  const length = Math.min(leftCodePoints.length, rightCodePoints.length)

  for (let index = 0; index < length; index += 1) {
    const leftCodePoint = leftCodePoints[index]!
    const rightCodePoint = rightCodePoints[index]!
    if (leftCodePoint !== rightCodePoint) {
      return leftCodePoint < rightCodePoint ? -1 : 1
    }
  }

  return leftCodePoints.length < rightCodePoints.length ? -1 : 1
}

/** Trim, deduplicate, and deterministically order provider model IDs. */
export function normalizeProviderCatalogModelIds(values: readonly unknown[]) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).sort(compareModelIds)
}

/** Normalize provider facts shared by target-specific export adapters. */
export function prepareProviderCatalogExport(
  inputs: ProviderCatalogExportInput[],
): PreparedProviderCatalogExport {
  const providers = inputs.map((input) => ({
    selectionId: input.selectionId,
    name: input.name.trim(),
    baseUrl:
      input.baseUrlPathSuffix === null
        ? input.baseUrl.trim().replace(/\/+$/, "")
        : coerceBaseUrlToPathSuffix(
            input.baseUrl,
            input.baseUrlPathSuffix ?? "/v1",
          ),
    apiKey: input.apiKey,
    modelIds: normalizeProviderCatalogModelIds([
      ...input.discoveredModelIds,
      ...(input.manualModelIds ?? []),
      input.manualModelId,
    ]),
  }))

  return {
    providers,
    providerCount: providers.length,
    modelCount: providers.reduce(
      (count, provider) => count + provider.modelIds.length,
      0,
    ),
  }
}
