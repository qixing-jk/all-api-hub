import { Combobox as ComboboxPrimitive } from "@base-ui/react"
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react"

import Tooltip from "~/components/Tooltip"
import { ClearableFieldButton } from "~/components/ui/clearableField"
import {
  Combobox,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "~/components/ui/combobox"
import { Input } from "~/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "~/components/ui/input-group"
import {
  getRecentBrowserTabSites,
  type RecentBrowserTabSite,
} from "~/utils/browser/recentTabSites"
import { getAllTabs } from "~/utils/browser/tabs"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("BrowserTabUrlInput")

/** Matches the tab's title and displayed URL case-insensitively. */
function matchesTabSite(option: RecentBrowserTabSite, query: string) {
  return option.label.toLowerCase().includes(query.toLowerCase())
}

interface BrowserTabUrlInputProps {
  inputProps: Omit<ComponentProps<"input">, "value" | "onChange"> & {
    "data-testid"?: string
  }
  url: string
  onUrlChange: (url: string) => void
  onSelectSite?: (site: RecentBrowserTabSite) => void
  enableRecentTabs: boolean
  recentTabsLabel: string
  urlMode: "origin" | "page"
  clearAction?: { label: string; onClear: () => void }
  endActions?: ReactNode
}

/** A free-text URL field that can also fill a URL from an open web tab. */
export function BrowserTabUrlInput({
  inputProps,
  url,
  onUrlChange,
  onSelectSite,
  enableRecentTabs,
  recentTabsLabel,
  urlMode,
  clearAction,
  endActions,
}: BrowserTabUrlInputProps) {
  const [options, setOptions] = useState<RecentBrowserTabSite[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [browseRecentSites, setBrowseRecentSites] = useState(false)
  const fieldAnchor = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setOptions((previous) => (previous.length ? [] : previous))
    setIsOpen(false)
    setBrowseRecentSites(false)
    if (!enableRecentTabs) return

    let active = true
    void getAllTabs()
      .then((tabs) => {
        if (active) setOptions(getRecentBrowserTabSites(tabs, urlMode))
      })
      .catch((error) => {
        if (active) logger.warn("Could not load recent tab sites", { error })
      })
    return () => {
      active = false
    }
  }, [enableRecentTabs, urlMode])

  const clearButton =
    clearAction && url && !inputProps.disabled ? (
      <Tooltip
        content={clearAction.label}
        anchorAsChild
        includeAccessibleDescription={false}
        pointerTransparent
      >
        <ClearableFieldButton
          label={clearAction.label}
          showNativeTooltip={false}
          onClick={() => {
            clearAction.onClear()
            inputRef.current?.focus()
          }}
        />
      </Tooltip>
    ) : null

  if (!enableRecentTabs) {
    const manualProps = {
      ...inputProps,
      value: url,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        onUrlChange(event.target.value),
    }
    if (!clearAction && !endActions) return <Input {...manualProps} />

    return (
      <InputGroup className="@container">
        <InputGroupInput ref={inputRef} {...manualProps} />
        <InputGroupAddon align="inline-end">
          {clearButton}
          {endActions}
        </InputGroupAddon>
      </InputGroup>
    )
  }

  const getOptionUrl = (site: RecentBrowserTabSite) =>
    urlMode === "page" ? site.url : site.value
  const hasOptions = options.length > 0

  return (
    <Combobox
      items={options}
      value={options.find((option) => getOptionUrl(option) === url) ?? null}
      inputValue={url}
      open={isOpen && hasOptions}
      itemToStringLabel={getOptionUrl}
      filter={(option, query) =>
        browseRecentSites || matchesTabSite(option, query)
      }
      autoHighlight
      disabled={inputProps.disabled}
      onOpenChange={(open, details) => {
        if (details.reason === "input-change") return
        if (
          open &&
          (details.reason === "list-navigation" ||
            details.reason === "trigger-press")
        ) {
          setBrowseRecentSites(true)
          setIsOpen(true)
        } else {
          setIsOpen(
            open &&
              (browseRecentSites ||
                options.some((option) => matchesTabSite(option, url))),
          )
        }
      }}
      onInputValueChange={(value, details) => {
        if (details.reason === "input-change") {
          setBrowseRecentSites(false)
          // Manual URLs are valid even when they match no open tab.
          setIsOpen(options.some((option) => matchesTabSite(option, value)))
          onUrlChange(value)
        }
      }}
      onValueChange={(option) => {
        if (!option) return
        onUrlChange(getOptionUrl(option))
        onSelectSite?.(option)
      }}
    >
      <InputGroup ref={fieldAnchor} className="@container">
        <ComboboxPrimitive.Input
          ref={inputRef}
          render={<InputGroupInput {...inputProps} />}
        />
        {(clearButton || endActions || hasOptions) && (
          <InputGroupAddon align="inline-end">
            {clearButton}
            {endActions}
            {hasOptions && (
              <Tooltip
                content={recentTabsLabel}
                className={isOpen ? "hidden" : undefined}
                anchorAsChild
                includeAccessibleDescription={false}
                pointerTransparent
              >
                <InputGroupButton asChild size="icon-xs">
                  <ComboboxTrigger type="button" aria-label={recentTabsLabel} />
                </InputGroupButton>
              </Tooltip>
            )}
          </InputGroupAddon>
        )}
      </InputGroup>
      {hasOptions && (
        <ComboboxContent
          anchor={fieldAnchor}
          className="min-w-(--anchor-width)"
        >
          <ComboboxList>
            {(option: RecentBrowserTabSite) => (
              <ComboboxItem key={getOptionUrl(option)} value={option}>
                <span className="min-w-0 flex-1 truncate" title={option.label}>
                  {option.label}
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      )}
    </Combobox>
  )
}
