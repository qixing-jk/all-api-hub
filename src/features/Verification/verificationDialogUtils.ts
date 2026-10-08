/** Detects user-initiated cancellation across DOM and service-layer aborts. */
export function isVerificationAbortError(
  error: unknown,
  abortSignal?: AbortSignal,
) {
  return (
    abortSignal?.aborted ||
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  )
}

/** Keeps optional redaction values type-safe before sanitizing diagnostics. */
export function filterVerificationRedactions(
  values: Array<string | undefined>,
): string[] {
  return values.filter((value): value is string => Boolean(value))
}
