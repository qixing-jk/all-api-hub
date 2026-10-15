import { SPONSOR_RECOMMENDATION_SURFACES } from "~/features/AccountManagement/sponsors/constants"
import { PopupSponsorRecommendationsSection } from "~/features/AccountManagement/sponsors/PopupSponsorRecommendationsSection"
import type { SponsorBookmarkFallbackPrefill } from "~/features/AccountManagement/sponsors/types"

interface BookmarkSponsorRecommendationsSectionProps {
  onOpenBookmarkManager?: (prefill: SponsorBookmarkFallbackPrefill) => void
  className?: string
}

export const BookmarkSponsorRecommendationsSection = ({
  onOpenBookmarkManager,
  className,
}: BookmarkSponsorRecommendationsSectionProps) => (
  <PopupSponsorRecommendationsSection
    surface={SPONSOR_RECOMMENDATION_SURFACES.PopupBookmarks}
    onOpenBookmarkManager={onOpenBookmarkManager}
    className={className}
  />
)
