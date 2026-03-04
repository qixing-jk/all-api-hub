import { useTranslation } from "react-i18next"

import { Alert, Button } from "~/components/ui"

interface ErrorDisplayProps {
  error: string
  onRetry: () => void
}

/**
 * Renders error state within copy key dialog, showing failure message and retry action.
 */
export function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
  const { t } = useTranslation("ui")

  return (
    <Alert variant="destructive">
      <div>
        <h3 className="mb-1 font-medium">{t("dialog.copyKey.getFailed")}</h3>
        <p className="mb-3 text-sm">{error}</p>
        <Button onClick={onRetry} variant="destructive" size="sm">
          {t("dialog.copyKey.retry")}
        </Button>
      </div>
    </Alert>
  )
}
