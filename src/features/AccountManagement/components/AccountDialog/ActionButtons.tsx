import {
  BoltIcon,
  CheckIcon,
  PencilIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import {
  ACCOUNT_POST_SAVE_WORKFLOW_STEPS,
  type AccountPostSaveWorkflowStep,
} from "~/services/accounts/accountPostSaveWorkflow"
import { getManagedSiteLabel } from "~/services/managedSites/utils/managedSite"

import {
  ACCOUNT_DIALOG_FORM_SOURCES,
  ACCOUNT_DIALOG_PHASES,
  type AccountDialogFormSource,
  type AccountDialogPhase,
} from "./models"

interface ActionButtonsProps {
  mode: DialogMode
  url: string
  phase: AccountDialogPhase
  formSource: AccountDialogFormSource
  isDetecting: boolean
  isSaving: boolean
  isFormValid: boolean
  onAutoDetect: () => void
  onShowManualForm: () => void
  onClose: () => void
  onAutoConfig: () => Promise<void>
  isAutoConfiguring: boolean
  accountPostSaveWorkflowStep: AccountPostSaveWorkflowStep
  formId?: string
}

/**
 * Action bar within the account dialog handling detect/manual modes and form submission.
 * Renders auto-detect, manual-switch, auto-config, cancel, and submit buttons based on state.
 */
export default function ActionButtons({
  mode,
  url,
  phase,
  formSource,
  isDetecting,
  isSaving,
  isFormValid,
  onAutoDetect,
  onShowManualForm,
  onClose,
  onAutoConfig,
  isAutoConfiguring,
  accountPostSaveWorkflowStep,
  formId,
}: ActionButtonsProps) {
  const { t } = useTranslation(["accountDialog", "common", "settings"])
  const { managedSiteType } = useUserPreferencesContext()
  const isAddMode = mode === DIALOG_MODES.ADD
  const isPreForm = isAddMode && phase === ACCOUNT_DIALOG_PHASES.SITE_INPUT
  const isDetected = formSource === ACCOUNT_DIALOG_FORM_SOURCES.DETECTED
  const managedSiteLabel = getManagedSiteLabel(t, managedSiteType)
  const autoConfigTitle = isFormValid
    ? t("accountDialog:actions.autoConfigTitle", {
        managedSite: managedSiteLabel,
      })
    : t("accountDialog:actions.autoConfigRequiresValidAccount")
  const autoConfigLoadingLabelByStep: Partial<
    Record<AccountPostSaveWorkflowStep, string>
  > = {
    [ACCOUNT_POST_SAVE_WORKFLOW_STEPS.SavingAccount]: t(
      "accountDialog:actions.workflow.savingAccount",
    ),
    [ACCOUNT_POST_SAVE_WORKFLOW_STEPS.LoadingSavedAccount]: t(
      "accountDialog:actions.workflow.loadingSavedAccount",
    ),
    [ACCOUNT_POST_SAVE_WORKFLOW_STEPS.CheckingToken]: t(
      "accountDialog:actions.workflow.checkingToken",
    ),
    [ACCOUNT_POST_SAVE_WORKFLOW_STEPS.CreatingToken]: t(
      "accountDialog:actions.workflow.creatingToken",
    ),
    [ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForOneTimeKeyAcknowledgement]: t(
      "accountDialog:actions.workflow.waitingForOneTimeKey",
    ),
    [ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForSub2ApiGroupSelection]: t(
      "accountDialog:actions.workflow.waitingForSub2ApiGroup",
    ),
    [ACCOUNT_POST_SAVE_WORKFLOW_STEPS.OpeningManagedSiteDialog]: t(
      "accountDialog:actions.workflow.openingManagedSiteDialog",
    ),
  }
  const autoConfigLoadingLabel =
    autoConfigLoadingLabelByStep[accountPostSaveWorkflowStep] ??
    t("accountDialog:actions.configuring")

  if (isPreForm) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={onAutoDetect}
          disabled={!url.trim() || isDetecting}
          loading={isDetecting}
          bleed
          className="flex-1"
          variant="default"
          data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.autoDetectButton}
          leftIcon={
            !isDetecting ? <SparklesIcon className="h-4 w-4" /> : undefined
          }
        >
          {isDetecting
            ? t("accountDialog:mode.detecting")
            : t("accountDialog:mode.autoDetect")}
        </Button>
        <Button
          type="button"
          onClick={onShowManualForm}
          disabled={!url.trim()}
          bleed
          className="flex-1"
          variant="outline"
          data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.manualAddButton}
          leftIcon={<PencilIcon className="h-4 w-4" />}
        >
          {t("accountDialog:mode.manualAdd")}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" onClick={onClose} variant="secondary">
        {t("common:actions.cancel")}
      </Button>

      {mode === DIALOG_MODES.EDIT && !isDetected && (
        <Button
          type="button"
          onClick={onAutoDetect}
          disabled={!url.trim() || isDetecting}
          loading={isDetecting}
          bleed
          className="flex-1"
          variant="warning"
          leftIcon={
            !isDetecting ? <SparklesIcon className="h-4 w-4" /> : undefined
          }
        >
          {isDetecting
            ? t("accountDialog:mode.detecting")
            : t("accountDialog:mode.reDetect")}
        </Button>
      )}

      {isAddMode && (
        <Button
          type="button"
          onClick={onAutoConfig}
          disabled={!isFormValid || isAutoConfiguring || isSaving}
          loading={isAutoConfiguring}
          bleed
          className="flex-1"
          aria-label={t("accountDialog:actions.autoConfigAriaLabel", {
            managedSite: managedSiteLabel,
          })}
          title={autoConfigTitle}
          variant="default"
          leftIcon={
            !isAutoConfiguring ? <BoltIcon className="h-4 w-4" /> : undefined
          }
        >
          {isAutoConfiguring
            ? autoConfigLoadingLabel
            : t("accountDialog:actions.configToManagedSite", {
                managedSite: managedSiteLabel,
              })}
        </Button>
      )}

      <Button
        type="submit"
        {...(formId ? { form: formId } : {})}
        disabled={!isFormValid || isSaving || isAutoConfiguring}
        loading={isSaving}
        bleed
        className="flex-1"
        variant={isAddMode ? "success" : "default"}
        data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.confirmAddButton}
        leftIcon={!isSaving ? <CheckIcon className="h-4 w-4" /> : undefined}
      >
        {isSaving
          ? t("common:status.saving")
          : isAddMode
            ? isDetected
              ? t("accountDialog:actions.confirmAdd")
              : t("accountDialog:actions.saveAccount")
            : t("accountDialog:actions.saveChanges")}
      </Button>
    </div>
  )
}
