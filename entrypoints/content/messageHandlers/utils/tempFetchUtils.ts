export type TempWindowResponseType = "json" | "text" | "arrayBuffer" | "blob"

/**
 * Normalizes fetch options coming from background scripts.
 * Ensures headers are sanitized and mutations do not affect original objects.
 * @param options Raw RequestInit payload.
 */
export function normalizeFetchOptions(options: RequestInit = {}): RequestInit {
  const normalized: RequestInit = { ...options }

  if (options.headers) {
    normalized.headers = sanitizeHeaders(options.headers)
  }

  return normalized
}

/**
 * Converts various header inputs to a plain object accepted by fetch.
 * @param headers Headers instance, tuple array, or object.
 * @returns Plain key/value header map.
 */
export function sanitizeHeaders(headers: HeadersInit): Record<string, string> {
  if (headers instanceof Headers) {
    const result: Record<string, string> = {}
    headers.forEach((value, key) => {
      result[key] = value
    })
    return result
  }

  if (Array.isArray(headers)) {
    return headers.reduce(
      (acc, [key, value]) => {
        acc[key] = value
        return acc
      },
      {} as Record<string, string>,
    )
  }

  return Object.entries(headers).reduce(
    (acc, [key, value]) => {
      if (value != null) {
        acc[key] = String(value)
      }
      return acc
    },
    {} as Record<string, string>,
  )
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
        console.warn(
          "[Content] Failed to parse JSON response, fallback to text",
          error,
        )
        return text
      }
    }
  }
}
