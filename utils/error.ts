/**
 * Normalize unknown error inputs into a human-readable string.
 * @param error Any thrown value, including primitives or Error-like objects.
 * @returns String representation safe for logging or user display.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === "string") {
    return error
  }

  if (error && typeof error === "object" && "message" in error) {
    return String(error.message)
  }

  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}
