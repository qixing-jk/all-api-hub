export {
  isInvalidAccessTokenMessage,
  isNoTabWithIdMessage,
} from "~/utils/autoCheckin"

/**
 * Format a timestamp (ms since epoch) into a user-friendly string.
 */
export function formatTimestamp(timestamp?: number): string {
  if (timestamp == null) return "-"
  try {
    return new Date(timestamp).toLocaleString()
  } catch {
    return "-"
  }
}
