import { useContext, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"

import { DialogStateContext } from "~/features/AccountManagement/dialogs/useDialogStateContext"
import type { SponsorRecommendationSurface } from "~/features/AccountManagement/sponsors/constants"
import { SponsorRecommendationsSection } from "~/features/AccountManagement/sponsors/SponsorRecommendationsSection"
import type {
  AddAccountPrefill,
  SponsorApiCredentialFallbackPrefill,
  SponsorBookmarkFallbackPrefill,
} from "~/features/AccountManagement/sponsors/types"
import { useSponsorRecommendations } from "~/features/AccountManagement/sponsors/useSponsorRecommendations"
import toast from "~/lib/notify"
import { cn } from "~/lib/utils"
import { isExtensionPopup } from "~/utils/browser"
import { getActiveTab } from "~/utils/browser/tabs"
import {
  openApiCredentialProfilesPage,
  openFullAccountManagerPage,
  openFullBookmarkManagerPage,
} from "~/utils/navigation"

import { openSponsorWorkflow } from "./openSponsorWorkflow"

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
  const { t } = useTranslation("account")
  const inPopup = isExtensionPopup()
  const targetTab = useRef<browser.tabs.Tab | null>(null)
  useEffect(() => {
    if (!inPopup) return
    void getActiveTab()
      .then((tab) => {
        targetTab.current = tab ?? null
      })
      .catch(() => {})
  }, [inPopup])
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
        onStartWorkflow={
          inPopup
            ? async (intent, visit) => {
                try {
                  await openSponsorWorkflow(intent, visit, targetTab.current)
                } catch {
                  toast.error(t("sponsor.openWorkflowFailed"))
                }
              }
            : undefined
        }
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
