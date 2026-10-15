import { useContext } from "react"

import { DialogStateContext } from "~/features/AccountManagement/dialogs/useDialogStateContext"
import type { SponsorRecommendationSurface } from "~/features/AccountManagement/sponsors/constants"
import { SponsorRecommendationsSection } from "~/features/AccountManagement/sponsors/SponsorRecommendationsSection"
import type {
  AddAccountPrefill,
  SponsorApiCredentialFallbackPrefill,
  SponsorBookmarkFallbackPrefill,
} from "~/features/AccountManagement/sponsors/types"
import { useSponsorRecommendations } from "~/features/AccountManagement/sponsors/useSponsorRecommendations"
import { cn } from "~/lib/utils"
import {
  openApiCredentialProfilesPage,
  openFullAccountManagerPage,
  openFullBookmarkManagerPage,
} from "~/utils/navigation"

export interface PopupSponsorRecommendationsSectionProps {
  surface: SponsorRecommendationSurface
  onContinueAddAccount?: (prefill: AddAccountPrefill) => void
  onOpenBookmarkManager?: (prefill: SponsorBookmarkFallbackPrefill) => void
  onOpenApiCredentialProfiles?: (
    prefill: SponsorApiCredentialFallbackPrefill,
  ) => void
  className?: string
}

/**
 * Unified sponsor recommendations section with standard top divider line and spacing
 * for popup tab onboarding views.
 */
export const PopupSponsorRecommendationsSection = ({
  surface,
  onContinueAddAccount,
  onOpenBookmarkManager,
  onOpenApiCredentialProfiles,
  className,
}: PopupSponsorRecommendationsSectionProps) => {
  const dialogContext = useContext(DialogStateContext)
  const sponsorRecommendations = useSponsorRecommendations({ surface })

  if (sponsorRecommendations.items.length === 0) {
    return null
  }

  return (
    <div
      className={cn(
        "border-border mt-density-3 pt-density-3 border-t",
        className,
      )}
    >
      <SponsorRecommendationsSection
        surface={surface}
        items={sponsorRecommendations.items}
        onContinueAddAccount={(prefill) => {
          if (onContinueAddAccount) {
            onContinueAddAccount(prefill)
          } else if (dialogContext) {
            dialogContext.openAddAccount(prefill)
          } else {
            void openFullAccountManagerPage()
          }
        }}
        onOpenBookmarkManager={(prefill) => {
          if (onOpenBookmarkManager) {
            onOpenBookmarkManager(prefill)
          } else {
            void openFullBookmarkManagerPage({ create: prefill })
          }
        }}
        onOpenApiCredentialProfiles={(prefill) => {
          if (onOpenApiCredentialProfiles) {
            onOpenApiCredentialProfiles(prefill)
          } else {
            void openApiCredentialProfilesPage({ create: prefill })
          }
        }}
      />
    </div>
  )
}
