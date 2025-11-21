import {
  BoltIcon,
  CheckIcon,
  PencilIcon,
  SparklesIcon
} from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

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
  formId
}: ActionButtonsProps) {
  const { t } = useTranslation(["accountDialog", "common"])
  const isAddMode = mode === DIALOG_MODES.ADD

  if (isAddMode && !isDetected && !isFormValid) {
    return (
      <div className="flex space-x-3">
        <button
          type="button"
          onClick={onAutoDetect}
          disabled={!url.trim() || isDetecting}
          className="flex flex-1 items-center justify-center space-x-2 rounded-lg bg-linear-to-r from-blue-500 to-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:from-blue-600 hover:to-indigo-700 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50">
          {isDetecting ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <span>{t("accountDialog:mode.detecting")}</span>
            </>
          ) : (
            <>
              <SparklesIcon className="h-4 w-4" />
              <span>{t("accountDialog:mode.autoDetect")}</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onShowManualForm}
          className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary dark:text-dark-text-secondary dark:hover:bg-dark-bg-tertiary flex flex-1 items-center justify-center space-x-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 hover:bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:outline-none">
          <PencilIcon className="h-4 w-4" />
          <span>{t("accountDialog:mode.manualAdd")}</span>
        </button>
      </div>
    )
  }

  return (
    <div className="flex space-x-3 pt-2">
      <button
        type="button"
        onClick={onClose}
        className="dark:bg-dark-bg-tertiary dark:text-dark-text-secondary rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200 focus:ring-2 focus:ring-gray-500 focus:outline-none dark:hover:bg-gray-700">
        {t("common:actions.cancel")}
      </button>

      {mode === DIALOG_MODES.EDIT && !isDetected && (
        <button
          type="button"
          onClick={onAutoDetect}
          disabled={!url.trim() || isDetecting}
          className="flex flex-1 items-center justify-center space-x-2 rounded-lg bg-linear-to-r from-blue-500 to-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:from-blue-600 hover:to-indigo-700 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50">
          {isDetecting ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <span>{t("accountDialog:mode.detecting")}</span>
            </>
          ) : (
            <>
              <SparklesIcon className="h-4 w-4" />
              <span>{t("accountDialog:mode.reDetect")}</span>
            </>
          )}
        </button>
      )}

      {isAddMode && (
        <button
          type="button"
          onClick={onAutoConfig}
          disabled={isAutoConfiguring || isSaving}
          className="flex flex-1 items-center justify-center space-x-2 rounded-lg bg-linear-to-r from-purple-500 to-pink-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:from-purple-600 hover:to-pink-700 focus:ring-2 focus:ring-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={t("accountDialog:actions.autoConfigAriaLabel")}
          title={t("accountDialog:actions.autoConfigTitle")}>
          {isAutoConfiguring ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <span>{t("accountDialog:actions.configuring")}</span>
            </>
          ) : (
            <>
              <BoltIcon className="h-4 w-4" />
              <span>{t("accountDialog:actions.configToNewApi")}</span>
            </>
          )}
        </button>
      )}

      <button
        type="submit"
        {...(formId ? { form: formId } : {})}
        disabled={!isFormValid || isSaving || isAutoConfiguring}
        className="flex flex-1 items-center justify-center space-x-2 rounded-lg bg-linear-to-r from-green-500 to-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:from-green-600 hover:to-emerald-700 focus:ring-2 focus:ring-green-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50">
        {isSaving ? (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            <span>{t("common:status.saving")}</span>
          </>
        ) : (
          <>
            <CheckIcon className="h-4 w-4" />
            <span>
              {isAddMode
                ? isDetected
                  ? t("accountDialog:actions.confirmAdd")
                  : t("accountDialog:actions.saveAccount")
                : t("accountDialog:actions.saveChanges")}
            </span>
          </>
        )}
      </button>
    </div>
  )
}
