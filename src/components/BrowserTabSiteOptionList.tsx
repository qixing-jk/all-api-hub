import { SiteFavicon } from "~/components/icons/SiteFavicon"
import { ComboboxItem, ComboboxList } from "~/components/ui/combobox"
import type { RecentBrowserTabSite } from "~/utils/browser/recentTabSites"

/** Renders the same labeled option in single- and multi-select tab pickers. */
export function BrowserTabSiteOptionList({
  getOptionKey = (site) => site.value,
}: {
  getOptionKey?: (site: RecentBrowserTabSite) => string
}) {
  return (
    <ComboboxList>
      {(site: RecentBrowserTabSite) => (
        <ComboboxItem key={getOptionKey(site)} value={site}>
          <SiteFavicon pageUrl={site.url} favIconUrl={site.favIconUrl} />
          <span className="min-w-0 flex-1 truncate" title={site.label}>
            {site.label}
          </span>
        </ComboboxItem>
      )}
    </ComboboxList>
  )
}
