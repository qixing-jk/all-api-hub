import { APICallError, StreamProviderError } from "ai"

import { runProbeGeneration } from "~/services/verification/aiApiVerification/probes/probeGeneration"
import { createModel } from "~/services/verification/aiApiVerification/providers"
import type { ApiVerificationMode } from "~/services/verification/aiApiVerification/types"
import { isRecord } from "~/utils/core/object"

/** Read the supported SSE error envelopes without interpreting provider codes. */
function streamErrorDetails(value: unknown) {
  if (!isRecord(value)) return undefined
  if (isRecord(value.error)) return value.error
  if (
    value.type === "response.failed" &&
    isRecord(value.response) &&
    isRecord(value.response.error)
  )
    return value.response.error
  if (value.type === "error") return value
  return undefined
}

/** Preserve request-local error evidence for capacity and retrieval measurements. */
export async function runContextGeneration(
  connection: Parameters<typeof createModel>[0],
  options: {
    prompt: string
    maxOutputTokens: number
    abortSignal: AbortSignal
  },
  mode?: ApiVerificationMode,
) {
  let rawChunk: unknown
  let acceptedEventStream = false
  try {
    return await runProbeGeneration(
      {
        ...options,
        model: createModel({
          ...connection,
          onResponse: (response) => {
            connection.onResponse?.(response)
            acceptedEventStream =
              response.ok &&
              response.headers
                .get("content-type")
                ?.split(";", 1)[0]
                ?.trim()
                .toLowerCase() === "text/event-stream"
          },
        }),
        maxRetries: 0,
        include: { rawChunks: true },
        onChunk: ({ chunk }) => {
          if (chunk.type === "raw" && streamErrorDetails(chunk.rawValue))
            rawChunk = chunk.rawValue
        },
      },
      mode,
    )
  } catch (error) {
    const streamed = StreamProviderError.isInstance(error)
    if (!streamed && !APICallError.isInstance(error)) throw error
    const data =
      streamed && streamErrorDetails(rawChunk)?.message === error.message
        ? rawChunk
        : error.data
    let statusCode = error.statusCode
    // Native Responses infers 500 for unrecognized SSE codes. Only an
    // observed successful event-stream response proves it was not HTTP 500.
    if (
      connection.apiType === "openai" &&
      acceptedEventStream &&
      statusCode === 500
    ) {
      const details = streamErrorDetails(data)
      if (details) {
        statusCode = [
          details.statusCode,
          details.status_code,
          details.status,
          details.code,
        ]
          .map((value) =>
            typeof value === "string" && /^\d{3}$/.test(value)
              ? Number(value)
              : value,
          )
          .find(
            (value): value is number =>
              typeof value === "number" &&
              Number.isInteger(value) &&
              value >= 400 &&
              value <= 599,
          )
      }
    }
    if (data !== error.data || statusCode !== error.statusCode)
      throw new StreamProviderError({
        message: error.message,
        code: streamed ? error.code : undefined,
        type: streamed ? error.type : undefined,
        statusCode,
        isRetryable: error.isRetryable,
        data,
        cause: error,
      })
    throw error
  }
}
