import { useId } from "react"
import { useTranslation } from "react-i18next"

import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"

import {
  SPONSOR_RECOMMENDATION_SURFACES,
  type SponsorRecommendationSurface,
} from "./constants"
import { SponsorRecommendationCard } from "./SponsorRecommendationCard"
import type {
  AddAccountPrefill,
  SponsorApiCredentialFallbackPrefill,
  SponsorBookmarkFallbackPrefill,
  SponsorRecommendation,
} from "./types"

interface SponsorRecommendationsSectionProps {
  surface: SponsorRecommendationSurface
  items: SponsorRecommendation[]
  onContinueAddAccount: (prefill: AddAccountPrefill) => void
  onOpenBookmarkManager: (prefill: SponsorBookmarkFallbackPrefill) => void
  onOpenApiCredentialProfiles: (
    prefill: SponsorApiCredentialFallbackPrefill,
  ) => void
}

/** Renders a semantic sponsor recommendation section when recommendations are available. */
export function SponsorRecommendationsSection({
  surface,
  items,
  onContinueAddAccount,
  onOpenBookmarkManager,
  onOpenApiCredentialProfiles,
}: SponsorRecommendationsSectionProps) {
  const { t } = useTranslation("account")
  const headingId = useId()
  const showVisibleHeader =
    surface !== SPONSOR_RECOMMENDATION_SURFACES.AddAccountDialog

  if (items.length === 0) {
    return null
  }

  return (
    <section
      aria-labelledby={headingId}
      className={showVisibleHeader ? "space-y-3" : "space-y-2"}
      data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendations}
    >
      <div className={showVisibleHeader ? "space-y-1" : "sr-only"}>
        <h3
          id={headingId}
          className="dark:text-dark-text-primary text-sm font-medium text-gray-900"
        >
          {t("sponsor.recommendedProviders")}
        </h3>
      </div>
      <div className="grid gap-2">
        {items.map((item) => (
          <SponsorRecommendationCard
            key={item.id}
            item={item}
            onContinueAddAccount={onContinueAddAccount}
            onOpenBookmarkManager={onOpenBookmarkManager}
            onOpenApiCredentialProfiles={onOpenApiCredentialProfiles}
          />
        ))}
      </div>
    </section>
  )
}
