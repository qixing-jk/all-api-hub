import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { EMRANK_ENDPOINTS } from "./constants"
import { invalidEmRankResponse, readEmRank } from "./transport"

export const EMRANK_MODEL_KINDS = {
  Embedding: "embedding",
  Reranker: "reranker",
  Decision: "decision",
} as const

export type EmRankModelKind =
  (typeof EMRANK_MODEL_KINDS)[keyof typeof EMRANK_MODEL_KINDS]

export type EmRankCatalogModel = {
  id: string
  kind: EmRankModelKind
  ownedBy: string
  /** Input multiplier the gateway bills with; output tokens are not billed. */
  modelRatio: number
  available: boolean
  contextTokens: number | null
  supportedDimensions: number[]
  defaultDimensions: number | null
  supportsImages: boolean | null
  releasedOn: string | null
}

const modelKinds: readonly string[] = Object.values(EMRANK_MODEL_KINDS)

/**
 * The catalogue is one unpaginated payload: `page`/`page_size` are accepted by
 * the console but every row still arrives in the first response (42 models on
 * 2026-10-16), so this adapter reads the whole list once.
 */
export async function fetchCatalogModels(
  request: ApiServiceRequest,
): Promise<EmRankCatalogModel[]> {
  const endpoint = `${EMRANK_ENDPOINTS.Catalog}?page=0`
  const body = await readEmRank(request, endpoint)
  if (!Array.isArray(body.data)) invalidEmRankResponse(endpoint)
  return body.data.map((value) => {
    if (
      !isRecord(value) ||
      typeof value.id !== "string" ||
      !value.id.trim() ||
      !modelKinds.includes(String(value.kind)) ||
      typeof value.owned_by !== "string" ||
      typeof value.available !== "boolean" ||
      (typeof value.modelratio !== "string" &&
        typeof value.modelratio !== "number") ||
      (typeof value.modelratio === "string" && !value.modelratio.trim()) ||
      (value.context_tokens !== null &&
        typeof value.context_tokens !== "number") ||
      !Array.isArray(value.supported_dimensions)
    )
      invalidEmRankResponse(endpoint)
    const ratio = Number(value.modelratio)
    if (!Number.isFinite(ratio) || ratio < 0) invalidEmRankResponse(endpoint)
    return {
      id: value.id.trim(),
      kind: value.kind as EmRankModelKind,
      ownedBy: value.owned_by,
      modelRatio: ratio,
      available: value.available,
      contextTokens:
        value.context_tokens === null ? null : value.context_tokens,
      defaultDimensions:
        typeof value.default_dimensions === "number" &&
        Number.isSafeInteger(value.default_dimensions) &&
        value.default_dimensions > 0
          ? value.default_dimensions
          : null,
      supportsImages:
        typeof value.supports_images === "boolean"
          ? value.supports_images
          : null,
      releasedOn:
        typeof value.released_on === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(value.released_on) &&
        Number.isFinite(Date.parse(value.released_on))
          ? value.released_on
          : null,
      supportedDimensions: value.supported_dimensions.flatMap(
        (dimension: unknown) =>
          typeof dimension === "number" &&
          Number.isSafeInteger(dimension) &&
          dimension > 0
            ? [dimension]
            : [],
      ),
    }
  })
}
