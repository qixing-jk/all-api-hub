import { useEffect, useId } from "react"
import { useTranslation } from "react-i18next"

import { trackSponsorRecommendationsImpression } from "~/features/AccountManagement/sponsors/analytics"
import {
  SPONSOR_RECOMMENDATION_SURFACES,
  type SponsorRecommendationSurface,
} from "~/features/AccountManagement/sponsors/constants"
import { SponsorRecommendationCard } from "~/features/AccountManagement/sponsors/SponsorRecommendationCard"
import type {
  AddAccountPrefill,
  SponsorApiCredentialFallbackPrefill,
  SponsorBookmarkFallbackPrefill,
  SponsorRecommendation,
} from "~/features/AccountManagement/sponsors/types"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"

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
  const isNewcomer = surface === SPONSOR_RECOMMENDATION_SURFACES.Newcomer
  const showVisibleHeader =
    surface !== SPONSOR_RECOMMENDATION_SURFACES.AddAccountDialog
  const heading = isNewcomer
    ? t("sponsor.newcomer.title")
    : t("sponsor.recommendedProviders")

  useEffect(() => {
    if (items.length === 0) return
    void trackSponsorRecommendationsImpression({ items, surface })
  }, [items, surface])

  if (items.length === 0) {
    return null
  }

  return (
    <section
      aria-labelledby={headingId}
      className={showVisibleHeader ? "space-y-density-3" : "space-y-density-2"}
      data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendations}
    >
      <div className={showVisibleHeader ? "space-y-density-1" : "sr-only"}>
        <h3 id={headingId} className="text-foreground text-sm font-medium">
          {heading}
        </h3>
        {isNewcomer ? (
          <p className="dark:text-secondary-foreground text-muted-foreground text-xs leading-5">
            {t("sponsor.newcomer.description")}
          </p>
        ) : null}
      </div>
      <div className="gap-y-density-2 grid gap-x-2">
        {items.map((item) => (
          <SponsorRecommendationCard
            key={item.id}
            item={item}
            itemCount={items.length}
            surface={surface}
            onContinueAddAccount={onContinueAddAccount}
            onOpenBookmarkManager={onOpenBookmarkManager}
            onOpenApiCredentialProfiles={onOpenApiCredentialProfiles}
          />
        ))}
      </div>
    </section>
  )
}
