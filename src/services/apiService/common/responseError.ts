import { readSafeUpstreamCode } from "~/services/apiTransport/responseError"
import type {
  ApiResponseErrorDecoder,
  ApiTransportResponse,
  DecodedApiResponseError,
} from "~/services/apiTransport/type"

type MessageEnvelopeDecoderOptions = {
  isBusinessEnvelope(body: Record<string, unknown>): boolean
  captureBusinessCode?: boolean
  standaloneHttpMessage?: boolean
  nestedError?: {
    type: string
    kind: DecodedApiResponseError["kind"]
    captureCode?: boolean
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const readMessage = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined

/** Decodes a provider-selected message envelope without applying disclosure policy. */
function decodeMessageEnvelopeResponseError(
  response: ApiTransportResponse<unknown>,
  options: MessageEnvelopeDecoderOptions,
): DecodedApiResponseError | null {
  if (!isRecord(response.body)) return null

  const body = response.body
  const message = readMessage(body.message)
  if (options.isBusinessEnvelope(body)) {
    const upstreamCode = options.captureBusinessCode
      ? readSafeUpstreamCode(body.code)
      : undefined
    return {
      kind: "business",
      ...(message ? { message } : {}),
      ...(upstreamCode ? { upstreamCode } : {}),
    }
  }
  if (options.standaloneHttpMessage && message) {
    return { kind: "http", message }
  }

  if (!options.nestedError || !isRecord(body.error)) return null
  const error = body.error
  if (readMessage(error.type) !== options.nestedError.type) return null

  const nestedMessage = readMessage(error.message)
  const nestedUpstreamCode = options.nestedError.captureCode
    ? readSafeUpstreamCode(error.code)
    : undefined
  return {
    kind: options.nestedError.kind,
    ...(nestedMessage ? { message: nestedMessage } : {}),
    ...(nestedUpstreamCode ? { upstreamCode: nestedUpstreamCode } : {}),
  }
}

/** Creates one provider-owned decoder from its declared envelope semantics. */
export const createMessageEnvelopeResponseErrorDecoder =
  (options: MessageEnvelopeDecoderOptions): ApiResponseErrorDecoder =>
  (response) =>
    decodeMessageEnvelopeResponseError(response, options)
