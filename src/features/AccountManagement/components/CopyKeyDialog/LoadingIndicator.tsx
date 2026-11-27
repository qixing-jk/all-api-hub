import { useTranslation } from "react-i18next"

import { DialogLoadingIndicator } from "~/components/ui/Dialog/DialogLoadingIndicator"

/**
 * Loading state shown while copy key data is being fetched.
 */
export function LoadingIndicator() {
  const { t } = useTranslation("ui")
  return <DialogLoadingIndicator label={t("dialog.copyKey.loading")} />
}
