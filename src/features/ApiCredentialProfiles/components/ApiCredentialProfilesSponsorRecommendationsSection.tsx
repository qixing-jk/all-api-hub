import { SPONSOR_RECOMMENDATION_SURFACES } from "~/features/AccountManagement/sponsors/constants"
import { PopupSponsorRecommendationsSection } from "~/features/AccountManagement/sponsors/PopupSponsorRecommendationsSection"
import type { SponsorApiCredentialFallbackPrefill } from "~/features/AccountManagement/sponsors/types"

interface ApiCredentialProfilesSponsorRecommendationsSectionProps {
  onOpenApiCredentialProfiles?: (
    prefill: SponsorApiCredentialFallbackPrefill,
  ) => void
  className?: string
}

export const ApiCredentialProfilesSponsorRecommendationsSection = ({
  onOpenApiCredentialProfiles,
  className,
}: ApiCredentialProfilesSponsorRecommendationsSectionProps) => (
  <PopupSponsorRecommendationsSection
    surface={SPONSOR_RECOMMENDATION_SURFACES.PopupApiCredentialProfiles}
    onOpenApiCredentialProfiles={onOpenApiCredentialProfiles}
    className={className}
  />
)
