import { once } from "node:events"
import { createServer } from "node:http"
import { expect, it, vi } from "vitest"

import { generateNewApiTotpCode } from "~/services/managedSites/providers/newApiTotp"
import {
  E2E_ACCESS_TOKEN_NAME,
  revokeStaleE2eAccessTokens,
} from "~~/e2e/utils/realSite/newApiAccessTokens"

it("carries the login challenge cookie through 2FA and revokes only after authentication", async () => {
  const totpSecret = "JBSWY3DPEHPK3PXP"
  const now = Date.now()
  const requests: string[] = []
  const server = createServer(async (req, res) => {
    requests.push(`${req.method} ${req.url}`)
    res.setHeader("content-type", "application/json")
    let body = ""
    for await (const chunk of req) body += chunk
    const data = body ? JSON.parse(body) : {}
    if (req.url === "/custom/login") {
      res.setHeader("set-cookie", "challenge=fixture; Path=/; HttpOnly")
      res.end(JSON.stringify({ success: true, data: { require_2fa: true } }))
      return
    }
    if (req.url === "/custom/2fa") {
      if (
        req.headers.cookie !== "challenge=fixture" ||
        data.code !== generateNewApiTotpCode(totpSecret)
      ) {
        res.writeHead(401).end(JSON.stringify({ success: false }))
        return
      }
      res.end(
        JSON.stringify({
          success: true,
          data: { access_token: "fixture-session" },
        }),
      )
      return
    }
    if (req.headers.authorization !== "Bearer fixture-session") {
      res.writeHead(401).end(JSON.stringify({ success: false }))
      return
    }
    if (req.url === "/api/user/access_tokens") {
      res.end(
        JSON.stringify({
          success: true,
          data: {
            items: [
              {
                id: 7,
                name: E2E_ACCESS_TOKEN_NAME,
                created_at: Math.floor(now / 1000) - 7200,
              },
            ],
          },
        }),
      )
      return
    }
    if (
      req.url === "/api/verify" &&
      data.context?.token_id === 7 &&
      data.scope === "access_token.revoke"
    ) {
      res.end(
        JSON.stringify({
          success: true,
          data: { proof_token: "fixture-proof" },
        }),
      )
      return
    }
    if (
      req.method === "DELETE" &&
      req.url === "/api/user/access_tokens/7" &&
      req.headers["x-security-proof"] === "fixture-proof"
    ) {
      res.end(JSON.stringify({ success: true }))
      return
    }
    res.writeHead(403).end(JSON.stringify({ success: false }))
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("No test port")
  const baseUrl = `http://127.0.0.1:${address.port}`
  // Freeze only Date so a TOTP period boundary cannot race the HTTP request.
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(now)
  try {
    await expect(
      revokeStaleE2eAccessTokens(
        {
          baseUrl,
          loginApiUrl: `${baseUrl}/custom/login`,
          login2faApiUrl: `${baseUrl}/custom/2fa`,
          username: "fixture-user",
          password: "fixture-password",
          totpSecret,
        },
        now,
      ),
    ).resolves.toEqual([7])
    expect(requests).toEqual([
      "POST /custom/login",
      "POST /custom/2fa",
      "GET /api/user/access_tokens",
      "POST /api/verify",
      "DELETE /api/user/access_tokens/7",
    ])
  } finally {
    vi.useRealTimers()
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
})
