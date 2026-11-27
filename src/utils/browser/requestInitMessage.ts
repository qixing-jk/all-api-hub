export type DispatchBoundRequestInit = RequestInit & {
  /** Absolute deadline carried through extension messaging alongside RequestInit. */
  dispatchDeadlineAt?: number
}

/** Check after acquiring transport, before marking a fetch dispatched. */
export function assertFetchDispatchDeadline(
  options?: DispatchBoundRequestInit,
) {
  const deadline = options?.dispatchDeadlineAt
  if (
    deadline !== undefined &&
    (!Number.isFinite(deadline) || Date.now() >= deadline)
  ) {
    throw new DOMException("Request expired before dispatch", "TimeoutError")
  }
}

/**
 * Converts supported header inputs into a structured-clone-safe object.
 */
export function normalizeHeaderInit(
  headers: HeadersInit | undefined,
): Record<string, string> {
  if (!headers) return {}

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
 * Builds a message-safe RequestInit copy for extension message payloads.
 * AbortSignal cannot reliably cross extension message boundaries; true
 * cross-context cancellation must use a separate request-id cancel protocol.
 */
export function normalizeRequestInitForMessage(
  options: RequestInit,
): RequestInit {
  const normalizedOptions: RequestInit = { ...options }

  delete normalizedOptions.signal

  if (options.headers) {
    normalizedOptions.headers = normalizeHeaderInit(options.headers)
  }

  return normalizedOptions
}
