import { Info, Sparkles, UserRound } from "lucide-react"
import { useTranslation } from "react-i18next"

import { LdohIcon } from "~/components/icons/LdohIcon"
import { Button } from "~/components/ui"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import type { AccountSiteManualAddGuideAnchor } from "~/services/accountSiteDefinitions"
import { LDOH_ORIGIN } from "~/services/integrations/ldohSiteLookup/constants"
import { createTab } from "~/utils/browser/tabs"

import { ManualAddGuideButton } from "./ManualAddGuideButton"
import {
  ACCOUNT_DIALOG_FORM_SOURCES,
  ACCOUNT_DIALOG_PHASES,
  type AccountDialogFormSource,
  type AccountDialogPhase,
} from "./models"

interface InfoPanelProps {
  presentation?: "panel" | "guidance" | "inline"
  mode: DialogMode
  phase: AccountDialogPhase
  formSource: AccountDialogFormSource
  autoDetectPresentation?: {
    title: string
    description: string
  }
  manualAddGuideAnchor?: AccountSiteManualAddGuideAnchor
}

/** Secondary site discovery, kept after recommendations in the add dialog. */
export function AccountSiteDiscoveryHint() {
  const { t } = useTranslation("accountDialog")
  return (
    <div className="text-muted-foreground gap-density-1 flex flex-wrap items-center text-xs leading-5">
      <span>{t("infoPanel.ldohSiteListHint")}</span>
      <Button
        type="button"
        onClick={() => void createTab(LDOH_ORIGIN, true)}
        variant="link"
        size="sm"
        className="h-auto min-h-0 justify-start p-0 text-left"
        leftIcon={
          <span aria-hidden="true">
            <LdohIcon size="sm" />
          </span>
        }
      >
        {t("infoPanel.openLdohSiteList")}
      </Button>
    </div>
  )
}

/**
 * Side panel describing automatic detection status and next steps per mode.
 * @param props Component props indicating mode and detection state.
 * @param props.mode Dialog mode used to determine copy and icon visuals.
 * @param props.presentation Prominent panel or quiet visible form guidance.
 * @param props.phase Current dialog phase determining whether the form is shown.
 * @param props.formSource Source that led the dialog into form mode.
 * @param props.autoDetectPresentation Optional site-specific detection copy.
 * @param props.manualAddGuideAnchor Optional docs anchor for the selected site type.
 */
export default function InfoPanel({
  presentation = "panel",
  mode,
  phase,
  formSource,
  autoDetectPresentation,
  manualAddGuideAnchor,
}: InfoPanelProps) {
  const { t } = useTranslation("accountDialog")
  const isAddMode = mode === DIALOG_MODES.ADD
  const isDetected = formSource === ACCOUNT_DIALOG_FORM_SOURCES.DETECTED
  const isManualForm =
    phase === ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM &&
    formSource !== ACCOUNT_DIALOG_FORM_SOURCES.DETECTED
  const showLdohSiteListLink =
    isAddMode && phase === ACCOUNT_DIALOG_PHASES.SITE_INPUT
  const showManualAddGuideLink =
    isAddMode && isManualForm && manualAddGuideAnchor

  const getTitle = () => {
    if (isAddMode) {
      if (isDetected) return t("infoPanel.confirmation")
      if (isManualForm) return t("infoPanel.manualAdd")
      if (autoDetectPresentation) return autoDetectPresentation.title
      return t("infoPanel.autoDetect")
    }
    return t("infoPanel.editInfo")
  }

  const getDescription = () => {
    if (isAddMode) {
      if (isDetected) return t("infoPanel.confirmAddInfo")
      if (isManualForm) return t("infoPanel.manualInfo")
      if (autoDetectPresentation) return autoDetectPresentation.description
      return t("infoPanel.autoDetectInfo")
    }
    return (
      <>
        <p>{t("infoPanel.editInfoDesc")}</p>
        <p>{t("infoPanel.reDetectInfo")}</p>
      </>
    )
  }

  const Icon = isAddMode ? Sparkles : UserRound
  const description = getDescription()

  if (presentation === "inline") {
    return (
      <div
        role="note"
        aria-label={getTitle()}
        className="text-muted-foreground flex items-start gap-2 text-xs leading-5"
      >
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">{description}</div>
      </div>
    )
  }

  if (presentation === "guidance") {
    return (
      <div
        role="note"
        aria-label={isAddMode ? getTitle() : t("infoPanel.editHelp")}
        className="text-muted-foreground space-y-density-2 px-3 text-xs leading-relaxed"
      >
        <p className="text-foreground flex items-center gap-2.5 font-medium">
          <Info aria-hidden="true" className="size-4 shrink-0" />
          {isAddMode ? getTitle() : t("infoPanel.editHelp")}
        </p>
        <div className="space-y-density-2">
          {typeof description === "string" ? <p>{description}</p> : description}
          {showManualAddGuideLink && (
            <ManualAddGuideButton
              anchor={manualAddGuideAnchor}
              className="h-auto min-h-0 justify-start p-0 text-left"
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-primary-soft text-primary-soft-foreground border-primary-soft-border py-density-3 rounded-lg border px-3">
      <div className="flex">
        <div className="shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div className="ml-3">
          <h3 className="text-xs font-medium">{getTitle()}</h3>
          <div className="mt-density-1 text-xs">
            {typeof description === "string" ? (
              <p>{description}</p>
            ) : (
              description
            )}

            {showLdohSiteListLink && (
              <div className="border-primary-soft-border mt-density-2 pt-density-2 border-t">
                <AccountSiteDiscoveryHint />
              </div>
            )}

            {showManualAddGuideLink && (
              <div className="border-primary-soft-border mt-density-2 pt-density-2 border-t">
                <ManualAddGuideButton
                  anchor={manualAddGuideAnchor}
                  className="h-auto min-h-0 justify-start p-0 text-left"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
