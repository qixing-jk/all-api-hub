import type { TempWindowResponseType } from "~/types/tempWindowFetch"
import {
  normalizeHeaderInit,
  type DispatchBoundRequestInit,
} from "~/utils/browser/requestInitMessage"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to content-side temp window fetch helpers.
 */
const logger = createLogger("TempFetchUtils")

/**
 * Normalizes fetch options coming from background scripts.
 * Ensures headers are sanitized and mutations do not affect original objects.
 * @param options Raw RequestInit payload.
 */
export function normalizeFetchOptions(
  options: DispatchBoundRequestInit = {},
): DispatchBoundRequestInit {
  const normalized = { ...options }

  if (options.headers) {
    normalized.headers = normalizeHeaderInit(options.headers)
  }

  // Message-cloned signals lose the native AbortSignal prototype.
  if (normalized.signal && !(normalized.signal instanceof AbortSignal)) {
    delete normalized.signal
  }

  return normalized
}

/**
 * Parses a fetch Response according to the requested responseType.
 * Falls back to text when JSON parsing fails to avoid throwing.
 */
export async function parseResponseData(
  response: Response,
  responseType: TempWindowResponseType,
) {
  switch (responseType) {
    case "text":
      return await response.text()
    case "arrayBuffer": {
      const buffer = await response.arrayBuffer()
      return Array.from(new Uint8Array(buffer))
    }
    case "blob": {
      const blob = await response.blob()
      const blobBuffer = await blob.arrayBuffer()
      return { data: Array.from(new Uint8Array(blobBuffer)), type: blob.type }
    }
    case "json":
    default: {
      const text = await response.text()
      try {
        return JSON.parse(text)
      } catch (error) {
        logger.warn("Failed to parse JSON response, fallback to text", error)
        return text
      }
    }
  }
}
