import type { TFunction } from "i18next"
import { Bookmark, ExternalLink, KeyRound, Plus } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge, IconButton } from "~/components/ui"
import {
  SPONSOR_RECOMMENDATION_ACTION_KINDS,
  trackSponsorRecommendationClick,
  type SponsorRecommendationActionKind,
} from "~/features/AccountManagement/sponsors/analytics"
import { type SponsorRecommendationSurface } from "~/features/AccountManagement/sponsors/constants"
import {
  SPONSOR_SUPPORT_STATUS,
  type AddAccountPrefill,
  type SponsorApiCredentialFallbackPrefill,
  type SponsorBookmarkFallbackPrefill,
  type SponsorRecommendation,
} from "~/features/AccountManagement/sponsors/types"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { cn } from "~/lib/utils"

interface SponsorRecommendationCardProps {
  item: SponsorRecommendation
  itemCount: number
  surface: SponsorRecommendationSurface
  onContinueAddAccount: (prefill: AddAccountPrefill) => void
  onOpenBookmarkManager: (prefill: SponsorBookmarkFallbackPrefill) => void
  onOpenApiCredentialProfiles: (
    prefill: SponsorApiCredentialFallbackPrefill,
  ) => void
}

/** Returns the translated badge label for a sponsor recommendation. */
function getSupportLabel(t: TFunction<"account">, item: SponsorRecommendation) {
  if (
    item.fallbackHints.bookmarkManager &&
    item.fallbackHints.apiCredentialProfiles
  ) {
    return t("sponsor.supportStatus.fallbackBookmarkAndApi")
  }

  if (item.fallbackHints.bookmarkManager) {
    return t("sponsor.supportStatus.fallbackBookmark")
  }

  if (item.fallbackHints.apiCredentialProfiles) {
    return t("sponsor.supportStatus.fallbackApiCredentialProfiles")
  }

  switch (item.supportStatus) {
    case SPONSOR_SUPPORT_STATUS.Supported:
      return t("sponsor.supportStatus.supported")
    case SPONSOR_SUPPORT_STATUS.Unsupported:
    default:
      return t("sponsor.supportStatus.unsupported")
  }
}

/** Returns the visual badge variant that matches a sponsor support status. */
function getSupportBadgeVariant(
  status: SponsorRecommendation["supportStatus"],
) {
  switch (status) {
    case SPONSOR_SUPPORT_STATUS.Supported:
      return "success"
    case SPONSOR_SUPPORT_STATUS.Unsupported:
    default:
      return "info"
  }
}

/** Renders one compact sponsor recommendation with primary, continue, and fallback actions. */
export function SponsorRecommendationCard({
  item,
  itemCount,
  surface,
  onContinueAddAccount,
  onOpenBookmarkManager,
  onOpenApiCredentialProfiles,
}: SponsorRecommendationCardProps) {
  const { t } = useTranslation("account")

  const trackClick = (actionKind: SponsorRecommendationActionKind) => {
    trackSponsorRecommendationClick({
      actionKind,
      item,
      itemCount,
      surface,
    })
  }

  const handlePrimaryClick = () => {
    trackClick(SPONSOR_RECOMMENDATION_ACTION_KINDS.VisitProvider)
    window.open(item.primaryAffiliateUrl, "_blank", "noopener,noreferrer")
  }

  const handleContinueAddAccount = () => {
    if (!item.accountPrefill) {
      return
    }

    trackClick(SPONSOR_RECOMMENDATION_ACTION_KINDS.ContinueAddAccount)
    onContinueAddAccount({
      siteUrl: item.accountPrefill.siteUrl,
      siteType: item.accountPrefill.siteType,
      ...(item.accountPrefill.authType
        ? { authType: item.accountPrefill.authType }
        : {}),
      source: "sponsor",
      sponsorId: item.id,
    })
    window.open(item.primaryAffiliateUrl, "_blank", "noopener,noreferrer")
  }

  const handleOpenBookmarkManager = () => {
    trackClick(SPONSOR_RECOMMENDATION_ACTION_KINDS.BookmarkFallback)
    window.open(item.primaryAffiliateUrl, "_blank", "noopener,noreferrer")
    onOpenBookmarkManager({
      name: item.name,
      url: fallbackUrl,
    })
  }

  const handleOpenApiCredentialProfiles = () => {
    trackClick(
      SPONSOR_RECOMMENDATION_ACTION_KINDS.ApiCredentialProfilesFallback,
    )
    window.open(item.primaryAffiliateUrl, "_blank", "noopener,noreferrer")
    onOpenApiCredentialProfiles({
      name: item.name,
      baseUrl: fallbackUrl,
      apiKeyCreateUrl: item.apiKeyCreateUrl,
      apiKeyCreateHint: item.postClickNote,
    })
  }

  const primaryLabel = t("sponsor.actions.visitProvider")
  const continueLabel = t("sponsor.actions.continueAddAccount")
  const isSupported = Boolean(item.accountPrefill)
  const handleMainAction = isSupported
    ? handleContinueAddAccount
    : handlePrimaryClick
  const hasFallbackActions =
    item.fallbackHints.bookmarkManager ||
    item.fallbackHints.apiCredentialProfiles
  const supportLabel = getSupportLabel(t, item)
  const fallbackUrl = item.websiteUrl ?? item.primaryAffiliateUrl

  return (
    <div
      className="group dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary/40 flex min-w-0 items-center gap-2 rounded-lg border border-gray-200 bg-white p-1.5 shadow-xs transition-colors hover:border-blue-200 hover:bg-blue-50/50 dark:hover:border-blue-800/70 dark:hover:bg-blue-950/20"
      data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendationCard}
    >
      <button
        type="button"
        className={cn(
          "focus-visible:ring-ring/50 flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors outline-none focus-visible:ring-[3px]",
          isSupported
            ? "text-blue-700 hover:bg-blue-100/70 dark:text-blue-300 dark:hover:bg-blue-900/30"
            : "dark:text-dark-text-primary dark:hover:bg-dark-bg-tertiary/70 text-gray-800 hover:bg-gray-100",
        )}
        onClick={handleMainAction}
        aria-label={
          isSupported
            ? `${continueLabel}: ${item.name}`
            : `${primaryLabel}: ${item.name}`
        }
        data-testid={
          isSupported
            ? ACCOUNT_MANAGEMENT_TEST_IDS.sponsorContinueAddAccountAction
            : ACCOUNT_MANAGEMENT_TEST_IDS.sponsorPrimaryAction
        }
      >
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
            isSupported
              ? "bg-blue-600 text-white shadow-sm dark:bg-blue-500"
              : "dark:bg-dark-bg-tertiary dark:text-dark-text-secondary bg-gray-100 text-gray-600",
          )}
        >
          {isSupported ? (
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          ) : (
            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm leading-5 font-medium">
              {item.name}
            </span>
          </span>
          <span className="dark:text-dark-text-tertiary line-clamp-2 text-xs leading-4 text-gray-500">
            {item.tagline}
          </span>
        </span>
        {!isSupported ? (
          <Badge
            variant={getSupportBadgeVariant(item.supportStatus)}
            size="sm"
            className="hidden shrink-0 sm:inline-flex"
            title={supportLabel}
          >
            {supportLabel}
          </Badge>
        ) : null}
      </button>

      {hasFallbackActions ? (
        <div className="flex shrink-0 items-center gap-1">
          {item.fallbackHints.bookmarkManager ? (
            <IconButton
              size="sm"
              type="button"
              variant="ghost"
              aria-label={t("sponsor.actions.openBookmarkManagerFallback")}
              title={t("sponsor.actions.openBookmarkManagerFallback")}
              onClick={handleOpenBookmarkManager}
              data-testid={
                ACCOUNT_MANAGEMENT_TEST_IDS.sponsorFallbackBookmarkAction
              }
            >
              <Bookmark aria-hidden="true" className="h-4 w-4" />
            </IconButton>
          ) : null}
          {item.fallbackHints.apiCredentialProfiles ? (
            <IconButton
              size="sm"
              type="button"
              variant="ghost"
              aria-label={t(
                "sponsor.actions.openApiCredentialProfilesFallback",
              )}
              title={t("sponsor.actions.openApiCredentialProfilesFallback")}
              onClick={handleOpenApiCredentialProfiles}
              data-testid={
                ACCOUNT_MANAGEMENT_TEST_IDS.sponsorFallbackApiCredentialProfilesAction
              }
            >
              <KeyRound aria-hidden="true" className="h-4 w-4" />
            </IconButton>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
