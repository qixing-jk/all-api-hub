import { readFileSync } from "node:fs"

import {
  MANAGED_SITE_CHANNELS_TEST_IDS as channels,
  MANAGED_SITE_CHANNEL_ROW_TEST_ID_PREFIX,
} from "../../../src/features/ManagedSiteChannels/testIds.ts"

const FEEDBACK_POLL_INTERVAL_MS = 250
const LANGUAGE_STORAGE_KEY = "all-api-hub-i18nextLng"

/** Delete one caller-owned channel through the shared workspace controls. */
export async function deleteManagedSiteChannelRow(
  page,
  row,
  { timeoutMs = 60_000 } = {},
) {
  if ((await row.count()) !== 1)
    throw new Error("Managed channel deletion requires one identified row")
  const rowId = await row.getAttribute("data-testid")
  if (!rowId?.startsWith(MANAGED_SITE_CHANNEL_ROW_TEST_ID_PREFIX))
    throw new Error("Managed channel row has no recognized identity")
  const deleteSelected = page.getByTestId(channels.deleteSelectedButton)
  if (await deleteSelected.isEnabled())
    throw new Error("Managed channel deletion refuses an existing selection")
  await page.getByTestId(`${rowId}-select`).click()
  await deleteSelected.click()
  await page.getByTestId(channels.deleteChannelConfirmButton).click()
  await row.waitFor({ state: "detached", timeout: timeoutMs })
}

/** Read the shipped connection-copy family without constructing translation keys. */
export function readManagedSiteConnectionCopy() {
  return JSON.parse(
    readFileSync(
      new URL("../../../src/locales/en/settings.json", import.meta.url),
      "utf8",
    ),
  ).managedSiteConnection
}

/** Ignore pre-existing notices and progress messages until terminal feedback arrives. */
export async function readNewManagedSiteConnectionFeedback(
  page,
  locator,
  previousTexts,
  timeoutMs,
) {
  const previous = new Set(previousTexts)
  const copy = readManagedSiteConnectionCopy()
  const progress = new Set([copy.saving, copy.checking])
  const deadline = Date.now() + timeoutMs
  let observed = []

  while (Date.now() < deadline) {
    observed = (await locator.allTextContents())
      .map((value) => value.trim())
      .filter(Boolean)
    if (observed.some((text) => progress.has(text))) {
      // A repeated result is fresh only if progress replaced its previous notice.
      for (const text of previous) {
        if (!observed.includes(text)) previous.delete(text)
      }
    }
    const fresh = observed.find(
      (text) => !previous.has(text) && !progress.has(text),
    )
    if (fresh) return { text: fresh, observed }
    await page.waitForTimeout(FEEDBACK_POLL_INTERVAL_MS)
  }

  return { text: "", observed }
}

export const managedSiteOptionsPageUrl = (
  extensionId,
  params = {},
  hash = "basic",
) => {
  const url = new URL(`chrome-extension://${extensionId}/options.html`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  url.hash = hash
  return url.toString()
}

/** Open the route with English configured before application initialization. */
export async function openManagedSiteOptionsPage(
  context,
  extensionId,
  { params, hash },
) {
  const page = await context.newPage()
  // Mirrors the E2E helper: the language lives in the page's localStorage.
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [LANGUAGE_STORAGE_KEY, "en"],
  )
  await page.goto(managedSiteOptionsPageUrl(extensionId, params, hash))
  await page.waitForLoadState("domcontentloaded")
  return page
}
