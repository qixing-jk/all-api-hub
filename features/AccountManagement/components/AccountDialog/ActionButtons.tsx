import {
  BoltIcon,
  CheckIcon,
  PencilIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"

interface ActionButtonsProps {
  mode: DialogMode
  url: string
  isDetecting: boolean
  isSaving: boolean
  isFormValid: boolean
  isDetected?: boolean
  onAutoDetect: () => void
  onShowManualForm: () => void
  onClose: () => void
  onAutoConfig: () => Promise<void>
  isAutoConfiguring: boolean
  formId?: string
}

export default function ActionButtons({
  mode,
  url,
  isDetecting,
  isSaving,
  isFormValid,
  isDetected,
  onAutoDetect,
  onShowManualForm,
  onClose,
  onAutoConfig,
  isAutoConfiguring,
  formId,
}: ActionButtonsProps) {
  const { t } = useTranslation(["accountDialog", "common"])
  const isAddMode = mode === DIALOG_MODES.ADD

  if (isAddMode && !isDetected && !isFormValid) {
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
          bleed
          className="flex-1"
          variant="outline"
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
          disabled={isAutoConfiguring || isSaving}
          loading={isAutoConfiguring}
          bleed
          className="flex-1"
          aria-label={t("accountDialog:actions.autoConfigAriaLabel")}
          title={t("accountDialog:actions.autoConfigTitle")}
          variant="default"
          leftIcon={
            !isAutoConfiguring ? <BoltIcon className="h-4 w-4" /> : undefined
          }
        >
          {isAutoConfiguring
            ? t("accountDialog:actions.configuring")
            : t("accountDialog:actions.configToNewApi")}
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
