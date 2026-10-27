import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { AuthTypeEnum } from "~/types"
import { isRecord } from "~/utils/core/object"

/**
 * Public, unauthenticated model catalog of the Novita OpenAI-compatible
 * mount. Verified live on 2026-10-25: `GET https://api.novita.ai/openai/v1/models`
 * answers with OpenAI-style `data` rows extended with Novita pricing fields.
 */

export type NovitaPublicModel = {
  readonly id: string
  readonly created: number
  readonly display_name?: string
  readonly description?: string
  readonly context_size?: number
  readonly max_output_tokens?: number
  readonly endpoints?: readonly string[]
  readonly input_modalities?: readonly string[]
  readonly output_modalities?: readonly string[]
  readonly pricing?: Readonly<Record<string, unknown>>
  readonly [key: string]: unknown
}

const invalidCatalogResponse = (): ApiError =>
  new ApiError(
    "Invalid Novita model catalog response",
    undefined,
    "/openai/v1/models",
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

/** Parses and validates the public catalog page. */
function parseNovitaPublicModelCatalog(body: unknown): NovitaPublicModel[] {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw invalidCatalogResponse()
  }
  return body.data.map((raw): NovitaPublicModel => {
    if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id.trim()) {
      throw invalidCatalogResponse()
    }
    return raw as NovitaPublicModel
  })
}

/** Fetches the provider-wide model catalog; it needs no credential. */
export async function fetchNovitaPublicModelCatalog(
  abortSignal?: AbortSignal,
): Promise<NovitaPublicModel[]> {
  const response = await fetchApiResponse<unknown>(
    {
      baseUrl: "https://api.novita.ai",
      auth: { authType: AuthTypeEnum.None },
      abortSignal,
    },
    {
      endpoint: "/openai/v1/models",
      options: { method: "GET", cache: "no-store" },
      currentTabTransport: "disabled",
    },
  )
  if (!response.ok) {
    throw new ApiError(
      `Novita model catalog request failed: ${response.status}`,
      response.status,
      "/openai/v1/models",
      response.status === 429
        ? API_ERROR_CODES.HTTP_429
        : API_ERROR_CODES.HTTP_OTHER,
    )
  }
  return parseNovitaPublicModelCatalog(response.body)
}
