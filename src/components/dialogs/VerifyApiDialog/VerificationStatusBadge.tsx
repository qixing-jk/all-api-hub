import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Badge } from "~/components/ui"
import type { ApiVerificationProbeStatus } from "~/services/verification/aiApiVerification"
import type { ApiVerificationHistoryDisplayStatus } from "~/services/verification/verificationResultHistory"

type VerificationStatusBadgeProps = {
  status: ApiVerificationProbeStatus | ApiVerificationHistoryDisplayStatus
}

/**
 * Render a standardized status badge for verification results and persisted
 * verification summaries.
 */
export function VerificationStatusBadge({
  status,
}: VerificationStatusBadgeProps) {
  const { t } = useTranslation("aiApiVerification")

  if (status === "pass") {
    return (
      <Badge variant="success" size="sm">
        <span className="flex items-center gap-1">
          <CheckCircleIcon className="h-3.5 w-3.5" />
          {t("verifyDialog.status.pass")}
        </span>
      </Badge>
    )
  }

  if (status === "unsupported") {
    return (
      <Badge variant="outline" size="sm">
        {t("verifyDialog.status.unsupported")}
      </Badge>
    )
  }

  if (status === "unverified") {
    return (
      <Badge variant="outline" size="sm">
        {t("verifyDialog.status.unverified")}
      </Badge>
    )
  }

  return (
    <Badge variant="destructive" size="sm">
      <span className="flex items-center gap-1">
        <XCircleIcon className="h-3.5 w-3.5" />
        {t("verifyDialog.status.fail")}
      </span>
    </Badge>
  )
}
