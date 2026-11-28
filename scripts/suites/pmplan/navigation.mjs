/* global chrome */
import assert from "node:assert/strict"
import { expect } from "@playwright/test"

import { runScenarioWithCleanup } from "../../../e2e/utils/scenarioErrors.ts"

/** Attribute only tabs returned by this owned extension page's navigation call. */
export async function openPmplanPage({ page, url, action, ownedTabIds }) {
  await page.evaluate((url) => {
    const original = chrome.tabs.create
    const state = { original, ids: [], wrapped: undefined }
    state.wrapped = function (properties, callback) {
      const record = (tab) => {
        if (properties.url === url && tab?.id != null) state.ids.push(tab.id)
        callback?.(tab)
        return tab
      }
      return callback
        ? original.call(chrome.tabs, properties, record)
        : original.call(chrome.tabs, properties).then(record)
    }
    chrome.tabs.create = state.wrapped
    window.__aahPmplanNavigation = state
  }, url)
  return runScenarioWithCleanup({
    run: async () => {
      await action()
      await expect
        .poll(() =>
          page.evaluate(() => window.__aahPmplanNavigation.ids.length),
        )
        .toBeGreaterThan(0)
      const ids = await page.evaluate(() => window.__aahPmplanNavigation.ids)
      ids.forEach((id) => ownedTabIds.add(id))
      assert.equal(ids.length, 1, "Navigation created more than one tab")
      await expect
        .poll(() =>
          page.evaluate(async (id) => (await chrome.tabs.get(id)).url, ids[0]),
        )
        .toBe(url)
      return ids[0]
    },
    finalizers: [
      async () => {
        const ids = await page.evaluate(() => {
          const state = window.__aahPmplanNavigation
          if (chrome.tabs.create === state.wrapped)
            chrome.tabs.create = state.original
          delete window.__aahPmplanNavigation
          return state.ids
        })
        ids.forEach((id) => ownedTabIds.add(id))
      },
    ],
    cleanupMessage: "PM-Plan navigation observation cleanup failed",
    failureMessage: "PM-Plan navigation and observation cleanup failed",
  })
}
