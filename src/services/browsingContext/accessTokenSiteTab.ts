import { RuntimeActionIds } from "~/constants/runtimeActions"
import type { AccountSiteType } from "~/constants/siteType"
import { supportsNewApiTokenSetup } from "~/services/apiService/newApiFamily/accessTokens/validation"
import {
  isMessageReceiverUnavailableError,
  sendTabMessageWithRetry,
} from "~/utils/browser/runtimeMessages"
import { injectContentScript } from "~/utils/browser/scripting"
import { createTab, getTab } from "~/utils/browser/tabs"
import { sleep } from "~/utils/core/async"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"

import { matchesAccessTokenCueSite } from "./newApiAccessTokenPage/siteBoundary"

const NAVIGATION_WAIT_MS = 15_000
const NAVIGATION_POLL_MS = 150
const TOP_FRAME = { frameId: 0 } as const

/** Only a loaded, committed document can receive the cue. */
async function readReadySiteOrigin(tabId: number, openedSite: string) {
  const tab = await getTab(tabId)
  if (tab.status !== "complete" || ("pendingUrl" in tab && tab.pendingUrl))
    return
  const { url } = tab
  if (matchesAccessTokenCueSite(openedSite, url))
    return tryParseHttpUrl(url)?.origin
}

/** Delivers the cue to the newly opened tab, allowing time for redirects. */
async function highlightAccessTokenSiteTab(tabId: number, openedSite: string) {
  const deadline = Date.now() + NAVIGATION_WAIT_MS
  while (!(await readReadySiteOrigin(tabId, openedSite))) {
    if (Date.now() >= deadline) return
    await sleep(NAVIGATION_POLL_MS)
  }
  const request = {
    action: RuntimeActionIds.ContentHighlightAccessTokenSection,
    openedSite,
  }
  try {
    // A document can finish loading just before its content receiver attaches.
    await sendTabMessageWithRetry(tabId, request, TOP_FRAME)
  } catch (error) {
    if (!isMessageReceiverUnavailableError(error)) return
    // The browser grants injection for the actual document, including any
    // canonical-host redirect. Recheck the tab after the message retries.
    const origin = await readReadySiteOrigin(tabId, openedSite)
    if (origin && (await injectContentScript(tabId, origin))) {
      await sendTabMessageWithRetry(tabId, request, {
        ...TOP_FRAME,
        maxAttempts: 1,
      })
    }
  }
}

/** Opens the site's Access Token page and starts its optional visual cue. */
export async function openAccessTokenSiteTab(
  destination: string,
  {
    siteType,
    tab: tabOptions,
  }: {
    siteType: AccountSiteType
    tab?: Parameters<typeof createTab>[2]
  },
) {
  const tab = tabOptions
    ? await createTab(destination, true, tabOptions)
    : await createTab(destination, true)
  const origin = tryParseHttpUrl(destination)?.origin
  if (supportsNewApiTokenSetup(siteType) && tab?.id != null && origin) {
    void highlightAccessTokenSiteTab(tab.id, origin).catch(() => undefined)
  }
}
