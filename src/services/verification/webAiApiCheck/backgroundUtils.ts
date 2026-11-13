import { createLogger } from "~/utils/core/logger"

export const logger = createLogger("WebAiApiCheck")

/** Validate optional custom headers consistently for webpage verification tools. */
export function hasValidRequestHeaders(headers: unknown): boolean {
  return (
    headers === undefined ||
    Boolean(
      headers &&
      typeof headers === "object" &&
      !Array.isArray(headers) &&
      Object.entries(headers).every(
        ([name, value]) =>
          typeof value === "string" &&
          Boolean(name.trim()) &&
          !/[\r\n]/.test(name + value),
      ),
    )
  )
}

/**
 * Creates the generic failure response used for unexpected handler errors.
 */
export function toGenericFailureResponse() {
  return { success: false as const, error: "Failed to handle request" }
}
