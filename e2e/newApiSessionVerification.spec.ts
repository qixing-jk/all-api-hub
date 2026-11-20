import { createServer } from "node:http"
import type { AddressInfo } from "node:net"

import { expect } from "~~/e2e/fixtures/extensionTest"
import { test as sessionTest } from "~~/e2e/fixtures/newApiSessionCleanup"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

interface SessionSite {
  origin: string
  channels: Array<{ id: number; status: number }>
  verifications: Array<{
    method: string
    code: string
    scope: string
    context: { channel_id: number }
  }>
  keyReads: number
  revocations: number
}

const accessToken = "session-verification-fixture-token"
const sessionId = "session-verification-fixture-session"
const test = sessionTest.extend<{ sessionSite: SessionSite }>({
  sessionSite: async ({ browserName }, run) => {
    void browserName
    const site: SessionSite = {
      origin: "",
      channels: [],
      verifications: [],
      keyReads: 0,
      revocations: 0,
    }
    const server = createServer(async (request, response) => {
      const path = new URL(request.url ?? "/", "http://fixture").pathname
      const authenticated =
        request.headers.authorization === `Bearer ${accessToken}`
      const json = (data: unknown, status = 200) => {
        response.writeHead(status, { "content-type": "application/json" })
        response.end(JSON.stringify({ success: status === 200, data }))
      }
      // The settings tab also mounts the managed-site model catalog.
      if (path === "/api/user/models") return json([])
      if (path === "/api/user/auth/refresh") return json(null, 404)
      if (path === "/api/user/login")
        return json({
          access_token: accessToken,
          token_type: "Bearer",
          access_expires_at: Math.floor(Date.now() / 1000) + 900,
          session: { sid: sessionId, current: true },
          user: { id: 1, username: "fixture-admin" },
        })
      if (!authenticated) return json(null, 401)
      if (path === "/api/user/2fa/status") return json({ enabled: true })
      if (path === "/api/user/passkey") return json({ enabled: false })
      if (path === "/api/channel/")
        return json({
          items: site.channels.slice(0, 1),
          total: site.channels.length,
        })
      if (path === "/api/verify" && request.method === "POST") {
        let raw = ""
        for await (const chunk of request) raw += chunk
        const body = JSON.parse(raw) as SessionSite["verifications"][number]
        site.verifications.push(body)
        if (
          body.method !== "2fa" ||
          !/^\d{6}$/.test(body.code) ||
          body.scope !== "channel.key.read" ||
          !body.context ||
          Object.keys(body.context).length !== 1 ||
          !site.channels.some(
            (channel) => channel.id === body.context.channel_id,
          )
        ) {
          response.writeHead(200, { "content-type": "application/json" })
          response.end(
            JSON.stringify({
              success: false,
              message: "The action details are invalid.",
            }),
          )
          return
        }
        return json({
          proof_token: "fixture-channel-proof",
          expires_at: Math.floor(Date.now() / 1000) + 300,
        })
      }
      if (path.endsWith("/key")) site.keyReads++
      if (
        path === `/api/user/sessions/${sessionId}` &&
        request.method === "DELETE"
      ) {
        site.revocations++
        response.writeHead(204).end()
        return
      }
      json(null, 404)
    })
    try {
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      )
      site.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      await run(site)
      expect(site.revocations).toBe(1)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  },
  newApiSessionCleanupOrigin: async ({ sessionSite }, run) =>
    run(sessionSite.origin),
})

test.use({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  contextOptions: { reducedMotion: "reduce" },
})

for (const mode of ["automatic", "missing-channel-manual-retry"] as const) {
  test(`New API settings session verification: ${mode}`, async ({
    context,
    extensionId,
    page,
    sessionSite,
  }, testInfo) => {
    if (mode === "automatic") sessionSite.channels = [{ id: 47, status: 2 }]
    installExtensionPageGuards(page, {
      ignoreConsoleError: (message) =>
        message.location().url.startsWith(sessionSite.origin) &&
        /Failed to load resource:.*(?:401|404)/.test(message.text()),
    })
    await stubLlmMetadataIndex(context)
    await forceExtensionLanguage(page, "zh-CN")
    await seedUserPreferences(await getServiceWorker(context), {
      newApi: {
        baseUrl: sessionSite.origin,
        adminToken: "fixture-admin-token",
        userId: "1",
        username: "fixture-admin",
        password: "fixture-password",
        totpSecret: mode === "automatic" ? "JBSWY3DPEHPK3PXP" : "",
      },
    })
    await page.goto(
      `chrome-extension://${extensionId}/options.html?tab=managedSite&anchor=new-api-session-test#basic`,
    )
    const sessionControl = page.locator("#new-api-session-test")
    await expect(sessionControl).toBeVisible()
    await sessionControl.getByRole("button").click()

    if (mode === "missing-channel-manual-retry") {
      const dialog = page.getByRole("dialog")
      await expect(
        dialog.getByText(/登录会话可用.*尚未完成二次验证/),
      ).toBeVisible()
      await expect(dialog.getByLabel("验证码", { exact: true })).toHaveCount(0)
      await expect(dialog.locator('[data-slot="modal-body"]')).toHaveCount(0)
      expect(sessionSite.verifications).toEqual([])
      await testInfo.attach("missing-channel", {
        body: await dialog.screenshot({
          path: testInfo.outputPath("missing-channel.png"),
          animations: "disabled",
        }),
        contentType: "image/png",
      })
      sessionSite.channels = [{ id: 47, status: 2 }]
      await dialog.getByRole("button", { name: "重试", exact: true }).click()
      await expect(dialog.getByLabel("验证码", { exact: true })).toBeVisible()
      await dialog.getByLabel("验证码", { exact: true }).fill("123456")
      await testInfo.attach("manual-verification", {
        body: await dialog.screenshot({
          path: testInfo.outputPath("manual-verification.png"),
          animations: "disabled",
        }),
        contentType: "image/png",
      })
      await dialog
        .getByRole("button", { name: "提交安全验证码", exact: true })
        .click()
    }
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(page.getByText(/登录会话和本次两步验证检测通过/)).toBeVisible()
    expect(sessionSite.verifications).toHaveLength(1)
    expect(sessionSite.verifications[0]).toMatchObject({
      method: "2fa",
      scope: "channel.key.read",
      context: { channel_id: 47 },
    })
    expect(sessionSite.keyReads).toBe(0)
    await testInfo.attach("settings-success", {
      body: await page.screenshot({
        path: testInfo.outputPath("settings-success.png"),
        animations: "disabled",
      }),
      contentType: "image/png",
    })
  })
}
