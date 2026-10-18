import { RuntimeActionIds } from "~/constants/runtimeActions"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

for (const kind of ["new-api", "sub2api"] as const) {
  test(`${kind} native password content protocol verifies and clears its own session`, async ({
    context,
    page,
  }) => {
    const origin = "https://password-login.example"
    const requests: { path: string; body: unknown }[] = []
    await context.route(`${origin}/**`, async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (!path.startsWith("/api/"))
        return route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Password protocol fixture</title>",
        })
      const body = request.postDataJSON()
      requests.push({ path, body })
      const payload: Record<string, unknown> = {
        "/api/status": {
          success: true,
          data: { password_login_enabled: true },
        },
        "/api/user/login": {
          success: true,
          data: { id: 17, checked_in: true },
        },
        "/api/user/self": { success: true, data: { id: 17 } },
        "/api/user/logout": { success: true },
        "/api/v1/settings/public": { code: 0, data: {} },
        "/api/v1/auth/login": {
          code: 0,
          data: {
            user: { id: 17 },
            access_token: "fixture-access",
            refresh_token: "fixture-refresh",
            expires_in: 3600,
          },
        },
        "/api/v1/auth/me": { code: 0, data: { id: 17 } },
        "/api/v1/auth/logout": { code: 0 },
      }
      expect(path in payload).toBe(true)
      await route.fulfill({ json: payload[path] })
    })
    await page.goto(`${origin}/login`)
    const worker = await getServiceWorker(context)
    const send = (details: Record<string, unknown>) =>
      worker.evaluate(
        async ({ origin, details }) => {
          const api = (globalThis as any).chrome
          const tabs = await api.tabs.query({ url: `${origin}/*` })
          if (tabs.length !== 1) throw new Error("Expected one fixture tab")
          return api.tabs.sendMessage(tabs[0].id, details, { frameId: 0 })
        },
        { origin, details },
      )
    await expect
      .poll(async () => {
        try {
          return !!(await send({
            action: RuntimeActionIds.ContentGetRenderedTitle,
          }))
        } catch {
          return false
        }
      })
      .toBe(true)
    const requestId = `fixture-${kind}`
    const result = await send({
      origin,
      requestId,
      expectedIdentity: "17",
      credentials: { username: "alice", password: " fixture password " },
      action:
        kind === "new-api"
          ? RuntimeActionIds.ContentNewApiPasswordLogin
          : RuntimeActionIds.ContentSub2ApiPasswordLogin,
    })
    expect(result).toMatchObject({ status: "authenticated", identity: "17" })
    expect(result).not.toHaveProperty("credentials")
    expect(requests.find((item) => item.path.endsWith("/login"))?.body).toEqual(
      kind === "new-api"
        ? { username: "alice", password: " fixture password " }
        : { email: "alice", password: " fixture password " },
    )
    expect(
      await send({
        origin,
        requestId,
        action:
          kind === "new-api"
            ? RuntimeActionIds.ContentClearNewApiPasswordLogin
            : RuntimeActionIds.ContentClearSub2ApiPasswordLogin,
      }),
    ).toEqual({ status: "cancelled" })
    expect(
      await page.evaluate(
        () =>
          localStorage.getItem("auth_token") ?? localStorage.getItem("user"),
      ),
    ).toBeNull()
    expect(
      requests.filter((item) => item.path.endsWith("/login")),
    ).toHaveLength(1)
    if (kind === "sub2api")
      expect(
        requests.find((item) => item.path.endsWith("/logout"))?.body,
      ).toEqual({ refresh_token: "fixture-refresh" })
  })
}
