import { NANOGPT_API_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { NANOGPT_ENDPOINTS } from "~/services/apiService/nanogpt/constants"
import { decodeNanoGptResponseError } from "~/services/apiService/nanogpt/responseError"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { isRecord } from "~/utils/core/object"
import { t } from "~/utils/i18n/core"

const createInvalidCatalogResponseError = () =>
  new ApiError(
    "Invalid NanoGPT model catalog response",
    undefined,
    NANOGPT_ENDPOINTS.detailedModels,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

const finiteNonnegative = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined

const nonBlankString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

/**
 * Per-request rate overrides for requests that carry a video, e.g. Qwen omni
 * models. They are published in the same USD per-million-token scale.
 */
export type NanoGptVideoRequestRates = {
  input: number
  output: number
  cacheRead?: number
}

export type NanoGptPricing = {
  input: number
  output: number
  /**
   * `cacheReadInputPer1kTokens` / `cacheWriteInputPer1kTokens` are published per
   * 1k tokens even though the parent `unit` label says per million: for
   * `openai/gpt-4.1-nano` 0.000025 × 1000 = $0.025/M and for
   * `anthropic/claude-sonnet-4.5` 0.0003 × 1000 = $0.30/M, matching each
   * provider's published cached-input rate. Verified 2026-10-25 against
   * evidence/probe-16-models-detailed.json plus provider price sheets.
   */
  cacheRead?: number
  cacheWrite?: number
  /** Additional per-token rate when the request includes audio input. */
  audioInput?: number
  videoRequest?: NanoGptVideoRequestRates
}

export type NanoGptCatalogModel = {
  id: string
  displayName?: string
  description?: string
  /** Publishing provider reported by the platform (`owned_by`). */
  ownerBy?: string
  contextLength?: number
  maxOutputTokens?: number
  inputModalities?: string[]
  outputModalities?: string[]
  pricing?: NanoGptPricing
}

const THOUSANDS_PER_MILLION = 1000

/** Reads one catalog row; rows without an id are unusable and are dropped. */
function parseCatalogModel(value: unknown): NanoGptCatalogModel | null {
  if (!isRecord(value)) return null
  const id = nonBlankString(value.id)
  if (!id) return null

  const pricing = isRecord(value.pricing) ? value.pricing : undefined
  const input = pricing ? finiteNonnegative(pricing.prompt) : undefined
  const output = pricing ? finiteNonnegative(pricing.completion) : undefined
  const cacheRead1k = pricing
    ? finiteNonnegative(pricing.cacheReadInputPer1kTokens)
    : undefined
  const cacheWrite1k = pricing
    ? finiteNonnegative(pricing.cacheWriteInputPer1kTokens)
    : undefined
  const audioInput = pricing
    ? finiteNonnegative(pricing.audio_input)
    : undefined
  const video =
    pricing && isRecord(pricing.video_request)
      ? pricing.video_request
      : undefined
  const videoInput = video ? finiteNonnegative(video.prompt) : undefined
  const videoOutput = video ? finiteNonnegative(video.completion) : undefined
  const videoCacheRead = video
    ? finiteNonnegative(video.cached_prompt)
    : undefined

  const architecture = isRecord(value.architecture)
    ? value.architecture
    : undefined
  const readModalities = (field: unknown) => {
    if (!Array.isArray(field)) return undefined
    const values = field
      .map((entry) => nonBlankString(entry))
      .filter((entry): entry is string => !!entry)
    return values.length ? values : undefined
  }
  const displayName = nonBlankString(value.name)
  const description = nonBlankString(value.description)
  const ownerBy = nonBlankString(value.owned_by)
  const contextLength = finiteNonnegative(value.context_length)
  const maxOutputTokens = finiteNonnegative(value.max_output_tokens)
  const inputModalities = readModalities(architecture?.input_modalities)
  const outputModalities = readModalities(architecture?.output_modalities)

  return {
    id,
    ...(displayName ? { displayName } : {}),
    ...(description ? { description } : {}),
    ...(ownerBy ? { ownerBy } : {}),
    ...(contextLength === undefined ? {} : { contextLength }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    ...(inputModalities ? { inputModalities } : {}),
    ...(outputModalities ? { outputModalities } : {}),
    // A row without both primary rates (e.g. "varies_by_modality") keeps no
    // pricing so the presentation reports an unavailable price instead of zero.
    ...(input === undefined || output === undefined
      ? {}
      : {
          pricing: {
            input,
            output,
            ...(cacheRead1k === undefined
              ? {}
              : { cacheRead: cacheRead1k * THOUSANDS_PER_MILLION }),
            ...(cacheWrite1k === undefined
              ? {}
              : { cacheWrite: cacheWrite1k * THOUSANDS_PER_MILLION }),
            ...(audioInput === undefined ? {} : { audioInput }),
            ...(videoInput === undefined || videoOutput === undefined
              ? {}
              : {
                  videoRequest: {
                    input: videoInput,
                    output: videoOutput,
                    ...(videoCacheRead === undefined
                      ? {}
                      : { cacheRead: videoCacheRead }),
                  },
                }),
          },
        }),
  }
}

/**
 * Fetches the provider-wide detailed catalog without account credentials.
 * `detailed=true` adds per-model USD rates; the plain list has identifiers only.
 * https://docs.nano-gpt.com/api-reference/endpoint/models (verified 2026-10-25)
 */
export async function fetchNanoGptDetailedModelCatalog(
  abortSignal?: AbortSignal,
): Promise<NanoGptCatalogModel[]> {
  const response = await fetchApiResponse<unknown>(
    {
      directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
      baseUrl: NANOGPT_API_ORIGIN,
      auth: { authType: AuthTypeEnum.None },
      abortSignal,
    },
    {
      endpoint: NANOGPT_ENDPOINTS.detailedModels,
      options: { method: "GET", cache: "no-store" },
      currentTabTransport: "disabled",
      tempWindowFallback: { statusCodes: [], codes: [] },
    },
  )

  if (!response.ok) {
    const providerError = decodeNanoGptResponseError(response, {
      endpoint: NANOGPT_ENDPOINTS.detailedModels,
    })
    throw new ApiError(
      getErrorMessage(
        providerError?.message,
        t("messages:errors.api.requestFailed", { status: response.status }),
      ),
      response.status,
      NANOGPT_ENDPOINTS.detailedModels,
      response.status === 429
        ? API_ERROR_CODES.HTTP_429
        : API_ERROR_CODES.HTTP_OTHER,
      providerError?.upstreamCode,
    )
  }

  const body = response.body
  if (!isRecord(body) || body.object !== "list" || !Array.isArray(body.data)) {
    throw createInvalidCatalogResponseError()
  }

  const models: NanoGptCatalogModel[] = []
  const seen = new Set<string>()
  for (const raw of body.data) {
    const model = parseCatalogModel(raw)
    if (!model || seen.has(model.id)) continue
    seen.add(model.id)
    models.push(model)
  }
  if (models.length === 0) throw createInvalidCatalogResponseError()
  return models
}
