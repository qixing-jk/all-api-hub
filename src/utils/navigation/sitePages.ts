import {
  resolveAccountSiteRouteUrl,
  SITE_ROUTE_KINDS,
} from "~/services/accounts/utils/siteRouteResolver"
import type { DisplaySiteData } from "~/types"
import { createTab as createTabApi } from "~/utils/browser/tabs"
import { createWindow, hasWindowsAPI } from "~/utils/browser/windows"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import {
  closeIfPopup,
  openMultiplePages,
  withPopupClose,
} from "~/utils/navigation/popup"

const logger = createLogger("Navigation")

/**
 * Opens the stored account's base URL in a new browser tab.
 * This remains available even when the account is disabled so users can still reach the provider site.
 * @param account Account metadata containing the base URL to open.
 */
const _openAccountBaseUrl = async (
  account: Pick<DisplaySiteData, "baseUrl">,
) => {
  await createTabApi(account.baseUrl, true)
}

/**
 * Opens the provider usage log endpoint derived from account metadata.
 * @param account Account definition containing base URL and site type.
 */
const _openUsagePage = async (account: DisplaySiteData) => {
  const logUrl = await resolveAccountSiteRouteUrl(
    account,
    SITE_ROUTE_KINDS.Usage,
  )
  if (logUrl) await createTabApi(logUrl, true)
}

/**
 * Resolves the default check-in URL for a given account.
 * @param account Account metadata used to resolve the check-in URL.
 */
const getCheckInPageUrl = (account: DisplaySiteData) =>
  resolveAccountSiteRouteUrl(account, SITE_ROUTE_KINDS.CheckIn)

/**
 * Best-effort URL opener for grouped navigation flows.
 *
 * When `openInNewWindow` is enabled and the Windows API is available, the first
 * URL is opened in a dedicated browser window and later URLs reuse that window
 * as tabs. Failures are logged and counted so callers can report partial
 * completion without aborting the remaining URLs.
 */
const openUrlsBestEffort = async (
  urls: string[],
  options?: { openInNewWindow?: boolean },
): Promise<{ openedCount: number; failedCount: number }> => {
  let openedCount = 0
  let targetWindowId: number | null = null

  for (const url of urls) {
    try {
      if (options?.openInNewWindow && hasWindowsAPI()) {
        if (targetWindowId == null) {
          const createdWindow = await createWindow({ url, focused: true })
          if (createdWindow?.id != null) {
            targetWindowId = createdWindow.id
            openedCount += 1
            continue
          }
        } else {
          try {
            const tab = await createTabApi(url, true, {
              windowId: targetWindowId,
            })
            if (tab?.id != null) {
              openedCount += 1
              continue
            }
          } catch (error) {
            logger.debug("Failed to reuse grouped navigation window", {
              url,
              targetWindowId,
              error,
            })
          }

          const recreatedWindow = await createWindow({ url, focused: true })
          if (recreatedWindow?.id != null) {
            targetWindowId = recreatedWindow.id
            openedCount += 1
            continue
          }
        }
      }

      const tab = await createTabApi(url, true)
      if (tab?.id != null) {
        openedCount += 1
        continue
      }

      logger.warn("Browser did not return a tab while opening URL", { url })
    } catch (error) {
      logger.warn("Failed to open URL during grouped navigation", {
        url,
        error: getErrorMessage(error),
      })
    }
  }

  return {
    openedCount,
    failedCount: Math.max(0, urls.length - openedCount),
  }
}

/**
 * Opens the default check-in page for a given account.
 * @param account Account metadata used to resolve the check-in URL.
 */
const _openCheckInPage = async (account: DisplaySiteData) => {
  const checkInUrl = await getCheckInPageUrl(account)
  if (checkInUrl) await createTabApi(checkInUrl, true)
}

/**
 * Opens the account's custom check-in URL when present, otherwise falls back to
 * the default site-specific path so manual overrides keep working.
 * @param account Account metadata that may contain a custom check-in URL.
 */
const _openCustomCheckInPage = async (account: DisplaySiteData) => {
  const customCheckInUrl = await resolveAccountSiteRouteUrl(
    account,
    SITE_ROUTE_KINDS.CheckIn,
    account.checkIn?.customCheckIn?.url,
  )
  if (customCheckInUrl) await createTabApi(customCheckInUrl, true)
}

/**
 * Opens the redeem flow, honoring custom URLs when available.
 * @param account Account metadata that can optionally override redeem path.
 */
const _openRedeemPage = async (account: DisplaySiteData) => {
  const redeemUrl = await resolveAccountSiteRouteUrl(
    account,
    SITE_ROUTE_KINDS.Redeem,
    account.checkIn?.customCheckIn?.redeemUrl,
  )
  if (redeemUrl) await createTabApi(redeemUrl, true)
}

/**
 * Open the stored account's base URL in a new tab and auto-close the popup when triggered from popup.html.
 */
export const openAccountBaseUrl = withPopupClose(_openAccountBaseUrl)

/**
 * Open the provider's usage log page and auto-close the popup when triggered
 * from compact contexts.
 */
export const openUsagePage = withPopupClose(_openUsagePage)

/**
 * Open the default check-in page for the provided account and shut down the
 * popup shell once the navigation has been requested.
 */
export const openCheckInPage = withPopupClose(_openCheckInPage)

/**
 * Open multiple accounts' default check-in pages, optionally grouping them into
 * a dedicated window when requested by the triggering interaction.
 * @param accounts Accounts whose default check-in pages should be opened.
 * @param options Bulk open options derived from the user's interaction.
 * @param options.openInNewWindow When true, open the first page in a new
 * dedicated window and reuse that window for the remaining pages when
 * supported by the browser.
 */
export const openCheckInPages = async (
  accounts: DisplaySiteData[],
  options?: { openInNewWindow?: boolean },
) => {
  const urls = await Promise.all(accounts.map(getCheckInPageUrl))
  const availableUrls = urls.filter((url): url is string => url !== null)
  const result = await openUrlsBestEffort(availableUrls, options)
  closeIfPopup()
  return {
    ...result,
    failedCount: result.failedCount + urls.length - availableUrls.length,
  }
}

/**
 * Open the account's custom check-in location when defined (falling back to
 * default) and close the popup to avoid redundant windows.
 */
export const openCustomCheckInPage = withPopupClose(_openCustomCheckInPage)

/**
 * Open the redeem page (custom or default path) and close the popup afterwards
 * so the user focuses on the newly opened tab.
 */
export const openRedeemPage = withPopupClose(_openRedeemPage)

/**
 * Open both redeem and check-in pages in parallel for the given account,
 * leveraging {@link openMultiplePages} to minimize popup churn.
 * @param account Target account.
 */
export const openCheckInAndRedeem = async (account: DisplaySiteData) => {
  await openMultiplePages([
    () => _openRedeemPage(account),
    () => _openCustomCheckInPage(account),
  ])
}
