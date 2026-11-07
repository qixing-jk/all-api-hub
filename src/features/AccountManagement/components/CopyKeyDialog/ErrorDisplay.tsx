import { useTranslation } from "react-i18next"

import { Alert, Button } from "~/components/ui"
import { AccountCredentialRecoveryGuidance } from "~/features/AccountManagement/credentialRecovery/AccountCredentialRecoveryGuidance"
import type { DisplaySiteData } from "~/types"

interface ErrorDisplayProps {
  error: string
  onRetry: () => void
  account?: DisplaySiteData | null
  authenticationFailed?: boolean
  onNavigate?: () => void
}

/**
 * Renders error state within copy key dialog, showing failure message and retry action.
 */
export function ErrorDisplay({
  error,
  onRetry,
  account,
  authenticationFailed,
  onNavigate,
}: ErrorDisplayProps) {
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
      {account && authenticationFailed && (
        <AccountCredentialRecoveryGuidance
          account={account}
          failure
          onNavigate={onNavigate}
        />
      )}
    </Alert>
  )
}
