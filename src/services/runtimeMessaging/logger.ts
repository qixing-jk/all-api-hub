import type { Logger } from "~/services/runtimeMessaging/extensionMessaging"
import { createLogger } from "~/utils/core/logger"

/**
 * Converts third-party logger input into this project's string-first log API.
 */
function toLogMessage(value: unknown): string {
  return typeof value === "string" ? value : String(value)
}

/**
 * Preserves structured logger input while keeping the message argument textual.
 */
function toLogDetails(message: unknown, details: unknown[]): unknown {
  if (typeof message === "string") {
    return details.length ? details : undefined
  }

  return details.length ? [message, ...details] : message
}

/**
 * Creates a logger adapter compatible with `@webext-core/messaging`.
 */
export function createRuntimeMessagingLogger(scope: string): Logger {
  const logger = createLogger(scope)

  return {
    debug: (message: unknown, ...details: unknown[]) => {
      logger.debug(toLogMessage(message), toLogDetails(message, details))
    },
    log: (message: unknown, ...details: unknown[]) => {
      logger.info(toLogMessage(message), toLogDetails(message, details))
    },
    warn: (message: unknown, ...details: unknown[]) => {
      logger.warn(toLogMessage(message), toLogDetails(message, details))
    },
    error: (message: unknown, ...details: unknown[]) => {
      logger.error(toLogMessage(message), toLogDetails(message, details))
    },
  }
}
