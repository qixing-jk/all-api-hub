import { useTranslation } from "react-i18next"

import { Spinner } from "~/components/ui"

/**
 * Loading state shown while copy key data is being fetched.
 */
export function LoadingIndicator() {
  const { t } = useTranslation("ui")
  const loadingLabel = t("dialog.copyKey.loading")

  return (
    <div className="flex flex-col items-center justify-center py-8">
      <Spinner size="lg" className="mb-4" aria-label={loadingLabel} />
      <p className="dark:text-secondary-foreground text-muted-foreground text-sm">
        {loadingLabel}
      </p>
    </div>
  )
}
