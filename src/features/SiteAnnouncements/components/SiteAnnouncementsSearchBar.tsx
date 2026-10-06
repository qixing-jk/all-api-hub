import { Search } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Input } from "~/components/ui"

interface SiteAnnouncementsSearchBarProps {
  value: string
  resultCount: number
  onChange: (value: string) => void
}

/**
 * Free-text search over the cached announcements, with the current result
 * count kept at the trailing edge of the same row.
 */
export function SiteAnnouncementsSearchBar({
  value,
  resultCount,
  onChange,
}: SiteAnnouncementsSearchBarProps) {
  const { t } = useTranslation("siteAnnouncements")

  return (
    <div className="mb-density-4">
      <Input
        type="search"
        // Chromium renders its own cancel affordance inside a search input,
        // which would sit next to the shared clear button.
        className="[&::-webkit-search-cancel-button]:appearance-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onClear={() => onChange("")}
        clearButtonLabel={t("search.clear")}
        placeholder={t("search.placeholder")}
        aria-label={t("search.placeholder")}
        leftIcon={<Search className="h-4 w-4" />}
        rightIcon={
          <span
            aria-hidden="true"
            className="text-muted-foreground text-xs tabular-nums"
          >
            {t("search.resultCount", { count: resultCount })}
          </span>
        }
      />
    </div>
  )
}
