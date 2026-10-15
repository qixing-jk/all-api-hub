import { SPONSOR_RECOMMENDATION_SURFACES } from "~/features/AccountManagement/sponsors/constants"
import { PopupSponsorRecommendationsSection } from "~/features/AccountManagement/sponsors/PopupSponsorRecommendationsSection"

export const NewcomerSponsorRecommendationsSection = ({
  className,
}: {
  className?: string
} = {}) => (
  <PopupSponsorRecommendationsSection
    surface={SPONSOR_RECOMMENDATION_SURFACES.Newcomer}
    className={className}
  />
)
