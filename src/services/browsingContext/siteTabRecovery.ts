import { runAbortableTask } from "~/services/apiTransport/abortableTask"
import {
  createTab,
  focusTab,
  getActiveTab,
  getCurrentTab,
  getTab,
  onTabUpdated,
  queryTabs,
  reloadTab,
} from "~/utils/browser/tabs"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"

export const SITE_TAB_REINJECT_RETRY_OPTIONS = {
  maxAttempts: 3,
  delayMs: 150,
} as const
const RELOAD_START_TIMEOUT_MS = 5000

/** Find an exact-origin tab within the invoking browser context. */
export async function findMatchingSiteTab(
  siteUrl: string,
  preferredTabId?: number,
) {
  const site = tryParseHttpUrl(siteUrl)
  if (!site) throw new Error("INVALID_SITE_TAB_URL")
  const { origin, protocol, hostname } = site
  const current = (await getCurrentTab()) ?? (await getActiveTab())
  const tabs = await queryTabs({ url: `${protocol}//${hostname}/*` })
  const matching = tabs.filter(
    (tab) =>
      tab.id != null &&
      tryParseHttpUrl(tab.url)?.origin === origin &&
      tab.incognito === (current?.incognito ?? false) &&
      (!current?.cookieStoreId || tab.cookieStoreId === current.cookieStoreId),
  )
  const tab =
    matching.find((tab) => tab.id === preferredTabId) ??
    matching.find((tab) => tab.active && tab.windowId === current?.windowId) ??
    matching.find((tab) => tab.windowId === current?.windowId) ??
    matching[0]
  return { origin, current, tab }
}

/** Reuse the matching tab or open the site in the invoking window and container. */
export async function resolveOrCreateSiteTab(
  siteUrl: string,
  preferredTabId?: number,
) {
  const { origin, current, tab } = await findMatchingSiteTab(
    siteUrl,
    preferredTabId,
  )
  if (tab?.id != null) return { tabId: tab.id, origin, existing: true }
  const created = await createTab(origin, true, {
    windowId: current?.windowId,
    cookieStoreId: current?.cookieStoreId,
  })
  if (created?.id == null) throw new Error("SITE_TAB_UNAVAILABLE")
  return { tabId: created.id, origin, existing: false }
}

/** Recheck tab ownership immediately before acting and after navigation. */
export async function assertSiteTabOrigin(
  tabId: number,
  expectedOrigin: string,
) {
  const tab = await getTab(tabId)
  if (tryParseHttpUrl(tab.url)?.origin !== expectedOrigin)
    throw new Error("SITE_TAB_ORIGIN_CHANGED")
  return tab
}

/** Open or focus the exact site so the user can restore its session. */
export async function focusSiteTab(siteUrl: string, preferredTabId?: number) {
  const { tabId, origin, existing } = await resolveOrCreateSiteTab(
    siteUrl,
    preferredTabId,
  )
  if (existing) await focusTab(await assertSiteTabOrigin(tabId, origin))
}

/** Wait for site readiness and confirm that navigation stayed on the requested origin. */
export async function waitForSiteTabReady(tabId: number, origin: string) {
  const { waitForTabComplete } = await import("./tempPage/browserAdapter")
  await waitForTabComplete(tabId, { origin })
  await assertSiteTabOrigin(tabId, origin)
}

/** Wait for the new navigation, then wait for its content handlers to be ready. */
export async function reloadSiteTabByIdAndWait(tabId: number, origin: string) {
  const tab = await assertSiteTabOrigin(tabId, origin)
  let markReloadStarted: () => void = () => undefined
  const started = new Promise<void>((resolve) => {
    markReloadStarted = resolve
  })
  const stopWatching = onTabUpdated((updatedId, change) => {
    if (
      updatedId === tabId &&
      (change.status === "loading" ||
        (tab.status === "loading" && change.status === "complete"))
    )
      markReloadStarted()
  })
  try {
    // Subscribe before reload so a fast transition cannot be missed. A tab
    // already loading may report only the next completion.
    await reloadTab(tabId)
    await runAbortableTask(() => started, {
      timeoutMs: RELOAD_START_TIMEOUT_MS,
    })
  } finally {
    stopWatching()
  }
  await waitForSiteTabReady(tabId, origin)
}

type ReloadSiteTabOptions = {
  siteUrl: string
  preferredTabId?: number
  createIfMissing?: boolean
}

/** Reload the matching site tab, optionally opening a fresh tab if it is missing. */
export function reloadSiteTabAndWait(
  options: ReloadSiteTabOptions & { createIfMissing: true },
): Promise<number>
export function reloadSiteTabAndWait(
  options: ReloadSiteTabOptions,
): Promise<number | null>
export async function reloadSiteTabAndWait({
  siteUrl,
  preferredTabId,
  createIfMissing = false,
}: ReloadSiteTabOptions): Promise<number | null> {
  if (createIfMissing) {
    const { tabId, origin, existing } = await resolveOrCreateSiteTab(
      siteUrl,
      preferredTabId,
    )
    if (existing) {
      await reloadSiteTabByIdAndWait(tabId, origin)
    } else {
      await waitForSiteTabReady(tabId, origin)
    }
    return tabId
  }

  const { origin, tab } = await findMatchingSiteTab(siteUrl, preferredTabId)
  if (tab?.id == null) return null
  await reloadSiteTabByIdAndWait(tab.id, origin)
  return tab.id
}
