import type { Worker } from "@playwright/test"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

const SITE_URL = "https://browser-identity.example.test/dashboard"

/** Uses the popup's public message contract in the actual content-script world. */
async function readBrowserIdentity(worker: Worker, pageUrl = SITE_URL) {
  return worker.evaluate(
    async ({ pageUrl, action, siteType }) => {
      const chromeApi = (globalThis as any).chrome
      const tabs = await chromeApi.tabs.query({})
      const tab = tabs.find(
        (candidate: { url?: string }) => candidate.url === pageUrl,
      )
      if (tab?.id === undefined) return null
      try {
        return await chromeApi.tabs.sendMessage(
          tab.id,
          {
            action,
            url: pageUrl,
            siteType,
            verifyIdentity: true,
            candidateUserIds: ["1", "2"],
          },
          { frameId: 0 },
        )
      } catch {
        // Poll only for content-script startup; detection itself does not retry.
        return null
      }
    },
    {
      pageUrl,
      action: RuntimeActionIds.ContentGetUserFromLocalStorage,
      siteType: SITE_TYPES.SUB2API,
    },
  )
}

test("passive identity checks reuse local observations and follow browser login changes", async ({
  context,
  page,
}) => {
  const apiRequests: { method: string; path: string }[] = []
  await context.route(
    "https://browser-identity.example.test/**",
    async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (path === "/dashboard") {
        await route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Sub2API Dashboard</title><h1>Dashboard</h1>",
        })
        return
      }
      if (path.startsWith("/api/"))
        apiRequests.push({ method: request.method(), path })
      if (path === "/api/v1/auth/me") {
        const authorization = request.headers().authorization
        const id =
          authorization === "Bearer session-one"
            ? 1
            : authorization === "Bearer session-two"
              ? 2
              : null
        await route.fulfill({
          status: id ? 200 : 401,
          contentType: "application/json",
          body: JSON.stringify(id ? { code: 0, data: { id } } : { code: 401 }),
        })
        return
      }
      await route.fulfill({ status: 404, body: "" })
    },
  )
  const worker = await getServiceWorker(context)
  await page.goto(SITE_URL)
  await page.evaluate(() =>
    localStorage.setItem("refresh_token", "website-owned-refresh-token"),
  )
  await expect
    .poll(() => readBrowserIdentity(worker))
    .toEqual({ success: false })
  expect(apiRequests).toEqual([])

  const openedPages = context.pages().length
  await page.evaluate(() => localStorage.setItem("auth_token", "session-one"))
  const firstIdentity = {
    success: true,
    data: { userId: "1", identityVerified: true },
  }
  expect(
    await Promise.all([
      readBrowserIdentity(worker),
      readBrowserIdentity(worker),
    ]),
  ).toEqual([firstIdentity, firstIdentity])
  expect(await readBrowserIdentity(worker)).toEqual(firstIdentity)
  expect(apiRequests).toHaveLength(1)

  await page.evaluate(() => localStorage.setItem("auth_token", "session-two"))
  const secondIdentity = {
    success: true,
    data: { userId: "2", identityVerified: true },
  }
  expect(await readBrowserIdentity(worker)).toEqual(secondIdentity)
  expect(apiRequests).toHaveLength(2)

  await page.reload()
  await expect.poll(() => readBrowserIdentity(worker)).toEqual(secondIdentity)
  expect(apiRequests).toHaveLength(3)

  await page.evaluate(() => localStorage.removeItem("auth_token"))
  expect(await readBrowserIdentity(worker)).toEqual({ success: false })
  expect(apiRequests).toHaveLength(3)

  await page.evaluate(() =>
    localStorage.setItem("auth_token", "rejected-session"),
  )
  expect(await readBrowserIdentity(worker)).toEqual({ success: false })
  expect(await readBrowserIdentity(worker)).toEqual({ success: false })
  expect(apiRequests).toEqual(
    Array.from({ length: 4 }, () => ({
      method: "GET",
      path: "/api/v1/auth/me",
    })),
  )
  expect(
    await page.evaluate(() => ({
      token: localStorage.getItem("auth_token"),
      refresh: localStorage.getItem("refresh_token"),
    })),
  ).toEqual({
    token: "rejected-session",
    refresh: "website-owned-refresh-token",
  })
  expect(context.pages()).toHaveLength(openedPages)
  await expect(page).toHaveURL(SITE_URL)
  await expect(page.getByRole("dialog")).toHaveCount(0)
})

test("passive identity cooldown survives reloads and another tab until Retry-After expires", async ({
  context,
  page,
}) => {
  const origin = "https://limited-identity.example.test"
  const firstUrl = `${origin}/dashboard`
  const secondUrl = `${origin}/dashboard?tab=2`
  const apiRequests: string[] = []
  let rateLimited = true
  await context.route(`${origin}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === "/dashboard") {
      await route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Sub2API Dashboard</title><h1>Dashboard</h1>",
      })
      return
    }
    if (path === "/api/v1/auth/me") {
      apiRequests.push(route.request().method())
      await route.fulfill({
        status: rateLimited ? 429 : 200,
        headers: rateLimited ? { "Retry-After": "10" } : {},
        contentType: "application/json",
        body: JSON.stringify(rateLimited ? {} : { code: 0, data: { id: 2 } }),
      })
      return
    }
    await route.fulfill({ status: 404, body: "" })
  })
  const worker = await getServiceWorker(context)
  await page.goto(firstUrl)
  await page.evaluate(() => localStorage.setItem("auth_token", "session-one"))
  await expect
    .poll(() => readBrowserIdentity(worker, firstUrl))
    .toEqual({
      success: false,
    })
  expect(apiRequests).toEqual(["GET"])

  await page.evaluate(() => {
    localStorage.setItem("auth_token", "session-two")
    document.cookie = "analytics=changed; path=/"
  })
  await page.reload()
  await expect
    .poll(() => readBrowserIdentity(worker, firstUrl))
    .toEqual({
      success: false,
    })
  const secondPage = await context.newPage()
  await secondPage.goto(secondUrl)
  await expect
    .poll(() => readBrowserIdentity(worker, secondUrl))
    .toEqual({
      success: false,
    })
  expect(apiRequests).toEqual(["GET"])

  rateLimited = false
  await expect
    .poll(() => readBrowserIdentity(worker, secondUrl), { timeout: 20_000 })
    .toEqual({ success: true, data: { userId: "2", identityVerified: true } })
  expect(apiRequests).toEqual(["GET", "GET"])
  expect(
    await secondPage.evaluate(() => localStorage.getItem("auth_token")),
  ).toBe("session-two")
  await expect(secondPage.getByRole("dialog")).toHaveCount(0)
  await expect(secondPage).toHaveURL(secondUrl)
})
