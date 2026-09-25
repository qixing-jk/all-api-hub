import {
  AUTO_CHECKIN_SKIP_REASON,
  AUTO_CHECKIN_SKIP_REASONS,
  type AutoCheckinSkipReason,
} from "~/types/autoCheckin"

/**
 * Semantic buckets shared by the execution results, readiness table, and the
 * overview todo list. Reasons stay persisted as-is; only their presentation
 * category is derived here.
 */
export const AUTO_CHECKIN_SKIP_CATEGORY = {
  /** The user has to fix something (sign in again, re-detect, grant access). */
  ACTION_REQUIRED: "action_required",
  /** Transient failures that the retry queue or a later run can resolve. */
  WAITING: "waiting",
  /** The account itself is turned off, which is a user decision. */
  ACCOUNT_DISABLED: "account_disabled",
  /** Skipped because detection or the selected method is turned off. */
  DISABLED: "disabled",
  /** The site type has no check-in provider for this method. */
  UNSUPPORTED: "unsupported",
  /** Routine skips that need no follow-up, e.g. already checked in today. */
  EXPECTED: "expected",
  /**
   * Reason-carrying statuses whose persisted result has no known reason code,
   * so the reason dimension still accounts for every row.
   */
  UNCLASSIFIED: "unclassified",
} as const

export type AutoCheckinSkipCategory =
  (typeof AUTO_CHECKIN_SKIP_CATEGORY)[keyof typeof AUTO_CHECKIN_SKIP_CATEGORY]

/** Preferred display order: most actionable first. */
export const AUTO_CHECKIN_SKIP_CATEGORIES = [
  AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
  AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
  AUTO_CHECKIN_SKIP_CATEGORY.ACCOUNT_DISABLED,
  AUTO_CHECKIN_SKIP_CATEGORY.DISABLED,
  AUTO_CHECKIN_SKIP_CATEGORY.UNSUPPORTED,
  AUTO_CHECKIN_SKIP_CATEGORY.EXPECTED,
  AUTO_CHECKIN_SKIP_CATEGORY.UNCLASSIFIED,
] as const satisfies readonly AutoCheckinSkipCategory[]

const SKIP_REASON_CATEGORIES = {
  [AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACCOUNT_DISABLED,
  [AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED]:
    AUTO_CHECKIN_SKIP_CATEGORY.DISABLED,
  [AUTO_CHECKIN_SKIP_REASON.DETECTION_DISABLED]:
    AUTO_CHECKIN_SKIP_CATEGORY.DISABLED,
  [AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED]:
    AUTO_CHECKIN_SKIP_CATEGORY.DISABLED,
  [AUTO_CHECKIN_SKIP_REASON.ALREADY_CHECKED_TODAY]:
    AUTO_CHECKIN_SKIP_CATEGORY.EXPECTED,
  [AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER]:
    AUTO_CHECKIN_SKIP_CATEGORY.UNSUPPORTED,
  [AUTO_CHECKIN_SKIP_REASON.METHOD_UNSUPPORTED]:
    AUTO_CHECKIN_SKIP_CATEGORY.UNSUPPORTED,
  [AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR]: AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
  [AUTO_CHECKIN_SKIP_REASON.SOURCE_UNAVAILABLE]:
    AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
  [AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE]:
    AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
  [AUTO_CHECKIN_SKIP_REASON.TIMEOUT]: AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
  [AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE]:
    AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
  [AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED]:
    AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
  [AUTO_CHECKIN_SKIP_REASON.CHECKIN_PAGE_UNAVAILABLE]:
    AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
  [AUTO_CHECKIN_SKIP_REASON.EXECUTION_CONTEXT_INVALID]:
    AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
  [AUTO_CHECKIN_SKIP_REASON.SESSION_BUSY]: AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
  [AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR]: AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
  [AUTO_CHECKIN_SKIP_REASON.UPSTREAM_REJECTED]:
    AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
  [AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DATA_MISSING]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
  [AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
  [AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
  [AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
  [AUTO_CHECKIN_SKIP_REASON.METHOD_NOT_MATCHED]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
  [AUTO_CHECKIN_SKIP_REASON.METHOD_UNAVAILABLE]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
  [AUTO_CHECKIN_SKIP_REASON.NO_SELECTED_METHOD]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
  [AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
  // Another account owns this browser login context, so the user has to pick
  // the other login method or change it on the owning account.
  [AUTO_CHECKIN_SKIP_REASON.LOGIN_PROVIDER_IN_USE]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
} as const satisfies Record<AutoCheckinSkipReason, AutoCheckinSkipCategory>

/**
 * Concrete reason codes per category, in persistence order. Filters and
 * summaries derive their subtype entries from this map, so a new reason only
 * needs a category assignment to show up everywhere.
 */
export const AUTO_CHECKIN_SKIP_CATEGORY_REASONS: Record<
  AutoCheckinSkipCategory,
  readonly AutoCheckinSkipReason[]
> = AUTO_CHECKIN_SKIP_CATEGORIES.reduce(
  (groups, category) => {
    groups[category] = AUTO_CHECKIN_SKIP_REASONS.filter(
      (reason) => SKIP_REASON_CATEGORIES[reason] === category,
    )
    return groups
  },
  {} as Record<AutoCheckinSkipCategory, readonly AutoCheckinSkipReason[]>,
)

/**
 * Resolves the semantic category of a persisted skip reason. Unknown or
 * missing codes stay uncategorized so callers never invent an actionable todo
 * for legacy data.
 */
export function getAutoCheckinSkipCategory(
  reasonCode: string | null | undefined,
): AutoCheckinSkipCategory | null {
  if (!reasonCode) return null

  return SKIP_REASON_CATEGORIES[reasonCode as AutoCheckinSkipReason] ?? null
}

/** Returns whether the skip reason needs an explicit user step. */
export function isAutoCheckinSkipReasonActionable(
  reasonCode: string | null | undefined,
): reasonCode is AutoCheckinSkipReason {
  return (
    getAutoCheckinSkipCategory(reasonCode) ===
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED
  )
}
