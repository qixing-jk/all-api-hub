import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { http, HttpResponse } from "msw"
import { expect, it } from "vitest"

import {
  readNanoGptCredential,
  runNanoGptProbe,
} from "~~/scripts/suites/nanogpt/probe.mjs"
import { server } from "~~/tests/msw/server"

const API = "https://api.nano-gpt.com"
const KEY = "sk-nano-fixture"
const balance = {
  usd_balance: "12.5",
  nano_balance: "3",
  nanoDepositAddress: "nano_fixture",
}
const usage = { totals: { requests: 4, totalTokens: 900, costUsd: 0.5 } }
function routes(usageBody = usage) {
  server.use(
    http.post(`${API}/api/check-balance`, ({ request }) => {
      expect(request.headers.get("authorization")).toBe(`Bearer ${KEY}`)
      expect(request.headers.get("cookie")).toBeNull()
      return HttpResponse.json(balance)
    }),
    http.get(`${API}/api/v1/usage`, () => HttpResponse.json(usageBody)),
    http.get(`${API}/api/subscription/v1/usage`, () =>
      HttpResponse.json({ active: false }),
    ),
  )
}
it("checks the credential independently of a browser Cookie session and preserves raw monetary units", async () => {
  routes()
  await expect(readNanoGptCredential(KEY)).resolves.toEqual({
    balance,
    usage,
    subscription: { active: false },
  })
})
it("does not count malformed usage costs as successful protocol coverage", async () => {
  routes({ totals: { requests: 4, totalTokens: 900, costUsd: NaN } })
  await expect(readNanoGptCredential(KEY)).rejects.toThrow("usage")
})
it("keeps public-only evidence incomplete when the saved-key reads cannot run", async () => {
  server.use(
    http.get(`${API}/api/v1/models`, () =>
      HttpResponse.json({
        data: [
          {
            id: "fixture/model",
            pricing: { currency: "USD", prompt: 1, completion: 2 },
          },
        ],
      }),
    ),
  )
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nanogpt-probe-"))
  try {
    await expect(
      runNanoGptProbe({ apiKey: "", evidenceDir: dir }),
    ).resolves.toMatchObject({
      skipped: true,
      reason: expect.stringContaining("missing_api_key"),
    })
    expect(
      JSON.parse(
        await fs.readFile(path.join(dir, "public-catalog.json"), "utf8"),
      ).data,
    ).toHaveLength(1)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})
