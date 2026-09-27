import { Star, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button, Card } from "~/components/ui"

export const STAR_PROMOTION_CARD_TEST_IDS = {
  card: "star-promotion-card",
  close: "star-promotion-close",
  star: "star-promotion-star",
  alreadyStarred: "star-promotion-already-starred",
  later: "star-promotion-later",
} as const

interface StarPromotionCardViewProps {
  /**
   * Localized title. Callers resolve the shared copy through
   * `useStarPromotionCardLabels`; keeping it a prop lets previews and tests
   * supply their own.
   */
  title: string
  /** Localized body copy. */
  description: string
  /** Localized primary star action label. */
  starLabel: string
  /** Localized self-report action label. */
  alreadyStarredLabel: string
  /** Localized "not now" label for the secondary dismissal button. */
  deferLabel: string
  /**
   * Localized accessible name for the close control. Kept distinct from
   * `deferLabel` because both controls dismiss the card; screen readers must be
   * able to tell them apart.
   */
  closeLabel: string
  /**
   * Heading element id used by `aria-labelledby`. Callers rendering more than
   * one card must pass unique values so the accessible names stay distinct.
   */
  headingId?: string
  onStar: () => void
  onAlreadyStarred: () => void
  onDefer: () => void
}

/** Localized copy the card renders, supplied by the caller as props. */
type StarPromotionCardLabels = Pick<
  StarPromotionCardViewProps,
  | "title"
  | "description"
  | "starLabel"
  | "alreadyStarredLabel"
  | "deferLabel"
  | "closeLabel"
>

/**
 * Resolves the card copy, so the live card and the dev preview cannot drift
 * apart and every label key is listed in one place.
 */
export function useStarPromotionCardLabels(): StarPromotionCardLabels {
  const { t } = useTranslation("ui")

  return {
    title: t("starPromotion.cardTitle"),
    description: t("starPromotion.cardDescription"),
    starLabel: t("starPromotion.actions.star"),
    alreadyStarredLabel: t("starPromotion.actions.alreadyStarred"),
    deferLabel: t("starPromotion.actions.later"),
    closeLabel: t("starPromotion.actions.defer"),
  }
}

/**
 * Presentational form of the persistent star promotion card.
 *
 * Both dismissal affordances (the close control and the "not now" button) are
 * non-terminal deferrals, matching the contract in
 * `~/services/starPromotion/contracts`. Rendering is split from the container
 * so dev previews can show every state without touching stored promotion state.
 */
export function StarPromotionCardView({
  title,
  description,
  starLabel,
  alreadyStarredLabel,
  deferLabel,
  closeLabel,
  headingId = "star-promotion-heading",
  onStar,
  onAlreadyStarred,
  onDefer,
}: StarPromotionCardViewProps) {
  return (
    <Card
      className="border-theme-200/80 dark:border-theme-900/60"
      variant="elevated"
      data-testid={STAR_PROMOTION_CARD_TEST_IDS.card}
      role="complementary"
      aria-labelledby={headingId}
    >
      <div className="gap-y-density-3 p-density-4 flex flex-col">
        <div className="gap-x-density-2 flex items-start justify-between">
          <div className="gap-x-density-2 flex items-center">
            <Star className="text-theme-600 dark:text-theme-400 h-4 w-4 fill-current" />
            <h3 id={headingId} className="text-base font-semibold">
              {title}
            </h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={onDefer}
            aria-label={closeLabel}
            data-testid={STAR_PROMOTION_CARD_TEST_IDS.close}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <p className="text-muted-foreground text-sm leading-5">{description}</p>

        <div className="gap-x-density-2 gap-y-density-2 flex flex-wrap items-center">
          <Button
            type="button"
            size="sm"
            onClick={onStar}
            leftIcon={<Star className="h-3.5 w-3.5" />}
            className="gap-x-density-1-5"
            data-testid={STAR_PROMOTION_CARD_TEST_IDS.star}
          >
            {starLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onAlreadyStarred}
            data-testid={STAR_PROMOTION_CARD_TEST_IDS.alreadyStarred}
          >
            {alreadyStarredLabel}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onDefer}
            data-testid={STAR_PROMOTION_CARD_TEST_IDS.later}
          >
            {deferLabel}
          </Button>
        </div>
      </div>
    </Card>
  )
}
