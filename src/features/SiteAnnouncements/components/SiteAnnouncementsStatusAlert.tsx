import { ShieldAlert } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { SiteAnnouncementSiteState } from "~/types/siteAnnouncements"

import { formatDateTime } from "../utils"

interface SiteAnnouncementsStatusAlertProps {
  status: SiteAnnouncementSiteState
}

/**
 * Shows the selected site's latest announcement polling status when it is not healthy.
 */
export function SiteAnnouncementsStatusAlert({
  status,
}: SiteAnnouncementsStatusAlertProps) {
  const { t } = useTranslation("siteAnnouncements")

  if (status.status === "success") {
    return null
  }

  return (
    <div className="mb-4 flex gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium">
          {status.status === "unsupported"
            ? t("status.unsupportedTitle")
            : t("status.failedTitle")}
        </p>
        <p className="mt-1 break-words">
          {status.status === "unsupported"
            ? t("status.unsupported")
            : t("status.failed", {
                error: status.lastError ?? "-",
              })}
        </p>
        <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-100/75">
          {t("status.lastChecked", {
            time: formatDateTime(status.lastCheckedAt),
          })}
        </p>
      </div>
    </div>
  )
}
