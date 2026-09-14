import type { TFunction } from "i18next"
import { Bookmark, Plus } from "lucide-react"
import { useTranslation } from "react-i18next"

import { ApiCredentialLibraryIcon } from "~/components/icons/productIcons"
import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
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

const SPONSOR_MAIN_ACTION_KINDS = {
  ContinueAddAccount: "continue-add-account",
  VisitProvider: "visit-provider",
  BookmarkFallback: "bookmark-fallback",
  ApiCredentialProfilesFallback: "api-credential-profiles-fallback",
} as const

type SponsorMainActionKind =
  (typeof SPONSOR_MAIN_ACTION_KINDS)[keyof typeof SPONSOR_MAIN_ACTION_KINDS]

/** Returns the translated badge label for a sponsor recommendation. */
function getSupportLabel(t: TFunction<"account">, item: SponsorRecommendation) {
  if (
    item.actions.bookmarkFallback &&
    item.actions.apiCredentialProfileFallback
  ) {
    return t("sponsor.supportStatus.fallbackBookmarkAndApi")
  }

  if (item.actions.bookmarkFallback) {
    return t("sponsor.supportStatus.fallbackBookmark")
  }

  if (item.actions.apiCredentialProfileFallback) {
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

/** Picks the compact row action, preferring plugin workflows over a plain visit. */
function getMainActionKind(item: SponsorRecommendation): SponsorMainActionKind {
  if (item.actions.addAccount) {
    return SPONSOR_MAIN_ACTION_KINDS.ContinueAddAccount
  }

  if (item.actions.apiCredentialProfileFallback) {
    return SPONSOR_MAIN_ACTION_KINDS.ApiCredentialProfilesFallback
  }

  if (item.actions.bookmarkFallback) {
    return SPONSOR_MAIN_ACTION_KINDS.BookmarkFallback
  }

  return SPONSOR_MAIN_ACTION_KINDS.VisitProvider
}

/** Returns the translated action label for the compact row action. */
function getMainActionLabel(
  t: TFunction<"account">,
  actionKind: SponsorMainActionKind,
) {
  switch (actionKind) {
    case SPONSOR_MAIN_ACTION_KINDS.ContinueAddAccount:
      return t("sponsor.actions.continueAddAccount")
    case SPONSOR_MAIN_ACTION_KINDS.BookmarkFallback:
      return t("sponsor.actions.openBookmarkManagerFallback")
    case SPONSOR_MAIN_ACTION_KINDS.ApiCredentialProfilesFallback:
      return t("sponsor.actions.openApiCredentialProfilesFallback")
    case SPONSOR_MAIN_ACTION_KINDS.VisitProvider:
    default:
      return t("sponsor.actions.visitProvider")
  }
}

/** Renders the compact row icon that matches its current action. */
function renderMainActionIcon(actionKind: SponsorMainActionKind) {
  switch (actionKind) {
    case SPONSOR_MAIN_ACTION_KINDS.ContinueAddAccount:
      return <Plus aria-hidden="true" className="h-3.5 w-3.5" />
    case SPONSOR_MAIN_ACTION_KINDS.BookmarkFallback:
      return <Bookmark aria-hidden="true" className="h-3.5 w-3.5" />
    case SPONSOR_MAIN_ACTION_KINDS.ApiCredentialProfilesFallback:
      return (
        <ApiCredentialLibraryIcon aria-hidden="true" className="h-3.5 w-3.5" />
      )
    case SPONSOR_MAIN_ACTION_KINDS.VisitProvider:
    default:
      return (
        <WorkflowTransitionIcon aria-hidden="true" className="h-3.5 w-3.5" />
      )
  }
}

/** Returns the stable test id for the compact row action currently promoted. */
function getMainActionTestId(actionKind: SponsorMainActionKind) {
  switch (actionKind) {
    case SPONSOR_MAIN_ACTION_KINDS.ContinueAddAccount:
      return ACCOUNT_MANAGEMENT_TEST_IDS.sponsorContinueAddAccountAction
    case SPONSOR_MAIN_ACTION_KINDS.BookmarkFallback:
      return ACCOUNT_MANAGEMENT_TEST_IDS.sponsorPrimaryBookmarkAction
    case SPONSOR_MAIN_ACTION_KINDS.ApiCredentialProfilesFallback:
      return ACCOUNT_MANAGEMENT_TEST_IDS.sponsorPrimaryApiCredentialProfilesAction
    case SPONSOR_MAIN_ACTION_KINDS.VisitProvider:
    default:
      return ACCOUNT_MANAGEMENT_TEST_IDS.sponsorPrimaryAction
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
    window.open(item.links.primary, "_blank", "noopener,noreferrer")
  }

  const handleContinueAddAccount = () => {
    const addAccountAction = item.actions.addAccount

    if (!addAccountAction) {
      return
    }

    trackClick(SPONSOR_RECOMMENDATION_ACTION_KINDS.ContinueAddAccount)
    onContinueAddAccount({
      siteUrl: addAccountAction.siteUrl,
      siteType: addAccountAction.siteType,
      ...(addAccountAction.authType
        ? { authType: addAccountAction.authType }
        : {}),
      source: "sponsor",
      sponsorId: item.id,
    })
    window.open(item.links.primary, "_blank", "noopener,noreferrer")
  }

  const handleOpenBookmarkManager = () => {
    const bookmarkFallback = item.actions.bookmarkFallback

    if (!bookmarkFallback) {
      return
    }

    trackClick(SPONSOR_RECOMMENDATION_ACTION_KINDS.BookmarkFallback)
    window.open(item.links.primary, "_blank", "noopener,noreferrer")
    onOpenBookmarkManager({
      name: item.name,
      url: bookmarkFallback.url,
    })
  }

  const handleOpenApiCredentialProfiles = () => {
    const apiCredentialFallback = item.actions.apiCredentialProfileFallback

    if (!apiCredentialFallback) {
      return
    }

    trackClick(
      SPONSOR_RECOMMENDATION_ACTION_KINDS.ApiCredentialProfilesFallback,
    )
    window.open(item.links.primary, "_blank", "noopener,noreferrer")
    onOpenApiCredentialProfiles({
      name: item.name,
      baseUrl: apiCredentialFallback.baseUrl,
      apiKeyCreateUrl: apiCredentialFallback.apiKeyCreateUrl,
      apiKeyCreateHint: apiCredentialFallback.apiKeyCreateHint,
    })
  }

  const mainActionKind = getMainActionKind(item)
  const mainActionLabel = getMainActionLabel(t, mainActionKind)
  const hasAddAccountAction = Boolean(item.actions.addAccount)
  const isIntegratedMainAction =
    mainActionKind !== SPONSOR_MAIN_ACTION_KINDS.VisitProvider
  const handleMainAction = () => {
    switch (mainActionKind) {
      case SPONSOR_MAIN_ACTION_KINDS.ContinueAddAccount:
        handleContinueAddAccount()
        return
      case SPONSOR_MAIN_ACTION_KINDS.BookmarkFallback:
        handleOpenBookmarkManager()
        return
      case SPONSOR_MAIN_ACTION_KINDS.ApiCredentialProfilesFallback:
        handleOpenApiCredentialProfiles()
        return
      case SPONSOR_MAIN_ACTION_KINDS.VisitProvider:
      default:
        handlePrimaryClick()
    }
  }
  const hasFallbackActions =
    Boolean(item.actions.bookmarkFallback) ||
    Boolean(item.actions.apiCredentialProfileFallback)
  const supportLabel = getSupportLabel(t, item)

  return (
    <div
      className="group dark:bg-card/40 corners-concentric border-border bg-card hover:border-theme-200 hover:bg-theme-50/50 dark:hover:border-theme-800/70 dark:hover:bg-theme-950/20 flex min-w-0 items-center gap-2 rounded-lg border p-1.5 shadow-xs transition-colors [--corner-inset:calc(--spacing(1.5)+1px)]"
      data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.sponsorRecommendationCard}
    >
      <button
        type="button"
        className={cn(
          "focus-visible:ring-ring/50 flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-[var(--corner-inner-radius)] px-2.5 py-1.5 text-left transition-colors outline-none focus-visible:ring-[3px]",
          isIntegratedMainAction
            ? "text-theme-700 hover:bg-theme-100/70 dark:text-theme-300 dark:hover:bg-theme-900/30"
            : "dark:text-foreground dark:hover:bg-secondary/70 text-secondary-foreground hover:bg-muted",
        )}
        onClick={handleMainAction}
        aria-label={`${mainActionLabel}: ${item.name}`}
        data-testid={getMainActionTestId(mainActionKind)}
      >
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-xs",
            isIntegratedMainAction
              ? "bg-primary text-primary-foreground shadow-sm"
              : "dark:bg-secondary dark:text-secondary-foreground bg-muted text-muted-foreground",
          )}
        >
          {renderMainActionIcon(mainActionKind)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm leading-5 font-medium">
              {item.name}
            </span>
          </span>
          <span className="text-muted-foreground line-clamp-2 text-xs leading-4">
            {item.tagline}
          </span>
        </span>
        {!hasAddAccountAction ? (
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
          {item.actions.bookmarkFallback ? (
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
          {item.actions.apiCredentialProfileFallback ? (
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
              <ApiCredentialLibraryIcon
                aria-hidden="true"
                className="h-4 w-4"
              />
            </IconButton>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
