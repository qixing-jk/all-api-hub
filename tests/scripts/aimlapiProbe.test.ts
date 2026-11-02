import { afterEach, expect, it, vi } from "vitest"

import { runAimlapiProbe } from "../../scripts/suites/aimlapi/probe.mjs"

afterEach(() => vi.unstubAllGlobals())
it("checks ordinary-key permissions without creating or deleting remote keys", async () => {
  const methods: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit = {}) => {
      methods.push(options.method || "GET")
      const path = new URL(url).pathname
      const status = path === "/v1/keys" ? 403 : 200
      const body =
        path === "/v1/models"
          ? { object: "list", data: [{ id: "model" }] }
          : path === "/v2/billing"
            ? { current_balance: 0, currency: "USD" }
            : { spend: 0, requests: 0 }
      return new Response(JSON.stringify(body), { status })
    }),
  )
  await runAimlapiProbe({ apiKey: "synthetic-regular" })
  expect(methods.every((method) => method === "GET")).toBe(true)
})
