import type { Page } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
} from "~~/e2e/utils/commonUserFlows"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

/**
 * Real-browser coverage for temp-page reclamation.
 *
 * The fixtures live behind background debug actions, so this spec can leave a
 * temp page behind exactly the way a dead worker does and then watch what
 * reclamation does with it. A reclamation also runs whenever the worker starts,
 * so the spec asserts the outcome (the page and its marker are gone, or they
 * were deliberately kept) instead of which of the two runs produced it.
 *
 * Nothing here is reachable in a production build: the background refuses those
 * actions outside development and test modes.
 */

type TempContextMarkerRow = {
  tabId: number
  windowScope: string
  createdAt: number | null
  tracked: boolean
}

type ReclamationOutcomeRow = { tabId: number; kind: string }

type ReclamationRun = {
  at: number
  summary: {
    reclaimedCount: number
    outcomes: ReclamationOutcomeRow[]
  }
}

type DebugData = {
  browserSession?: string
  retryArmed?: boolean
  markers?: TempContextMarkerRow[]
  runs?: ReclamationRun[]
  tabId?: number
  windowId?: number
  requestId?: string
  summary?: ReclamationRun["summary"]
}

type DebugResponse = {
  success?: boolean
  error?: string
  data?: DebugData
}

type TempContextState = {
  markers: TempContextMarkerRow[]
  runs: ReclamationRun[]
}

/**
 * A temp context needs a page with a content script and without protection
 * guards, so the tracked fixture is served from a routed origin instead of the
 * network.
 */
const TRACKED_CONTEXT_ORIGIN = "https://temp-context-fixture.example.com"

/** Sends one background action and returns its raw response. */
async function sendRuntimeAction(
  page: Page,
  request: Record<string, unknown>,
): Promise<DebugResponse | undefined> {
  return (await page.evaluate(
    async (payload) =>
      await (globalThis as any).chrome.runtime.sendMessage(payload),
    request,
  )) as DebugResponse | undefined
}

/** Sends one background debug action and returns its payload. */
async function runDebugAction(
  page: Page,
  request: Record<string, unknown>,
): Promise<DebugData> {
  const response = await sendRuntimeAction(page, request)

  expect(response?.error).toBeUndefined()
  expect(response?.success).toBe(true)
  return response?.data ?? {}
}

/** Reads the ownership markers and this worker's recent reclamations. */
async function readState(page: Page): Promise<TempContextState> {
  const data = await runDebugAction(page, {
    action: RuntimeActionIds.TempContextDebugListMarkers,
  })
  return { markers: data.markers ?? [], runs: data.runs ?? [] }
}

/** Every open tab and window id, read from the extension page itself. */
async function readOpenBrowserIds(page: Page) {
  return await page.evaluate(async () => {
    const chromeApi = (globalThis as any).chrome
    const tabs = await chromeApi.tabs.query({})
    const windows = await chromeApi.windows.getAll()
    return {
      tabIds: tabs.map((tab: { id?: number }) => tab.id),
      windowIds: windows.map((window: { id?: number }) => window.id),
    }
  })
}

/**
 * Decisions a run can record for one temp page. `skipped-missing` counts as
 * handled because it is what a run reports when another run already closed the
 * page but its marker was still readable.
 */
function handledOutcomeKinds(state: TempContextState, tabId: number) {
  return state.runs.flatMap((run) =>
    run.summary.outcomes
      .filter((outcome) => outcome.tabId === tabId)
      .map((outcome) => outcome.kind),
  )
}

function isTempPageMarked(state: TempContextState, tabId: number) {
  return state.markers.some((marker) => marker.tabId === tabId)
}

async function openOptionsPage(page: Page, extensionId: string) {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await page.goto(`chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`)
  await waitForExtensionRoot(page)
}

test("closes a leaked background tab and forgets it", async ({
  extensionId,
  page,
}) => {
  await openOptionsPage(page, extensionId)

  const fixture = await runDebugAction(page, {
    action: RuntimeActionIds.TempContextDebugCreateOrphan,
    scenario: "shared-tab",
  })
  const tabId = fixture.tabId as number
  expect(typeof tabId).toBe("number")
  expect(isTempPageMarked(await readState(page), tabId)).toBe(true)

  await expect(async () => {
    await runDebugAction(page, {
      action: RuntimeActionIds.TempContextDebugReclaimNow,
    })
    const state = await readState(page)
    const open = await readOpenBrowserIds(page)

    // The tab existed here, so a removal of a missing tab would have rejected
    // and been reported as `failed` instead of closing it.
    expect(handledOutcomeKinds(state, tabId).length).toBeGreaterThan(0)
    expect(isTempPageMarked(state, tabId)).toBe(false)
    expect(open.tabIds).not.toContain(tabId)
  }).toPass({ timeout: 20_000 })
})

test("closes the window a leaked popup owns", async ({ extensionId, page }) => {
  await openOptionsPage(page, extensionId)

  const fixture = await runDebugAction(page, {
    action: RuntimeActionIds.TempContextDebugCreateOrphan,
    scenario: "owned-window",
  })
  const tabId = fixture.tabId as number
  const windowId = fixture.windowId as number
  expect(typeof windowId).toBe("number")

  await expect(async () => {
    await runDebugAction(page, {
      action: RuntimeActionIds.TempContextDebugReclaimNow,
    })
    const state = await readState(page)
    const open = await readOpenBrowserIds(page)

    expect(handledOutcomeKinds(state, tabId)).toContain("closed-window")
    expect(isTempPageMarked(state, tabId)).toBe(false)
    expect(open.tabIds).not.toContain(tabId)
    expect(open.windowIds).not.toContain(windowId)
  }).toPass({ timeout: 20_000 })
})

test("leaves a temp page the live worker still owns", async ({
  context,
  extensionId,
  page,
}) => {
  await context.route(`${TRACKED_CONTEXT_ORIGIN}/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body>temp context fixture</body></html>",
    }),
  )
  await openOptionsPage(page, extensionId)

  const fixture = await runDebugAction(page, {
    action: RuntimeActionIds.TempContextDebugCreateTrackedContext,
    url: `${TRACKED_CONTEXT_ORIGIN}/`,
  })
  const tabId = fixture.tabId as number
  expect(typeof tabId).toBe("number")

  const data = await runDebugAction(page, {
    action: RuntimeActionIds.TempContextDebugReclaimNow,
  })
  expect(data.summary?.outcomes).toContainEqual({
    kind: "skipped-tracked",
    tabId,
  })

  // `skipped-tracked` is only decided after the tab was found in the browser's
  // own tab list, so this also proves the temp page was still open.
  const listing = await runDebugAction(page, {
    action: RuntimeActionIds.TempContextDebugListMarkers,
  })
  expect(listing.retryArmed).toBe(true)

  // Leave nothing behind: closing through the normal request path releases the
  // context this spec kept open on purpose. The close may already have nothing
  // to close — a worker that died in the meantime made this page an orphan, and
  // the next start reclaimed it — so only the end state is asserted.
  await sendRuntimeAction(page, {
    action: RuntimeActionIds.CloseTempWindow,
    requestId: fixture.requestId,
  })
  await expect(async () => {
    expect((await readOpenBrowserIds(page)).tabIds).not.toContain(tabId)
  }).toPass({ timeout: 20_000 })
})

test("leaves the tab the user is looking at", async ({ extensionId, page }) => {
  await openOptionsPage(page, extensionId)

  const fixture = await runDebugAction(page, {
    action: RuntimeActionIds.TempContextDebugCreateOrphan,
    scenario: "visible-tab",
  })
  const tabId = fixture.tabId as number

  const data = await runDebugAction(page, {
    action: RuntimeActionIds.TempContextDebugReclaimNow,
  })
  expect(data.summary?.outcomes).toContainEqual({
    kind: "skipped-visible",
    tabId,
  })

  const state = await readState(page)
  const open = await readOpenBrowserIds(page)
  expect(isTempPageMarked(state, tabId)).toBe(true)
  expect(open.tabIds).toContain(tabId)
})
