import { CircleCheck, CircleX } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "~/components/ui"
import { API_VERIFICATION_PROBE_STATUSES } from "~/services/verification/aiApiVerification"
import type { CliSupportResult } from "~/services/verification/cliSupportVerification"

/**
 * Render a standardized status badge for a CLI tool result.
 */
export function ToolStatusBadge({ result }: { result: CliSupportResult }) {
  const { t } = useTranslation("cliSupportVerification")

  if (result.status === API_VERIFICATION_PROBE_STATUSES.Pass) {
    return (
      <Badge variant="success" size="sm">
        <span className="flex items-center gap-1">
          <CircleCheck className="h-3.5 w-3.5" />
          {t("verifyDialog.status.pass")}
        </span>
      </Badge>
    )
  }

  if (result.status === API_VERIFICATION_PROBE_STATUSES.Unsupported) {
    return (
      <Badge variant="outline" size="sm">
        {t("verifyDialog.status.unsupported")}
      </Badge>
    )
  }

  return (
    <Badge variant="destructive" size="sm">
      <span className="flex items-center gap-1">
        <CircleX className="h-3.5 w-3.5" />
        {t("verifyDialog.status.fail")}
      </span>
    </Badge>
  )
}
