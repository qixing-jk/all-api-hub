import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"

import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { registerBalanceDefaultDisplayTests } from "~~/e2e/scenarios/balanceDefaultDisplay"

test.describe("New API balance from authenticated login without a repeat self request", () => {
  let server: Server
  let selfRequests = 0
  let logouts = 0
  const overrides = {
    AAH_E2E_NEW_API_BASE_URL: "",
    AAH_E2E_NEW_API_USERNAME: "balance-user",
    AAH_E2E_NEW_API_PASSWORD: "balance-password",
    AAH_E2E_NEW_API_LOGIN_PATH: "/login",
    AAH_E2E_NEW_API_LOGIN_API_PATH: "/api/user/login",
  }
  let originalEnv: Record<string, string | undefined>

  test.beforeAll(async () => {
    selfRequests = 0
    logouts = 0
    let authenticated = false
    const authBundle = {
      success: true,
      data: {
        access_token: "fixture-dashboard-token",
        token_type: "Bearer",
        access_expires_at: Math.floor(Date.now() / 1000) + 3_600,
        user: { id: 42, username: "balance-user", quota: 1_250_000 },
        session: { sid: "fixture-session", current: true },
      },
    }
    server = createServer((request, response) => {
      const url = new URL(request.url!, "http://localhost")
      if (url.pathname === "/api/user/self") selfRequests += 1
      if (
        request.method === "POST" &&
        url.pathname === "/api/user/auth/refresh"
      ) {
        response.writeHead(authenticated ? 200 : 401, {
          "Content-Type": "application/json",
        })
        response.end(
          JSON.stringify(authenticated ? authBundle : { success: false }),
        )
      } else if (
        request.method === "POST" &&
        url.pathname === "/api/user/login"
      ) {
        authenticated = true
        response.writeHead(200, { "Content-Type": "application/json" })
        response.end(JSON.stringify(authBundle))
      } else if (
        request.method === "POST" &&
        url.pathname === "/api/user/auth/logout"
      ) {
        authenticated = false
        logouts += 1
        response.writeHead(200, { "Content-Type": "application/json" })
        response.end(JSON.stringify({ success: true }))
      } else if (url.pathname === "/login" || url.pathname === "/console") {
        response.writeHead(200, { "Content-Type": "text/html" })
        response.end(
          "<!doctype html><title>Cached New API console</title><p>$2.50</p>",
        )
      } else {
        response.writeHead(404)
        response.end()
      }
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    overrides.AAH_E2E_NEW_API_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    originalEnv = Object.fromEntries(
      Object.keys(overrides).map((key) => [key, process.env[key]]),
    )
    Object.assign(process.env, overrides)
  })

  test.afterAll(async () => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
    expect(selfRequests).toBe(0)
    expect(logouts).toBe(1)
  })

  registerBalanceDefaultDisplayTests("NEW_API")
})
