import { relayContentLog } from "~/utils/browser/contentLogRelay"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("AccountDetection")
const MAX_SUMMARY_EVENTS = 16

export type AccountDetectionDiagnostics = {
  requestId: string
  record(event: string, details?: Record<string, unknown>): void
  finish(outcome: "success" | "failed", details?: Record<string, unknown>): void
}

/** Keeps one local trace across detection strategies and extension contexts. */
export function createAccountDetectionDiagnostics(
  options: {
    requestId?: string
    relayToBackground?: boolean
  } = {},
): AccountDetectionDiagnostics {
  const requestId = options.requestId || `account-detection-${safeRandomUUID()}`
  const startedAt = Date.now()
  const events: Record<string, unknown>[] = []
  let eventCount = 0

  /** Writes one local event and optionally relays it to the background console. */
  function emit(
    event: string,
    details: Record<string, unknown>,
    summary = false,
  ) {
    const entry = {
      ...details,
      requestId,
      timestampMs: Date.now(),
      elapsedMs: Date.now() - startedAt,
    }
    try {
      if (summary) logger.info("Account detection summary", entry)
      else logger.debug(event, entry)
    } catch {
      // Diagnostic sinks cannot change detection or fallback behavior.
    }
    if (options.relayToBackground) {
      relayContentLog(event, { ...entry, diagnosticScope: "account_detection" })
    }
  }

  return {
    requestId,
    record(event, details = {}) {
      eventCount += 1
      events.push({ ...details, event, elapsedMs: Date.now() - startedAt })
      if (events.length > MAX_SUMMARY_EVENTS) events.shift()
      emit(event, details)
    },
    finish(outcome, details = {}) {
      emit(
        "detection_finished",
        { ...details, outcome, eventCount, events: [...events] },
        true,
      )
    },
  }
}
