import { useTranslation } from "react-i18next"

/**
 * Spinner placeholder shown while copy key data is being fetched.
 */
export function LoadingIndicator() {
  const { t } = useTranslation("ui")

  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-purple-300 border-t-purple-600" />
      <p className="dark:text-dark-text-secondary text-sm text-gray-500">
        {t("dialog.copyKey.loading")}
      </p>
    </div>
  )
}
