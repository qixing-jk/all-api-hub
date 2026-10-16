import { once } from "node:events"
import { createConnection } from "node:net"
import { http, passthrough } from "msw"
import { describe, expect, it, vi } from "vitest"

import { startTurnstileTestServer } from "~~/scripts/fixtures/turnstile-server.mjs"
import { server as msw } from "~~/tests/msw/server"

describe("local Turnstile test server", () => {
  it("closes even when the browser leaves an unused preconnected socket", async () => {
    const server = await startTurnstileTestServer({ port: 0 })
    const socket = createConnection({
      host: "127.0.0.1",
      port: Number(new URL(server.origin).port),
    })
    await once(socket, "connect")
    const closing = server.close()
    try {
      expect(
        await Promise.race([
          closing.then(() => true),
          new Promise((resolve) => setTimeout(() => resolve(false), 250)),
        ]),
      ).toBe(true)
    } finally {
      socket.destroy()
      await closing
    }
  })
  it("serves the official interactive component and validates the submitted dummy token", async () => {
    const siteverify = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ success: true })))
    const server = await startTurnstileTestServer({
      port: 0,
      fetchImpl: siteverify,
    })
    msw.use(http.all(`${server.origin}/*`, () => passthrough()))
    try {
      const page = await fetch(`${server.origin}/?scenario=interactive`)
      const html = await page.text()
      expect(html).toContain(
        "https://challenges.cloudflare.com/turnstile/v0/api.js",
      )
      expect(html).toContain("3x00000000000000000000FF")
      const result = await fetch(`${server.origin}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnstile: "XXXX.DUMMY.TOKEN.XXXX" }),
      })
      expect(result.status).toBe(200)
      expect(await result.json()).toMatchObject({ success: true })
      expect(siteverify).toHaveBeenCalledWith(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        expect.objectContaining({
          method: "POST",
          body: expect.any(URLSearchParams),
        }),
      )
      expect(siteverify.mock.calls[0]![1].body.get("response")).toBe(
        "XXXX.DUMMY.TOKEN.XXXX",
      )
    } finally {
      await server.close()
    }
  })
  it("rejects missing tokens locally and preserves Siteverify failures", async () => {
    const siteverify = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ success: false })))
    const server = await startTurnstileTestServer({
      port: 0,
      fetchImpl: siteverify,
    })
    msw.use(http.all(`${server.origin}/*`, () => passthrough()))
    try {
      const missing = await fetch(`${server.origin}/verify`, {
        method: "POST",
        body: "{}",
      })
      expect(missing.status).toBe(400)
      expect(siteverify).not.toHaveBeenCalled()
      const failed = await fetch(`${server.origin}/verify`, {
        method: "POST",
        body: JSON.stringify({ turnstile: "XXXX.DUMMY.TOKEN.XXXX" }),
      })
      expect(failed.status).toBe(422)
      expect(await failed.json()).toMatchObject({ success: false })
      const page = await fetch(`${server.origin}/?scenario=failure`)
      expect(await page.text()).toContain("2x00000000000000000000AB")
    } finally {
      await server.close()
    }
  })
})
