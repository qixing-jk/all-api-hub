import type { Worker } from "@playwright/test"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import {
  loginToRealNewApiSite,
  resolveNewApiRealSiteConfig,
} from "~~/e2e/utils/realSite/newApi"
import {
  loginToRealSub2ApiSite,
  resolveSub2ApiRealSiteConfig,
} from "~~/e2e/utils/realSite/sub2api"

/** Send one action; only the separate read-only readiness probe is polled. */
async function contentAction(
  worker: Worker,
  origin: string,
  details: Record<string, unknown>,
) {
  return worker.evaluate(
    async ({ origin, details }) => {
      const api = (globalThis as any).chrome
      const tabs = await api.tabs.query({ url: `${origin}/*` })
      if (tabs.length !== 1) throw new Error("Expected one test-owned site tab")
      return api.tabs.sendMessage(tabs[0].id, details, { frameId: 0 })
    },
    { origin, details },
  )
}

test.use({ trace: "off", video: "off", screenshot: "off" })

test.describe("real-site native password login", () => {
  test.describe.configure({ retries: 0 })

  for (const kind of ["new-api", "sub2api"] as const) {
    test(`${kind} verifies and cleans up a native password session through the extension content protocol`, async ({
      context,
      page,
    }) => {
      test.setTimeout(120_000)
      const config =
        kind === "new-api"
          ? resolveNewApiRealSiteConfig().config
          : resolveSub2ApiRealSiteConfig().config
      test.skip(
        !config,
        `Missing dedicated ${kind} test deployment credentials`,
      )
      if (!config) return
      const origin = new URL(config.baseUrl).origin
      let expectedIdentity: string
      if (kind === "new-api") {
        const newApiConfig = resolveNewApiRealSiteConfig().config
        if (!newApiConfig) throw new Error("Missing New API configuration")
        const bootstrap = await loginToRealNewApiSite(page, newApiConfig)
        expectedIdentity = String(bootstrap.user.id)
        await bootstrap.cleanupOwnedSession?.()
      } else {
        const bootstrap = await loginToRealSub2ApiSite(page, config)
        expectedIdentity = String(bootstrap.authState.user.id)
        if (bootstrap.authState.refreshToken) {
          const revoked = await page.evaluate(
            async ({ refreshToken, accessToken }) => {
              const response = await fetch("/api/v1/auth/logout", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ refresh_token: refreshToken }),
              })
              return response.status
            },
            {
              refreshToken: bootstrap.authState.refreshToken,
              accessToken: bootstrap.authState.accessToken,
            },
          )
          expect(revoked).toBe(200)
        }
        await page.evaluate(() => localStorage.clear())
      }
      // Keep this document stable while the content action owns its session.
      await page.goto(origin)
      const worker = await getServiceWorker(context)
      await expect
        .poll(async () => {
          try {
            return !!(await contentAction(worker, origin, {
              action: RuntimeActionIds.ContentGetRenderedTitle,
            }))
          } catch {
            return false
          }
        })
        .toBe(true)
      const requestId = `password-e2e-${kind}`
      const action =
        kind === "new-api"
          ? RuntimeActionIds.ContentNewApiPasswordLogin
          : RuntimeActionIds.ContentSub2ApiPasswordLogin
      const clearAction =
        kind === "new-api"
          ? RuntimeActionIds.ContentClearNewApiPasswordLogin
          : RuntimeActionIds.ContentClearSub2ApiPasswordLogin
      try {
        const result = await contentAction(worker, origin, {
          action,
          origin,
          requestId,
          expectedIdentity,
          credentials: { username: config.username, password: config.password },
        })
        expect(result).toMatchObject({
          status: "authenticated",
          identity: expectedIdentity,
        })
        expect(result).not.toHaveProperty("credentials")
        expect(result).not.toHaveProperty("access_token")
        if (kind === "sub2api") {
          const identity = await page.evaluate(async () => {
            const response = await fetch("/api/v1/auth/me", {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
              },
            })
            return String((await response.json()).data?.id)
          })
          expect(identity).toBe(expectedIdentity)
        }
      } finally {
        expect(
          await contentAction(worker, origin, {
            action: clearAction,
            origin,
            requestId,
          }),
        ).toEqual({ status: "cancelled" })
      }
      if (kind === "sub2api")
        expect(
          await page.evaluate(() => localStorage.getItem("auth_token")),
        ).toBeNull()
      else {
        const status = await page.evaluate(
          async () =>
            (await fetch("/api/user/auth/refresh", { method: "POST" })).status,
        )
        expect(status).toBe(401)
      }
    })
  }
})
