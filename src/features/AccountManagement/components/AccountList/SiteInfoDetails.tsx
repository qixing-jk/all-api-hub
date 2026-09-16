import {
  CalendarDays,
  Gift,
  Link,
  RefreshCw,
  SquarePen,
  Tag,
  User,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Caption } from "~/components/ui"
import { SiteInfoHighlightedText } from "~/features/AccountManagement/components/AccountList/SiteInfoHighlightedText"
import type { SearchResultWithHighlight } from "~/features/AccountManagement/hooks/useAccountSearch"
import { cn } from "~/lib/utils"
import type { DisplaySiteData } from "~/types"
import { formatLocaleDateTime } from "~/utils/core/formatters"

/** Keeps metadata rows aligned, including icons and truncated text. */
function SiteInfoDetailRow({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: LucideIcon
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "gap-y-density-1 mt-0.5 flex min-w-0 items-start gap-x-1",
        className,
      )}
    >
      <Icon className="dark:text-muted-foreground text-faint-foreground mt-0.5 h-3 w-3 shrink-0" />
      <Caption className="truncate" title={title}>
        {children}
      </Caption>
    </div>
  )
}

interface SiteInfoDetailsProps {
  site: DisplaySiteData
  highlights?: SearchResultWithHighlight["highlights"]
  showCreatedAt: boolean
}

/** Renders account metadata and search matches beneath the site title. */
export function SiteInfoDetails({
  site,
  highlights,
  showCreatedAt,
}: SiteInfoDetailsProps) {
  const { t } = useTranslation(["account", "messages", "common"])
  const customCheckInUrl = site.checkIn?.customCheckIn?.url
  const customRedeemUrl = site.checkIn?.customCheckIn?.redeemUrl
  const hasTags = Boolean(site.tags && site.tags.length > 0)
  const tagLabel = hasTags ? site.tags?.join(", ") || "" : ""
  const createdAtLabel = t("account:list.header.createdAt")
  const createdAtText = formatLocaleDateTime(
    site.created_at,
    t("common:labels.notAvailable"),
  )

  return (
    <>
      <SiteInfoDetailRow icon={User} title={site.username}>
        {highlights?.username && site.username ? (
          <SiteInfoHighlightedText
            fragments={highlights.username}
            fallback={site.username}
          />
        ) : (
          site.username
        )}
      </SiteInfoDetailRow>

      {showCreatedAt && (
        <SiteInfoDetailRow
          icon={CalendarDays}
          title={`${createdAtLabel}: ${createdAtText}`}
        >
          {createdAtLabel}: {createdAtText}
        </SiteInfoDetailRow>
      )}

      {highlights?.baseUrl && (
        <SiteInfoDetailRow icon={Link} title={site.baseUrl}>
          <SiteInfoHighlightedText
            fragments={highlights.baseUrl}
            fallback={site.baseUrl}
          />
        </SiteInfoDetailRow>
      )}

      {highlights?.customCheckInUrl && customCheckInUrl && (
        <SiteInfoDetailRow icon={RefreshCw} title={customCheckInUrl}>
          <SiteInfoHighlightedText
            fragments={highlights.customCheckInUrl}
            fallback={customCheckInUrl}
          />
        </SiteInfoDetailRow>
      )}

      {highlights?.customRedeemUrl && customRedeemUrl && (
        <SiteInfoDetailRow icon={Gift} title={customRedeemUrl}>
          <SiteInfoHighlightedText
            fragments={highlights.customRedeemUrl}
            fallback={customRedeemUrl}
          />
        </SiteInfoDetailRow>
      )}

      {site.notes && (
        <SiteInfoDetailRow
          icon={SquarePen}
          title={site.notes}
          className="sm:mt-density-1"
        >
          {site.notes}
        </SiteInfoDetailRow>
      )}

      {hasTags && (
        <SiteInfoDetailRow
          icon={Tag}
          title={tagLabel}
          className="sm:mt-density-1"
        >
          <SiteInfoHighlightedText
            fragments={highlights?.tags}
            fallback={tagLabel}
          />
        </SiteInfoDetailRow>
      )}
    </>
  )
}
