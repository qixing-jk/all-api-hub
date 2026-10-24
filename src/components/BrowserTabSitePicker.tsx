import { useEffect, useState } from "react"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "~/components/ui/combobox"
import {
  getRecentBrowserTabSites,
  type RecentBrowserTabSite,
} from "~/utils/browser/recentTabSites"
import { getAllTabs } from "~/utils/browser/tabs"

/** Browser-tab choices share origin ordering with account onboarding. */
export function BrowserTabSitePicker({
  label,
  emptyMessage,
  disabled,
  onSelect,
  selectedOrigins,
}: {
  label: string
  emptyMessage: string
  disabled?: boolean
  selectedOrigins: string[]
  onSelect: (sites: RecentBrowserTabSite[]) => void
}) {
  const [options, setOptions] = useState<RecentBrowserTabSite[]>([])
  const [query, setQuery] = useState("")
  useEffect(() => {
    let active = true
    void getAllTabs()
      .then((tabs) => {
        if (active) setOptions(getRecentBrowserTabSites(tabs))
      })
      .catch(() => {
        if (active) setOptions([])
      })
    return () => {
      active = false
    }
  }, [])
  return (
    <Combobox<RecentBrowserTabSite, true>
      multiple
      value={options.filter((option) => selectedOrigins.includes(option.value))}
      items={options}
      inputValue={query}
      onInputValueChange={setQuery}
      // Reopening during the popup's exit transition must use the new search,
      // rather than Base UI's frozen close-query from the previous selection.
      filteredItems={options.filter((option) =>
        option.label.toLowerCase().includes(query.trim().toLowerCase()),
      )}
      itemToStringLabel={(option) => option.label}
      onValueChange={(option) => {
        onSelect(option)
      }}
      disabled={disabled}
    >
      <ComboboxInput
        aria-label={label}
        placeholder={label}
        className="w-full"
      />
      <ComboboxContent className="max-w-(--available-width) min-w-(--anchor-width)">
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
        <ComboboxList>
          {(option: RecentBrowserTabSite) => (
            <ComboboxItem key={option.value} value={option}>
              <span className="min-w-0 truncate">{option.label}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
