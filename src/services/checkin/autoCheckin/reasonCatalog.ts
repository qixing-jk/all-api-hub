import {
  AUTO_CHECKIN_SKIP_REASON,
  type AutoCheckinSkipReason,
} from "~/types/autoCheckin"

/**
 * What the product asks the user to do about one check-in outcome, if anything.
 *
 * This is the semantic dimension of a reason code, shared by three consumers:
 * the result buckets users filter by, the overview todo list, and the automatic
 * retry policy. Keeping one table for all three is what stops them from
 * disagreeing: `WAITING` is defined as the bucket "the retry queue or a later
 * run can resolve", so the retry policy is a projection of this table rather
 * than a second list that has to be kept in step by hand.
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
   * so the reason dimension still accounts for every row. Only results stored
   * before the reason code became mandatory can land here.
   */
  UNCLASSIFIED: "unclassified",
} as const

export type AutoCheckinSkipCategory =
  (typeof AUTO_CHECKIN_SKIP_CATEGORY)[keyof typeof AUTO_CHECKIN_SKIP_CATEGORY]

/**
 * The semantic category of every reason code, exhaustive by type: a new reason
 * code cannot compile until it declares what the product should do about it.
 *
 * Two rows were re-assigned when this table became the single source of truth.
 * `ACCOUNT_UNAVAILABLE` (the stored account or its credentials are missing) and
 * `EXECUTION_CONTEXT_INVALID` (a platform failure that already has a user-facing
 * remedy) were displayed as transient while the retry policy refused to retry
 * them; they are user work, so they belong to `ACTION_REQUIRED`. The reverse
 * mistake kept `MANUAL_VERIFICATION_REQUIRED` out of the retry policy while its
 * bucket said a person must act — now that the category is the decision, it is
 * no longer retried in the background.
 */
export const CHECKIN_SKIP_REASON_CATEGORIES: Record<
  AutoCheckinSkipReason,
  AutoCheckinSkipCategory
> = {
  [AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DATA_MISSING]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
  [AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACCOUNT_DISABLED,
  [AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
  [AUTO_CHECKIN_SKIP_REASON.ACCOUNT_STATE_WRITE_FAILED]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
  [AUTO_CHECKIN_SKIP_REASON.ALREADY_CHECKED_TODAY]:
    AUTO_CHECKIN_SKIP_CATEGORY.EXPECTED,
  [AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
  [AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED]:
    AUTO_CHECKIN_SKIP_CATEGORY.DISABLED,
  [AUTO_CHECKIN_SKIP_REASON.CHECKIN_PAGE_UNAVAILABLE]:
    AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
  [AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED]:
    AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
  [AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
  [AUTO_CHECKIN_SKIP_REASON.DETECTION_DISABLED]:
    AUTO_CHECKIN_SKIP_CATEGORY.DISABLED,
  [AUTO_CHECKIN_SKIP_REASON.EXECUTION_CONTEXT_INVALID]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
  [AUTO_CHECKIN_SKIP_REASON.LOGIN_PROVIDER_IN_USE]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
  [AUTO_CHECKIN_SKIP_REASON.LOGIN_PROVIDER_REQUIRED]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
  [AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
  [AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED]:
    AUTO_CHECKIN_SKIP_CATEGORY.DISABLED,
  [AUTO_CHECKIN_SKIP_REASON.METHOD_NOT_MATCHED]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
  [AUTO_CHECKIN_SKIP_REASON.METHOD_UNAVAILABLE]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
  [AUTO_CHECKIN_SKIP_REASON.METHOD_UNSUPPORTED]:
    AUTO_CHECKIN_SKIP_CATEGORY.UNSUPPORTED,
  [AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR]: AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
  [AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER]:
    AUTO_CHECKIN_SKIP_CATEGORY.UNSUPPORTED,
  [AUTO_CHECKIN_SKIP_REASON.NO_SELECTED_METHOD]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
  [AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED]:
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
  [AUTO_CHECKIN_SKIP_REASON.SESSION_BUSY]: AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
  [AUTO_CHECKIN_SKIP_REASON.SOURCE_UNAVAILABLE]:
    AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
  [AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE]:
    AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
  [AUTO_CHECKIN_SKIP_REASON.TIMEOUT]: AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
  [AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR]: AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
  [AUTO_CHECKIN_SKIP_REASON.UPSTREAM_REJECTED]:
    AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
}

/**
 * Resolves the semantic category of a persisted skip reason. Unknown or missing
 * codes stay uncategorized so callers never invent an actionable todo for data
 * they cannot interpret.
 */
export function getCheckinSkipReasonCategory(
  reasonCode: string | null | undefined,
): AutoCheckinSkipCategory | null {
  if (!reasonCode) return null

  return (
    CHECKIN_SKIP_REASON_CATEGORIES[reasonCode as AutoCheckinSkipReason] ?? null
  )
}
