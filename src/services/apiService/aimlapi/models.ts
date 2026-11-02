import { AIMLAPI_ENDPOINTS } from "~/services/apiService/aimlapi/constants"
import {
  fetchAimlApiJson,
  invalidAimlApiResponse,
} from "~/services/apiService/aimlapi/transport"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { normalizeModelDescriptors } from "~/services/models/modelDescriptor"
import { isRecord } from "~/utils/core/object"

/**
 * One public catalogue row. The deployment returns `info` for every row but
 * only some rows carry `contextLength`/`outputMax`, so those stay optional.
 */
export type AimlApiPublicModel = {
  id: string
  info: {
    name: string
    developer: string
    description?: string
    contextLength?: number
    outputMax?: number
    releasedAt?: string
    url?: string
    docsUrl?: string
  }
  type: string
  aliases: readonly string[]
  tags: readonly string[]
  pricing?: unknown
}

/** Parses one row, rejecting a payload that is not the documented catalogue. */
function parseAimlApiPublicModel(
  value: unknown,
  endpoint: string,
): AimlApiPublicModel {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim())
    invalidAimlApiResponse(endpoint)
  const info = value.info
  if (
    !isRecord(info) ||
    typeof info.name !== "string" ||
    typeof info.developer !== "string"
  )
    invalidAimlApiResponse(endpoint)

  const optionalString = (candidate: unknown) =>
    typeof candidate === "string" ? candidate : undefined
  const optionalCount = (candidate: unknown) =>
    typeof candidate === "number" &&
    Number.isSafeInteger(candidate) &&
    candidate >= 0
      ? candidate
      : undefined
  const stringList = (candidate: unknown) =>
    Array.isArray(candidate)
      ? candidate.filter((item): item is string => typeof item === "string")
      : []

  return {
    id: value.id.trim(),
    info: {
      name: info.name,
      developer: info.developer,
      description: optionalString(info.description),
      contextLength: optionalCount(info.contextLength),
      outputMax: optionalCount(info.outputMax),
      releasedAt: optionalString(info.releasedAt),
      url: optionalString(info.url),
      docsUrl: optionalString(info.docsUrl),
    },
    type: typeof value.type === "string" ? value.type : "",
    aliases: stringList(value.aliases),
    tags: stringList(value.tags),
    ...(Object.hasOwn(value, "pricing") ? { pricing: value.pricing } : {}),
  }
}

/** Reads the public, provider-wide catalogue. No credential is required. */
export async function fetchAimlApiModelCatalog(
  request: ApiServiceRequest,
  options: { includePricing?: boolean } = {},
): Promise<AimlApiPublicModel[]> {
  const endpoint = `${AIMLAPI_ENDPOINTS.Models}${options.includePricing ? "?include=pricing" : ""}`
  const body = await fetchAimlApiJson<unknown>(request, endpoint, {
    anonymous: true,
  })
  if (!isRecord(body) || !Array.isArray(body.data))
    invalidAimlApiResponse(endpoint)
  return body.data.map((value) => parseAimlApiPublicModel(value, endpoint))
}

/** Projects the catalogue into the shared descriptor shape. */
export async function fetchAimlApiModels(request: ApiServiceRequest) {
  const models = await fetchAimlApiModelCatalog(request)
  return normalizeModelDescriptors(
    models.map((model) => ({
      id: model.id,
      ...(model.info.developer
        ? {
            vendorEvidence: {
              kind: "publisher" as const,
              name: model.info.developer,
            },
          }
        : {}),
    })),
  )
}
