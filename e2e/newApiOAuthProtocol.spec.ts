import { RuntimeActionIds } from "~/constants/runtimeActions"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

for (const modern of [true, false]) {
  for (const matching of [true, false]) {
    test(`internal ${modern ? "modern" : "legacy"} OAuth ${matching ? "verifies" : "rejects"} callback identity`, async ({
      context,
    }) => {
      const origin = "https://oauth-gateway.example"
      const calls: string[] = []
      await context.route(`${origin}/**`, async (route) => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        calls.push(`${request.method()} ${path}`)
        if (path === "/api/status")
          return route.fulfill({
            json: {
              success: true,
              data: { linuxdo_oauth: true, linuxdo_client_id: "client" },
            },
          })
        if (path === "/api/user/auth/logout")
          return modern
            ? route.fulfill({ json: { success: true } })
            : route.fulfill({ status: 404 })
        if (path === "/api/user/logout")
          return route.fulfill({ json: { success: true } })
        if (path === "/api/oauth/state") {
          expect(request.method()).toBe(modern ? "POST" : "GET")
          if (modern)
            expect(request.postDataJSON()).toEqual({
              provider: "linuxdo",
              intent: "login",
            })
          return route.fulfill({
            json: {
              success: true,
              data: modern ? { flow_token: "signed-state" } : "signed-state",
            },
          })
        }
        if (path === "/api/user/auth/refresh")
          return route.fulfill({
            json: {
              success: true,
              data: {
                access_token: "transient-secret",
                token_type: "Bearer",
                access_expires_at: Date.now() / 1000 + 300,
                user: { id: 17 },
                session: { sid: "session", current: true },
              },
            },
          })
        if (path === "/api/user/self") {
          expect(
            request.headers()[modern ? "authorization" : "new-api-user"],
          ).toBe(modern ? "Bearer transient-secret" : "17")
          return route.fulfill({
            json: { success: true, data: { id: matching ? 17 : 18 } },
          })
        }
        if (path === "/oauth/linuxdo")
          return route.fulfill({
            contentType: "text/html; charset=utf-8",
            body: `<script>${modern ? "" : "localStorage.setItem('user', JSON.stringify({id:17}));"}location.replace('${modern ? "/dashboard" : "/console/token"}')</script>`,
          })
        return route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: "<html><head><title>OAuth fixture</title></head><body>OAuth fixture</body></html>",
        })
      })
      await context.route(
        "https://connect.linux.do/oauth2/authorize**",
        (route) =>
          route.fulfill({
            contentType: "text/html; charset=utf-8",
            body: `<html><head><title>Authorization fixture</title></head><body><a href="${origin}/oauth/linuxdo?code=test&amp;state=signed-state">允许</a></body></html>`,
          }),
      )
      const worker = await getServiceWorker(context)
      const sitePage = await context.newPage()
      await sitePage.goto(`${origin}/login`)
      const tabId = await worker.evaluate(async (url) => {
        const [tab] = await chrome.tabs.query({ url })
        if (typeof tab?.id !== "number") throw new Error("OAuth tab missing")
        return tab.id
      }, `${origin}/login`)
      const send = (action: string, details: Record<string, unknown> = {}) =>
        worker.evaluate(
          async ({ tabId, action, details }) =>
            chrome.tabs.sendMessage(tabId, { ...details, action }),
          { tabId, action, details },
        )
      const ready = async () => {
        await expect
          .poll(async () => {
            try {
              await send(RuntimeActionIds.ContentGetRenderedTitle)
              return true
            } catch {
              return false
            }
          })
          .toBe(true)
      }
      await ready()
      const request = {
        origin,
        requestId: "internal-oauth",
        loginProvider: "linuxdo",
        userIdHeader: "New-Api-User",
        completionPaths: ["/console", "/console/token", "/dashboard"],
      }
      const prepared = await send(
        RuntimeActionIds.ContentPrepareNewApiOAuth,
        request,
      )
      expect(prepared.success).toBe(true)
      const authorizationUrl = new URL(prepared.authorizationUrl)
      expect(authorizationUrl.searchParams.get("state")).toBe("signed-state")
      await sitePage.goto(authorizationUrl.href)
      await ready()
      await send(RuntimeActionIds.ContentApproveLinuxDoOAuth, {
        authorizationUrl: authorizationUrl.href,
      })
      await sitePage.waitForURL(
        `${origin}${modern ? "/dashboard" : "/console/token"}`,
      )
      await ready()
      const completed = await send(
        RuntimeActionIds.ContentCompleteNewApiOAuth,
        request,
      )
      expect(completed).toEqual(
        matching
          ? { success: true, userId: "17" }
          : { success: false, reason: "identity_mismatch" },
      )
      expect(JSON.stringify(completed)).not.toContain("transient-secret")
      expect(
        calls.filter((call) => call.endsWith(" /api/oauth/state")),
      ).toHaveLength(1)
      await send(RuntimeActionIds.ContentClearNewApiOAuthEvidence, request)
      expect(
        await sitePage.evaluate(() =>
          sessionStorage.getItem("all-api-hub:oauth"),
        ),
      ).toBeNull()
      await sitePage.close()
    })
  }
}
