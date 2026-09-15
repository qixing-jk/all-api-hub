import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"
import { SPONSOR_RECOMMENDATION_SURFACES } from "~/features/AccountManagement/sponsors/constants"
import { SponsorRecommendationsSection } from "~/features/AccountManagement/sponsors/SponsorRecommendationsSection"
import { useSponsorRecommendations } from "~/features/AccountManagement/sponsors/useSponsorRecommendations"
import {
  openApiCredentialProfilesPage,
  openFullBookmarkManagerPage,
} from "~/utils/navigation"

export const NewcomerSponsorRecommendationsSection = () => {
  const { openAddAccount } = useDialogStateContext()
  const sponsorRecommendations = useSponsorRecommendations({
    surface: SPONSOR_RECOMMENDATION_SURFACES.Newcomer,
  })

  if (sponsorRecommendations.items.length === 0) {
    return null
  }

  return (
    <div className="border-border mt-density-5 pt-density-4 sm:mt-density-6 sm:pt-density-5 border-t">
      <SponsorRecommendationsSection
        surface={SPONSOR_RECOMMENDATION_SURFACES.Newcomer}
        items={sponsorRecommendations.items}
        onContinueAddAccount={openAddAccount}
        onOpenBookmarkManager={(prefill) => {
          void openFullBookmarkManagerPage({ create: prefill })
        }}
        onOpenApiCredentialProfiles={(prefill) => {
          void openApiCredentialProfilesPage({ create: prefill })
        }}
      />
    </div>
  )
}
