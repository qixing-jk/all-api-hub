import { formatLocaleDateTime } from "~/utils/core/formatters"

export {
  isInvalidAccessTokenMessage,
  isNoTabWithIdMessage,
} from "~/features/AutoCheckin/utils/autoCheckin"

/**
 * Format a timestamp (seconds/ms since epoch) into a user-friendly string.
 */
export function formatTimestamp(timestamp?: number): string {
  return formatLocaleDateTime(timestamp, "-")
}
