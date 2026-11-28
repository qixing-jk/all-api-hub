/* global chrome */
import assert from "node:assert/strict"
import { expect } from "@playwright/test"

import { runScenarioWithCleanup } from "../../../e2e/utils/scenarioErrors.ts"

/** Attribute only tabs returned by this owned extension page's navigation call. */
export async function openPmplanPage({
  page,
  url,
  action,
  ownedTabIds,
  timeoutMs = 15000,
}) {
  await page.evaluate((url) => {
    const original = chrome.tabs.create
    const state = { original, ids: [], pending: [], wrapped: undefined }
    state.wrapped = function (properties, callback) {
      if (properties.url !== url) return original.apply(chrome.tabs, arguments)
      let settled
      const pending = new Promise((resolve) => {
        settled = resolve
      })
      state.pending.push(pending)
      const record = (tab) => {
        if (properties.url === url && tab?.id != null) state.ids.push(tab.id)
        settled()
        callback?.(tab)
        return tab
      }
      try {
        return callback
          ? original.call(chrome.tabs, properties, record)
          : original.call(chrome.tabs, properties).then(record, (error) => {
              settled()
              throw error
            })
      } catch (error) {
        settled()
        throw error
      }
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
        const { ids, timedOut } = await page.evaluate(async (timeoutMs) => {
          const state = window.__aahPmplanNavigation
          if (chrome.tabs.create === state.wrapped)
            chrome.tabs.create = state.original
          let timer
          const timedOut = await Promise.race([
            Promise.all(state.pending).then(() => false),
            new Promise((resolve) => {
              timer = setTimeout(() => resolve(true), timeoutMs)
            }),
          ])
          clearTimeout(timer)
          delete window.__aahPmplanNavigation
          return { ids: state.ids, timedOut }
        }, timeoutMs)
        ids.forEach((id) => ownedTabIds.add(id))
        assert.ok(
          !timedOut,
          "Tab creation outcome remains unconfirmed after cleanup deadline",
        )
      },
    ],
    cleanupMessage: "PM-Plan navigation observation cleanup failed",
    failureMessage: "PM-Plan navigation and observation cleanup failed",
  })
}
