import { Combobox as ComboboxPrimitive } from "@base-ui/react"
import { Globe2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { ClearableFieldButton } from "~/components/ui/clearableField"
import {
  Combobox,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "~/components/ui/combobox"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "~/components/ui/input-group"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { getAllTabs } from "~/utils/browser/tabs"
import { createLogger } from "~/utils/core/logger"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

const logger = createLogger("AccountSiteUrlInput")

interface RecentTabSite {
  value: string
  label: string
}

/**
 * Site URL field for the account dialog. The field itself carries the actions
 * that fill it: reusing the site open in the current tab, and picking another
 * recently active site when no current-tab site is available.
 */
export function AccountSiteUrlInput({
  url,
  onUrlChange,
  onClearUrl,
  disabled,
  enableRecentTabs,
  currentTabUrl,
  onUseCurrentTab,
}: {
  url: string
  onUrlChange: (url: string) => void
  onClearUrl: () => void
  disabled: boolean
  enableRecentTabs: boolean
  currentTabUrl?: string | null
  onUseCurrentTab?: () => void
}) {
  const { t } = useTranslation(["accountDialog", "common"])
  const [options, setOptions] = useState<RecentTabSite[]>([])
  const [browseRecentSites, setBrowseRecentSites] = useState(false)
  const fieldAnchor = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    if (!enableRecentTabs) {
      setOptions((prev) => (prev.length === 0 ? prev : []))
      setBrowseRecentSites(false)
      return
    }

    /** Loads unique web origins, keeping each site's most recently active tab title. */
    async function loadRecentSites() {
      try {
        const tabs = await getAllTabs()
        const sites = new Map<string, RecentTabSite>()
        for (const tab of [...tabs].sort(
          (a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0),
        )) {
          if (!tab.url) continue
          try {
            const parsed = new URL(tab.url)
            if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
              continue
            }
            const origin = parsed.origin
            if (sites.has(origin)) continue
            const title = tab.title?.trim()
            sites.set(origin, {
              value: origin,
              label: title ? `${title} — ${origin}` : origin,
            })
          } catch {
            // A tab can have an unavailable or incomplete URL during navigation.
          }
        }
        if (!cancelled) setOptions([...sites.values()])
      } catch (error) {
        logger.warn("Could not load recent tab sites", { error })
        if (!cancelled) {
          setOptions((prev) => (prev.length === 0 ? prev : []))
        }
      }
    }

    void loadRecentSites()
    return () => {
      cancelled = true
    }
  }, [enableRecentTabs])

  const inputProps = {
    id: "site-url",
    type: "text",
    placeholder: "https://example.com",
    disabled,
    "data-testid": ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput,
  }

  const clearButton =
    url && !disabled ? (
      <ClearableFieldButton
        label={t("common:actions.clear")}
        onClick={() => {
          onClearUrl()
          inputRef.current?.focus()
        }}
      />
    ) : null

  // The reuse action belongs to the field it fills, so the detected origin is
  // not repeated as helper text below the input. It stays hidden while the
  // field already holds that site, and its label collapses to the globe on very
  // narrow viewports, where the URL itself needs the room.
  const currentTabSite = normalizeUrlForOriginKey(currentTabUrl, {
    lowerCase: true,
  })
  const useCurrentTabButton =
    currentTabSite &&
    onUseCurrentTab &&
    !disabled &&
    normalizeUrlForOriginKey(url, { lowerCase: true }) !== currentTabSite ? (
      <InputGroupButton
        size="xs"
        onClick={onUseCurrentTab}
        aria-label={t("siteInfo.useCurrent")}
        title={currentTabUrl ?? undefined}
        className="shrink-0 whitespace-nowrap"
      >
        <Globe2 aria-hidden="true" />
        <span className="hidden min-[360px]:inline">
          {t("siteInfo.useCurrent")}
        </span>
      </InputGroupButton>
    ) : null

  if (!enableRecentTabs || options.length === 0) {
    return (
      <InputGroup>
        <InputGroupInput
          ref={inputRef}
          {...inputProps}
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
        />
        <InputGroupAddon align="inline-end">
          {clearButton}
          {useCurrentTabButton}
        </InputGroupAddon>
      </InputGroup>
    )
  }

  return (
    <Combobox
      items={options}
      value={options.find((option) => option.value === url) ?? null}
      inputValue={url}
      itemToStringLabel={(option) => option.value}
      filter={(option, query) =>
        browseRecentSites ||
        option.label.toLowerCase().includes(query.toLowerCase())
      }
      autoHighlight
      onOpenChange={(open, details) => {
        if (open && details.reason === "list-navigation")
          setBrowseRecentSites(true)
      }}
      onInputValueChange={(value, details) => {
        if (details.reason === "input-change") {
          setBrowseRecentSites(false)
          onUrlChange(value)
        }
      }}
      onValueChange={(option) => {
        if (option) onUrlChange(option.value)
      }}
    >
      <InputGroup ref={fieldAnchor}>
        <ComboboxPrimitive.Input
          ref={inputRef}
          render={<InputGroupInput {...inputProps} />}
        />
        <InputGroupAddon align="inline-end">
          {clearButton}
          {useCurrentTabButton}
          <InputGroupButton asChild size="icon-xs">
            <ComboboxTrigger
              type="button"
              onPointerDown={() => setBrowseRecentSites(true)}
              aria-label={t("siteInfo.recentTabSites")}
            />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <ComboboxContent anchor={fieldAnchor} className="min-w-(--anchor-width)">
        <ComboboxList>
          {(option: RecentTabSite) => (
            <ComboboxItem key={option.value} value={option}>
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
