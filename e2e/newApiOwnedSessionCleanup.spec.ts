import { createServer } from "node:http"
import type { AddressInfo } from "node:net"

import { NEW_API_OWNED_SESSION_ACTIONS } from "~/services/managedSites/newApiOwnedSession/contracts"
import { expect } from "~~/e2e/fixtures/extensionTest"
import { test as cleanupTest } from "~~/e2e/fixtures/newApiSessionCleanup"

const ownedSessionId = "e2e-new-api-owned-session"
const accessToken = "e2e-new-api-owned-session-token"

const test = cleanupTest.extend<{ sessionOrigin: string }>({
  sessionOrigin: async ({ browserName }, run) => {
    void browserName
    const revocations: Array<{ path: string; authenticated: boolean }> = []
    const server = createServer((request, response) => {
      if (request.method !== "DELETE") {
        response.writeHead(405).end()
        return
      }
      const authenticated =
        request.headers.authorization === `Bearer ${accessToken}`
      revocations.push({ path: request.url ?? "", authenticated })
      response.writeHead(authenticated ? 204 : 401).end()
    })
    try {
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      )
      const { port } = server.address() as AddressInfo
      await run(`http://127.0.0.1:${port}`)
      expect(revocations).toEqual([
        { path: `/api/user/sessions/${ownedSessionId}`, authenticated: true },
      ])
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  },
  newApiSessionCleanupOrigin: async ({ sessionOrigin }, run) => {
    await run(sessionOrigin)
  },
})

test("revokes the test-owned New API session during teardown", async ({
  extensionId,
  page,
  sessionOrigin,
}) => {
  await page.goto(
    `chrome-extension://${extensionId}/account-detection-test.html`,
  )
  const captured = await page.evaluate(
    (request) => chrome.runtime.sendMessage(request),
    {
      action: NEW_API_OWNED_SESSION_ACTIONS.Capture,
      bundle: {
        baseUrl: sessionOrigin,
        sessionId: ownedSessionId,
        accessToken,
        accessExpiresAt: Math.floor(Date.now() / 1000) + 900,
      },
    },
  )
  expect(captured).toEqual({ success: true })
})
