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
    <div className="dark:border-dark-bg-tertiary mt-5 border-t border-gray-200 pt-4 sm:mt-6 sm:pt-5">
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
