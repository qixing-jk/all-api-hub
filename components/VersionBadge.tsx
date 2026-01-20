import { Badge } from "~/components/ui"
import { getManifest } from "~/utils/browserApi"
import { getDocsChangelogUrl } from "~/utils/docsLinks"

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
  if (!version) return null

  const changelogUrl = getDocsChangelogUrl(version)

  return (
    <Badge asChild variant={variant} size={size} className={className}>
      <a
        href={changelogUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="tap-highlight-transparent touch-manipulation"
        aria-label={`v${version} changelog`}
      >
        v{version}
      </a>
    </Badge>
  )
}
