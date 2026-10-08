import {
  AUTO_CHECKIN_SKIP_CATEGORY,
  CHECKIN_SKIP_REASON_CATEGORIES,
  getCheckinSkipReasonCategory,
  type AutoCheckinSkipCategory,
} from "~/services/checkin/autoCheckin/reasonCatalog"
import {
  AUTO_CHECKIN_SKIP_REASONS,
  type AutoCheckinSkipReason,
} from "~/types/autoCheckin"

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
      (reason) => CHECKIN_SKIP_REASON_CATEGORIES[reason] === category,
    )
    return groups
  },
  {} as Record<AutoCheckinSkipCategory, readonly AutoCheckinSkipReason[]>,
)

/** Returns whether the skip reason needs an explicit user step. */
export function isAutoCheckinSkipReasonActionable(
  reasonCode: string | null | undefined,
): reasonCode is AutoCheckinSkipReason {
  return (
    getCheckinSkipReasonCategory(reasonCode) ===
    AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED
  )
}
