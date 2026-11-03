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
    <Alert
      variant="destructive"
      title={t("dialog.copyKey.getFailed")}
      description={error}
    >
      <Button onClick={onRetry} variant="outline" size="sm">
        {t("dialog.copyKey.retry")}
      </Button>
    </Alert>
  )
}
