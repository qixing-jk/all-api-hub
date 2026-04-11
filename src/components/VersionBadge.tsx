import { ArrowUpCircleIcon } from "@heroicons/react/24/solid"
import { useTranslation } from "react-i18next"

import { Badge } from "~/components/ui"
import { useReleaseUpdateStatus } from "~/contexts/ReleaseUpdateStatusContext"
import { cn } from "~/lib/utils"
import { hasAvailableReleaseUpdate } from "~/services/updates/presentation"
import { getManifest } from "~/utils/browser/browserApi"
import { getDocsChangelogUrl } from "~/utils/navigation/docsLinks"

export type VersionBadgeProps = {
  /**
   * Badge size variant.
   */
  size?: "default" | "sm"

  /**
   * Badge color variant.
   */
  variant?: "default" | "secondary" | "destructive" | "outline"

  /**
   * Optional extra className for the badge container.
   */
  className?: string
}

/**
 * VersionBadge shows the current extension version and links to the changelog anchor for that version.
 *
 * This intentionally reads from the runtime manifest to reflect the actual packaged version used by the extension.
 */
export function VersionBadge({
  size = "default",
  variant = "secondary",
  className,
}: VersionBadgeProps) {
  const { version } = getManifest()
  const { t } = useTranslation("settings")
  const { status } = useReleaseUpdateStatus()
  if (!version) return null

  const hasUpdate = hasAvailableReleaseUpdate(status)
  const href =
    hasUpdate && status ? status.releaseUrl : getDocsChangelogUrl(version)
  const ariaLabel = hasUpdate
    ? t("releaseUpdate.versionBadge.updateAvailableAriaLabel", { version })
    : t("releaseUpdate.versionBadge.changelogAriaLabel", { version })

  return (
    <Badge asChild variant={variant} size={size} className={className}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "tap-highlight-transparent inline-flex touch-manipulation items-center gap-1.5",
        )}
        aria-label={ariaLabel}
      >
        <span>v{version}</span>
        {hasUpdate && (
          <ArrowUpCircleIcon
            aria-hidden="true"
            className="h-5 w-5 text-amber-500"
          />
        )}
      </a>
    </Badge>
  )
}
