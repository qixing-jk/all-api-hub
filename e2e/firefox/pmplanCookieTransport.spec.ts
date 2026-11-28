import { createServer } from "node:http"
import type { AddressInfo } from "node:net"

import { RuntimeActionIds } from "~/constants/runtimeActions"

import { expect, test } from "./extensionTest"

test("Firefox PM-Plan requires interceptor permission and isolates deployment Cookies", async ({
  firefoxExtension,
}) => {
  const requests: { host: string; cookie: string; override?: string }[] = []
  const server = createServer((request, response) => {
    if (request.url !== "/api/me") {
      response.writeHead(404).end()
      return
    }
    requests.push({
      host: request.headers.host ?? "",
      cookie: request.headers.cookie ?? "",
      override: request.headers["all-api-hub-session-cookie"] as
        string | undefined,
    })
    response.setHeader("content-type", "application/json")
    response.end(JSON.stringify({ user: { id: 42, username: "fixture" } }))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const port = (server.address() as AddressInfo).port
  const originA = `http://127.0.0.1:${port}`
  const originB = `http://localhost:${port}`
  try {
    await firefoxExtension.driver.executeScript("Services.io.offline = false")
    const options = firefoxExtension.page("options.html")
    await options.openInTab("?tab=permissions#basic")
    const grant = (permission: string) =>
      test.step(`Grant ${permission}`, async () => {
        const granted = () =>
          options.evaluateAsync<boolean>(
            `browser.permissions.contains({permissions: [${JSON.stringify(permission)}]})`,
          )
        expect(await granted()).toBe(false)
        await options.nativeClickSelector(
          `#${permission} button:not(:disabled)`,
        )
        // Permissions without a Firefox warning can be granted without a prompt.
        await expect
          .poll(async () => {
            if (await granted()) return true
            return firefoxExtension.driver.executeScript<boolean>(
              "return Boolean(document.getElementById('addon-webext-permissions-notification') && PopupNotifications.panel.state === 'open')",
            )
          })
          .toBe(true)
        if (!(await granted())) await options.respondToPermissionPrompt(true)
        await expect.poll(granted).toBe(true)
      })
    await grant("cookies")
    await options.evaluateAsync(`Promise.all([
      browser.cookies.set({url: ${JSON.stringify(originA)}, name: 'pmplan_session', value: 'deployment-a', path: '/'}),
      browser.cookies.set({url: ${JSON.stringify(originB)}, name: 'pmplan_session', value: 'deployment-b', path: '/'})
    ]).then(() => true)`)
    const probe = firefoxExtension.page("account-detection-test.html")
    await probe.openInTab()
    await expect
      .poll(() => probe.evaluate("typeof window.pmplanCookieTransportProbe"))
      .toBe("function")
    const readIdentity = (origin: string, cookie?: string) =>
      probe.evaluateAsync(
        `window.pmplanCookieTransportProbe(${JSON.stringify(origin)}, ${JSON.stringify(cookie)})`,
      )
    expect(await readIdentity(originA)).toEqual({
      success: false,
      errorCode: "COOKIE_PERMISSION_REQUIRED",
    })
    expect(requests).toEqual([])

    // Return to the native settings tab for gesture-bound Firefox grants.
    await options.evaluateAsync(
      "browser.tabs.getCurrent().then(tab => browser.tabs.update(tab.id, {active: true})).then(() => true)",
    )
    await grant("webRequest")
    await grant("webRequestBlocking")
    for (const origin of [originA, originB]) {
      expect(
        await options.evaluateAsync(
          `browser.runtime.sendMessage({action: ${JSON.stringify(RuntimeActionIds.CookieInterceptorTrackUrl)}, url: ${JSON.stringify(origin)}})`,
        ),
      ).toEqual({ success: true })
      expect(await readIdentity(origin)).toEqual({
        success: true,
        userId: "42",
      })
    }
    // An explicitly saved session must replace the ambient login at that host.
    expect(await readIdentity(originA, "pmplan_session=saved-a")).toEqual({
      success: true,
      userId: "42",
    })
    expect(requests).toEqual([
      { host: `127.0.0.1:${port}`, cookie: "pmplan_session=deployment-a" },
      { host: `localhost:${port}`, cookie: "pmplan_session=deployment-b" },
      { host: `127.0.0.1:${port}`, cookie: "pmplan_session=saved-a" },
    ])
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
