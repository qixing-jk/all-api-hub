import { formatLocaleDateTime } from "~/utils/core/formatters"

interface AccountTableIdentity {
  accountId: string
  accountName: string
}

/** Sort account labels naturally, using the stable account id as a tie-breaker. */
export function compareAccountTableIdentity(
  left: AccountTableIdentity,
  right: AccountTableIdentity,
): number {
  return (
    left.accountName.localeCompare(right.accountName, undefined, {
      numeric: true,
      sensitivity: "base",
    }) || left.accountId.localeCompare(right.accountId)
  )
}

/**
 * Format a timestamp (seconds/ms since epoch) into a user-friendly string.
 */
export function formatTimestamp(timestamp?: number): string {
  return formatLocaleDateTime(timestamp, "-")
}
