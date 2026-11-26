import { useState } from "react"

import { BrowserTabSiteOptionList } from "~/components/BrowserTabSiteOptionList"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
} from "~/components/ui/combobox"
import { useRecentBrowserTabSites } from "~/hooks/useRecentBrowserTabSites"
import {
  matchesRecentBrowserTabSite,
  type RecentBrowserTabSite,
} from "~/utils/browser/recentTabSites"

/** Browser-tab choices share origin ordering with account onboarding. */
export function BrowserTabSitePicker({
  label,
  emptyMessage,
  disabled,
  onSelect,
  isSiteSelected,
}: {
  label: string
  emptyMessage: string
  disabled?: boolean
  isSiteSelected: (site: RecentBrowserTabSite) => boolean
  onSelect: (
    sites: readonly RecentBrowserTabSite[],
    previous: readonly RecentBrowserTabSite[],
  ) => void
}) {
  const options = useRecentBrowserTabSites()
  const [query, setQuery] = useState("")
  const selected = options.filter(isSiteSelected)
  const search = query.trim()
  return (
    <Combobox<RecentBrowserTabSite, true>
      multiple
      value={selected}
      items={options}
      inputValue={query}
      onInputValueChange={setQuery}
      // Reopening during the popup's exit transition must use the new search,
      // rather than Base UI's frozen close-query from the previous selection.
      filteredItems={options.filter((option) =>
        matchesRecentBrowserTabSite(option, search),
      )}
      itemToStringLabel={(option) => option.label}
      onValueChange={(sites) => onSelect(sites, selected)}
      disabled={disabled}
    >
      <ComboboxInput
        aria-label={label}
        placeholder={label}
        className="w-full"
        disabled={disabled}
      />
      <ComboboxContent className="max-w-(--available-width) min-w-(--anchor-width)">
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
        <BrowserTabSiteOptionList />
      </ComboboxContent>
    </Combobox>
  )
}
