import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"

interface FormActionsProps {
  isSubmitting: boolean
  isEditMode: boolean
  onClose: () => void
  onSubmit: () => void
  canSubmit: boolean
}

/**
 * Renders dialog footer buttons handling cancel/save flows.
 * @param props Component props container.
 * @param props.isSubmitting Whether form submission is in progress.
 * @param props.isEditMode Toggles between create/update labels.
 * @param props.onClose Callback invoked when cancel button pressed.
 * @param props.onSubmit Callback invoked for primary action.
 * @param props.canSubmit Enables submit button when form is valid.
 */
export function FormActions({
  isSubmitting,
  isEditMode,
  onClose,
  onSubmit,
  canSubmit,
}: FormActionsProps) {
  const { t } = useTranslation("keyManagement")

  return (
    <div className="flex justify-end space-x-3 pt-4">
      <Button onClick={onClose} disabled={isSubmitting} variant="secondary">
        {t("common:actions.cancel")}
      </Button>
      <Button
        onClick={onSubmit}
        disabled={isSubmitting || !canSubmit}
        loading={isSubmitting}
      >
        {isSubmitting
          ? isEditMode
            ? t("common:status.updating")
            : t("common:status.creating")
          : isEditMode
            ? t("dialog.updateToken")
            : t("dialog.createToken")}
      </Button>
    </div>
  )
}
