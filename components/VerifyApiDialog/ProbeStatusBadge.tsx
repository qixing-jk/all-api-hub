import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Badge } from "~/components/ui"
import type { ApiVerificationProbeResult } from "~/services/apiVerification/types"

/**
 * Render a standardized status badge for a probe result.
 */
export function ProbeStatusBadge({
  result,
}: {
  result: ApiVerificationProbeResult
}) {
  const { t } = useTranslation("apiVerification")

  if (result.status === "pass") {
    return (
      <Badge variant="success" size="sm">
        <span className="flex items-center gap-1">
          <CheckCircleIcon className="h-3.5 w-3.5" />
          {t("verifyDialog.status.pass")}
        </span>
      </Badge>
    )
  }

  if (result.status === "unsupported") {
    return (
      <Badge variant="outline" size="sm">
        {t("verifyDialog.status.unsupported")}
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
