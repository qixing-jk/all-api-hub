import { Info } from "lucide-react"
import { useEffect, useState, type ComponentProps, type ReactNode } from "react"

import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { normalizeSponsorAddAccountPrefill } from "~/features/AccountManagement/sponsors/addAccountPrefill"
import { SPONSOR_RECOMMENDATION_SURFACES } from "~/features/AccountManagement/sponsors/constants"
import { SponsorRecommendationsSection } from "~/features/AccountManagement/sponsors/SponsorRecommendationsSection"
import { useSponsorRecommendations } from "~/features/AccountManagement/sponsors/useSponsorRecommendations"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import {
  openApiCredentialProfilesPage,
  openFullBookmarkManagerPage,
} from "~/utils/navigation"

import InfoPanel, { AccountSiteDiscoveryHint } from "../InfoPanel"
import {
  ACCOUNT_DIALOG_PHASES,
  type AccountDialogFormSource,
  type AccountDialogPhase,
} from "../models"

/** Presents the site entry fields, site guidance and optional sponsor prefills. */
export function AccountDialogSiteStep({
  isOpen,
  mode,
  phase,
  formSource,
  siteInfoInput,
  autoDetectPresentation,
  manualAddGuideAnchor,
  onApplyPrefill,
}: {
  isOpen: boolean
  mode: DialogMode
  phase: AccountDialogPhase
  formSource: AccountDialogFormSource
  siteInfoInput: ReactNode
  autoDetectPresentation?: ComponentProps<
    typeof InfoPanel
  >["autoDetectPresentation"]
  manualAddGuideAnchor?: ComponentProps<
    typeof InfoPanel
  >["manualAddGuideAnchor"]
  onApplyPrefill: (
    prefill: NonNullable<ReturnType<typeof normalizeSponsorAddAccountPrefill>>,
  ) => void
}) {
  const canShowSponsorRecommendations =
    isOpen &&
    mode === DIALOG_MODES.ADD &&
    phase === ACCOUNT_DIALOG_PHASES.SITE_INPUT
  const sponsorRecommendations = useSponsorRecommendations({
    surface: SPONSOR_RECOMMENDATION_SURFACES.AddAccountDialog,
    enabled: canShowSponsorRecommendations,
  })
  const showSponsorRecommendations =
    canShowSponsorRecommendations && sponsorRecommendations.items.length > 0
  const [selectedSponsorPostClickNote, setSelectedSponsorPostClickNote] =
    useState<string | null>(null)

  useEffect(() => {
    if (!canShowSponsorRecommendations) {
      setSelectedSponsorPostClickNote(null)
    }
  }, [canShowSponsorRecommendations])

  if (phase === ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM) return null
  return (
    <div className="min-w-0 space-y-density-3">
      <div className="min-w-0 space-y-density-4">
        {siteInfoInput}
        {selectedSponsorPostClickNote ? (
          <div
            className="flex items-start gap-x-2 gap-y-density-2 rounded-md bg-primary-soft px-2 py-density-2 text-xs leading-5 text-primary-soft-foreground"
            data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.sponsorPostClickNote}
          >
            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{selectedSponsorPostClickNote}</span>
          </div>
        ) : null}
      </div>
      {showSponsorRecommendations ? (
        <div className="min-w-0">
          <SponsorRecommendationsSection
            layout="grid"
            surface={SPONSOR_RECOMMENDATION_SURFACES.AddAccountDialog}
            items={sponsorRecommendations.items}
            onContinueAddAccount={(nextPrefill) => {
              const normalizedPrefill =
                normalizeSponsorAddAccountPrefill(nextPrefill)
              if (!normalizedPrefill) return

              onApplyPrefill(normalizedPrefill)
              const selectedSponsor = sponsorRecommendations.items.find(
                (item) => item.id === normalizedPrefill.sponsorId,
              )
              setSelectedSponsorPostClickNote(
                selectedSponsor?.postClickNote ?? null,
              )
            }}
            onOpenBookmarkManager={(prefill) => {
              void openFullBookmarkManagerPage({ create: prefill })
            }}
            onOpenApiCredentialProfiles={(prefill) => {
              void openApiCredentialProfilesPage({ create: prefill })
            }}
          />
        </div>
      ) : null}
      {mode === DIALOG_MODES.ADD && (
        <div className="space-y-density-3 border-t border-border pt-density-3">
          <InfoPanel
            mode={mode}
            phase={phase}
            formSource={formSource}
            presentation="inline"
            autoDetectPresentation={autoDetectPresentation}
            manualAddGuideAnchor={manualAddGuideAnchor}
          />
          <AccountSiteDiscoveryHint />
        </div>
      )}
    </div>
  )
}
