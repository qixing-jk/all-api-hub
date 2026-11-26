import { useTranslation } from "react-i18next"

import { BrowserTabUrlInput } from "~/components/BrowserTabUrlInput"
import { AccountSiteIcon } from "~/components/icons/productIcons"
import Tooltip from "~/components/Tooltip"
import { InputGroupButton } from "~/components/ui/input-group"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

/** Site URL field with a shortcut to fill the active tab's origin. */
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
  const currentTabSite = normalizeUrlForOriginKey(currentTabUrl, {
    lowerCase: true,
  })
  const useCurrentLabel = t("siteInfo.useCurrent")
  const useCurrentTabButton =
    currentTabSite &&
    onUseCurrentTab &&
    !disabled &&
    normalizeUrlForOriginKey(url, { lowerCase: true }) !== currentTabSite ? (
      <Tooltip
        content={`${useCurrentLabel}\n${currentTabUrl}`}
        className="wrap-anywhere whitespace-pre-line"
        anchorAsChild
        pointerTransparent
      >
        <InputGroupButton
          size="xs"
          onClick={onUseCurrentTab}
          aria-label={useCurrentLabel}
          className="shrink-0 whitespace-nowrap"
        >
          <AccountSiteIcon aria-hidden="true" />
          <span className="hidden @min-[22rem]:inline">{useCurrentLabel}</span>
        </InputGroupButton>
      </Tooltip>
    ) : null

  return (
    <BrowserTabUrlInput
      inputProps={{
        id: "site-url",
        type: "text",
        placeholder: "https://example.com",
        disabled,
        "data-testid": ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput,
      }}
      url={url}
      onUrlChange={onUrlChange}
      enableRecentTabs={enableRecentTabs}
      recentTabsLabel={t("siteInfo.recentTabSites")}
      urlMode="origin"
      clearAction={{ label: t("common:actions.clear"), onClear: onClearUrl }}
      endActions={useCurrentTabButton}
    />
  )
}
