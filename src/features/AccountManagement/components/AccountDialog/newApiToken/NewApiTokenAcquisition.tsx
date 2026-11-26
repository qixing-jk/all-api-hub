import { Info, ShieldPlus } from "lucide-react"
import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import { SidebarIcon } from "~/components/icons/SidebarIcon"
import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { ActionGroup, Button, InlineMessage } from "~/components/ui"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import type { AccountSiteManualAddGuideAnchor } from "~/services/accountSiteDefinitions"

import { ManualAddGuideButton } from "../ManualAddGuideButton"
import { ACCOUNT_DIALOG_RECOVERY_ACTIONS } from "../models"
import type { AccountRecoveryContinuation } from "../recovery/useAccountDialogRecoveryHandoff"
import {
  NEW_API_TOKEN_RECOVERY_REASONS,
  type NewApiTokenRecoveryReason,
} from "./tokenVerification"

/** Renders token setup next to the credential field or in the compact dialog footer. */
export function NewApiTokenAcquisition({
  recoveryReason,
  tokenActionsTarget,
  openSiteAction,
  onStartTokenCreation,
  continuation,
  manualAddGuideAnchor,
  navigationError,
  rotationWarning,
}: {
  recoveryReason: NewApiTokenRecoveryReason
  tokenActionsTarget?: HTMLElement | null
  openSiteAction: ReactNode
  onStartTokenCreation: () => void
  continuation?: AccountRecoveryContinuation
  manualAddGuideAnchor?: AccountSiteManualAddGuideAnchor
  navigationError?: string
  rotationWarning?: string | false
}) {
  const { t } = useTranslation("accountDialog")
  const compact = tokenActionsTarget !== undefined
  const isContinuingCreate =
    continuation?.pendingAction ===
    ACCOUNT_DIALOG_RECOVERY_ACTIONS.NewApiTokenCreate
  const handleStartTokenCreation = () => {
    if (continuation) {
      continuation.onContinue(ACCOUNT_DIALOG_RECOVERY_ACTIONS.NewApiTokenCreate)
      return
    }
    onStartTokenCreation()
  }
  const acquisitionActions = (
    <ActionGroup
      aria-label={t("form.accessToken")}
      className={
        compact
          ? "max-sm:w-full max-sm:flex-col-reverse max-sm:items-stretch"
          : "max-sm:w-full max-sm:flex-col max-sm:items-stretch"
      }
    >
      {openSiteAction}
      <Button
        type="button"
        size="sm"
        variant="default"
        className="h-auto min-h-(--density-control) max-w-full whitespace-normal"
        disabled={
          continuation && (continuation.disabled || continuation.isPending)
        }
        loading={isContinuingCreate}
        onClick={handleStartTokenCreation}
        leftIcon={<ShieldPlus aria-hidden="true" className="size-4" />}
      >
        {t("tokenCreation.title")}
      </Button>
    </ActionGroup>
  )
  const popupGuidance = continuation && (
    <InlineMessage
      tone="info"
      size="sm"
      icon={
        continuation.sidePanelSupported ? (
          <SidebarIcon side="right" className="size-3.5" />
        ) : (
          <WorkflowTransitionIcon className="size-3.5" />
        )
      }
    >
      {continuation.sidePanelSupported
        ? t("tokenCreation.popupSidePanelHint")
        : t("tokenCreation.popupFullPageHint")}
    </InlineMessage>
  )
  const helperLinks = (
    <div className="mt-1 flex flex-wrap items-center gap-x-4">
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="link"
          className="px-0 text-xs text-muted-foreground"
          leftIcon={<Info aria-hidden="true" className="size-3.5" />}
        >
          {t("tokenCreation.manualSetup")}
        </Button>
      </PopoverTrigger>
      {manualAddGuideAnchor && (
        <ManualAddGuideButton
          anchor={manualAddGuideAnchor}
          label={t("tokenCreation.manualAddDocs")}
          className="px-0 text-xs text-muted-foreground"
        />
      )}
    </div>
  )
  const activeError = continuation?.errorMessage ?? navigationError
  const navigationWarning = activeError && (
    <InlineMessage role="alert" tone="warning" size="sm">
      {activeError}
    </InlineMessage>
  )
  return (
    <Popover>
      {compact ? (
        <>
          {helperLinks}
          {popupGuidance && <div className="mt-density-2">{popupGuidance}</div>}
          {tokenActionsTarget &&
            createPortal(acquisitionActions, tokenActionsTarget)}
          {navigationWarning}
        </>
      ) : (
        <div className="space-y-density-2 border-t border-border-subtle pt-density-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-density-2">
            <div className="min-w-0 flex-1 basis-64">
              <p
                role="status"
                aria-live="polite"
                className="text-sm text-muted-foreground"
                data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectErrorMessage}
              >
                {recoveryReason === NEW_API_TOKEN_RECOVERY_REASONS.INVALID
                  ? t("tokenCreation.replaceInvalidDescription")
                  : recoveryReason ===
                      NEW_API_TOKEN_RECOVERY_REASONS.IDENTITY_MISMATCH
                    ? t("tokenCreation.replaceMismatchedDescription")
                    : t("tokenCreation.setupDescription")}
              </p>
              {helperLinks}
            </div>
            {acquisitionActions}
          </div>
          {popupGuidance}
          {navigationWarning}
        </div>
      )}
      <PopoverContent
        aria-label={t("tokenCreation.manualSetup")}
        align="start"
        side={compact ? "top" : "bottom"}
        sideOffset={6}
        collisionPadding={24}
        hideWhenDetached
        className="max-h-(--radix-popper-available-height) w-96 max-w-(--radix-popper-available-width) space-y-3 overflow-y-auto text-sm"
      >
        <p className="leading-relaxed text-muted-foreground">
          {t("tokenCreation.manualInstructions")}
        </p>
        {rotationWarning && (
          <InlineMessage
            role="note"
            tone="warning"
            className="border-t border-border-subtle pt-density-2"
          >
            {rotationWarning}
          </InlineMessage>
        )}
      </PopoverContent>
    </Popover>
  )
}
