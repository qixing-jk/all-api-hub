import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test"
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest"

// @ts-expect-error Node-only live helper does not have declarations.
import { openPmplanPage } from "~~/scripts/suites/pmplan/navigation.mjs"

let browser: Browser
let context: BrowserContext
let page: Page
const url = "https://plan.pmcat.top/#/usage"

beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
})
afterAll(async () => browser.close())
beforeEach(async () => {
  context = await browser.newContext()
  page = await context.newPage()
  await page.evaluate(() => {
    const tabs = new Map()
    const create = (
      properties: { url: string },
      callback?: (tab: unknown) => void,
    ) => {
      const tab = { id: 17, url: properties.url }
      tabs.set(tab.id, tab)
      if (callback) {
        callback(tab)
        return
      }
      return Promise.resolve(tab)
    }
    Object.assign(window, {
      chrome: { tabs: { create, get: async (id: number) => tabs.get(id) } },
      originalCreate: create,
    })
  })
})
afterEach(async () => context.close())

it.each([true, false])(
  "attributes only the owned page's tab creation and restores the API (callback=%s)",
  async (callback) => {
    const ownedTabIds = new Set<number>()
    const other = await context.newPage()
    const id = await openPmplanPage({
      page,
      url,
      ownedTabIds,
      action: async () => {
        await other.goto(`data:text/html,<p>Operator tab</p>`)
        await page.evaluate(
          async ({ url, callback }) => {
            if (callback)
              await new Promise((resolve) =>
                chrome.tabs.create({ url }, resolve),
              )
            else await chrome.tabs.create({ url })
          },
          { url, callback },
        )
      },
    })
    expect(id).toBe(17)
    expect([...ownedTabIds]).toEqual([17])
    expect(other.isClosed()).toBe(false)
    expect(
      await page.evaluate(
        () => chrome.tabs.create === (window as any).originalCreate,
      ),
    ).toBe(true)
  },
)

it("retains confirmed ownership and restores observation if the action later throws", async () => {
  const ownedTabIds = new Set<number>()
  await expect(
    openPmplanPage({
      page,
      url,
      ownedTabIds,
      action: async () => {
        await page.evaluate((url) => chrome.tabs.create({ url }), url)
        throw new Error("action failed")
      },
    }),
  ).rejects.toThrow("action failed")
  expect([...ownedTabIds]).toEqual([17])
  expect(
    await page.evaluate(
      () => chrome.tabs.create === (window as any).originalCreate,
    ),
  ).toBe(true)
})
