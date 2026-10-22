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
import { cn } from "~/lib/utils"

import type { SponsorWorkflowStarter } from "./sponsorWorkflowIntent"

interface SponsorRecommendationsSectionProps {
  onStartWorkflow?: SponsorWorkflowStarter
  surface: SponsorRecommendationSurface
  items: SponsorRecommendation[]
  layout?: "list" | "grid"
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
  layout = "list",
  onContinueAddAccount,
  onOpenBookmarkManager,
  onOpenApiCredentialProfiles,
  onStartWorkflow,
}: SponsorRecommendationsSectionProps) {
  const { t } = useTranslation("account")
  const headingId = useId()
  const isNewcomer = surface === SPONSOR_RECOMMENDATION_SURFACES.Newcomer
  const isPopupApiCredentials =
    surface === SPONSOR_RECOMMENDATION_SURFACES.PopupApiCredentialProfiles
  const isPopupBookmarks =
    surface === SPONSOR_RECOMMENDATION_SURFACES.PopupBookmarks

  const heading = isNewcomer
    ? t("sponsor.newcomer.title")
    : isPopupApiCredentials
      ? t("sponsor.popupApiCredentialProfiles.title")
      : isPopupBookmarks
        ? t("sponsor.popupBookmarks.title")
        : t("sponsor.recommendedProviders")

  const description = isNewcomer
    ? t("sponsor.newcomer.description")
    : isPopupApiCredentials
      ? t("sponsor.popupApiCredentialProfiles.description")
      : isPopupBookmarks
        ? t("sponsor.popupBookmarks.description")
        : null

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
      className="space-y-density-3"
      data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendations}
    >
      <div className="space-y-density-1">
        <h3 id={headingId} className="text-foreground text-sm font-medium">
          {heading}
        </h3>
        {description ? (
          <p className="dark:text-secondary-foreground text-muted-foreground text-xs leading-5">
            {description}
          </p>
        ) : null}
      </div>
      <div
        className={cn(
          "gap-density-2 grid min-w-0",
          layout === "grid" && "lg:grid-cols-2",
        )}
      >
        {items.map((item) => (
          <SponsorRecommendationCard
            key={item.id}
            item={item}
            itemCount={items.length}
            surface={surface}
            onContinueAddAccount={onContinueAddAccount}
            onOpenBookmarkManager={onOpenBookmarkManager}
            onOpenApiCredentialProfiles={onOpenApiCredentialProfiles}
            onStartWorkflow={onStartWorkflow}
          />
        ))}
      </div>
    </section>
  )
}
